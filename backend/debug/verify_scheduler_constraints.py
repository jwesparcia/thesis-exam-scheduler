import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import sys
from datetime import datetime, date, time
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Exam, Proctor, TeacherSchedule, Subject, Section, Room, Timeslot
from utils.scheduler import intervals_cover, subjects_match

def verify_constraints():
    db = SessionLocal()
    try:
        print("=== VERIFYING GENERATED SCHEDULER CONSTRAINTS ===")
        
        # 1. Fetch draft exams
        exams = db.query(Exam).filter(Exam.status == "draft").all()
        print(f"Total draft exams generated: {len(exams)}")
        if len(exams) == 0:
            print("No draft exams found. Please run the scheduler first.")
            return

        # 2. Load proctor data
        all_proctors = db.query(Proctor).filter(Proctor.exclude_from_scheduling == False).all()
        proctor_map = {p.id: p for p in all_proctors}
        
        # Load teacher schedules
        proctor_schedules = {}
        for p in all_proctors:
            if p.teacher_id:
                scheds = db.query(TeacherSchedule).filter(TeacherSchedule.teacher_id == p.teacher_id).all()
                availability = {}
                for s in scheds:
                    availability.setdefault(s.day_of_week, []).append((s.start_time, s.end_time))
                proctor_schedules[p.id] = {
                    "availability": availability,
                    "taught_subjects": {s.subject_name for s in scheds if s.subject_name}
                }

        # 3. Perform validation checks
        violations = []
        assigned_proctors_count = 0
        unassigned_proctors_count = 0
        proctor_time_load = {} # maps pid -> set of timeslot_id

        # To check room collisions
        room_time_load = {} # maps room_id -> list of exams
        
        for exam in exams:
            sub = exam.subject
            sec = exam.section
            slot = exam.timeslot
            room = exam.room
            pid = exam.proctor_id
            
            if not slot:
                violations.append(f"Exam {exam.id} has no timeslot assigned.")
                continue

            # Room booking track
            if room:
                room_time_load.setdefault((room.id, slot.id), []).append(exam)
            
            if not pid:
                unassigned_proctors_count += 1
                continue
                
            assigned_proctors_count += 1
            proctor = proctor_map.get(pid)
            if not proctor:
                violations.append(f"Exam {exam.id} has invalid proctor ID: {pid}")
                continue
                
            # Double-booking check
            proctor_time_load.setdefault(pid, []).append((slot.id, exam))
            
            # Schedule availability check
            p_data = proctor_schedules.get(pid)
            if not p_data:
                violations.append(f"Proctor {proctor.name} has no schedule/availability in database but was assigned to Exam {exam.id} ({sub.name}).")
                continue
                
            dow = slot.date.weekday()
            if dow not in p_data["availability"]:
                violations.append(f"Proctor {proctor.name} is assigned to Exam {exam.id} on {slot.date} (Weekday {dow}), but has no schedule on that day.")
                continue
                
            # Check interval coverage
            if not intervals_cover(p_data["availability"][dow], slot.start_time, slot.end_time):
                sched_strs = [f"{start.strftime('%I:%M %p')}-{end.strftime('%I:%M %p')}" for start, end in p_data["availability"][dow]]
                violations.append(f"Proctor {proctor.name} schedule does not cover timeslot {slot.start_time}-{slot.end_time} on weekday {dow}. Work intervals: {', '.join(sched_strs)}")

            # No proctoring own class/subject check
            for taught_name in p_data["taught_subjects"]:
                if subjects_match(taught_name, sub.name):
                    violations.append(f"Proctor {proctor.name} is assigned to proctor their own subject/class: Exam {exam.id} for {sub.name} (matches taught subject: '{taught_name}')")

        # 4. Check double-booking violations for proctors
        for pid, assignments in proctor_time_load.items():
            slot_map = {}
            for slot_id, exam in assignments:
                slot_map.setdefault(slot_id, []).append(exam)
            for slot_id, exam_list in slot_map.items():
                if len(exam_list) > 1:
                    exam_details = ", ".join([f"Exam {e.id} ({e.subject.name} - {e.section.name})" for e in exam_list])
                    p_name = proctor_map[pid].name
                    violations.append(f"Proctor {p_name} is double-booked in timeslot {slot_id} with multiple exams: {exam_details}")

        # 5. Check room collision violations
        for (room_id, slot_id), exam_list in room_time_load.items():
            if len(exam_list) > 1:
                r_name = exam_list[0].room.name if exam_list[0].room else f"ID {room_id}"
                s_obj = exam_list[0].timeslot
                exam_details = ", ".join([f"Exam {e.id} ({e.subject.name} - {e.section.name})" for e in exam_list])
                violations.append(f"Room collision: Room {r_name} is booked for multiple exams in timeslot {s_obj.start_time}-{s_obj.end_time} on {s_obj.date}: {exam_details}")

        # Summary
        print(f"Assigned proctors count: {assigned_proctors_count}")
        print(f"Unassigned exams count (no proctor): {unassigned_proctors_count}")
        print(f"Total violations found: {len(violations)}")
        
        if violations:
            print("\nVIOLATIONS LIST:")
            for v in violations:
                print(f" - {v}")
            sys.exit(1)
        else:
            print("\n[SUCCESS] All schedule and proctor constraints verified! No violations detected.")
            
    finally:
        db.close()

if __name__ == "__main__":
    verify_constraints()
