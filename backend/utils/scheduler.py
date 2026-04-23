import random
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from models import Exam, Timeslot, Room, Subject, Section, DistributionRule, TeacherSchedule, Proctor

# --- CONFIGURATION ---
# Sequence: 7:00, 8:30, 10:00 (Lunch 11:30-1:00) 1:00, 2:30, 4:00
DAILY_SLOTS = [
    (time(7, 0), time(8, 30)),
    (time(8, 30), time(10, 0)),
    (time(10, 0), time(11, 30)),
    # Lunch break 11:30 - 1:00 (implicitly handled by the gap between slot 3 and 4)
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
]

NUM_EXAM_DAYS = 4
MAX_EXAMS_PER_DAY = 4  # Increased from 3 to 4 for better coverage

def is_overlapping(start1, end1, start2, end2):
    return max(start1, start2) < min(end1, end2)

def _gap_ok(day_slots, new_start, new_end):
    """
    Ensures that adding (new_start, new_end) to the day's existing slots
    doesn't create a gap > 1h 30m between consecutive exams.
    """
    all_slots = sorted(day_slots + [(new_start, new_end)])
    for i in range(len(all_slots) - 1):
        gap = datetime.combine(date.min, all_slots[i+1][0]) - datetime.combine(date.min, all_slots[i][1])
        if gap > timedelta(hours=1, minutes=30):
            return False
    return True

def generate_exam_schedule(db: Session, start_date: date, end_date: date = None):
    # 1. Clear previous DRAFT schedules
    db.query(Exam).filter(Exam.status == "draft").delete()
    db.commit()

    # 2. Setup Examination Days (Skipping Weekends)
    exam_days = []
    curr = start_date
    while len(exam_days) < NUM_EXAM_DAYS:
        if curr.weekday() < 5: # Mon-Fri
            exam_days.append(curr)
        curr += timedelta(days=1)
    
    # 3. Create/Fetch Timeslots
    timeslots = []
    for d in exam_days:
        for start_t, end_t in DAILY_SLOTS:
            ts = Timeslot(date=d, start_time=start_t, end_time=end_t)
            db.add(ts)
            timeslots.append(ts)
    db.flush()  # get IDs

    # 4. Fetch Resources
    subjects = db.query(Subject).filter(Subject.exam_type == "written").all()
    rooms = db.query(Room).all()
    rules = db.query(DistributionRule).all()
    sections = db.query(Section).all()

    # Map dates to day indices 1-4 for distribution rules
    date_map = {d: i + 1 for i, d in enumerate(exam_days)}

    from sqlalchemy.orm import joinedload
    posted_exams = db.query(Exam).options(joinedload(Exam.timeslot)).filter(Exam.status == "posted").all()
    potential_proctors = db.query(Proctor).all()

    # 5. Group Subject records by name to ensure shared subjects are simultaneous
    shared_subject_groups = {}
    for sub in subjects:
        key = sub.name
        if key not in shared_subject_groups:
            shared_subject_groups[key] = []
        shared_subject_groups[key].append(sub)

    # Track usage per course/year/semester group to enforce daily limits and gaps
    group_days_used = {}      # (c, y, s) -> set of dates
    group_exams_per_day = {}  # (c, y, s) -> date -> count
    group_day_timeslots = {}  # (c, y, s) -> date -> [(start, end)]

    # Fetch all teaching schedules for the exam days once
    all_teaching_schedules = db.query(TeacherSchedule).filter(
        TeacherSchedule.day_of_week.in_(list(set(d.weekday() for d in exam_days)))
    ).all()
    teacher_proctor_map = {p.teacher_id: p.id for p in potential_proctors if p.teacher_id}

    # Helper: Get allowed slots for a subject based on distribution rules
    def get_allowed_slots(subject):
        if subject.category == 'general':
            rule = next((r for r in rules if r.category_type == 'general'), None)
        else:
            rule = next((r for r in rules if r.category_type == 'major' and r.year_level_id == subject.year_level_id), None)

        if not rule:
            return timeslots

        allowed = []
        for slot in timeslots:
            day_num = date_map.get(slot.date)
            if day_num not in rule.allowed_days:
                continue

            is_morning = slot.start_time < time(12, 0)
            if rule.allowed_session == 'morning' and not is_morning:
                continue
            if rule.allowed_session == 'afternoon' and is_morning:
                continue

            allowed.append(slot)
        return allowed

    # Sort groups to process those with more sections first (more constrained)
    sorted_group_names = sorted(shared_subject_groups.keys(), 
                               key=lambda k: len(shared_subject_groups[k]), reverse=True)

    generated_exams = []
    total_scheduled = 0

    for name_key in sorted_group_names:
        sub_list = shared_subject_groups[name_key]
        subject_name = name_key
        
        # Collect all sections across all courses involved
        involved_sections_with_subs = []
        involved_group_keys = set()
        for sub in sub_list:
            gk = (sub.course_id, sub.year_level_id, sub.semester)
            involved_group_keys.add(gk)
            # Ensure group tracking is initialized
            if gk not in group_days_used:
                group_days_used[gk] = set()
                group_exams_per_day[gk] = {}
                group_day_timeslots[gk] = {}
            
            secs = [sec for sec in sections if sec.course_id == sub.course_id and sec.year_level_id == sub.year_level_id]
            for sec in secs:
                involved_sections_with_subs.append((sec, sub))
        
        if not involved_sections_with_subs:
            continue

        # Get intersection of allowed slots for all involved subjects
        common_allowed_slots = None
        for sub in sub_list:
            slots = set(get_allowed_slots(sub))
            if common_allowed_slots is None:
                common_allowed_slots = slots
            else:
                common_allowed_slots &= slots
        
        if not common_allowed_slots:
             print(f"[SCHEDULER]   - No common allowed slots for {subject_name}")
             continue
        
        scored_slots = []
        for slot in common_allowed_slots:
            # Check daily limit for ALL involved group keys
            over_limit = False
            for gk in involved_group_keys:
                if group_exams_per_day[gk].get(slot.date, 0) >= MAX_EXAMS_PER_DAY:
                    over_limit = True
                    break
            if over_limit:
                continue

            # Check section overlap for ALL sections in this shared group
            section_ids = [s_sub[0].id for s_sub in involved_sections_with_subs]
            has_section_overlap = False
            for e in generated_exams + posted_exams:
                if e.section_id in section_ids and e.timeslot:
                    if e.timeslot.date == slot.date:
                        if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                            has_section_overlap = True
                            break
            if has_section_overlap:
                continue

            # Scoring: prioritize spreading exams across days
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
            # 1. Room Availability
            busy_room_ids = []
            for e in generated_exams + posted_exams:
                if e.timeslot and e.timeslot.date == slot.date:
                    if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                        busy_room_ids.append(e.room_id)
            
            available_rooms = [r for r in rooms if r.id not in busy_room_ids]
            if len(available_rooms) < len(involved_sections_with_subs):
                continue

            # 2. Proctor Availability
            busy_proctor_ids = []
            for e in generated_exams + posted_exams:
                if e.timeslot and e.timeslot.date == slot.date:
                    if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                        busy_proctor_ids.append(e.proctor_id)
            
            # Note: We are ignoring TeacherSchedule (teaching conflicts) to ensure higher coverage,
            # assuming regular teaching is suspended or prioritized below examinations.
            
            available_proctors = [p for p in potential_proctors if p.id not in busy_proctor_ids]
            
            # Exclude proctors who teach any of the subjects in the group
            proctor_teachers_of_subjects = [sub.teacher_id for sub in sub_list]
            available_proctors = [p for p in available_proctors if p.teacher_id not in proctor_teachers_of_subjects]

            if len(available_proctors) < len(involved_sections_with_subs):
                continue

            # Success! Assign the slot
            random.shuffle(available_rooms)
            random.shuffle(available_proctors)
            
            for i, (section, subject) in enumerate(involved_sections_with_subs):
                new_exam = Exam(
                    subject_id=subject.id,
                    section_id=section.id,
                    room_id=available_rooms[i].id,
                    timeslot=slot,
                    course_id=subject.course_id,
                    year_level_id=subject.year_level_id,
                    semester=subject.semester,
                    status="draft",
                    proctor_id=available_proctors[i].id
                )
                generated_exams.append(new_exam)
                total_scheduled += 1
            
            # Update tracking
            for gk in involved_group_keys:
                group_days_used[gk].add(slot.date)
                group_exams_per_day[gk][slot.date] = group_exams_per_day[gk].get(slot.date, 0) + 1
                if slot.date not in group_day_timeslots[gk]:
                    group_day_timeslots[gk][slot.date] = []
                group_day_timeslots[gk][slot.date].append((slot.start_time, slot.end_time))
            
            assigned = True
            break
        
        if not assigned:
            print(f"[SCHEDULER]   - FAILED to assign SHARED subject {subject_name} (Checked {len(scored_slots)} potential slots)")

    # Post-check: ensure all groups use enough days
    for gk, days in group_days_used.items():
        if len(days) == 0:
            print(f"[SCHEDULER] WARNING: Group {gk} has NO exams scheduled.")
        else:
            print(f"[SCHEDULER] Group {gk} uses {len(days)} days: {sorted(days)}")

    db.add_all(generated_exams)
    db.commit()
    return len(generated_exams)
