import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pandas as pd
from sqlalchemy.orm import Session
from core import SessionLocal
from model import Proctor, TeacherSchedule
from datetime import time

def add_dummy_schedules():
    db = SessionLocal()
    
    # Read the schedule from sched.xlsx
    df = pd.read_excel('../frontend/sched.xlsx')
    
    # Map column names to day_of_week integers (0=Monday, 6=Sunday)
    day_map = {
        'MONDAY': 0,
        'TUESDAY': 1,
        'WEDNESDAY': 2,
        'THURSDAY': 3,
        'FRIDAY': 4,
        'SATURDAY': 5
    }
    
    schedules_to_add = []
    
    for index, row in df.iterrows():
        time_str = str(row['Day/Time']).strip()
        if ' - ' not in time_str:
            continue
            
        try:
            start_str, end_str = time_str.split(' - ')
            start_h, start_m = map(int, start_str.split(':'))
            end_h, end_m = map(int, end_str.split(':'))
            
            # Handle AM/PM conversion (school operates 7am to 7pm)
            # 7, 8, 9, 10, 11 are AM. 12 is PM. 1, 2, 3, 4, 5, 6 are PM.
            # 7 at the end of the day is PM (19:00).
            # We can determine if it's PM by looking at the hour and index
            if start_h < 7:
                start_h += 12
            elif start_h == 7 and end_h == 7 and start_m > 0:
                pass # 7:30 AM
            elif start_h == 7 and index > 10:
                start_h += 12 # 7:00 PM
                
            if end_h < 7:
                end_h += 12
            elif end_h == 7 and index > 10:
                end_h += 12
            
            start_t = time(start_h, start_m)
            end_t = time(end_h, end_m)
            
            for day_col, day_idx in day_map.items():
                if day_col in df.columns:
                    val = str(row[day_col]).strip()
                    if val != 'nan' and val != '':
                        schedules_to_add.append({
                            'day_of_week': day_idx,
                            'start_time': start_t,
                            'end_time': end_t,
                            'subject_name': val
                        })
        except Exception as e:
            continue
            
    # Get all proctors
    proctors = db.query(Proctor).all()
    
    # Delete existing dummy schedules to prevent duplicates if run multiple times
    db.query(TeacherSchedule).delete()
    
    count = 0
    import random
    for proctor in proctors:
        if proctor.teacher_id:
            # Proctors have 2 days off between Mon-Sat (0-5)
            # Pick 2 random days to be their days off
            working_days = list(range(6))
            random.seed(proctor.id) # Use proctor.id as seed so it's consistent
            off_days = random.sample(working_days, 2)
            working_days = [d for d in working_days if d not in off_days]
            
            for s in schedules_to_add:
                if s['day_of_week'] not in working_days:
                    continue
                ts = TeacherSchedule(
                    teacher_id=proctor.teacher_id,
                    day_of_week=s['day_of_week'],
                    start_time=s['start_time'],
                    end_time=s['end_time'],
                    subject_name=s['subject_name'],
                    is_published=True
                )
                db.add(ts)
                count += 1
                
    db.commit()
    db.close()
    print(f"Added {count} dummy schedule entries across {len(proctors)} proctors.")

if __name__ == "__main__":
    add_dummy_schedules()
