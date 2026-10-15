import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Exam, Section, Room, Timeslot
from utils.scheduler import _room_floor, _room_building_and_floor

db = SessionLocal()
try:
    exams = db.query(Exam).filter(Exam.timeslot_id.isnot(None), Exam.term == 'Midterm').all()
    # Sections of BSCrim 2
    secs = db.query(Section).filter(Section.name.like('BSCrim 2-10%')).all()
    rem_cluster = [{'sec_id': s.id, 'sec_name': s.name, 'student_count': s.student_count, 'preferred_room_id': s.preferred_room_id} for s in secs]
    rcN = len(rem_cluster)

    rooms = db.query(Room).filter(Room.department == 'College').order_by(Room.name).all()
    room_ids = [r.id for r in rooms]
    room_capacities = [r.capacity for r in rooms]
    room_floors = [_room_floor(r.name) for r in rooms]
    room_buildings = [_room_building_and_floor(r.name)[0] for r in rooms]
    room_id_to_idx = {r_id: idx for idx, r_id in enumerate(room_ids)}
    room_names = [r.name for r in rooms]

    def room_key(r_idx):
        return (0, 0, -room_floors[r_idx], room_names[r_idx])

    def match_sections_to_rooms(sections_list, candidate_room_indices):
        if not sections_list:
            return {}, []
        available_pool = set(candidate_room_indices)
        assigned_map = {}
        used_indices = []
        remaining_secs = []

        for s in sections_list:
            pref_id = s.get("preferred_room_id")
            needed = s.get("student_count", 35)
            matched_pref = False
            if pref_id and pref_id in room_id_to_idx:
                pref_r_idx = room_id_to_idx[pref_id]
                if pref_r_idx in available_pool and room_capacities[pref_r_idx] >= needed:
                    assigned_map[s["sec_id"]] = room_ids[pref_r_idx]
                    used_indices.append(pref_r_idx)
                    available_pool.remove(pref_r_idx)
                    matched_pref = True
            if not matched_pref:
                remaining_secs.append(s)

        remaining_secs.sort(key=lambda s: -s.get("student_count", 35))

        for s in remaining_secs:
            needed = s.get("student_count", 35)
            eligible = [r for r in available_pool if room_capacities[r] >= needed]
            if not eligible:
                return None, None
            best_r_idx = min(
                eligible,
                key=lambda r: (room_capacities[r] - needed, room_key(r))
            )
            assigned_map[s["sec_id"]] = room_ids[best_r_idx]
            used_indices.append(best_r_idx)
            available_pool.remove(best_r_idx)

        return assigned_map, used_indices

    # Map timeslots
    all_ts = db.query(Timeslot).all()
    ts_id_to_ts = {t.id: t for t in all_ts}

    # Booked room slots
    room_slots_set = set()
    for e in exams:
        if e.room_id in room_id_to_idx and e.timeslot_id:
            r_idx = room_id_to_idx[e.room_id]
            room_slots_set.add((r_idx, e.timeslot_id))

    # Check for a slot for BSCrim 2
    # Exam for Comparative Models
    e_cmp = [e for e in exams if 'Comparative Models' in e.subject.name and e.section.name == 'BSCrim 2-101'][0]
    slot_id = e_cmp.timeslot_id

    slots_75 = [t for t in all_ts if ((t.end_time.hour*60+t.end_time.minute)-(t.start_time.hour*60+t.start_time.minute)) == 75]
    print(f"Testing {len(slots_75)} slots for Comparative Models...")

    found = []
    for cand_ts in slots_75:
        cand_avail = [r for r in range(len(rooms)) if (r, cand_ts.id) not in room_slots_set]
        if len(cand_avail) < rcN:
            continue
        cand_by_floor = {}
        for r in cand_avail:
            cand_by_floor.setdefault((room_buildings[r], room_floors[r]), []).append(r)
        valid_fls = {fl: fl_rooms for fl, fl_rooms in cand_by_floor.items() if len(fl_rooms) >= rcN}
        for fl, fl_rooms in valid_fls.items():
            m_map, m_used = match_sections_to_rooms(rem_cluster, fl_rooms)
            if m_map is not None:
                found.append((cand_ts.date, cand_ts.start_time, fl))
                break

    print(f"Found {len(found)} candidate slots with single-floor rooms! First 5: {found[:5]}")

finally:
    db.close()
