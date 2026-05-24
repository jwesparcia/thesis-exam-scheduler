import random
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from models import Exam, Timeslot, Room, Subject, Section, DistributionRule, TeacherSchedule, Proctor, TeacherTeaching
from room_data import get_room_names_for_department

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
ROOM_BOOKING_TARGET = 22
HIGH_FLOOR_MIN = 5

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


def _room_floor(room_name):
    digits = "".join(ch for ch in str(room_name) if ch.isdigit())
    return int(digits[0]) if digits else 0

def generate_exam_schedule(db: Session, start_date: date, end_date: date = None, department: str = "College", semester: int = 1, excluded_subjects: list = None, progress_callback=None):
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

    # 1. Clear previous DRAFT schedules for the specific department and semester
    report_progress(4, "Preparing schedule", "Clearing previous draft schedules")
    from models import Course
    drafts_to_delete = db.query(Exam).join(Course).filter(
        Exam.status == "draft",
        Course.category == department,
        Exam.semester == semester
    ).all()
    for draft in drafts_to_delete:
        db.delete(draft)
    db.commit()

    report_progress(8, "Preparing timeslots", "Building exam days and daily time slots")
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
    if not room_ids:
        raise ValueError(f"No available exam rooms found for {department}. Sync or seed the Exam-Rooms.xlsx room list first.")
    rules = db.query(DistributionRule).all()
    sections = db.query(Section).join(Course).filter(Course.category == department).all()
    
    # Pre-calculate count of written exam subjects per section
    subjects_per_section = {}
    for sec in sections:
        subjects_per_section[sec.id] = sum(1 for sub in subjects if sub.course_id == sec.course_id and sub.year_level_id == sec.year_level_id)
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
        sub_name = sub_name.lower()
        if category == 'general':
            # Day 1 Morning GE
            if any(k in sub_name for k in ['math', 'science', 'chemistry', 'biology', 'physics', 'communication', 'comm', 'writing', 'reading', 'literature', 'great books', 'foreign']):
                return "GE_GROUP_1"
            # Day 2 Morning GE
            elif any(k in sub_name for k in ['wika', 'teksto', 'filipino', 'self', 'history', 'contemporary', 'culture', 'rizal', 'ethics', 'appreciation', 'entrepreneurial', 'governance']):
                return "GE_GROUP_2"
            else:
                return "GE_GROUP_2" # Default to Day 2 for unclassified GE
        else:
            if any(k in sub_name for k in ['computing', 'computer productivity', 'computer fundamentals']):
                return "COMP_FUND"
            return "MAJOR"

    # Group subjects by name
    report_progress(32, "Grouping subjects", "Synchronizing shared subjects across sections")
    shared_subject_groups = {}
    for sub in subjects:
        key = sub.name
        shared_subject_groups.setdefault(key, []).append(sub)

    import copy
    
    # Pre-calculate involved sections and valid timeslots per group
    groups = []
    for name_key, sub_list in shared_subject_groups.items():
        involved_sections = []
        for sub in sub_list:
            secs = [sec for sec in sections if sec.course_id == sub.course_id and sec.year_level_id == sub.year_level_id]
            for sec in secs:
                involved_sections.append((sec, sub))
        if not involved_sections:
            continue
            
        # Determine allowed slots for this specific subject group
        # Since all subjects in sub_list have the same name, use the first one's classification
        sample_sub = sub_list[0]
        classification = classify_subject(sample_sub.name, sample_sub.category)
        
        # We also need to know the year levels involved (to handle Y3/Y4 vs Y1/Y2 for majors)
        year_levels = {sub.year_level_id for sub in sub_list}
        
        common_allowed_slots = set()
        
        for slot in timeslots:
            day_num = date_map.get(slot.date)
            is_morning = slot.start_time < datetime.strptime("11:30:00", "%H:%M:%S").time()
            
            allowed = False
            if classification == "GE_GROUP_1":
                if day_num == 1 and is_morning: allowed = True
            elif classification == "GE_GROUP_2":
                if day_num == 2 and is_morning: allowed = True
            elif classification == "COMP_FUND":
                if day_num == 1 and not is_morning: allowed = True
            elif classification == "MAJOR":
                has_y3_y4 = any(y in [3, 4] for y in year_levels)
                has_y1_y2 = any(y in [1, 2] for y in year_levels)
                
                # If it's exclusively Y3/Y4, it can do Day 1 Afternoon
                if has_y3_y4 and not has_y1_y2:
                    if day_num == 1 and not is_morning: allowed = True
                    if day_num == 2 and not is_morning: allowed = True
                    if day_num in [3, 4]: allowed = True
                else:
                    # Y1/Y2 mixed or exclusively Y1/Y2
                    if day_num == 2 and not is_morning: allowed = True
                    if day_num in [3, 4]: allowed = True
            
            if allowed:
                common_allowed_slots.add(slot)
                
        if not common_allowed_slots:
            print(f"[SCHEDULER] No common allowed slots for {name_key} (Class: {classification})")
            continue
            
        groups.append({
            "name": name_key,
            "sections": involved_sections,
            "allowed_slots": [s.id for s in common_allowed_slots],
            "classification": classification
        })

    # -------------------------
    # Preprocessing for Performance
    # -------------------------
    # Precompute timeslot information to avoid database/ORM overhead and time parsing in the loop
    timeslot_info = {}
    from datetime import time as dt_time
    LIMIT_TIME = dt_time(11, 30)
    for ts_id, ts in timeslot_map.items():
        start_m = ts.start_time.hour * 60 + ts.start_time.minute
        end_m = ts.end_time.hour * 60 + ts.end_time.minute
        timeslot_info[ts_id] = {
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
                "idx_in_g": idx_in_g
            })
            section_ids_set.add(sec.id)
        
        # Precompute slot proctors list for every allowed timeslot in this group
        slot_proctors = {}
        for slot_id in set(g["allowed_slots"]) | generated_timeslot_ids:
            ts_inf = timeslot_info[slot_id]
            slot_proctors[slot_id] = []
            for sec, sub in g["sections"]:
                candidates = []
                for pid, pdata in proctor_data.items():
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
                    candidates.append(pid)
                slot_proctors[slot_id].append(candidates)
                
        preprocessed_groups.append({
            "name": g["name"],
            "sections": prep_sections,
            "allowed_slots": g["allowed_slots"],
            "classification": g["classification"],
            "section_ids_set": section_ids_set,
            "slot_proctors": slot_proctors
        })

    preprocessed_groups.sort(
        key=lambda g: (len(g["allowed_slots"]), -len(g["sections"]), g["name"])
    )

    # Pre-evaluate posted exams into plain lists/dicts to completely avoid database queries in fitness
    posted_section_slots = {}
    posted_room_slots = {}
    posted_proctor_slots = {}
    posted_section_day_counts = {}
    posted_proctor_counts_init = {pid: 0 for pid in proctor_data}
    posted_room_loads_init = {r_id: 0 for r_id in room_ids}
    posted_section_day_slots = {}

    for e in posted_exams:
        if not e.timeslot:
            continue
        slot_id = e.timeslot.id
        ts_inf = timeslot_info.get(slot_id)
        if not ts_inf:
            continue
        posted_section_slots.setdefault(e.section_id, set()).add(slot_id)
        if e.room_id in room_ids_set:
            posted_room_slots.setdefault(e.room_id, set()).add(slot_id)
            posted_room_loads_init[e.room_id] = posted_room_loads_init.get(e.room_id, 0) + 1
        if e.proctor_id:
            posted_proctor_slots.setdefault(e.proctor_id, set()).add(slot_id)
            if e.proctor_id in posted_proctor_counts_init:
                posted_proctor_counts_init[e.proctor_id] += 1
        day = ts_inf["date"]
        posted_section_day_counts.setdefault(e.section_id, {}).setdefault(day, 0)
        posted_section_day_counts[e.section_id][day] += 1
        posted_section_day_slots.setdefault(e.section_id, {}).setdefault(day, []).append(ts_inf)

    def choose_available_room(slot_id, room_slots, room_loads):
        available_rooms = [
            r_id for r_id in room_ids
            if slot_id not in room_slots.get(r_id, set())
        ]
        if not available_rooms:
            return None

        return min(
            available_rooms,
            key=lambda r_id: (
                0 if room_floor_by_id.get(r_id, 0) >= HIGH_FLOOR_MIN and room_loads.get(r_id, 0) < ROOM_BOOKING_TARGET else
                1 if room_loads.get(r_id, 0) < ROOM_BOOKING_TARGET else
                2,
                room_loads.get(r_id, 0),
                -room_floor_by_id.get(r_id, 0),
                room_name_by_id.get(r_id, ""),
            ),
        )

    def assign_room(slot_id, room_slots, room_loads):
        room_id = choose_available_room(slot_id, room_slots, room_loads)
        if room_id is None:
            return None

        room_slots.setdefault(room_id, set()).add(slot_id)
        room_loads[room_id] = room_loads.get(room_id, 0) + 1
        return room_id

    slot_room_capacity = {}
    for slot_id in timeslot_info:
        posted_room_count = sum(
            1 for r_id in room_ids
            if slot_id in posted_room_slots.get(r_id, set())
        )
        slot_room_capacity[slot_id] = max(0, len(room_ids) - posted_room_count)

    def group_room_demand(group_idx):
        return len(preprocessed_groups[group_idx]["sections"])

    def get_slot_room_demand(individual, exclude_group_idx=None):
        demand_by_slot = {}
        for group_idx, slot_id in enumerate(individual):
            if group_idx == exclude_group_idx or slot_id is None:
                continue
            if group_idx >= len(preprocessed_groups):
                continue
            demand_by_slot[slot_id] = demand_by_slot.get(slot_id, 0) + group_room_demand(group_idx)
        return demand_by_slot

    def get_capacity_safe_slots(group_idx, candidate_slots, current_individual=None):
        demand_by_slot = get_slot_room_demand(current_individual or [], exclude_group_idx=group_idx)
        group_demand = group_room_demand(group_idx)
        return [
            slot_id for slot_id in candidate_slots
            if slot_room_capacity.get(slot_id, len(room_ids)) - demand_by_slot.get(slot_id, 0) >= group_demand
        ]

    def choose_capacity_balanced_slot(group_idx, candidate_slots, current_individual=None):
        if not candidate_slots:
            return None

        demand_by_slot = get_slot_room_demand(current_individual or [], exclude_group_idx=group_idx)
        group_demand = group_room_demand(group_idx)
        return max(
            candidate_slots,
            key=lambda slot_id: (
                slot_room_capacity.get(slot_id, len(room_ids)) - demand_by_slot.get(slot_id, 0) - group_demand,
                -demand_by_slot.get(slot_id, 0),
                random.random(),
            ),
        )

    # Genetic Algorithm Parameters
    POP_SIZE = 80
    GENERATIONS = 200
    MUTATION_RATE = 0.20

    def generate_random_allele(group_idx, current_individual=None):
        group = preprocessed_groups[group_idx]
        if current_individual is not None:
            used_slots = set()
            my_sec_ids = group["section_ids_set"]
            for i, slot_id in enumerate(current_individual):
                if i == group_idx:
                    continue
                other_sec_ids = preprocessed_groups[i]["section_ids_set"]
                if my_sec_ids.intersection(other_sec_ids):
                    used_slots.add(slot_id)
                    
            free_slots = [s for s in group["allowed_slots"] if s not in used_slots]
            candidate_slots = free_slots or group["allowed_slots"]
        else:
            candidate_slots = group["allowed_slots"]
        capacity_slots = get_capacity_safe_slots(group_idx, candidate_slots, current_individual)
        slot_id = choose_capacity_balanced_slot(
            group_idx,
            capacity_slots or candidate_slots,
            current_individual,
        )
        return slot_id

    def create_individual():
        ind = []
        for i in range(len(preprocessed_groups)):
            ind.append(generate_random_allele(i, ind))
        repaired, _, _ = repair_room_overflows(ind)
        return repaired

    def copy_individual(ind):
        return list(ind)

    def fitness(individual):
        score = 0
        
        # Group individuals by timeslot to process allocations sequentially
        slot_allocations = {}
        for idx, slot_id in enumerate(individual):
            slot_allocations.setdefault(slot_id, []).append(idx)
        for slot_id, group_indices in slot_allocations.items():
            room_demand = sum(group_room_demand(group_idx) for group_idx in group_indices)
            room_capacity = slot_room_capacity.get(slot_id, len(room_ids))
            if room_demand > room_capacity:
                score -= (room_demand - room_capacity) * 2000000
            else:
                score += (room_capacity - room_demand) * 25
             
        proctor_counts = dict(posted_proctor_counts_init)
        
        # Deep/shallow copies of precomputed values
        section_slots = {k: set(v) for k, v in posted_section_slots.items()}
        room_slots = {k: set(v) for k, v in posted_room_slots.items()}
        room_loads = dict(posted_room_loads_init)
        proctor_slots = {k: set(v) for k, v in posted_proctor_slots.items()}
        section_day_counts = {k: dict(v) for k, v in posted_section_day_counts.items()}
        section_day_slots = {k: {day: list(slots) for day, slots in days.items()} for k, days in posted_section_day_slots.items()}
        
        # Tracking Day 2 Afternoon major exams per section
        section_day2_major_counts = {}
        
        # Process timeslot allocations
        for slot_id, group_indices in slot_allocations.items():
            ts_inf = timeslot_info[slot_id]
            day = ts_inf["date"]
            day_num = ts_inf["day_num"]
            is_morning = ts_inf["is_morning"]
            
            # Flatten all section/exam requirements for this slot_id
            slot_exams = []
            for g_idx in group_indices:
                group = preprocessed_groups[g_idx]
                for prep_sec in group["sections"]:
                    slot_exams.append({
                        "g_idx": g_idx,
                        "prep_sec": prep_sec,
                        "candidates": group["slot_proctors"][slot_id][prep_sec["idx_in_g"]]
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
                    section_day2_major_counts.setdefault(sec_id, 0)
                    section_day2_major_counts[sec_id] += 1
                
                # Section overlap
                if slot_id in section_slots.get(sec_id, set()):
                    score -= 500000
                else:
                    section_slots.setdefault(sec_id, set()).add(slot_id)
                    
                # Max exams per day
                d_count = section_day_counts.setdefault(sec_id, {}).get(day, 0) + 1
                section_day_counts[sec_id][day] = d_count
                limit = 4 if prep_sec["subjects_per_section"] >= 8 else 3
                if d_count > limit:
                    score -= 20000
                    
                # Collect slot per section per day
                section_day_slots.setdefault(sec_id, {}).setdefault(day, []).append(ts_inf)
                
                r_id = assign_room(slot_id, room_slots, room_loads)
                if not r_id:
                    score -= 1000000  # Strong penalty because roomless exams require admin repair.
                
                # Greedy Proctor Assignment
                p_id = None
                best_count = 99999
                for pid in exam["candidates"]:
                    if slot_id in proctor_slots.get(pid, set()) or pid in assigned_proctors_in_slot:
                        continue
                    if proctor_counts[pid] >= proctor_data[pid]["max_assignments"]:
                        continue
                    if proctor_counts[pid] < best_count:
                        best_count = proctor_counts[pid]
                        p_id = pid
                        
                if p_id:
                    proctor_slots.setdefault(p_id, set()).add(slot_id)
                    assigned_proctors_in_slot.add(p_id)
                    proctor_counts[p_id] += 1
                    if proctor_counts[p_id] > proctor_data[p_id]["max_assignments"]:
                        score -= 10000
                    score += 50
                else:
                    score -= 30000  # Penalty for unassigned proctor

        # Apply penalty for Day 2 Afternoon > 2 majors
        for sec_id, major_count in section_day2_major_counts.items():
            if major_count > 2:
                score -= 10000

        # Reward for spreading exams
        for sec_id, days in section_day_counts.items():
            if len(days) >= 3:
                score += 1000

        # Check daily counts and gap limits for each section
        for sec_id, day_slots_map in section_day_slots.items():
            total_section_exams = sum(len(slots) for slots in day_slots_map.values())
            for day, slots in day_slots_map.items():
                num_exams = len(slots)
                
                # Constraint 1: Validate daily exam counts per section/student
                total_subjects = subjects_per_section.get(sec_id, 0)
                if total_subjects >= 8:
                    if num_exams < 3:
                        score -= 10000
                    elif num_exams > 4:
                        score -= 10000
                else:
                    if total_section_exams >= 2 and num_exams == 1:
                        score -= 10000
                    elif num_exams > 3:
                        score -= 10000
                
                # Constraint 2: gap limits
                if num_exams >= 2:
                    sorted_slots = sorted(slots, key=lambda s: s["start_m"])
                    for i in range(len(sorted_slots) - 1):
                        gap_minutes = sorted_slots[i+1]["start_m"] - sorted_slots[i]["end_m"]
                        if gap_minutes > 90:
                            score -= 15000

        return score

    def group_has_section_conflict(individual, group_idx, target_slot_id):
        section_ids = preprocessed_groups[group_idx]["section_ids_set"]
        for sec_id in section_ids:
            if target_slot_id in posted_section_slots.get(sec_id, set()):
                return True

        for other_idx, other_slot_id in enumerate(individual):
            if other_idx == group_idx or other_slot_id != target_slot_id:
                continue
            if section_ids.intersection(preprocessed_groups[other_idx]["section_ids_set"]):
                return True

        return False

    def find_room_repair_target(individual, demand_by_slot, group_idx, current_slot_id):
        group = preprocessed_groups[group_idx]
        demand = group_room_demand(group_idx)
        candidates = []

        for slot_id in group["allowed_slots"]:
            if slot_id == current_slot_id:
                continue
            if group_has_section_conflict(individual, group_idx, slot_id):
                continue

            remaining_capacity = slot_room_capacity.get(slot_id, len(room_ids)) - demand_by_slot.get(slot_id, 0)
            if remaining_capacity < demand:
                continue

            target_info = timeslot_info[slot_id]
            current_info = timeslot_info[current_slot_id]
            candidates.append((
                0 if target_info["date"] == current_info["date"] else 1,
                -remaining_capacity,
                target_info["date"],
                target_info["start_time"],
                slot_id,
            ))

        if not candidates:
            return None

        candidates.sort()
        return candidates[0][-1]

    def repair_room_overflows(individual):
        repaired = list(individual)
        moves = []
        max_passes = max(1, len(repaired) * 2)

        for _ in range(max_passes):
            demand_by_slot = get_slot_room_demand(repaired)
            overflows = [
                (slot_id, demand - slot_room_capacity.get(slot_id, len(room_ids)))
                for slot_id, demand in demand_by_slot.items()
                if demand > slot_room_capacity.get(slot_id, len(room_ids))
            ]
            if not overflows:
                return repaired, moves, []

            moved = False
            for slot_id, _overflow in sorted(overflows, key=lambda item: item[1], reverse=True):
                group_indices = [idx for idx, assigned_slot in enumerate(repaired) if assigned_slot == slot_id]
                group_indices.sort(key=lambda idx: (len(preprocessed_groups[idx]["allowed_slots"]), -group_room_demand(idx)))

                for group_idx in group_indices:
                    target_slot_id = find_room_repair_target(repaired, demand_by_slot, group_idx, slot_id)
                    if not target_slot_id:
                        continue

                    repaired[group_idx] = target_slot_id
                    moves.append((group_idx, slot_id, target_slot_id))
                    moved = True
                    break

                if moved:
                    break

            if not moved:
                return repaired, moves, overflows

        demand_by_slot = get_slot_room_demand(repaired)
        overflows = [
            (slot_id, demand - slot_room_capacity.get(slot_id, len(room_ids)))
            for slot_id, demand in demand_by_slot.items()
            if demand > slot_room_capacity.get(slot_id, len(room_ids))
        ]
        return repaired, moves, overflows

    def build_capacity_safe_individual(seed_individual=None):
        assigned = [None] * len(preprocessed_groups)
        group_order = sorted(
            range(len(preprocessed_groups)),
            key=lambda idx: (len(preprocessed_groups[idx]["allowed_slots"]), -group_room_demand(idx)),
        )

        for group_idx in group_order:
            group = preprocessed_groups[group_idx]
            preferred_slot = seed_individual[group_idx] if seed_individual else None
            candidate_slots = list(group["allowed_slots"])
            candidate_slots.sort(
                key=lambda slot_id: (
                    0 if slot_id == preferred_slot else 1,
                    timeslot_info[slot_id]["date"],
                    timeslot_info[slot_id]["start_time"],
                )
            )

            non_conflicting_slots = [
                slot_id for slot_id in candidate_slots
                if not group_has_section_conflict(assigned, group_idx, slot_id)
            ]
            capacity_slots = get_capacity_safe_slots(group_idx, non_conflicting_slots, assigned)
            chosen_slot = choose_capacity_balanced_slot(group_idx, capacity_slots, assigned)

            if chosen_slot is None:
                chosen_slot = choose_capacity_balanced_slot(group_idx, non_conflicting_slots, assigned)
            if chosen_slot is None:
                all_non_conflicting_slots = [
                    slot_id for slot_id in generated_timeslot_ids
                    if not group_has_section_conflict(assigned, group_idx, slot_id)
                ]
                all_capacity_slots = get_capacity_safe_slots(group_idx, all_non_conflicting_slots, assigned)
                chosen_slot = choose_capacity_balanced_slot(group_idx, all_capacity_slots, assigned)
            if chosen_slot is None:
                chosen_slot = choose_capacity_balanced_slot(group_idx, candidate_slots, assigned)
            assigned[group_idx] = chosen_slot

        return assigned

    population = [create_individual() for _ in range(POP_SIZE)]
    
    best_individual = None
    best_fitness = -float('inf')

    # Evolutionary Loop
    for gen in range(GENERATIONS):
        pop_fitness = [(ind, fitness(ind)) for ind in population]
        pop_fitness.sort(key=lambda x: x[1], reverse=True)
        
        if pop_fitness[0][1] > best_fitness:
            best_fitness = pop_fitness[0][1]
            best_individual = copy_individual(pop_fitness[0][0])
            
        if gen % 10 == 0 or gen == GENERATIONS - 1:
            print(f"[GA] Gen {gen}: Best Fitness = {pop_fitness[0][1]}, Average = {sum(x[1] for x in pop_fitness)/len(pop_fitness):.1f}")
            ga_percent = 45 + ((gen + 1) / GENERATIONS) * 40
            report_progress(ga_percent, "Optimizing schedule", f"Generation {gen + 1} of {GENERATIONS}")
            
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
            parent2 = t3[0] if t3[1] > t4[1] else t4[0]
            
            # Crossover (Uniform)
            child = []
            for i in range(len(preprocessed_groups)):
                slot_id = parent1[i] if random.random() < 0.5 else parent2[i]
                child.append(slot_id)
                    
            # Mutation
            for i in range(len(preprocessed_groups)):
                if random.random() < MUTATION_RATE:
                    child[i] = generate_random_allele(i, child)
            child, _, _ = repair_room_overflows(child)
            new_population.append(child)
            
        population = new_population

    if best_individual:
        best_individual, room_repair_moves, room_overflows = repair_room_overflows(best_individual)
        if room_repair_moves:
            print(f"[SCHEDULER] Room capacity repair moved {len(room_repair_moves)} subject group(s) to open slots.")
        if room_overflows:
            overflow_details = []
            for slot_id, overflow_count in room_overflows[:5]:
                ts_inf = timeslot_info[slot_id]
                overflow_details.append(
                    f"{ts_inf['date']} {ts_inf['start_time'].strftime('%I:%M %p')} (+{overflow_count})"
                )
            print(f"[SCHEDULER] Room capacity still exceeded after repair: {', '.join(overflow_details)}")
            fallback_individual = build_capacity_safe_individual(best_individual)
            fallback_individual, fallback_moves, fallback_overflows = repair_room_overflows(fallback_individual)
            if not fallback_overflows:
                best_individual = fallback_individual
                print("[SCHEDULER] Room capacity fallback produced a room-safe timetable.")
            elif sum(count for _, count in fallback_overflows) < sum(count for _, count in room_overflows):
                best_individual = fallback_individual
                print("[SCHEDULER] Room capacity fallback reduced overloaded room demand.")

    # Print breakdown of best individual
    report_progress(88, "Validating schedule", "Checking the best generated timetable")
    if best_individual:
        # Reconstruct exactly as done in fitness to print final metrics
        slot_allocations = {}
        for idx, slot_id in enumerate(best_individual):
            slot_allocations.setdefault(slot_id, []).append(idx)
            
        proctor_counts = dict(posted_proctor_counts_init)
        
        section_slots = {k: set(v) for k, v in posted_section_slots.items()}
        room_slots = {k: set(v) for k, v in posted_room_slots.items()}
        room_loads = dict(posted_room_loads_init)
        proctor_slots = {k: set(v) for k, v in posted_proctor_slots.items()}
        section_day_counts = {k: dict(v) for k, v in posted_section_day_counts.items()}
        section_day_slots = {k: {day: list(slots) for day, slots in days.items()} for k, days in posted_section_day_slots.items()}
        section_day2_major_counts = {}
        
        sec_overlap = 0
        room_overlap = 0
        proc_overlap = 0
        proc_limit = 0
        sec_limit = 0
        daily_viol = 0
        gap_viol = 0
        
        for slot_id, group_indices in slot_allocations.items():
            ts_inf = timeslot_info[slot_id]
            day = ts_inf["date"]
            day_num = ts_inf["day_num"]
            is_morning = ts_inf["is_morning"]
            
            slot_exams = []
            for g_idx in group_indices:
                group = preprocessed_groups[g_idx]
                for prep_sec in group["sections"]:
                    slot_exams.append({
                        "g_idx": g_idx,
                        "prep_sec": prep_sec,
                        "candidates": group["slot_proctors"][slot_id][prep_sec["idx_in_g"]]
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
                
                if slot_id in section_slots.get(sec_id, set()):
                    sec_overlap += 1
                else:
                    section_slots.setdefault(sec_id, set()).add(slot_id)
                    
                d_count = section_day_counts.setdefault(sec_id, {}).get(day, 0) + 1
                section_day_counts[sec_id][day] = d_count
                limit = 4 if prep_sec["subjects_per_section"] >= 8 else 3
                if d_count > limit:
                    sec_limit += 1
                    
                section_day_slots.setdefault(sec_id, {}).setdefault(day, []).append(ts_inf)
                
                r_id = assign_room(slot_id, room_slots, room_loads)
                if not r_id:
                    room_overlap += 1
                
                p_id = None
                best_count = 99999
                for pid in exam["candidates"]:
                    if slot_id in proctor_slots.get(pid, set()) or pid in assigned_proctors_in_slot:
                        continue
                    if proctor_counts[pid] >= proctor_data[pid]["max_assignments"]:
                        continue
                    if proctor_counts[pid] < best_count:
                        best_count = proctor_counts[pid]
                        p_id = pid
                        
                if p_id:
                    proctor_slots.setdefault(p_id, set()).add(slot_id)
                    assigned_proctors_in_slot.add(p_id)
                    proctor_counts[p_id] += 1
                    if proctor_counts[p_id] > proctor_data[p_id]["max_assignments"]:
                        proc_limit += 1
                        
        for sec_id, day_slots_map in section_day_slots.items():
            total_section_exams = sum(len(slots) for slots in day_slots_map.values())
            for day, slots in day_slots_map.items():
                num_exams = len(slots)
                total_subjects = subjects_per_section.get(sec_id, 0)
                if total_subjects >= 8:
                    if num_exams < 3 or num_exams > 4:
                        daily_viol += 1
                else:
                    if total_section_exams >= 2 and num_exams == 1:
                        daily_viol += 1
                    elif num_exams > 3:
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
        print(f"  - Section Limit (>3 or >4 per day) Violations: {sec_limit}")
        print(f"  - Daily Distribution Violations (1-exam or out of range): {daily_viol}")
        print(f"  - Breaktime/Gap (>90m) Violations: {gap_viol}")
        print(f"  - Day 2 Afternoon Major Exam Violations (>2): {day2_major_viol}")

    # Apply Best Schedule
    report_progress(92, "Creating exams", "Assigning rooms and proctors to draft exams")
    generated_exams = []
    total_scheduled = 0
    assigned_proctor_count = 0
    assigned_room_count = 0
    
    if best_individual:
        proctor_counts = dict(posted_proctor_counts_init)
        room_slots = {k: set(v) for k, v in posted_room_slots.items()}
        room_loads = dict(posted_room_loads_init)
        proctor_slots = {k: set(v) for k, v in posted_proctor_slots.items()}
        section_slots = {k: set(v) for k, v in posted_section_slots.items()}

        def available_room_count(slot_id):
            return sum(
                1 for r_id in room_ids
                if slot_id not in room_slots.get(r_id, set())
            )

        def target_high_floor_count(slot_id):
            return sum(
                1 for r_id in room_ids
                if (
                    slot_id not in room_slots.get(r_id, set())
                    and room_floor_by_id.get(r_id, 0) >= HIGH_FLOOR_MIN
                    and room_loads.get(r_id, 0) < ROOM_BOOKING_TARGET
                )
            )

        def group_has_final_section_conflict(group, slot_id):
            return any(
                slot_id in section_slots.get(sec_id, set())
                for sec_id in group["section_ids_set"]
            )

        def pick_group_slot(group_idx, preferred_slot_id):
            group = preprocessed_groups[group_idx]
            candidate_slots = list(dict.fromkeys(
                [preferred_slot_id] + list(group["allowed_slots"]) + list(generated_timeslot_ids)
            ))
            demand = len(group["sections"])

            for require_no_section_conflict in (True, False):
                room_safe_slots = [
                    slot_id for slot_id in candidate_slots
                    if available_room_count(slot_id) >= demand
                    and (
                        not require_no_section_conflict
                        or not group_has_final_section_conflict(group, slot_id)
                    )
                ]
                if room_safe_slots:
                    return max(
                        room_safe_slots,
                        key=lambda slot_id: (
                            1 if slot_id == preferred_slot_id else 0,
                            target_high_floor_count(slot_id),
                            available_room_count(slot_id),
                            -timeslot_info[slot_id]["day_num"],
                        ),
                    )

            non_conflicting_slots = [
                slot_id for slot_id in candidate_slots
                if not group_has_final_section_conflict(group, slot_id)
            ]
            fallback_slots = non_conflicting_slots or candidate_slots
            return max(
                fallback_slots,
                key=lambda slot_id: (
                    target_high_floor_count(slot_id),
                    available_room_count(slot_id),
                ),
            )

        def pick_exam_slot(preferred_slot_id, section_id):
            candidate_slots = list(dict.fromkeys([preferred_slot_id] + list(generated_timeslot_ids)))
            room_safe_slots = [
                slot_id for slot_id in candidate_slots
                if available_room_count(slot_id) > 0
                and slot_id not in section_slots.get(section_id, set())
            ]
            if not room_safe_slots:
                room_safe_slots = [
                    slot_id for slot_id in candidate_slots
                    if available_room_count(slot_id) > 0
                ]
            if not room_safe_slots:
                return preferred_slot_id
            return max(
                room_safe_slots,
                key=lambda slot_id: (
                    1 if slot_id == preferred_slot_id else 0,
                    target_high_floor_count(slot_id),
                    available_room_count(slot_id),
                ),
            )

        group_order = sorted(
            range(len(preprocessed_groups)),
            key=lambda idx: (best_individual[idx], len(preprocessed_groups[idx]["allowed_slots"])),
        )
        total_groups_to_apply = max(1, len(group_order))

        for group_position, g_idx in enumerate(group_order, start=1):
            if group_position == 1 or group_position == total_groups_to_apply or group_position % 4 == 0:
                apply_percent = 92 + (group_position / total_groups_to_apply) * 6
                report_progress(apply_percent, "Creating exams", f"Applying subject group {group_position} of {total_groups_to_apply}")

            group = preprocessed_groups[g_idx]
            preferred_slot_id = best_individual[g_idx]
            slot_id = pick_group_slot(g_idx, preferred_slot_id)
            slot_exams = sorted(
                group["sections"],
                key=lambda prep_sec: len(group["slot_proctors"][slot_id][prep_sec["idx_in_g"]])
            )

            for prep_sec in slot_exams:
                sec_id = prep_sec["sec_id"]
                sub_id = prep_sec["sub_id"]
                
                exam_slot_id = slot_id
                r_id = assign_room(exam_slot_id, room_slots, room_loads)
                if not r_id:
                    exam_slot_id = pick_exam_slot(slot_id, sec_id)
                    r_id = assign_room(exam_slot_id, room_slots, room_loads)
                if not r_id:
                    subject_name = prep_sec.get("sub_name") or f"Subject {sub_id}"
                    section_name = prep_sec.get("sec_name") or f"Section {sec_id}"
                    slot = timeslot_map[exam_slot_id]
                    raise ValueError(
                        f"No available room for {subject_name} ({section_name}) on "
                        f"{slot.date.strftime('%A, %B %d, %Y')} "
                        f"{slot.start_time.strftime('%I:%M %p')} - {slot.end_time.strftime('%I:%M %p')}. "
                        "Add more exam rooms or widen the exam date range."
                    )

                p_id = None
                best_count = 99999
                candidates = group["slot_proctors"][exam_slot_id][prep_sec["idx_in_g"]]
                for pid in candidates:
                    if exam_slot_id in proctor_slots.get(pid, set()):
                        continue
                    if proctor_counts[pid] >= proctor_data[pid]["max_assignments"]:
                        continue
                    if proctor_counts[pid] < best_count:
                        best_count = proctor_counts[pid]
                        p_id = pid
                        
                if p_id:
                    proctor_slots.setdefault(p_id, set()).add(exam_slot_id)
                    proctor_counts[p_id] += 1

                section_slots.setdefault(sec_id, set()).add(exam_slot_id)
                slot = timeslot_map[exam_slot_id]
                new_exam = Exam(
                    subject_id=sub_id,
                    section_id=sec_id,
                    room_id=r_id,
                    timeslot=slot,
                    course_id=prep_sec["course_id"],
                    year_level_id=prep_sec["year_level_id"],
                    semester=prep_sec["semester"],
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
