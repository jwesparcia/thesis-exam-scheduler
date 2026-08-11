import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import DistributionRule, Subject, Timeslot
from datetime import datetime, date, time, timedelta

db = SessionLocal()
try:
    rules = db.query(DistributionRule).all()
    print("Seeded/Configured Rules:")
    for r in rules:
        y_name = r.year_level.name if r.year_level else "Any"
        print(f"Rule: ID={r.id}, Category={r.category_type}, Year={y_name}, Days={r.allowed_days}, Session={r.allowed_session}")

    # Build date_map based on same logic as test run
    start_date = date(2026, 5, 20)
    exam_days = []
    curr = start_date
    while len(exam_days) < 4:
        if curr.weekday() != 6:
            exam_days.append(curr)
        curr += timedelta(days=1)
    
    date_map = {d: i + 1 for i, d in enumerate(exam_days)}
    print("\nExam Days:", exam_days)
    print("Date Map:", date_map)

    # Let's query timeslots
    timeslots = db.query(Timeslot).all()
    print(f"\nTotal Timeslots in DB: {len(timeslots)}")

    # Run the allowed timeslots matching logic for some sample subjects
    subjects = db.query(Subject).limit(5).all()
    for sub in subjects:
        sub_allowed = set()
        matching_rules = [r for r in rules if r.category_type == sub.category]
        specific_rules = [r for r in matching_rules if r.year_level_id == sub.year_level_id]
        active_rules = specific_rules if specific_rules else [r for r in matching_rules if r.year_level_id is None]
        
        y_name = sub.year_level.name if sub.year_level else "None"
        print(f"\nSubject: {sub.name} (Category: {sub.category}, Year: {y_name})")
        print(f"  Active Rules: {[r.id for r in active_rules]}")
        
        for slot in timeslots:
            day_num = date_map.get(slot.date)
            is_morning = slot.start_time < time(11, 30)
            
            allowed_by_any_rule = False
            for rule in active_rules:
                if day_num in rule.allowed_days:
                    if rule.allowed_session == "any":
                        allowed_by_any_rule = True
                    elif rule.allowed_session == "morning" and is_morning:
                        allowed_by_any_rule = True
                    elif rule.allowed_session == "afternoon" and not is_morning:
                        allowed_by_any_rule = True
            
            if allowed_by_any_rule:
                sub_allowed.add(slot)
                
        print(f"  Allowed timeslots count: {len(sub_allowed)}")
        # Print a few allowed slots as examples
        for slot in list(sub_allowed)[:3]:
            print(f"    - Day {date_map.get(slot.date)}: {slot.date} {slot.start_time} - {slot.end_time}")
finally:
    db.close()
