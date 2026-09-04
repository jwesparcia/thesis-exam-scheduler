import random
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from model import Exam, Timeslot, Room, Subject, Section, DistributionRule, TeacherSchedule, Proctor, TeacherTeaching
from room_data import get_room_names_for_department

# Time slots per day matching the official Tertiary Periodical Departmental Exam Schedule:
# Morning:   7:00-8:30, 8:30-10:00, 10:00-11:30
# Afternoon: 11:30-1:00, 1:00-2:30, 2:30-4:00, 4:00-5:30
# (No lunch gap — continuous back-to-back 1.5-hour blocks)
DAILY_SLOTS = [
    (time(7, 0),  time(8, 30)),
    (time(8, 30), time(10, 0)),
    (time(10, 0), time(11, 30)),
    (time(11, 30), time(13, 0)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
]

NUM_EXAM_DAYS = 4
MAX_EXAMS_PER_DAY = 3
ROOM_BOOKING_TARGET = 22
HIGH_FLOOR_MIN = 5

# Genetic Algorithm Parameters (default values)
POP_SIZE = 40
GENERATIONS = 60
MUTATION_RATE = 0.20

def time_to_minutes(t):
    return t.hour * 60 + t.minute

def intervals_cover(intervals, target_start, target_end):
    t_start = time_to_minutes(target_start)
    t_end = time_to_minutes(target_end)
    
    covered_minutes = [False] * (t_end - t_start)
    for start, end in intervals:
        s_m = time_to_minutes(start)
        e_m = time_to_minutes(end)
        clip_start = max(t_start, s_m)
        clip_end = min(t_end, e_m)
        if clip_start < clip_end:
            for m in range(clip_start - t_start, clip_end - t_start):
                covered_minutes[m] = True
    return all(covered_minutes)

def subjects_match(sched_sub, exam_sub):
    sched_sub = str(sched_sub).upper().replace(" ", "").replace("-", "")
    exam_sub = str(exam_sub).upper().replace(" ", "").replace("-", "")
    
    # Check abbreviations
    if "COMPROG" in sched_sub and "COMPUTERPROGRAMMING" in exam_sub:
        return True
    if "WEBSYS" in sched_sub and "WEBSYSTEM" in exam_sub:
        return True
    if "FUNDOFWEB" in sched_sub and "FUNDAMENTALSOFWEB" in exam_sub:
        return True
    if "INFOMNGT" in sched_sub and "INFORMATIONMANAGEMENT" in exam_sub:
        return True
    if "INFOASSR" in sched_sub and "INFORMATIONASSURANCE" in exam_sub:
         return True
    if "NETTECH" in sched_sub and "NETWORKTECHNOLOGY" in exam_sub:
         return True
    # General substring matching
    if sched_sub in exam_sub or exam_sub in sched_sub:
        return True
    return False


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

def _minutes_gap_ok(existing_slots_m, new_start_m, new_end_m):
    """
    Ensures that adding (new_start_m, new_end_m) to existing_slots_m
    doesn't create a gap > 90m (1h 30m) between consecutive exams on that day.
    existing_slots_m: list of (start_m, end_m)
    """
    all_slots = sorted(existing_slots_m + [(new_start_m, new_end_m)], key=lambda x: x[0])
    for i in range(len(all_slots) - 1):
        if all_slots[i+1][0] - all_slots[i][1] > 90:
            return False
    return True



def _room_floor(room_name):
    digits = "".join(ch for ch in str(room_name) if ch.isdigit())
    return int(digits[0]) if digits else 0

def _room_building_and_floor(room_name):
    letters = ""
    for ch in str(room_name):
        if ch.isalpha():
            letters += ch
        else:
            break
    digits = "".join(ch for ch in str(room_name)[len(letters):] if ch.isdigit())
    floor = int(digits[0]) if digits else 0
    return letters or "Unknown", floor

def generate_exam_schedule(db: Session, start_date: date, end_date: date = None, department: str = "College", semester: int = 1, excluded_subjects: list = None, progress_callback=None, term: str = "Midterm"):
    if excluded_subjects is None:
        excluded_subjects = []

    def report_progress(percent, phase, detail=""):
        if not progress_callback:
            return
        progress_callback({
            "percent": max(0, min(100, int(percent))),
            "phase": phase,
            "detail": detail,
        })

    # 1. Clear previous DRAFT schedules for the specific department, semester and term
    report_progress(4, "Preparing schedule", "Clearing previous draft schedules")
    from model import Course
    drafts_to_delete = db.query(Exam).join(Course, Exam.course_id == Course.id).filter(
        Exam.status == "draft",
        Course.category == department,
        Exam.semester == semester,
        Exam.term == term
    ).all()
    draft_ids = [draft.id for draft in drafts_to_delete]
    if draft_ids:
        # Delete rescheduling requests first to avoid FK violation
        from model import ReschedulingRequest
        db.query(ReschedulingRequest).filter(
            ReschedulingRequest.exam_id.in_(draft_ids)
        ).delete(synchronize_session=False)
    for draft in drafts_to_delete:
        db.delete(draft)
    db.commit()

    report_progress(8, "Preparing timeslots", "Building exam days and daily time slots")
    exam_days = []
    curr = start_date
    while len(exam_days) < NUM_EXAM_DAYS:
        if curr.weekday() != 6:
            exam_days.append(curr)
        curr += timedelta(days=1)

    timeslots = []
    existing_ts_list = db.query(Timeslot).filter(Timeslot.date.in_(exam_days)).all()
    existing_ts_map = {(ts.date, ts.start_time, ts.end_time): ts for ts in existing_ts_list}
    for d in exam_days:
        for start_t, end_t in DAILY_SLOTS:
            key = (d, start_t, end_t)
            if key in existing_ts_map:
                ts = existing_ts_map[key]
            else:
                ts = Timeslot(date=d, start_time=start_t, end_time=end_t)
                db.add(ts)
                existing_ts_map[key] = ts
            timeslots.append(ts)
    db.flush()
    
    # Store timeslots by ID for later retrieval
    timeslot_map = {ts.id: ts for ts in timeslots}
    generated_timeslot_ids = {ts.id for ts in timeslots}

    # 4. Fetch Resources for the specific department and semester
    report_progress(16, "Loading resources", "Fetching subjects, rooms, and distribution rules")
    subjects_query = db.query(Subject).join(Course).filter(
        Subject.exam_type == "written",
        Course.category == department,
        Subject.semester == semester
    )
    
    if excluded_subjects:
        subjects_query = subjects_query.filter(Subject.name.notin_(excluded_subjects))
        
    subjects = subjects_query.all()
    room_names = get_room_names_for_department(department)
    rooms = db.query(Room).filter(Room.name.in_(room_names)).order_by(Room.name).all()
    room_ids = [r.id for r in rooms]
    room_ids_set = set(room_ids)
    room_name_by_id = {r.id: r.name for r in rooms}
    room_floor_by_id = {r.id: _room_floor(r.name) for r in rooms}
    room_building_by_id = {r.id: (r.building or _room_building_and_floor(r.name)[0]) for r in rooms}
    if not room_ids:
        raise ValueError(f"No available exam rooms found for {department}. Sync or seed the Exam-Rooms.xlsx room list first.")
    rules = db.query(DistributionRule).all()
    from sqlalchemy import or_
    sections = db.query(Section).join(Course).filter(
        Course.category == department,
        or_(Section.semester == semester, Section.semester.is_(None))
    ).all()
    
    import re as _re_sec
    def _get_section_year_level_id(sec):
        if sec.year_level_id:
            return sec.year_level_id
        m = _re_sec.search(r'[-_\s](\d+)', sec.name)
        if not m:
            m = _re_sec.search(r'(\d+)', sec.name)
        if m:
            num = int(m.group(1))
            if num in (1, 2, 3, 4):
                return num
            if num in (5, 11):
                return 5
            if num in (6, 12):
                return 6
        return None

    # Pre-calculate count of written exam subjects per section
    subjects_per_section = {}
    for sec in sections:
        sec_yl = _get_section_year_level_id(sec)
        subjects_per_section[sec.id] = sum(1 for sub in subjects if sub.course_id == sec.course_id and sub.year_level_id == sec_yl)
    date_map = {d: i + 1 for i, d in enumerate(exam_days)}
    posted_exams = db.query(Exam).filter(Exam.status == "posted").all()
    for e in posted_exams:
        if e.timeslot:
            timeslot_map[e.timeslot.id] = e.timeslot

    # Proctor data: only those with TeacherSchedule (availability)
    report_progress(24, "Loading proctors", "Reading uploaded proctor schedules")
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
            "taught_subjects": {s.subject_name for s in schedules if s.subject_name}
        }

    def classify_subject(sub_name, category):
        """
        Classify a subject according to the Tertiary Periodical Departmental Exam Schedule template:
          GE_GROUP_1  -> Day 1 Morning  (Comm & Lit, Math, Sciences)
          GE_GROUP_2  -> Day 2 Morning  (Filipino, SOCSCI — except Literature)
          COMP_FUND   -> Day 1 Afternoon (Computer Fundamentals)
          MAJOR       -> Day 1 Afternoon (Y3/Y4 only) + Days 2-4 any
        """
        sub_name_lower = sub_name.lower()

        # Check for Computer Fundamentals first
        if any(k in sub_name_lower for k in [
            'computer fundamentals', 'computer productivity',
            'intro to computing', 'introduction to computing',
            'programming logic and design', 'programming logic & design',
            'fund of web', 'fundamentals of web', 'it application tools'
        ]):
            return "COMP_FUND"

        if category == 'general':
            # Day 1 Morning GE: Communication, Literature, Math, Sciences
            if any(k in sub_name_lower for k in [
                'math', 'calculus', 'statistics', 'quantitative', 'pre-calculus', 'business math',
                'science', 'chemistry', 'biology', 'physics', 'earth', 'environmental', 'anatomy', 'physiology', 'disaster readiness',
                'communication', 'comm', 'writing', 'reading', 'oral comm', 'speech',
                'literature', 'great books', 'foreign language', 'english for academic'
            ]):
                return "GE_GROUP_1"
            # Day 2 Morning GE: Filipino, SOCSCI (except Lit)
            else:
                return "GE_GROUP_2"
        else:
            return "MAJOR"

    # Fetch year level IDs for Y3 and Y4 (for major subject slot restriction)
    import re as _re
    from model import YearLevel
    year_level_id_to_name = {yl.id: yl.name for yl in db.query(YearLevel).all()}
    senior_year_level_ids = {
        yl_id for yl_id, name in year_level_id_to_name.items()
        if _re.search(r'(3rd|4th|grade\s*1[12])', name.lower())
    }

    # Group subjects by name
    report_progress(32, "Grouping subjects", "Synchronizing shared subjects across sections")
    shared_subject_groups = {}
    for sub in subjects:
        key = sub.name
        shared_subject_groups.setdefault(key, []).append(sub)

    import copy

    def _allowed_slots_for_classification(classification, year_level_id):
        """
        Return the set of timeslots allowed for a subject based on its classification
        and year level, directly implementing the official exam schedule template:

          Day 1 Morning   (7:00-11:30):  GE_GROUP_1
          Day 1 Afternoon (11:30-17:30): COMP_FUND, MAJOR (Y3/Y4 only)
          Day 2 Morning   (7:00-11:30):  GE_GROUP_2
          Day 2 Afternoon (11:30-17:30): MAJOR (all year levels)
          Day 3 All slots:               MAJOR (all year levels)
          Day 4 All slots:               MAJOR (all year levels)
        """
        allowed = set()
        is_senior = year_level_id in senior_year_level_ids
        for slot in timeslots:
            day_num = date_map.get(slot.date)
            is_morning = slot.start_time < datetime.strptime("11:30:00", "%H:%M:%S").time()
            if classification == "GE_GROUP_1":
                # Day 1 & Day 3 Morning (matching official DistributionRule: days 1, 2, 3 morning)
                if day_num in (1, 3) and is_morning:
                    allowed.add(slot)
            elif classification == "GE_GROUP_2":
                # Day 2 & Day 3 Morning (matching official DistributionRule: days 1, 2, 3 morning)
                if day_num in (2, 3) and is_morning:
                    allowed.add(slot)
            elif classification == "COMP_FUND":
                # Day 1, Afternoon only
                if day_num == 1 and not is_morning:
                    allowed.add(slot)
            elif classification == "MAJOR":
                if day_num == 1 and not is_morning and is_senior:
                    # Day 1 Afternoon: only Y3 & Y4
                    allowed.add(slot)
                elif day_num in (2, 3, 4):
                    # Days 2-4: all year levels
                    allowed.add(slot)
            else:
                allowed.add(slot)
        return allowed

    # Pre-calculate involved sections and valid timeslots per group
    groups = []
    for name_key, sub_list in shared_subject_groups.items():
        involved_sections = []
        for sub in sub_list:
            secs = [sec for sec in sections if sec.course_id == sub.course_id and _get_section_year_level_id(sec) == sub.year_level_id]
            for sec in secs:
                involved_sections.append((sec, sub))
        if not involved_sections:
            continue

        sample_sub = sub_list[0]
        classification = classify_subject(sample_sub.name, sample_sub.category)

        # Literature is a special GE subject — exclude from GE morning rules, treat as major
        import re
        is_lit = sample_sub.category == "general" and (
            "literature" in sample_sub.name.lower() or re.search(r"\blit\b", sample_sub.name.lower())
        )
        if is_lit:
            classification = "MAJOR"

        # Compute allowed slots per individual subject (may differ by year level for MAJOR)
        subject_allowed_slots_lists = []
        for sub in sub_list:
            sub_classification = classify_subject(sub.name, sub.category)
            if is_lit:
                sub_classification = "MAJOR"
            sub_allowed = _allowed_slots_for_classification(sub_classification, sub.year_level_id)
            if not sub_allowed:
                print(f"[SCHEDULER] No allowed slots for '{sub.name}' ({sub_classification}, YL={sub.year_level_id}). Falling back.")
                sub_allowed = set(timeslots)
            subject_allowed_slots_lists.append(sub_allowed)

        if subject_allowed_slots_lists:
            common_allowed_slots = set.intersection(*subject_allowed_slots_lists)
        else:
            common_allowed_slots = set()

        if not common_allowed_slots:
            print(f"[SCHEDULER] No common allowed slots for '{name_key}' ({classification}). Falling back to all timeslots.")
            common_allowed_slots = set(timeslots)

        groups.append({
            "name": name_key,
            "sections": involved_sections,
            "allowed_slots": [s.id for s in common_allowed_slots],
            "classification": classification
        })

    # -------------------------
    # Preprocessing for Performance
    # -------------------------
    # Map database IDs to sequential list indices
    timeslot_ids = list(timeslot_map.keys())
    num_timeslots = len(timeslot_ids)
    timeslot_id_to_idx = {tid: idx for idx, tid in enumerate(timeslot_ids)}
    timeslot_idx_to_id = {idx: tid for idx, tid in enumerate(timeslot_ids)}

    timeslot_info_list = [None] * num_timeslots
    from datetime import time as dt_time
    LIMIT_TIME = dt_time(11, 30)
    for ts_id, ts in timeslot_map.items():
        slot_idx = timeslot_id_to_idx[ts_id]
        start_m = ts.start_time.hour * 60 + ts.start_time.minute
        end_m = ts.end_time.hour * 60 + ts.end_time.minute
        timeslot_info_list[slot_idx] = {
            "id": ts.id,
            "date": ts.date,
            "start_time": ts.start_time,
            "end_time": ts.end_time,
            "start_m": start_m,
            "end_m": end_m,
            "day_num": date_map.get(ts.date),
            "is_morning": ts.start_time < LIMIT_TIME,
            "weekday": ts.date.weekday(),
            "timeslot_obj": ts
        }

    generated_timeslot_indices = {timeslot_id_to_idx[ts_id] for ts_id in generated_timeslot_ids}

    # Rooms sequential indexing
    num_rooms = len(room_ids)
    room_id_to_idx = {r_id: idx for idx, r_id in enumerate(room_ids)}
    room_floors = [room_floor_by_id[r_id] for r_id in room_ids]
    room_buildings = [room_building_by_id[r_id] for r_id in room_ids]
    room_names = [room_name_by_id[r_id] for r_id in room_ids]

    floor_counts = {}
    for r_idx in range(num_rooms):
        b = room_buildings[r_idx]
        f = room_floors[r_idx]
        floor_counts[(b, f)] = floor_counts.get((b, f), 0) + 1
    max_floor_cap = max(floor_counts.values()) if floor_counts else 0

    # Proctors sequential indexing
    proctor_ids = list(proctor_data.keys())
    num_proctors = len(proctor_ids)
    proctor_id_to_idx = {pid: idx for idx, pid in enumerate(proctor_ids)}
    proctor_max_assignments = [proctor_data[pid]["max_assignments"] for pid in proctor_ids]

    # Preprocess groups to avoid ORM access inside the GA loops
    report_progress(40, "Preparing optimizer", "Precomputing valid slots and proctor candidates")
    preprocessed_groups = []
    for g in groups:
        prep_sections = []
        section_ids_set = set()
        for idx_in_g, (sec, sub) in enumerate(g["sections"]):
            prep_sections.append({
                "sec_id": sec.id,
                "sec_name": sec.name,
                "sub_id": sub.id,
                "sub_name": sub.name,
                "course_id": sub.course_id,
                "year_level_id": sub.year_level_id,
                "semester": sub.semester,
                "subjects_per_section": subjects_per_section.get(sec.id, 0),
                "preferred_room_id": sec.preferred_room_id,
                "idx_in_g": idx_in_g
            })
            section_ids_set.add(sec.id)
        
        # Precompute slot proctors list for every timeslot (covers repair assignments too)
        slot_proctors = {}
        for slot_id, slot_idx in timeslot_id_to_idx.items():
            ts_inf = timeslot_info_list[slot_idx]
            slot_proctors[slot_idx] = []
            for sec, sub in g["sections"]:
                candidates = []
                for p_idx, pid in enumerate(proctor_ids):
                    pdata = proctor_data[pid]
                    dow = ts_inf["weekday"]
                    if dow not in pdata["availability"]:
                        continue
                    if not intervals_cover(pdata["availability"][dow], ts_inf["start_time"], ts_inf["end_time"]):
                        continue
                    is_own_class = False
                    for taught_name in pdata["taught_subjects"]:
                        if subjects_match(taught_name, sub.name):
                            is_own_class = True
                            break
                    if is_own_class:
                        continue
                    if (sub.id, sec.id) in pdata["forbidden"]:
                        continue
                    candidates.append(p_idx)
                slot_proctors[slot_idx].append(candidates)
                
        # Store the allowed slots as a set for fast membership testing in fitness function
        allowed_slots_set = {timeslot_id_to_idx[sid] for sid in g["allowed_slots"]}
        preprocessed_groups.append({
            "name": g["name"],
            "sections": prep_sections,
            "allowed_slots": [timeslot_id_to_idx[sid] for sid in g["allowed_slots"]],
            "allowed_slots_set": allowed_slots_set,
            "classification": g["classification"],
            "section_ids_set": section_ids_set,
            "slot_proctors": slot_proctors
        })

    preprocessed_groups.sort(
        key=lambda g: (len(g["allowed_slots"]), -len(g["sections"]), g["name"])
    )

    # Pre-evaluate posted exams into plain lists/dicts to completely avoid database queries in fitness
    posted_room_loads_init = [0] * num_rooms
    posted_proctor_counts_init = [0] * num_proctors

    posted_section_slots_set = set()
    posted_room_slots_set = set()
    posted_proctor_slots_set = set()

    posted_section_day_counts = {}
    posted_section_day_slots = {}

    for e in posted_exams:
        if not e.timeslot:
            continue
        slot_id = e.timeslot.id
        if slot_id not in timeslot_id_to_idx:
            continue
        slot_idx = timeslot_id_to_idx[slot_id]
        ts_inf = timeslot_info_list[slot_idx]
        
        posted_section_slots_set.add((e.section_id, slot_idx))
        
        if e.room_id in room_id_to_idx:
            r_idx = room_id_to_idx[e.room_id]
            posted_room_slots_set.add((r_idx, slot_idx))
            posted_room_loads_init[r_idx] += 1
            
        if e.proctor_id in proctor_id_to_idx:
            p_idx = proctor_id_to_idx[e.proctor_id]
            posted_proctor_slots_set.add((p_idx, slot_idx))
            posted_proctor_counts_init[p_idx] += 1
            
        day = ts_inf["date"]
        posted_section_day_counts[(e.section_id, day)] = posted_section_day_counts.get((e.section_id, day), 0) + 1
        posted_section_day_slots.setdefault((e.section_id, day), []).append(ts_inf)

    slot_room_capacity = [num_rooms] * num_timeslots
    for slot_idx in range(num_timeslots):
        posted_room_count = sum(
            1 for r_idx in range(num_rooms)
            if (r_idx, slot_idx) in posted_room_slots_set
        )
        slot_room_capacity[slot_idx] = max(0, num_rooms - posted_room_count)

    group_room_demands = [len(g["sections"]) for g in preprocessed_groups]

    # Precomputations for ultra-fast conflict and gap checking
    num_groups = len(preprocessed_groups)
    section_to_groups = {}
    for g_idx, g in enumerate(preprocessed_groups):
        for sec_id in g["section_ids_set"]:
            section_to_groups.setdefault(sec_id, []).append(g_idx)

    conflicting_groups = []
    for g_idx, g in enumerate(preprocessed_groups):
        confs = set()
        for sec_id in g["section_ids_set"]:
            for other_idx in section_to_groups[sec_id]:
                if other_idx != g_idx:
                    confs.add(other_idx)
        conflicting_groups.append(sorted(confs))

    group_posted_conflicts = []
    for g_idx, g in enumerate(preprocessed_groups):
        conf_slots = set()
        for sec_id in g["section_ids_set"]:
            for s_idx in range(num_timeslots):
                if (sec_id, s_idx) in posted_section_slots_set:
                    conf_slots.add(s_idx)
        group_posted_conflicts.append(conf_slots)

    posted_sec_day_slots_m = {}
    for (sec_id, day), ts_list in posted_section_day_slots.items():
        posted_sec_day_slots_m[(sec_id, day)] = [(ts["start_m"], ts["end_m"]) for ts in ts_list]

    def get_slot_room_demand(individual, exclude_group_idx=None):
        demand_by_slot = [0] * num_timeslots
        for group_idx, slot_idx in enumerate(individual):
            if group_idx == exclude_group_idx or slot_idx is None:
                continue
            demand_by_slot[slot_idx] += group_room_demands[group_idx]
        return demand_by_slot

    def get_capacity_safe_slots(group_idx, candidate_slots, current_individual=None):
        demand_by_slot = get_slot_room_demand(current_individual or [], exclude_group_idx=group_idx)
        group_demand = group_room_demands[group_idx]
        return [
            slot_idx for slot_idx in candidate_slots
            if slot_room_capacity[slot_idx] - demand_by_slot[slot_idx] >= group_demand
        ]

    def choose_capacity_balanced_slot(group_idx, candidate_slots, current_individual=None):
        if not candidate_slots:
            return None

        demand_by_slot = get_slot_room_demand(current_individual or [], exclude_group_idx=group_idx)
        group_demand = group_room_demands[group_idx]
        return max(
            candidate_slots,
            key=lambda slot_idx: (
                slot_room_capacity[slot_idx] - demand_by_slot[slot_idx] - group_demand,
                -demand_by_slot[slot_idx],
                random.random(),
            ),
        )

    def group_has_section_conflict(individual, group_idx, target_slot_idx):
        if target_slot_idx in group_posted_conflicts[group_idx]:
            return True
        for other_idx in conflicting_groups[group_idx]:
            if other_idx < len(individual) and individual[other_idx] == target_slot_idx:
                return True
        return False

    def group_slot_creates_gap_violation(group_idx, slot_idx, individual_or_map, exclude_group_idx=None):
        ts_inf = timeslot_info_list[slot_idx]
        day = ts_inf["date"]
        s_m = ts_inf["start_m"]
        e_m = ts_inf["end_m"]

        if isinstance(individual_or_map, dict):
            for sec_id in preprocessed_groups[group_idx]["section_ids_set"]:
                existing = individual_or_map.get((sec_id, day), [])
                if len(existing) >= 3:
                    return True
                if existing and not _minutes_gap_ok(existing, s_m, e_m):
                    return True
            return False

        individual = individual_or_map
        for sec_id in preprocessed_groups[group_idx]["section_ids_set"]:
            existing = list(posted_sec_day_slots_m.get((sec_id, day), ()))
            for other_g in section_to_groups.get(sec_id, ()):
                if other_g == exclude_group_idx or other_g >= len(individual):
                    continue
                assigned_s = individual[other_g]
                if assigned_s is not None:
                    o_ts = timeslot_info_list[assigned_s]
                    if o_ts["date"] == day:
                        existing.append((o_ts["start_m"], o_ts["end_m"]))
            if len(existing) >= 3:
                return True
            if existing and not _minutes_gap_ok(existing, s_m, e_m):
                return True
        return False

    def get_individual_section_day_slots(individual, exclude_group_idx=None):
        sec_day_map = {}
        for (sec_id, day), ts_list in posted_section_day_slots.items():
            sec_day_map.setdefault((sec_id, day), []).extend(
                [(ts["start_m"], ts["end_m"]) for ts in ts_list]
            )

        if individual:
            for g_i, slot_idx in enumerate(individual):
                if g_i == exclude_group_idx or slot_idx is None:
                    continue
                ts_inf = timeslot_info_list[slot_idx]
                day = ts_inf["date"]
                s_m = ts_inf["start_m"]
                e_m = ts_inf["end_m"]
                for sec_id in preprocessed_groups[g_i]["section_ids_set"]:
                    sec_day_map.setdefault((sec_id, day), []).append((s_m, e_m))

        return sec_day_map

    def generate_random_allele(group_idx, current_individual=None):
        group = preprocessed_groups[group_idx]
        if current_individual is not None:
            used_slots = set()
            for other_idx in conflicting_groups[group_idx]:
                if other_idx < len(current_individual):
                    s = current_individual[other_idx]
                    if s is not None:
                        used_slots.add(s)
                        
            free_slots = [s for s in group["allowed_slots"] if s not in used_slots]
            candidate_slots = free_slots or group["allowed_slots"]

            gap_safe_slots = [
                s for s in candidate_slots
                if not group_slot_creates_gap_violation(group_idx, s, current_individual, exclude_group_idx=group_idx)
            ]
            if gap_safe_slots:
                candidate_slots = gap_safe_slots
        else:
            candidate_slots = group["allowed_slots"]
        capacity_slots = get_capacity_safe_slots(group_idx, candidate_slots, current_individual)
        slot_idx = choose_capacity_balanced_slot(
            group_idx,
            capacity_slots or candidate_slots,
            current_individual,
        )
        return slot_idx

    def find_room_repair_target(individual, demand_by_slot, group_idx, current_slot_idx):
        group = preprocessed_groups[group_idx]
        demand = group_room_demands[group_idx]
        candidates = []

        for slot_idx in group["allowed_slots"]:
            if slot_idx == current_slot_idx:
                continue
            if group_has_section_conflict(individual, group_idx, slot_idx):
                continue

            remaining_capacity = slot_room_capacity[slot_idx] - demand_by_slot[slot_idx]
            if remaining_capacity < demand:
                continue

            has_gap_viol = group_slot_creates_gap_violation(group_idx, slot_idx, individual, exclude_group_idx=group_idx)

            target_info = timeslot_info_list[slot_idx]
            current_info = timeslot_info_list[current_slot_idx]
            candidates.append((
                1 if has_gap_viol else 0,
                0 if target_info["date"] == current_info["date"] else 1,
                -remaining_capacity,
                target_info["date"],
                target_info["start_time"],
                slot_idx,
            ))

        if not candidates:
            return None

        candidates.sort()
        return candidates[0][-1]

    def repair_room_overflows(individual):
        repaired = list(individual)
        moves = []
        max_passes = min(20, max(1, len(repaired)))

        for _ in range(max_passes):
            demand_by_slot = get_slot_room_demand(repaired)
            overflows = [
                (slot_idx, demand - slot_room_capacity[slot_idx])
                for slot_idx, demand in enumerate(demand_by_slot)
                if demand > slot_room_capacity[slot_idx]
            ]
            if not overflows:
                return repaired, moves, []

            moved = False
            for slot_idx, _overflow in sorted(overflows, key=lambda item: item[1], reverse=True):
                group_indices = [idx for idx, assigned_slot in enumerate(repaired) if assigned_slot == slot_idx]
                group_indices.sort(key=lambda idx: (len(preprocessed_groups[idx]["allowed_slots"]), -group_room_demands[idx]))

                for group_idx in group_indices:
                    target_slot_idx = find_room_repair_target(repaired, demand_by_slot, group_idx, slot_idx)
                    if not target_slot_idx:
                        continue

                    repaired[group_idx] = target_slot_idx
                    moves.append((group_idx, slot_idx, target_slot_idx))
                    moved = True
                    break

                if moved:
                    break

            if not moved:
                return repaired, moves, overflows

        demand_by_slot = get_slot_room_demand(repaired)
        overflows = [
            (slot_idx, demand - slot_room_capacity[slot_idx])
            for slot_idx, demand in enumerate(demand_by_slot)
            if demand > slot_room_capacity[slot_idx]
        ]
        return repaired, moves, overflows

    def repair_section_gaps(individual):
        repaired = list(individual)
        demand_by_slot = get_slot_room_demand(repaired)

        for _ in range(3):
            moved_any = False
            for sec_id, g_indices in section_to_groups.items():
                by_day = {}
                for g_i in g_indices:
                    if g_i < len(repaired):
                        s_idx = repaired[g_i]
                        if s_idx is not None:
                            by_day.setdefault(timeslot_info_list[s_idx]["date"], []).append((g_i, s_idx))

                for day, g_s_pairs in by_day.items():
                    if len(g_s_pairs) < 2:
                        continue
                    sorted_pairs = sorted(g_s_pairs, key=lambda p: timeslot_info_list[p[1]]["start_m"])
                    has_gap = any(
                        timeslot_info_list[sorted_pairs[i+1][1]]["start_m"] - timeslot_info_list[sorted_pairs[i][1]]["end_m"] > 90
                        for i in range(len(sorted_pairs) - 1)
                    )
                    if not has_gap:
                        continue

                    for g_idx, curr_slot in sorted_pairs:
                        group = preprocessed_groups[g_idx]
                        curr_demand = group_room_demands[g_idx]

                        best_alt = None
                        best_alt_score = -999999

                        allowed_cands = [s for s in group["allowed_slots"] if s != curr_slot]
                        other_cands = [s for s in sorted(generated_timeslot_indices) if s != curr_slot and s not in group["allowed_slots"]]

                        for cand_slot in allowed_cands + other_cands:
                            if group_has_section_conflict(repaired, g_idx, cand_slot):
                                continue
                            rem_cap = slot_room_capacity[cand_slot] - demand_by_slot[cand_slot]
                            if rem_cap < curr_demand:
                                continue
                            if group_slot_creates_gap_violation(g_idx, cand_slot, repaired, exclude_group_idx=g_idx):
                                continue

                            alt_info = timeslot_info_list[cand_slot]
                            bonus = 50 if cand_slot in group["allowed_slots"] else 0
                            score = (100 if alt_info["date"] == day else 10) + bonus + rem_cap
                            if score > best_alt_score:
                                best_alt_score = score
                                best_alt = cand_slot

                        if best_alt is not None:
                            repaired[g_idx] = best_alt
                            demand_by_slot[curr_slot] -= curr_demand
                            demand_by_slot[best_alt] += curr_demand
                            moved_any = True
                            break

                    if moved_any:
                        break
            if not moved_any:
                break

        return repaired

    def create_individual():
        ind = []
        for i in range(len(preprocessed_groups)):
            ind.append(generate_random_allele(i, ind))
        repaired, _, _ = repair_room_overflows(ind)
        repaired = repair_section_gaps(repaired)
        return repaired

    def copy_individual(ind):
        return list(ind)

    # Precompute static penalties for sections not in active_run_sections
    active_run_sections = {sec_id for g in preprocessed_groups for sec_id in g["section_ids_set"]}
    posted_sec_ids = {k[0] for k in posted_section_day_slots.keys()}
    
    static_penalty = 0
    for sec_id in posted_sec_ids:
        if sec_id in active_run_sections:
            continue
        
        day_slots_map = {}
        for (s_id, day), slots in posted_section_day_slots.items():
            if s_id == sec_id:
                day_slots_map[day] = slots
                
        total_section_exams = sum(len(slots) for slots in day_slots_map.values())
        total_subjects_posted = subjects_per_section.get(sec_id, 0)

        # For sections with >= 8 subjects: must use all 4 exam days
        if total_subjects_posted >= 8 and len(day_slots_map) < NUM_EXAM_DAYS:
            static_penalty -= 10000 * (NUM_EXAM_DAYS - len(day_slots_map))

        for day, slots in day_slots_map.items():
            num_exams = len(slots)
            # Min 2 per active day, max 3 per active day (universal rule)
            if num_exams > 3:
                static_penalty -= 10000
            elif num_exams == 1 and total_section_exams >= 2:
                static_penalty -= 10000
                
            if num_exams >= 2:
                sorted_slots = sorted(slots, key=lambda s: s["start_m"])
                for i in range(len(sorted_slots) - 1):
                    gap_minutes = sorted_slots[i+1]["start_m"] - sorted_slots[i]["end_m"]
                    if gap_minutes > 90:
                        excess = gap_minutes - 90
                        static_penalty -= 5000000 + excess * 10000

    def fitness(individual):
        score = static_penalty
        
        # Group individuals by timeslot to process allocations sequentially
        slot_allocations = {}
        for idx, slot_idx in enumerate(individual):
            if slot_idx is not None:
                slot_allocations.setdefault(slot_idx, []).append(idx)
                
        for slot_idx, group_indices in slot_allocations.items():
            room_demand = sum(group_room_demands[group_idx] for group_idx in group_indices)
            room_capacity = slot_room_capacity[slot_idx]
            if room_demand > room_capacity:
                score -= (room_demand - room_capacity) * 2000000
            else:
                score += (room_capacity - room_demand) * 25
             
        proctor_counts = list(posted_proctor_counts_init)
        
        section_slots_set = set()
        room_slots_set = set()
        room_loads = list(posted_room_loads_init)
        proctor_slots_set = set()
        section_day_counts = {}
        section_day_slots = {}
        
        section_day2_major_counts = {}
        
        # Process timeslot allocations
        for slot_idx, group_indices in slot_allocations.items():
            ts_inf = timeslot_info_list[slot_idx]
            day = ts_inf["date"]
            day_num = ts_inf["day_num"]
            is_morning = ts_inf["is_morning"]

            # HARD CONSTRAINT: Penalize any group placed outside its template-assigned slots.
            # The Tertiary Periodical Departmental Exam Schedule template MUST always be followed.
            # Penalty is set extremely high (50M per section) to make violations effectively impossible.
            for g_idx in group_indices:
                group = preprocessed_groups[g_idx]
                allowed_slots_set = group.get("allowed_slots_set", set())
                if allowed_slots_set and slot_idx not in allowed_slots_set:
                    score -= 50000000 * len(group["sections"])

            # Group room assignments to enforce the same-floor building constraint.
            # Each course's sections within a subject group must be on the same floor.
            sorted_g_indices = sorted(group_indices, key=lambda gi: -len(preprocessed_groups[gi]["sections"]))
            for g_idx in sorted_g_indices:
                group = preprocessed_groups[g_idx]
                sections_in_group = group["sections"]
                N = len(sections_in_group)

                available_r_indices = [
                    r_idx for r_idx in range(num_rooms)
                    if (r_idx, slot_idx) not in room_slots_set and (r_idx, slot_idx) not in posted_room_slots_set
                ]

                def room_key(r_idx):
                    load = room_loads[r_idx]
                    floor = room_floors[r_idx]
                    if floor >= HIGH_FLOOR_MIN and load < ROOM_BOOKING_TARGET:
                        prio = 0
                    elif load < ROOM_BOOKING_TARGET:
                        prio = 1
                    else:
                        prio = 2
                    return (prio, load, -floor, room_names[r_idx])

                sub_chosen = []
                # Check for preferred room first
                pref_found = False
                for ps in sections_in_group:
                    pref_room_id = ps.get("preferred_room_id")
                    if pref_room_id and pref_room_id in room_id_to_idx:
                        pref_r_idx = room_id_to_idx[pref_room_id]
                        if pref_r_idx in available_r_indices:
                            pref_b = room_buildings[pref_r_idx]
                            pref_f = room_floors[pref_r_idx]
                            floor_rooms = [
                                r for r in available_r_indices
                                if room_buildings[r] == pref_b and room_floors[r] == pref_f
                            ]
                            if len(floor_rooms) >= N:
                                remaining = [r for r in floor_rooms if r != pref_r_idx]
                                remaining.sort(key=room_key)
                                sub_chosen = [pref_r_idx] + remaining[:N-1]
                                pref_found = True
                                break

                if not pref_found:
                    available_by_floor = {}
                    for r_idx in available_r_indices:
                        b = room_buildings[r_idx]
                        f = room_floors[r_idx]
                        available_by_floor.setdefault((b, f), []).append(r_idx)

                    valid_floors = {
                        fl_key: fl_rooms
                        for fl_key, fl_rooms in available_by_floor.items()
                        if len(fl_rooms) >= N
                    }

                    if valid_floors:
                        def floor_sort_key(fl_key, _N=N):
                            fl_rooms = valid_floors[fl_key]
                            sorted_r_keys = sorted([room_key(r) for r in fl_rooms])
                            return sorted_r_keys[:_N]

                        best_fl_key = min(valid_floors.keys(), key=floor_sort_key)
                        best_fl_rooms = valid_floors[best_fl_key]
                        best_fl_rooms.sort(key=room_key)
                        sub_chosen = best_fl_rooms[:N]
                    else:
                        # Fallback: cannot fit subject group sections on a single floor. Penalize only if N <= max_floor_cap.
                        if N <= max_floor_cap:
                            score -= 300000 * N
                        
                        # Fallback room assignment: group available rooms by building/floor
                        # and pick from floors with the most available rooms to keep them as grouped as possible.
                        floor_groups = {}
                        for r_idx in available_r_indices:
                            b = room_buildings[r_idx]
                            f = room_floors[r_idx]
                            floor_groups.setdefault((b, f), []).append(r_idx)
                        
                        sorted_floors = sorted(floor_groups.values(), key=lambda r_list: -len(r_list))
                        sub_chosen = []
                        for fl_rooms in sorted_floors:
                            fl_rooms_sorted = sorted(fl_rooms, key=room_key)
                            needed = N - len(sub_chosen)
                            sub_chosen.extend(fl_rooms_sorted[:needed])
                            if len(sub_chosen) == N:
                                break

                for r_idx in sub_chosen:
                    room_slots_set.add((r_idx, slot_idx))
                    room_loads[r_idx] += 1

                if len(sub_chosen) < N:
                    score -= (N - len(sub_chosen)) * 1000000
            
            # Flatten all section/exam requirements for this slot_idx
            slot_exams = []
            for g_idx in group_indices:
                group = preprocessed_groups[g_idx]
                for prep_sec in group["sections"]:
                    slot_exams.append({
                        "g_idx": g_idx,
                        "prep_sec": prep_sec,
                        "candidates": group["slot_proctors"][slot_idx][prep_sec["idx_in_g"]]
                    })
            
            # Assign proctors greedily (sort by constraints, most restricted first)
            slot_exams.sort(key=lambda x: len(x["candidates"]))
            
            assigned_proctors_in_slot = set()
            
            for exam in slot_exams:
                g_idx = exam["g_idx"]
                prep_sec = exam["prep_sec"]
                sec_id = prep_sec["sec_id"]
                group = preprocessed_groups[g_idx]
                classification = group["classification"]
                
                # Track Day 2 Afternoon majors
                if classification == "MAJOR" and day_num == 2 and not is_morning:
                    section_day2_major_counts[sec_id] = section_day2_major_counts.get(sec_id, 0) + 1
                
                # Section overlap
                if (sec_id, slot_idx) in section_slots_set or (sec_id, slot_idx) in posted_section_slots_set:
                    score -= 500000
                else:
                    section_slots_set.add((sec_id, slot_idx))
                    
                # Max exams per day
                d_key = (sec_id, day)
                d_count = section_day_counts.get(d_key, 0)
                if d_count == 0:
                    d_count = posted_section_day_counts.get(d_key, 0)
                d_count += 1
                section_day_counts[d_key] = d_count
                
                if d_count > 3:
                    score -= 20000
                    
                # Collect slot per section per day
                section_day_slots.setdefault(d_key, []).append(ts_inf)
                
                # Greedy Proctor Assignment
                p_idx = -1
                best_count = 99999
                for pidx in exam["candidates"]:
                    if (pidx, slot_idx) in proctor_slots_set or (pidx, slot_idx) in posted_proctor_slots_set or pidx in assigned_proctors_in_slot:
                        continue
                    if proctor_counts[pidx] >= proctor_max_assignments[pidx]:
                        continue
                    if proctor_counts[pidx] < best_count:
                        best_count = proctor_counts[pidx]
                        p_idx = pidx
                        
                if p_idx != -1:
                    proctor_slots_set.add((p_idx, slot_idx))
                    assigned_proctors_in_slot.add(p_idx)
                    proctor_counts[p_idx] += 1
                    if proctor_counts[p_idx] > proctor_max_assignments[p_idx]:
                        score -= 10000
                    score += 50
                else:
                    score -= 30000  # Penalty for unassigned proctor

        # Apply penalty for Day 2 Afternoon > 2 majors
        for sec_id, major_count in section_day2_major_counts.items():
            if major_count > 2:
                score -= 500000 * (major_count - 2)

        # Reward for spreading exams
        active_days_by_sec = {}
        for sec_id in active_run_sections:
            for (posted_sec_id, day) in posted_section_day_counts.keys():
                if posted_sec_id == sec_id:
                    active_days_by_sec.setdefault(sec_id, set()).add(day)
        for (sec_id, day) in section_day_counts.keys():
            active_days_by_sec.setdefault(sec_id, set()).add(day)
            
        for sec_id, days_set in active_days_by_sec.items():
            if len(days_set) >= 3:
                score += 1000

        # Check daily counts and gap limits for each section
        for sec_id in active_run_sections:
            new_days = {day for (s_id, day) in section_day_slots.keys() if s_id == sec_id}
            posted_days = {day for (s_id, day) in posted_section_day_slots.keys() if s_id == sec_id}
            all_days = new_days | posted_days
            
            total_section_exams = 0
            for day in all_days:
                new_slots = section_day_slots.get((sec_id, day), [])
                posted_slots = posted_section_day_slots.get((sec_id, day), [])
                total_section_exams += len(new_slots) + len(posted_slots)

            # For sections with >= 8 subjects: must use all 4 exam days
            if subjects_per_section.get(sec_id, 0) >= 8 and len(all_days) < NUM_EXAM_DAYS:
                score -= 10000 * (NUM_EXAM_DAYS - len(all_days))

            for day in all_days:
                new_slots = section_day_slots.get((sec_id, day), [])
                posted_slots = posted_section_day_slots.get((sec_id, day), [])
                slots = new_slots + posted_slots
                num_exams = len(slots)

                # Constraint 1: Validate daily exam counts per section/student
                # Min 2 per active day, max 3 per active day (universal rule)
                if num_exams > 3:
                    score -= 10000
                elif num_exams == 1 and total_section_exams >= 2:
                    score -= 10000
                
                # Constraint 2: gap limits (maximum gap between consecutive exams is 90 minutes / 1h 30m)
                if num_exams >= 2:
                    sorted_slots = sorted(slots, key=lambda s: s["start_m"])
                    for i in range(len(sorted_slots) - 1):
                        gap_minutes = sorted_slots[i+1]["start_m"] - sorted_slots[i]["end_m"]
                        if gap_minutes > 90:
                            excess = gap_minutes - 90
                            score -= 5000000 + excess * 10000

        return score

    def build_capacity_safe_individual(seed_individual=None):
        assigned = [None] * len(preprocessed_groups)
        group_order = sorted(
            range(len(preprocessed_groups)),
            key=lambda idx: (len(preprocessed_groups[idx]["allowed_slots"]), -group_room_demands[idx]),
        )

        for group_idx in group_order:
            group = preprocessed_groups[group_idx]
            preferred_slot = seed_individual[group_idx] if seed_individual else None
            candidate_slots = list(group["allowed_slots"])
            candidate_slots.sort(
                key=lambda slot_idx: (
                    0 if slot_idx == preferred_slot else 1,
                    timeslot_info_list[slot_idx]["date"],
                    timeslot_info_list[slot_idx]["start_time"],
                )
            )

            non_conflicting_slots = [
                slot_idx for slot_idx in candidate_slots
                if not group_has_section_conflict(assigned, group_idx, slot_idx)
            ]
            capacity_slots = get_capacity_safe_slots(group_idx, non_conflicting_slots, assigned)
            
            gap_safe_capacity_slots = [
                s for s in capacity_slots
                if not group_slot_creates_gap_violation(group_idx, s, assigned, exclude_group_idx=group_idx)
            ]
            chosen_slot = choose_capacity_balanced_slot(group_idx, gap_safe_capacity_slots, assigned) if gap_safe_capacity_slots else None

            if chosen_slot is None:
                gap_safe_non_conflicting = [
                    s for s in non_conflicting_slots
                    if not group_slot_creates_gap_violation(group_idx, s, assigned, exclude_group_idx=group_idx)
                ]
                if gap_safe_non_conflicting:
                    chosen_slot = choose_capacity_balanced_slot(group_idx, gap_safe_non_conflicting, assigned)

            if chosen_slot is None:
                all_non_conflicting_slots = [
                    slot_idx for slot_idx in sorted(generated_timeslot_indices)
                    if not group_has_section_conflict(assigned, group_idx, slot_idx)
                ]
                all_capacity_slots = get_capacity_safe_slots(group_idx, all_non_conflicting_slots, assigned)
                gap_safe_all_cap = [
                    s for s in all_capacity_slots
                    if not group_slot_creates_gap_violation(group_idx, s, assigned, exclude_group_idx=group_idx)
                ]
                if gap_safe_all_cap:
                    chosen_slot = choose_capacity_balanced_slot(group_idx, gap_safe_all_cap, assigned)

            if chosen_slot is None:
                chosen_slot = choose_capacity_balanced_slot(group_idx, capacity_slots or non_conflicting_slots or candidate_slots, assigned)
            assigned[group_idx] = chosen_slot

        return assigned

    population = [create_individual() for _ in range(POP_SIZE)]
    
    best_individual = None
    best_fitness = -float('inf')
    generations_without_improvement = 0

    fitness_cache = {}
    def get_fitness(ind):
        key = tuple(ind)
        fit = fitness_cache.get(key)
        if fit is None:
            fit = fitness(ind)
            fitness_cache[key] = fit
        return fit

    # Evolutionary Loop
    for gen in range(GENERATIONS):
        pop_fitness = [(ind, get_fitness(ind)) for ind in population]
        pop_fitness.sort(key=lambda x: x[1], reverse=True)
        
        if pop_fitness[0][1] > best_fitness:
            best_fitness = pop_fitness[0][1]
            best_individual = copy_individual(pop_fitness[0][0])
            generations_without_improvement = 0
        else:
            generations_without_improvement += 1
            
        if gen % 5 == 0 or gen == GENERATIONS - 1:
            print(f"[GA] Gen {gen}: Best Fitness = {pop_fitness[0][1]}, Average = {sum(x[1] for x in pop_fitness)/len(pop_fitness):.1f}")
            ga_percent = 45 + ((gen + 1) / GENERATIONS) * 40
            report_progress(ga_percent, "Optimizing schedule", f"Generation {gen + 1} of {GENERATIONS}")
            
        # Early stopping if converged
        if generations_without_improvement >= 12 and gen >= 20:
            print(f"[GA] Search converged at generation {gen} with best fitness {best_fitness}.")
            report_progress(85, "Optimizing schedule", "Search converged successfully")
            break

        new_population = []
        # Elitism: keep best 2
        new_population.append(copy_individual(pop_fitness[0][0]))
        new_population.append(copy_individual(pop_fitness[1][0]))
        
        while len(new_population) < POP_SIZE:
            # Tournament Selection
            t1 = random.choice(pop_fitness)
            t2 = random.choice(pop_fitness)
            parent1 = t1[0] if t1[1] > t2[1] else t2[0]
            
            t3 = random.choice(pop_fitness)
            t4 = random.choice(pop_fitness)
            parent2 = t3[0] if t3[1] > t4[1] else t3[0]
            
            # Crossover (Uniform)
            child = [parent1[i] if random.random() < 0.5 else parent2[i] for i in range(len(preprocessed_groups))]
                    
            # Mutation
            for i in range(len(preprocessed_groups)):
                if random.random() < MUTATION_RATE:
                    child[i] = generate_random_allele(i, child)
            new_population.append(child)
            
        population = new_population

    if best_individual:
        best_individual, room_repair_moves, room_overflows = repair_room_overflows(best_individual)
        best_individual = repair_section_gaps(best_individual)
        if room_repair_moves:
            print(f"[SCHEDULER] Room capacity repair moved {len(room_repair_moves)} subject group(s) to open slots.")
        if room_overflows:
            overflow_details = []
            for slot_idx, overflow_count in room_overflows[:5]:
                ts_inf = timeslot_info_list[slot_idx]
                overflow_details.append(
                    f"{ts_inf['date']} {ts_inf['start_time'].strftime('%I:%M %p')} (+{overflow_count})"
                )
            print(f"[SCHEDULER] Room capacity still exceeded after repair: {', '.join(overflow_details)}")
            fallback_individual = build_capacity_safe_individual(best_individual)
            fallback_individual, fallback_moves, fallback_overflows = repair_room_overflows(fallback_individual)
            fallback_individual = repair_section_gaps(fallback_individual)
            if not fallback_overflows:
                best_individual = fallback_individual
                print("[SCHEDULER] Room capacity fallback produced a room-safe timetable.")
            elif sum(count for _, count in fallback_overflows) < sum(count for _, count in room_overflows):
                best_individual = fallback_individual
                print("[SCHEDULER] Room capacity fallback reduced overloaded room demand.")
        best_individual = repair_section_gaps(best_individual)

    # Print breakdown of best individual
    report_progress(88, "Validating schedule", "Checking the best generated timetable")
    if best_individual:
        slot_allocations = {}
        for idx, slot_idx in enumerate(best_individual):
            if slot_idx is not None:
                slot_allocations.setdefault(slot_idx, []).append(idx)
            
        proctor_counts = list(posted_proctor_counts_init)
        
        section_slots_set = set()
        room_slots_set = set(posted_room_slots_set)
        room_loads = list(posted_room_loads_init)
        proctor_slots_set = set(posted_proctor_slots_set)
        section_day_counts = {}
        section_day_slots = {}
        section_day2_major_counts = {}
        
        sec_overlap = 0
        room_overlap = 0
        proc_overlap = 0
        proc_limit = 0
        sec_limit = 0
        daily_viol = 0
        gap_viol = 0
        
        for slot_idx, group_indices in slot_allocations.items():
            ts_inf = timeslot_info_list[slot_idx]
            day = ts_inf["date"]
            day_num = ts_inf["day_num"]
            is_morning = ts_inf["is_morning"]

            # Penalize any group placed outside its allowed slots (e.g. general subjects outside Day 1/2 morning)
            for g_idx in group_indices:
                group = preprocessed_groups[g_idx]
                allowed_slots_set = group.get("allowed_slots_set", set())
                if allowed_slots_set and slot_idx not in allowed_slots_set:
                    daily_viol += len(group["sections"])

            # Group room assignments to enforce the same-floor building constraint (per course).
            sorted_g_indices = sorted(group_indices, key=lambda gi: -len(preprocessed_groups[gi]["sections"]))
            for g_idx in sorted_g_indices:
                group = preprocessed_groups[g_idx]
                sections_in_group = group["sections"]
                N = len(sections_in_group)

                available_r_indices = [
                    r_idx for r_idx in range(num_rooms)
                    if (r_idx, slot_idx) not in room_slots_set
                ]

                def room_key(r_idx):
                    load = room_loads[r_idx]
                    floor = room_floors[r_idx]
                    if floor >= HIGH_FLOOR_MIN and load < ROOM_BOOKING_TARGET:
                        prio = 0
                    elif load < ROOM_BOOKING_TARGET:
                        prio = 1
                    else:
                        prio = 2
                    return (prio, load, -floor, room_names[r_idx])

                sub_chosen = []
                # Check for preferred room first
                pref_found = False
                for ps in sections_in_group:
                    pref_room_id = ps.get("preferred_room_id")
                    if pref_room_id and pref_room_id in room_id_to_idx:
                        pref_r_idx = room_id_to_idx[pref_room_id]
                        if pref_r_idx in available_r_indices:
                            pref_b = room_buildings[pref_r_idx]
                            pref_f = room_floors[pref_r_idx]
                            floor_rooms = [
                                r for r in available_r_indices
                                if room_buildings[r] == pref_b and room_floors[r] == pref_f
                            ]
                            if len(floor_rooms) >= N:
                                remaining = [r for r in floor_rooms if r != pref_r_idx]
                                remaining.sort(key=room_key)
                                sub_chosen = [pref_r_idx] + remaining[:N-1]
                                pref_found = True
                                break

                if not pref_found:
                    available_by_floor = {}
                    for r_idx in available_r_indices:
                        b = room_buildings[r_idx]
                        f = room_floors[r_idx]
                        available_by_floor.setdefault((b, f), []).append(r_idx)

                    valid_floors = {
                        fl_key: fl_rooms
                        for fl_key, fl_rooms in available_by_floor.items()
                        if len(fl_rooms) >= N
                    }

                    if valid_floors:
                        def floor_sort_key(fl_key, _N=N):
                            fl_rooms = valid_floors[fl_key]
                            sorted_r_keys = sorted([room_key(r) for r in fl_rooms])
                            return sorted_r_keys[:_N]

                        best_fl_key = min(valid_floors.keys(), key=floor_sort_key)
                        best_fl_rooms = valid_floors[best_fl_key]
                        best_fl_rooms.sort(key=room_key)
                        sub_chosen = best_fl_rooms[:N]
                    else:
                        # Fallback room assignment: group available rooms by building/floor
                        # and pick from floors with the most available rooms to keep them as grouped as possible.
                        floor_groups = {}
                        for r_idx in available_r_indices:
                            b = room_buildings[r_idx]
                            f = room_floors[r_idx]
                            floor_groups.setdefault((b, f), []).append(r_idx)
                        
                        sorted_floors = sorted(floor_groups.values(), key=lambda r_list: -len(r_list))
                        sub_chosen = []
                        for fl_rooms in sorted_floors:
                            fl_rooms_sorted = sorted(fl_rooms, key=room_key)
                            needed = N - len(sub_chosen)
                            sub_chosen.extend(fl_rooms_sorted[:needed])
                            if len(sub_chosen) == N:
                                break

                for r_idx in sub_chosen:
                    room_slots_set.add((r_idx, slot_idx))
                    room_loads[r_idx] += 1

                if len(sub_chosen) < N:
                    room_overlap += (N - len(sub_chosen))
            
            slot_exams = []
            for g_idx in group_indices:
                group = preprocessed_groups[g_idx]
                for prep_sec in group["sections"]:
                    slot_exams.append({
                        "g_idx": g_idx,
                        "prep_sec": prep_sec,
                        "candidates": group["slot_proctors"][slot_idx][prep_sec["idx_in_g"]]
                    })
                    
            slot_exams.sort(key=lambda x: len(x["candidates"]))
            assigned_proctors_in_slot = set()
            
            for exam in slot_exams:
                g_idx = exam["g_idx"]
                prep_sec = exam["prep_sec"]
                sec_id = prep_sec["sec_id"]
                group = preprocessed_groups[g_idx]
                classification = group["classification"]
                
                if classification == "MAJOR" and day_num == 2 and not is_morning:
                    section_day2_major_counts.setdefault(sec_id, 0)
                    section_day2_major_counts[sec_id] += 1
                
                if (sec_id, slot_idx) in section_slots_set or (sec_id, slot_idx) in posted_section_slots_set:
                    sec_overlap += 1
                else:
                    section_slots_set.add((sec_id, slot_idx))
                    
                d_key = (sec_id, day)
                d_count = section_day_counts.get(d_key, 0)
                if d_count == 0:
                    d_count = posted_section_day_counts.get(d_key, 0)
                d_count += 1
                section_day_counts[d_key] = d_count
                
                if d_count > 3:
                    sec_limit += 1
                    
                section_day_slots.setdefault(d_key, []).append(ts_inf)
                
                p_idx = -1
                best_count = 99999
                for pidx in exam["candidates"]:
                    if (pidx, slot_idx) in proctor_slots_set or pidx in assigned_proctors_in_slot:
                        continue
                    if proctor_counts[pidx] >= proctor_max_assignments[pidx]:
                        continue
                    if proctor_counts[pidx] < best_count:
                        best_count = proctor_counts[pidx]
                        p_idx = pidx
                        
                if p_idx != -1:
                    proctor_slots_set.add((p_idx, slot_idx))
                    assigned_proctors_in_slot.add(p_idx)
                    proctor_counts[p_idx] += 1
                    if proctor_counts[p_idx] > proctor_max_assignments[p_idx]:
                        proc_limit += 1

        active_days_by_sec = {}
        for sec_id in active_run_sections:
            for (posted_sec_id, day) in posted_section_day_counts.keys():
                if posted_sec_id == sec_id:
                    active_days_by_sec.setdefault(sec_id, set()).add(day)
        for (sec_id, day) in section_day_counts.keys():
            active_days_by_sec.setdefault(sec_id, set()).add(day)

        for sec_id in active_run_sections:
            new_days = {day for (s_id, day) in section_day_slots.keys() if s_id == sec_id}
            posted_days = {day for (s_id, day) in posted_section_day_slots.keys() if s_id == sec_id}
            all_days = new_days | posted_days
            
            total_section_exams = 0
            for day in all_days:
                new_slots = section_day_slots.get((sec_id, day), [])
                posted_slots = posted_section_day_slots.get((sec_id, day), [])
                total_section_exams += len(new_slots) + len(posted_slots)

            # For sections with >= 8 subjects: must use all 4 exam days
            if subjects_per_section.get(sec_id, 0) >= 8 and len(all_days) < NUM_EXAM_DAYS:
                daily_viol += (NUM_EXAM_DAYS - len(all_days))

            for day in all_days:
                new_slots = section_day_slots.get((sec_id, day), [])
                posted_slots = posted_section_day_slots.get((sec_id, day), [])
                slots = new_slots + posted_slots
                num_exams = len(slots)

                total_subjects = subjects_per_section.get(sec_id, 0)
                # Min 2 per active day, max 3 per active day (universal rule)
                if num_exams > 3:
                    daily_viol += 1
                elif num_exams == 1 and total_section_exams >= 2:
                    daily_viol += 1
                
                if num_exams >= 2:
                    sorted_slots = sorted(slots, key=lambda s: s["start_m"])
                    for i in range(len(sorted_slots) - 1):
                        gap_minutes = sorted_slots[i+1]["start_m"] - sorted_slots[i]["end_m"]
                        if gap_minutes > 90:
                            gap_viol += 1

        day2_major_viol = sum(1 for count in section_day2_major_counts.values() if count > 2)

        print(f"[GA RUN SUMMARY] Best Fitness: {best_fitness}")
        print(f"  - Section Overlaps: {sec_overlap}")
        print(f"  - Room Overlaps: {room_overlap}")
        print(f"  - Proctor Overlaps: {proc_overlap}")
        print(f"  - Proctor Assignment Limit Violations: {proc_limit}")
        print(f"  - Section Limit (>3 per day) Violations: {sec_limit}")
        print(f"  - Daily Distribution Violations (1-exam days, >3 exams/day, or missing days for >=8 subjects): {daily_viol}")
        print(f"  - Breaktime/Gap (>90m) Violations: {gap_viol}")
        print(f"  - Day 2 Afternoon Major Exam Violations (>2): {day2_major_viol}")

    # Apply Best Schedule
    report_progress(92, "Creating exams", "Assigning rooms and proctors to draft exams")
    generated_exams = []
    total_scheduled = 0
    assigned_proctor_count = 0
    assigned_room_count = 0
    
    if best_individual:
        proctor_counts = list(posted_proctor_counts_init)
        room_slots_set = set(posted_room_slots_set)
        room_loads = list(posted_room_loads_init)
        proctor_slots_set = set(posted_proctor_slots_set)
        section_slots_set = set(posted_section_slots_set)

        def available_room_count(slot_idx):
            return sum(
                1 for r_idx in range(num_rooms)
                if (r_idx, slot_idx) not in room_slots_set
            )

        def target_high_floor_count(slot_idx):
            return sum(
                1 for r_idx in range(num_rooms)
                if (
                    (r_idx, slot_idx) not in room_slots_set
                    and room_floors[r_idx] >= HIGH_FLOOR_MIN
                    and room_loads[r_idx] < ROOM_BOOKING_TARGET
                )
            )

        def group_has_final_section_conflict(group, slot_idx):
            return any(
                (sec_id, slot_idx) in section_slots_set
                for sec_id in group["section_ids_set"]
            )

        def pick_group_slot(group_idx, preferred_slot_idx):
            group = preprocessed_groups[group_idx]
            candidate_slots = list(dict.fromkeys(
                [preferred_slot_idx] + list(group["allowed_slots"]) + list(timeslot_id_to_idx.values())
            ))
            demand = len(group["sections"])

            current_sec_day_map = {}
            for (sec_id, day), ts_list in posted_section_day_slots.items():
                current_sec_day_map.setdefault((sec_id, day), []).extend(
                    [(ts["start_m"], ts["end_m"]) for ts in ts_list]
                )
            for (s_id, s_idx) in section_slots_set:
                ts_inf = timeslot_info_list[s_idx]
                current_sec_day_map.setdefault((s_id, ts_inf["date"]), []).append((ts_inf["start_m"], ts_inf["end_m"]))

            for require_no_section_conflict in (True, False):
                room_safe_slots = [
                    slot_idx for slot_idx in candidate_slots
                    if available_room_count(slot_idx) >= demand
                    and (
                        not require_no_section_conflict
                        or not group_has_final_section_conflict(group, slot_idx)
                    )
                ]
                if room_safe_slots:
                    return max(
                        room_safe_slots,
                        key=lambda slot_idx: (
                            0 if not group_slot_creates_gap_violation(group_idx, slot_idx, current_sec_day_map) else -1,
                            1 if slot_idx == preferred_slot_idx else 0,
                            target_high_floor_count(slot_idx),
                            available_room_count(slot_idx),
                            -(timeslot_info_list[slot_idx]["day_num"] or 0),
                        ),
                    )

            non_conflicting_slots = [
                slot_idx for slot_idx in candidate_slots
                if not group_has_final_section_conflict(group, slot_idx)
            ]
            fallback_slots = non_conflicting_slots or candidate_slots
            return max(
                fallback_slots,
                key=lambda slot_idx: (
                    0 if not group_slot_creates_gap_violation(group_idx, slot_idx, current_sec_day_map) else -1,
                    target_high_floor_count(slot_idx),
                    available_room_count(slot_idx),
                ),
            )

        def pick_exam_slot(preferred_slot_idx, section_id):
            candidate_slots = list(dict.fromkeys([preferred_slot_idx] + sorted(generated_timeslot_indices)))
            room_safe_slots = [
                slot_idx for slot_idx in candidate_slots
                if available_room_count(slot_idx) > 0
                and (section_id, slot_idx) not in section_slots_set
            ]
            if not room_safe_slots:
                room_safe_slots = [
                    slot_idx for slot_idx in candidate_slots
                    if available_room_count(slot_idx) > 0
                ]
            if not room_safe_slots:
                return preferred_slot_idx

            sec_day_slots = {}
            for (sec_id, day), ts_list in posted_section_day_slots.items():
                if sec_id == section_id:
                    sec_day_slots.setdefault(day, []).extend([(ts["start_m"], ts["end_m"]) for ts in ts_list])
            for (s_id, s_idx) in section_slots_set:
                if s_id == section_id:
                    ts_inf = timeslot_info_list[s_idx]
                    sec_day_slots.setdefault(ts_inf["date"], []).append((ts_inf["start_m"], ts_inf["end_m"]))

            def exam_slot_gap_safe(slot_idx):
                ts_inf = timeslot_info_list[slot_idx]
                existing = sec_day_slots.get(ts_inf["date"], [])
                if len(existing) >= 3:
                    return False
                if existing and not _minutes_gap_ok(existing, ts_inf["start_m"], ts_inf["end_m"]):
                    return False
                return True

            return max(
                room_safe_slots,
                key=lambda slot_idx: (
                    1 if exam_slot_gap_safe(slot_idx) else 0,
                    1 if slot_idx == preferred_slot_idx else 0,
                    target_high_floor_count(slot_idx),
                    available_room_count(slot_idx),
                ),
            )

        def assign_room_idx(slot_idx, preferred_room_id=None):
            # Try to honour the section's preferred room first
            if preferred_room_id and preferred_room_id in room_id_to_idx:
                pref_idx = room_id_to_idx[preferred_room_id]
                if (pref_idx, slot_idx) not in room_slots_set:
                    room_slots_set.add((pref_idx, slot_idx))
                    room_loads[pref_idx] += 1
                    return room_ids[pref_idx]

            best_room_idx = -1
            best_val = (99, 99, 99999, 99999, "")
            for r_idx in range(num_rooms):
                if (r_idx, slot_idx) in room_slots_set:
                    continue
                load = room_loads[r_idx]
                floor = room_floors[r_idx]
                bldg = room_buildings[r_idx]
                bldg_prio = 0 if bldg == "B" else 1
                if floor >= HIGH_FLOOR_MIN and load < ROOM_BOOKING_TARGET:
                    prio = 0
                elif load < ROOM_BOOKING_TARGET:
                    prio = 1
                else:
                    prio = 2
                val = (bldg_prio, prio, load, -floor, room_names[r_idx])
                if val < best_val:
                    best_val = val
                    best_room_idx = r_idx
            
            if best_room_idx != -1:
                room_slots_set.add((best_room_idx, slot_idx))
                room_loads[best_room_idx] += 1
                return room_ids[best_room_idx]

            # Fallback: if all rooms are booked in this timeslot, pick the room with lowest total load
            if num_rooms > 0:
                fallback_idx = min(range(num_rooms), key=lambda r_idx: room_loads[r_idx])
                room_slots_set.add((fallback_idx, slot_idx))
                room_loads[fallback_idx] += 1
                return room_ids[fallback_idx]

            return None

        group_order = sorted(
            range(len(preprocessed_groups)),
            key=lambda idx: (
                best_individual[idx],
                -len(preprocessed_groups[idx]["sections"]),
                len(preprocessed_groups[idx]["allowed_slots"])
            ),
        )
        total_groups_to_apply = max(1, len(group_order))

        for group_position, g_idx in enumerate(group_order, start=1):
            if group_position == 1 or group_position == total_groups_to_apply or group_position % 4 == 0:
                apply_percent = 92 + (group_position / total_groups_to_apply) * 6
                report_progress(apply_percent, "Creating exams", f"Applying subject group {group_position} of {total_groups_to_apply}")

            group = preprocessed_groups[g_idx]
            preferred_slot_idx = best_individual[g_idx]
            slot_idx = pick_group_slot(g_idx, preferred_slot_idx)
            slot_exams = sorted(
                group["sections"],
                key=lambda prep_sec: len(group["slot_proctors"][slot_idx][prep_sec["idx_in_g"]])
            )
            N = len(slot_exams)

            available_r_indices = [
                r_idx for r_idx in range(num_rooms)
                if (r_idx, slot_idx) not in room_slots_set
            ]

            def room_key(r_idx):
                load = room_loads[r_idx]
                floor = room_floors[r_idx]
                if floor >= HIGH_FLOOR_MIN and load < ROOM_BOOKING_TARGET:
                    prio = 0
                elif load < ROOM_BOOKING_TARGET:
                    prio = 1
                else:
                    prio = 2
                return (prio, load, -floor, room_names[r_idx])

            assigned_rooms = {}  # sec_id -> room_id
            assigned_slots = {}  # sec_id -> exam_slot_idx

            sub_chosen = []
            pref_found = False
            for ps in slot_exams:
                pref_room_id = ps.get("preferred_room_id")
                if pref_room_id and pref_room_id in room_id_to_idx:
                    pref_r_idx = room_id_to_idx[pref_room_id]
                    if pref_r_idx in available_r_indices:
                        pref_b = room_buildings[pref_r_idx]
                        pref_f = room_floors[pref_r_idx]
                        floor_rooms = [
                            r for r in available_r_indices
                            if room_buildings[r] == pref_b and room_floors[r] == pref_f
                        ]
                        if len(floor_rooms) >= N:
                            remaining = [r for r in floor_rooms if r != pref_r_idx]
                            remaining.sort(key=room_key)
                            sub_chosen = [pref_r_idx] + remaining[:N-1]
                            pref_found = True
                            
                            # Assign rooms directly here
                            assigned_rooms[ps["sec_id"]] = room_ids[pref_r_idx]
                            assigned_slots[ps["sec_id"]] = slot_idx
                            other_secs = [s for s in slot_exams if s["sec_id"] != ps["sec_id"]]
                            for idx, os_sec in enumerate(other_secs):
                                assigned_rooms[os_sec["sec_id"]] = room_ids[remaining[idx]]
                                assigned_slots[os_sec["sec_id"]] = slot_idx
                            break

            if not pref_found:
                available_by_floor = {}
                for r_idx in available_r_indices:
                    b = room_buildings[r_idx]
                    f = room_floors[r_idx]
                    available_by_floor.setdefault((b, f), []).append(r_idx)

                valid_floors = {
                    fl_key: fl_rooms
                    for fl_key, fl_rooms in available_by_floor.items()
                    if len(fl_rooms) >= N
                }

                if valid_floors:
                    def floor_sort_key(fl_key, _N=N):
                        fl_rooms = valid_floors[fl_key]
                        sorted_r_keys = sorted([room_key(r) for r in fl_rooms])
                        return sorted_r_keys[:_N]

                    best_fl_key = min(valid_floors.keys(), key=floor_sort_key)
                    best_fl_rooms = valid_floors[best_fl_key]
                    best_fl_rooms.sort(key=room_key)
                    sub_chosen = best_fl_rooms[:N]
                else:
                    # Fallback room assignment: group available rooms by building/floor
                    # and pick from floors with the most available rooms to keep them as grouped as possible.
                    floor_groups = {}
                    for r_idx in available_r_indices:
                        b = room_buildings[r_idx]
                        f = room_floors[r_idx]
                        floor_groups.setdefault((b, f), []).append(r_idx)
                    
                    sorted_floors = sorted(floor_groups.values(), key=lambda r_list: -len(r_list))
                    sub_chosen = []
                    for fl_rooms in sorted_floors:
                        fl_rooms_sorted = sorted(fl_rooms, key=room_key)
                        needed = N - len(sub_chosen)
                        sub_chosen.extend(fl_rooms_sorted[:needed])
                        if len(sub_chosen) == N:
                            break

                # Assign rooms directly here (handling potential overflow if sub_chosen has length < N)
                for idx, s in enumerate(slot_exams):
                    if idx < len(sub_chosen):
                        assigned_rooms[s["sec_id"]] = room_ids[sub_chosen[idx]]
                        assigned_slots[s["sec_id"]] = slot_idx

            # Mark all chosen rooms as used
            for r_idx in sub_chosen:
                room_slots_set.add((r_idx, slot_idx))
                room_loads[r_idx] += 1

            # Fallback for any overflow sections not assigned above
            for prep_sec in slot_exams:
                sec_id = prep_sec["sec_id"]
                if sec_id in assigned_rooms:
                    continue

                # Overflow: no room left in this slot for this section
                exam_slot_idx = pick_exam_slot(slot_idx, sec_id)
                r_id = assign_room_idx(exam_slot_idx, prep_sec.get("preferred_room_id"))

                if not r_id:
                    subject_name = prep_sec.get("sub_name") or f"Subject {prep_sec['sub_id']}"
                    section_name = prep_sec.get("sec_name") or f"Section {sec_id}"
                    slot = timeslot_info_list[exam_slot_idx]["timeslot_obj"]
                    raise ValueError(
                        f"No available room for {subject_name} ({section_name}) on "
                        f"{slot.date.strftime('%A, %B %d, %Y')} "
                        f"{slot.start_time.strftime('%I:%M %p')} - {slot.end_time.strftime('%I:%M %p')}. "
                        "Add more exam rooms or widen the exam date range."
                    )
                assigned_rooms[sec_id] = r_id
                assigned_slots[sec_id] = exam_slot_idx

            for prep_sec in slot_exams:
                sec_id = prep_sec["sec_id"]
                sub_id = prep_sec["sub_id"]
                exam_slot_idx = assigned_slots[sec_id]
                r_id = assigned_rooms[sec_id]

                p_id = None
                best_count = 99999
                candidates = group["slot_proctors"][exam_slot_idx][prep_sec["idx_in_g"]]
                for pidx in candidates:
                    if (pidx, exam_slot_idx) in proctor_slots_set:
                        continue
                    if proctor_counts[pidx] >= proctor_max_assignments[pidx]:
                        continue
                    if proctor_counts[pidx] < best_count:
                        best_count = proctor_counts[pidx]
                        p_id = proctor_ids[pidx]
                        
                if p_id:
                    p_idx = proctor_id_to_idx[p_id]
                    proctor_slots_set.add((p_idx, exam_slot_idx))
                    proctor_counts[p_idx] += 1

                section_slots_set.add((sec_id, exam_slot_idx))
                slot = timeslot_info_list[exam_slot_idx]["timeslot_obj"]
                new_exam = Exam(
                    subject_id=sub_id,
                    section_id=sec_id,
                    room_id=r_id,
                    timeslot=slot,
                    course_id=prep_sec["course_id"],
                    year_level_id=prep_sec["year_level_id"],
                    semester=prep_sec["semester"],
                    term=term,
                    status="draft",
                    proctor_id=p_id,
                )
                generated_exams.append(new_exam)
                total_scheduled += 1
                if r_id:
                    assigned_room_count += 1
                if p_id:
                    assigned_proctor_count += 1
                    proctor_data[p_id]["assigned_count"] += 1

    db.add_all(generated_exams)
    report_progress(99, "Saving schedule", "Writing generated exams to the database")
    db.commit()
    report_progress(100, "Schedule generated", "Generation complete")

    return {
        "total_exams": total_scheduled,
        "assigned_proctors": assigned_proctor_count,
        "unassigned": total_scheduled - assigned_proctor_count,
        "unassigned_rooms": total_scheduled - assigned_room_count
    }
