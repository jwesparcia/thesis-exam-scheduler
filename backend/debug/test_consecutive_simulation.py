import sys
import os
from datetime import date, time

def time_to_min(t):
    return t.hour * 60 + t.minute

def run_simulation():
    print("=== SIMULATION TEST: Multi-Slot Proctor Assignment Sequence ===")
    
    # 4 Proctors: P0, P1, P2, P3
    # P0 and P1 from THM, P2 and P3 from ICT
    proctor_ids = [101, 102, 103, 104]
    num_proctors = 4
    proctor_departments = ["THM", "THM", "ICT", "ICT"]
    proctor_max_assignments = [8, 8, 8, 8]
    MAX_CONSECUTIVE_GAP = 30
    
    # 5 consecutive time slots on the same day:
    # 07:30 - 08:45
    # 09:00 - 10:15
    # 10:30 - 11:45
    # 12:00 - 13:15
    # 13:30 - 14:45
    d = date(2026, 5, 20)
    slots = [
        {"slot_idx": 0, "date": d, "start_m": 7 * 60 + 30, "end_m": 8 * 60 + 45},
        {"slot_idx": 1, "date": d, "start_m": 9 * 60, "end_m": 10 * 60 + 15},
        {"slot_idx": 2, "date": d, "start_m": 10 * 60 + 30, "end_m": 11 * 60 + 45},
        {"slot_idx": 3, "date": d, "start_m": 12 * 60, "end_m": 13 * 60 + 15},
        {"slot_idx": 4, "date": d, "start_m": 13 * 60 + 30, "end_m": 14 * 60 + 45},
    ]

    # For each slot, 1 exam in ICT department
    # Cross-dept proctors (THM: P0, P1) will be preferred first!
    tasks = []
    for s in slots:
        tasks.append({
            "slot": s,
            "candidates": [0, 1, 2, 3], # all 4 proctors eligible
            "exam_dept": "ICT"
        })

    proctor_counts = [0] * num_proctors
    proctor_slots_set = set()
    proctor_last_assignment = [None] * num_proctors
    proctor_consec_streak = [0] * num_proctors
    
    assigned_schedule = []

    for task_idx, task in enumerate(tasks):
        s = task["slot"]
        day = s["date"]
        start_m = s["start_m"]
        end_m = s["end_m"]
        slot_idx = s["slot_idx"]
        exam_dept = task["exam_dept"]
        
        p_id = None
        best_key = (99, 99999)
        chosen_pidx = None
        for pidx in task["candidates"]:
            if (pidx, slot_idx) in proctor_slots_set:
                continue
            if proctor_counts[pidx] >= proctor_max_assignments[pidx]:
                continue
            
            # Consecutive check
            last_asgn = proctor_last_assignment[pidx]
            if last_asgn is not None:
                last_d, last_s_m, last_e_m = last_asgn
                if day == last_d and 0 <= (start_m - last_e_m) <= MAX_CONSECUTIVE_GAP:
                    if proctor_consec_streak[pidx] >= 2:
                        continue # Skip!
            
            p_dept = proctor_departments[pidx]
            is_same = 1 if (p_dept and exam_dept and p_dept == exam_dept) else 0
            key = (is_same, proctor_counts[pidx])
            if key < best_key:
                best_key = key
                chosen_pidx = pidx
                p_id = proctor_ids[pidx]
                
        if p_id is not None:
            proctor_slots_set.add((chosen_pidx, slot_idx))
            proctor_counts[chosen_pidx] += 1
            
            last_asgn = proctor_last_assignment[chosen_pidx]
            if last_asgn is not None and day == last_asgn[0] and 0 <= (start_m - last_asgn[2]) <= MAX_CONSECUTIVE_GAP:
                proctor_consec_streak[chosen_pidx] += 1
            else:
                proctor_consec_streak[chosen_pidx] = 1
            proctor_last_assignment[chosen_pidx] = (day, start_m, end_m)
            
            assigned_schedule.append({
                "slot_idx": slot_idx,
                "time": f"{start_m//60}:{start_m%60:02d} - {end_m//60}:{end_m%60:02d}",
                "proctor": f"P{chosen_pidx} (ID: {p_id}, Dept: {proctor_departments[chosen_pidx]})",
                "pidx": chosen_pidx,
                "streak": proctor_consec_streak[chosen_pidx],
                "total_count": proctor_counts[chosen_pidx]
            })

    for a in assigned_schedule:
        print(f"Slot {a['slot_idx']} ({a['time']}): Assigned to {a['proctor']} | Current Streak: {a['streak']} | Total Exams: {a['total_count']}")

    # Verification Assertions:
    # 1. P0 is cross-dept, assigned at Slot 0 (streak 1)
    assert assigned_schedule[0]["pidx"] in (0, 1), "Slot 0 should pick cross-dept proctor P0 or P1"
    first_p = assigned_schedule[0]["pidx"]
    # 2. At Slot 1, P0 or P1 gets 2nd consecutive assignment
    # 3. Check that NO proctor has streak > 2 anywhere in the schedule
    pidx_history = {}
    for a in assigned_schedule:
        pidx = a["pidx"]
        pidx_history.setdefault(pidx, []).append(a["slot_idx"])
        assert a["streak"] <= 2, f"Streak violated: {a}"

    print("\nProctor assignment slot indices:")
    for pidx, slots_assigned in pidx_history.items():
        print(f"  Proctor {pidx}: slots {slots_assigned}")
        # Verify no 3 consecutive slot indices (e.g. [0, 1, 2] is forbidden)
        for i in range(len(slots_assigned) - 2):
            s0 = slots_assigned[i]
            s1 = slots_assigned[i+1]
            s2 = slots_assigned[i+2]
            assert not (s1 == s0 + 1 and s2 == s1 + 1), f"Proctor {pidx} assigned 3 consecutive slots: {s0}, {s1}, {s2}!"

    print("\n[SUCCESS] Simulation test passed! Maximum 2 consecutive assignments rule perfectly enforced.")

if __name__ == "__main__":
    run_simulation()
