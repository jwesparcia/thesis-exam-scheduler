import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import Exam, Subject, Section, Timeslot
from collections import defaultdict
from sqlalchemy.orm import joinedload

def verify_distribution():
    db = SessionLocal()
    try:
        print("--- Verification: Daily Exam Distribution ---")

        # 1. Fetch all exams, preloading subjects, sections, timeslots
        exams = db.query(Exam).options(
            joinedload(Exam.subject),
            joinedload(Exam.section),
            joinedload(Exam.timeslot)
        ).all()

        if not exams:
            print("No exams found in the database. Run scheduler first.")
            return

        print(f"Total exams in DB: {len(exams)}")

        # 2. Pre-calculate count of written exam subjects per section
        subjects = db.query(Subject).filter(
            Subject.exam_type == "written",
            Subject.semester == 1
        ).all()
        sections = db.query(Section).all()
        subjects_per_section = {}
        for sec in sections:
            subjects_per_section[sec.id] = sum(
                1 for sub in subjects 
                if sub.course_id == sec.course_id and sub.year_level_id == sec.year_level_id
            )

        # 3. Group exams by section, then by date
        section_day_exams = defaultdict(lambda: defaultdict(list))
        for exam in exams:
            if not exam.timeslot:
                continue
            section_day_exams[exam.section_id][exam.timeslot.date].append(exam)

        # 4. Check each section's daily distribution
        violations = []
        sections_checked = 0

        for sec_id, day_exams in section_day_exams.items():
            sections_checked += 1
            sec = db.query(Section).filter(Section.id == sec_id).first()
            sec_name = sec.name if sec else f"Section ID {sec_id}"
            total_subj = subjects_per_section.get(sec_id, 0)
            
            print(f"\nSection: {sec_name} | Total Written Subjects: {total_subj}")
            
            # Print daily distribution
            for day, day_exams_list in sorted(day_exams.items()):
                num_exams = len(day_exams_list)
                exam_names = [e.subject.name for e in day_exams_list]
                print(f"  Date: {day} | Count: {num_exams} | Exams: {exam_names}")
                
                # Check constraints
                if total_subj >= 8:
                    if num_exams < 3 or num_exams > 4:
                        violation_msg = f"Violation for {sec_name} on {day}: {num_exams} exams (Allowed: 3-4)"
                        violations.append(violation_msg)
                        print(f"    [FAIL] {violation_msg}")
                    else:
                        print("    [PASS]")
                else:
                    if num_exams > 3:
                        violation_msg = f"Violation for {sec_name} on {day}: {num_exams} exams (Allowed: max 3)"
                        violations.append(violation_msg)
                        print(f"    [FAIL] {violation_msg}")
                    elif num_exams == 1 and sum(len(exs) for exs in day_exams.values()) >= 2:
                        violation_msg = f"Violation for {sec_name} on {day}: {num_exams} exams (Allowed: 2-3)"
                        violations.append(violation_msg)
                        print(f"    [FAIL] {violation_msg}")
                    else:
                        print("    [PASS]")

        print("\n=== VERIFICATION SUMMARY ===")
        print(f"Sections Checked: {sections_checked}")
        if violations:
            print(f"FAIL: Found {len(violations)} violations!")
            for v in violations:
                print(f"  - {v}")
        else:
            print("SUCCESS: All sections satisfy the daily subject count constraints!")

    finally:
        db.close()

if __name__ == "__main__":
    verify_distribution()
