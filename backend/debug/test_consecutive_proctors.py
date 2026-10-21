import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import date, time
from core import SessionLocal
from model import Exam, Proctor, Timeslot, Subject, Section, Course
from utils.scheduler import generate_exam_schedule
from debug.verify_scheduler_constraints import verify_constraints

def test_consecutive_proctor_logic():
    print("=== TEST 1: Unit Test for Consecutive Assignment Logic ===")
    MAX_CONSECUTIVE_GAP = 30
    
    # Simulate proctor assignment tracker
    proctor_last_assignment = [None] * 5
    proctor_consec_streak = [0] * 5
    
    # Slot 1: 07:30 - 08:45 on Day 1
    d1 = date(2026, 5, 20)
    slot1 = (d1, 7 * 60 + 30, 8 * 60 + 45)
    # Slot 2: 09:00 - 10:15 on Day 1 (15m gap -> consecutive)
    slot2 = (d1, 9 * 60, 10 * 60 + 15)
    # Slot 3: 10:30 - 11:45 on Day 1 (15m gap -> consecutive)
    slot3 = (d1, 10 * 60 + 30, 11 * 60 + 45)
    # Slot 4: 13:00 - 14:15 on Day 1 (75m gap from slot 3 -> break)
    slot4 = (d1, 13 * 60, 14 * 60 + 15)
    # Slot 5: 07:30 - 08:45 on Day 2 (new day -> break)
    d2 = date(2026, 5, 21)
    slot5 = (d2, 7 * 60 + 30, 8 * 60 + 45)

    def can_assign(pidx, slot):
        day, start_m, end_m = slot
        last_asgn = proctor_last_assignment[pidx]
        if last_asgn is not None:
            last_d, last_s_m, last_e_m = last_asgn
            if day == last_d and 0 <= (start_m - last_e_m) <= MAX_CONSECUTIVE_GAP:
                if proctor_consec_streak[pidx] >= 2:
                    return False
        return True

    def assign(pidx, slot):
        assert can_assign(pidx, slot), f"Proctor {pidx} should be eligible for slot {slot}"
        day, start_m, end_m = slot
        last_asgn = proctor_last_assignment[pidx]
        if last_asgn is not None and day == last_asgn[0] and 0 <= (start_m - last_asgn[2]) <= MAX_CONSECUTIVE_GAP:
            proctor_consec_streak[pidx] += 1
        else:
            proctor_consec_streak[pidx] = 1
        proctor_last_assignment[pidx] = (day, start_m, end_m)

    # 1. Assign Proctor 0 to Slot 1 (1st assignment)
    assert can_assign(0, slot1) == True
    assign(0, slot1)
    assert proctor_consec_streak[0] == 1

    # 2. Assign Proctor 0 to Slot 2 (2nd consecutive assignment)
    assert can_assign(0, slot2) == True
    assign(0, slot2)
    assert proctor_consec_streak[0] == 2

    # 3. Check Slot 3 (3rd consecutive time slot) -> MUST BE SKIPPED
    assert can_assign(0, slot3) == False, "Proctor 0 should be skipped for 3rd consecutive slot without break!"
    print("  -> Passed: Proctor 0 correctly skipped for 3rd consecutive slot")

    # 4. Another proctor (Proctor 1) is assigned to Slot 3
    assert can_assign(1, slot3) == True
    assign(1, slot3)
    assert proctor_consec_streak[1] == 1

    # 5. Slot 4 is at 13:00 (75 min after slot 2 for Proctor 0) -> Proctor 0 had a break during slot 3!
    assert can_assign(0, slot4) == True, "Proctor 0 should be eligible again after a break!"
    assign(0, slot4)
    assert proctor_consec_streak[0] == 1, "Streak should reset to 1 after a break!"
    print("  -> Passed: Proctor 0 streak reset to 1 after break")

    # 6. Assign Proctor 0 to Slot 5 on Day 2 -> New day break
    assign(0, (d1, 14 * 60 + 30, 15 * 60 + 45)) # 2nd on Day 1
    assert proctor_consec_streak[0] == 2
    # Day 2 morning:
    assert can_assign(0, slot5) == True, "Proctor 0 should be eligible on new day!"
    assign(0, slot5)
    assert proctor_consec_streak[0] == 1, "Streak should reset to 1 on new day!"
    print("  -> Passed: Proctor 0 eligible on new day after overnight break")

    print("\n=== TEST 2: Running GA Scheduler & Verifying Constraints ===")
    db = SessionLocal()
    try:
        print("Running GA Schedule Generation...")
        result = generate_exam_schedule(
            db=db,
            start_date=date(2026, 5, 20),
            department="College",
            semester=1
        )
        print("Generation result:", result)
        print("\nVerifying constraints on generated schedule...")
        verify_constraints()
    finally:
        db.close()

if __name__ == "__main__":
    test_consecutive_proctor_logic()
