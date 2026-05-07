import random
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from models import Exam, Timeslot, Room, Subject, Section, DistributionRule, TeacherSchedule, Proctor, TeacherTeaching

DAILY_SLOTS = [
    (time(7, 0), time(8, 30)),
    (time(8, 30), time(10, 0)),
    (time(10, 0), time(11, 30)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
]

NUM_EXAM_DAYS = 4
MAX_EXAMS_PER_DAY = 4

def is_overlapping(start1, end1, start2, end2):
    return max(start1, start2) < min(end1, end2)

def generate_exam_schedule(db: Session, start_date: date, end_date: date = None):
    db.query(Exam).filter(Exam.status == "draft").delete()
    db.commit()

    exam_days = []
    curr = start_date
    while len(exam_days) < NUM_EXAM_DAYS:
        if curr.weekday() < 5:
            exam_days.append(curr)
        curr += timedelta(days=1)

    timeslots = []
    for d in exam_days:
        for start_t, end_t in DAILY_SLOTS:
            ts = Timeslot(date=d, start_time=start_t, end_time=end_t)
            db.add(ts)
            timeslots.append(ts)
    db.flush()

    subjects = db.query(Subject).all()
    rooms = db.query(Room).all()
    rules = db.query(DistributionRule).all()
    sections = db.query(Section).all()
    date_map = {d: i + 1 for i, d in enumerate(exam_days)}
    posted_exams = db.query(Exam).filter(Exam.status == "posted").all()

    # Proctor data: only those with TeacherSchedule (availability)
    all_proctors = db.query(Proctor).filter(Proctor.exclude_from_scheduling == False).all()
    proctor_data = {}
    for proctor in all_proctors:
        if not proctor.teacher_id:
            continue
        schedules = db.query(TeacherSchedule).filter(TeacherSchedule.teacher_id == proctor.teacher_id).all()
        if not schedules:
            continue
        availability = {}
        for sched in schedules:
            availability.setdefault(sched.day_of_week, []).append((sched.start_time, sched.end_time))
        # Teaching assignments (empty if none)
        teachings = db.query(TeacherTeaching).filter(TeacherTeaching.teacher_id == proctor.teacher_id).all()
        forbidden = {(tt.subject_id, tt.section_id) for tt in teachings}
        max_assignments = len(forbidden) if forbidden else 8   # default limit 8
        proctor_data[proctor.id] = {
            "proctor": proctor,
            "availability": availability,
            "forbidden": forbidden,
            "assigned_count": 0,
            "max_assignments": max_assignments,
        }

    # Group subjects by name
    shared_subject_groups = {}
    for sub in subjects:
        key = sub.name
        shared_subject_groups.setdefault(key, []).append(sub)

    group_days_used = {}
    group_exams_per_day = {}
    group_day_timeslots = {}

    generated_exams = []
    total_scheduled = 0
    assigned_proctor_count = 0   # count of exams that got a proctor

    sorted_group_names = sorted(shared_subject_groups.keys(),
                                key=lambda k: len(shared_subject_groups[k]), reverse=True)

    for name_key in sorted_group_names:
        sub_list = shared_subject_groups[name_key]
        involved_sections_with_subs = []
        involved_group_keys = set()
        for sub in sub_list:
            gk = (sub.course_id, sub.year_level_id, sub.semester)
            involved_group_keys.add(gk)
            if gk not in group_days_used:
                group_days_used[gk] = set()
                group_exams_per_day[gk] = {}
                group_day_timeslots[gk] = {}
            secs = [sec for sec in sections if sec.course_id == sub.course_id and sec.year_level_id == sub.year_level_id]
            for sec in secs:
                involved_sections_with_subs.append((sec, sub))
        if not involved_sections_with_subs:
            continue

        common_allowed_slots = None
        for sub in sub_list:
            if sub.category == 'general':
                rule = next((r for r in rules if r.category_type == 'general'), None)
            else:
                rule = next((r for r in rules if r.category_type == 'major' and r.year_level_id == sub.year_level_id), None)
            if not rule:
                slots = timeslots
            else:
                slots = []
                for slot in timeslots:
                    day_num = date_map.get(slot.date)
                    if day_num not in rule.allowed_days:
                        continue
                    is_morning = slot.start_time < time(12, 0)
                    if rule.allowed_session == 'morning' and not is_morning:
                        continue
                    if rule.allowed_session == 'afternoon' and is_morning:
                        continue
                    slots.append(slot)
            slots_set = set(slots)
            if common_allowed_slots is None:
                common_allowed_slots = slots_set
            else:
                common_allowed_slots &= slots_set
        if not common_allowed_slots:
            print(f"[SCHEDULER] No common allowed slots for {name_key}")
            continue

        scored_slots = []
        for slot in common_allowed_slots:
            over_limit = False
            for gk in involved_group_keys:
                if group_exams_per_day[gk].get(slot.date, 0) >= MAX_EXAMS_PER_DAY:
                    over_limit = True
                    break
            if over_limit:
                continue
            section_ids = [sec.id for sec, _ in involved_sections_with_subs]
            section_overlap = False
            for e in generated_exams + posted_exams:
                if e.section_id in section_ids and e.timeslot:
                    if e.timeslot.date == slot.date and is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                        section_overlap = True
                        break
            if section_overlap:
                continue
            score = 0
            for gk in involved_group_keys:
                if len(group_days_used[gk]) < 3 and slot.date not in group_days_used[gk]:
                    score += 2000
                elif len(group_days_used[gk]) >= 3:
                    if slot.date in group_days_used[gk]:
                        score += 1000
            score += random.random() * 10
            scored_slots.append((score, slot))
        scored_slots.sort(key=lambda x: x[0], reverse=True)

        assigned = False
        for _, slot in scored_slots:
            busy_rooms = set()
            for e in generated_exams + posted_exams:
                if e.timeslot and e.timeslot.date == slot.date:
                    if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                        busy_rooms.add(e.room_id)
            available_rooms = [r for r in rooms if r.id not in busy_rooms]
            if len(available_rooms) < len(involved_sections_with_subs):
                continue

            # For each exam in this group, we try to assign a proctor
            # We'll collect proctor assignments per exam
            proctor_candidates_per_exam = []
            for section, subject in involved_sections_with_subs:
                candidates = []
                for pid, pdata in proctor_data.items():
                    if pdata["assigned_count"] >= pdata["max_assignments"]:
                        continue
                    dow = slot.date.weekday()
                    if dow not in pdata["availability"]:
                        continue
                    available = False
                    for (st, et) in pdata["availability"][dow]:
                        if st <= slot.start_time <= et and st <= slot.end_time <= et:
                            available = True
                            break
                    if not available:
                        continue
                    if (subject.id, section.id) in pdata["forbidden"]:
                        continue
                    candidates.append(pid)
                proctor_candidates_per_exam.append(candidates)

            # Greedy assignment of distinct proctors
            assigned_proctors = []
            possible = True
            for i, candidates in enumerate(proctor_candidates_per_exam):
                # We allow no proctor: if no candidate, we set to None and continue
                if not candidates:
                    assigned_proctors.append(None)
                    continue
                # Remove already used proctors
                remaining = [pid for pid in candidates if pid not in assigned_proctors if pid is not None]
                if not remaining:
                    # No unique proctor left, we can assign None
                    assigned_proctors.append(None)
                else:
                    chosen = random.choice(remaining)
                    assigned_proctors.append(chosen)
            # No need for "possible" false – we can always assign with None

            random.shuffle(available_rooms)
            for i, (section, subject) in enumerate(involved_sections_with_subs):
                proctor_id = assigned_proctors[i]
                new_exam = Exam(
                    subject_id=subject.id,
                    section_id=section.id,
                    room_id=available_rooms[i % len(available_rooms)].id,
                    timeslot=slot,
                    course_id=subject.course_id,
                    year_level_id=subject.year_level_id,
                    semester=subject.semester,
                    status="draft",
                    proctor_id=proctor_id,
                )
                generated_exams.append(new_exam)
                total_scheduled += 1
                if proctor_id is not None:
                    assigned_proctor_count += 1
                    proctor_data[proctor_id]["assigned_count"] += 1

            for gk in involved_group_keys:
                group_days_used[gk].add(slot.date)
                group_exams_per_day[gk][slot.date] = group_exams_per_day[gk].get(slot.date, 0) + 1
                if slot.date not in group_day_timeslots[gk]:
                    group_day_timeslots[gk][slot.date] = []
                group_day_timeslots[gk][slot.date].append((slot.start_time, slot.end_time))

            assigned = True
            break

        if not assigned:
            print(f"[SCHEDULER] FAILED to assign shared subject {name_key}")

    db.add_all(generated_exams)
    db.commit()
    # Return both total exams and how many got a proctor
    return {
        "total_exams": total_scheduled,
        "assigned_proctors": assigned_proctor_count,
        "unassigned": total_scheduled - assigned_proctor_count
    }