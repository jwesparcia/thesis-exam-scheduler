from sqlalchemy.orm import Session
from models import Exam, Subject, Section, Room, Timeslot, Teacher, DistributionRule, TeacherSchedule, Proctor
from sqlalchemy import and_
import random
from datetime import datetime, time, date, timedelta

# Fixed timeslot windows per day (6 slots: 7:00 AM – 5:30 PM)
# Each exam = 1h 30m | Max gap between slots = 1h 30m
# Gaps: Slot1→2 = 0min, 2→3 = 30min, 3→4 = 1hr (lunch), 4→5 = 0min, 5→6 = 0min
DAILY_SLOTS = [
    (time(7, 0), time(8, 30)),     # Slot 1: 7:00 AM – 8:30 AM
    (time(8, 30), time(10, 0)),    # Slot 2: 8:30 AM – 10:00 AM
    (time(10, 30), time(12, 0)),   # Slot 3: 10:30 AM – 12:00 PM
    (time(13, 0), time(14, 30)),   # Slot 4: 1:00 PM – 2:30 PM
    (time(14, 30), time(16, 0)),   # Slot 5: 2:30 PM – 4:00 PM
    (time(16, 0), time(17, 30)),   # Slot 6: 4:00 PM – 5:30 PM
]

# Maximum allowed gap between consecutive exams for the same group on the same day
MAX_GAP = timedelta(hours=1, minutes=30)

def is_overlapping(slot1_start, slot1_end, slot2_start, slot2_end):
    """Check if two time ranges [start, end) overlap."""
    return slot1_start < slot2_end and slot2_start < slot1_end

def _gap_ok(existing_times, new_start, new_end):
    """Return True if inserting (new_start, new_end) keeps all consecutive gaps ≤ MAX_GAP."""
    all_times = sorted(existing_times + [(new_start, new_end)])
    for i in range(1, len(all_times)):
        prev_end = all_times[i - 1][1]
        curr_start = all_times[i][0]
        gap = datetime.combine(date.min, curr_start) - datetime.combine(date.min, prev_end)
        if gap > MAX_GAP:
            return False
    return True

NUM_EXAM_DAYS = 4  # Always generate exactly 4 days


def _get_exam_weekdays(start: date, count: int) -> list:
    """Return `count` weekdays starting from `start`, skipping weekends."""
    days = []
    current = start
    while len(days) < count:
        if current.weekday() < 5:  # Mon-Fri
            days.append(current)
        current += timedelta(days=1)
    return days


def generate_exam_schedule(db: Session, start_date: date | None = None, end_date: date | None = None):
    # 1. Clear existing DRAFT exams and old timeslots
    db.query(Exam).filter(Exam.status == "draft").delete()
    # Only delete timeslots that are not linked to non-draft exams
    db.query(Timeslot).filter(
        ~Timeslot.id.in_(
            db.query(Exam.timeslot_id).filter(Exam.status != "draft")
        )
    ).delete(synchronize_session="fetch")
    db.commit()

    # 2. Determine the exam days
    if start_date is None:
        start_date = date.today()
    
    if end_date:
        # Calculate all weekdays between start and end inclusive
        exam_days = []
        curr = start_date
        while curr <= end_date:
            if curr.weekday() < 5:
                exam_days.append(curr)
            curr += timedelta(days=1)
    else:
        exam_days = _get_exam_weekdays(start_date, NUM_EXAM_DAYS)

    print(f"[SCHEDULER] Generating synchronized schedule for {len(exam_days)} days: {exam_days}")

    # 3. Create timeslots
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

    # Group subjects by (course, year_level, semester)
    # This ensures that all sections of the same course/year/semester share the same schedule
    # Note: If a subject is shared across multiple courses, this logic might need adjustment,
    # but based on the schema, subjects are linked to a single course.
    subject_groups = {}
    for sub in subjects:
        key = (sub.course_id, sub.year_level_id, sub.semester)
        if key not in subject_groups:
            subject_groups[key] = []
        subject_groups[key].append(sub)

    generated_exams = []
    # Fetch existing posted exams for conflict checking once at the start
    from sqlalchemy.orm import joinedload
    posted_exams = db.query(Exam).options(joinedload(Exam.timeslot)).filter(Exam.status == "posted").all()
    potential_proctors = db.query(Proctor).all()

    # Track assigned slots per (course, year_level, semester) to check spread and conflicts
    group_days_used = {}  # group_key -> set of dates
    group_exams_per_day = {} # group_key -> date -> count
    group_day_timeslots = {} # group_key -> {date -> [(start_time, end_time)]}

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

    # Process each (course, year_level, semester) group
    total_scheduled = 0
    for group_key, group_subjects in subject_groups.items():
        course_id, year_level_id, semester = group_key
        group_sections = [sec for sec in sections if sec.course_id == course_id and sec.year_level_id == year_level_id]
        
        if not group_sections:
            print(f"[SCHEDULER] Skipping group {group_key}: No sections found.")
            continue

        print(f"[SCHEDULER] Group {group_key}: {len(group_subjects)} subjects, {len(group_sections)} sections.")
        
        group_days_used[group_key] = set()
        group_exams_per_day[group_key] = {}
        group_day_timeslots[group_key] = {}

        for subject in group_subjects:
            allowed_slots = get_allowed_slots(subject)
            if not allowed_slots:
                print(f"[SCHEDULER]   - No allowed slots for {subject.name}")
                continue

            scored_slots = []
            for slot in allowed_slots:
                # ── Max-gap constraint: if this group already has exams on
                #    this day, inserting this slot must keep all consecutive
                #    gaps ≤ 1 h 30 m.
                existing_day_slots = group_day_timeslots[group_key].get(slot.date, [])
                if existing_day_slots:
                    if not _gap_ok(existing_day_slots, slot.start_time, slot.end_time):
                        continue  # would create a gap > 1:30 – skip

                score = 0
                if len(group_days_used[group_key]) < 3 and slot.date not in group_days_used[group_key]:
                    score += 2000
                elif len(group_days_used[group_key]) >= 3:
                     if slot.date in group_days_used[group_key]:
                         score += 1000
                     elif len(group_days_used[group_key]) == 3:
                         score += 500
                score += random.random() * 10
                scored_slots.append((score, slot))

            scored_slots.sort(key=lambda x: x[0], reverse=True)

            assigned = False
            for _, slot in scored_slots:
                # 1. Subject Limit Check
                if group_exams_per_day[group_key].get(slot.date, 0) >= 3:
                    continue

                # 2. Section Conflict: Ensure none of the sections in this group already have an exam overlapping this time
                section_ids = [s.id for s in group_sections]
                
                has_section_overlap = False
                for e in generated_exams + posted_exams:
                    if e.section_id in section_ids and e.timeslot:
                        if e.timeslot.date == slot.date:
                            if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                                has_section_overlap = True
                                break
                if has_section_overlap:
                    continue

                # 3. Room Availability: Find rooms not used in an overlapping time window
                busy_room_ids = []
                for e in generated_exams + posted_exams:
                    if e.timeslot and e.timeslot.date == slot.date:
                        if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                            busy_room_ids.append(e.room_id)
                
                available_rooms = [r for r in rooms if r.id not in busy_room_ids]
                if len(available_rooms) < len(group_sections):
                    continue

                # 4. Proctor Availability: Find proctors not busy in an overlapping time window
                # AND not teaching during this slot
                # AND not teaching the current subject
                busy_proctor_ids = []
                for e in generated_exams + posted_exams:
                    if e.timeslot and e.timeslot.date == slot.date:
                        if is_overlapping(e.timeslot.start_time, e.timeslot.end_time, slot.start_time, slot.end_time):
                            busy_proctor_ids.append(e.proctor_id)
                
                # Check teaching schedules for this day
                day_idx = slot.date.weekday()
                teaching_conflicts = db.query(TeacherSchedule).filter(
                    TeacherSchedule.day_of_week == day_idx
                ).all()
                
                for ts in teaching_conflicts:
                    if is_overlapping(ts.start_time, ts.end_time, slot.start_time, slot.end_time):
                        # Find the proctor id for this teacher
                        conflict_proctor = db.query(Proctor).filter(Proctor.teacher_id == ts.teacher_id).first()
                        if conflict_proctor:
                            busy_proctor_ids.append(conflict_proctor.id)
                            
                available_proctors = [p for p in potential_proctors if p.id not in busy_proctor_ids]
                
                # Exclude proctor if they teach this subject
                available_proctors = [p for p in available_proctors if p.teacher_id != subject.teacher_id]

                if len(available_proctors) < len(group_sections):
                    continue

                # Success! Assign the slot
                random.shuffle(available_rooms)
                random.shuffle(available_proctors)
                
                for i, section in enumerate(group_sections):
                    new_exam = Exam(
                        subject_id=subject.id,
                        section_id=section.id,
                        room_id=available_rooms[i].id,
                        timeslot=slot, # Assign object directly
                        course_id=subject.course_id,
                        year_level_id=subject.year_level_id,
                        semester=subject.semester,
                        status="draft",
                        proctor_id=available_proctors[i].id
                    )
                    generated_exams.append(new_exam)
                    total_scheduled += 1
                
                group_days_used[group_key].add(slot.date)
                group_exams_per_day[group_key][slot.date] = group_exams_per_day[group_key].get(slot.date, 0) + 1
                # Track for gap constraint
                if slot.date not in group_day_timeslots[group_key]:
                    group_day_timeslots[group_key][slot.date] = []
                group_day_timeslots[group_key][slot.date].append((slot.start_time, slot.end_time))
                assigned = True
                print(f"[SCHEDULER]   - Assigned {subject.name} to {slot.date} {slot.start_time}")
                break

            if not assigned:
                print(f"[SCHEDULER]   - FAILED to assign {subject.name}")

    # Post-check: ensure all groups use 3-4 days
    for group_key, days in group_days_used.items():
        print(f"[SCHEDULER] Group {group_key} uses {len(days)} days: {sorted(days)}")

    db.add_all(generated_exams)
    db.commit()
    return len(generated_exams)
