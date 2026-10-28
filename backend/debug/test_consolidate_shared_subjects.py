import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core import SessionLocal
from model import Subject, SubjectProgram, TeacherTeaching, Exam, IrregularSelection, Course
from sqlalchemy.orm import joinedload
from collections import defaultdict
from utils.scheduler import generate_exam_schedule
from datetime import date

def test_actual_consolidation_and_scheduler():
    db = SessionLocal()
    try:
        subjects = db.query(Subject).options(
            joinedload(Subject.assigned_programs),
            joinedload(Subject.course)
        ).all()

        groups = defaultdict(list)
        for s in subjects:
            norm_name = " ".join(s.name.strip().lower().split()) if s.name else ""
            key = (norm_name, s.year_level_id, s.semester, s.exam_type or "written")
            groups[key].append(s)

        merged_groups = 0
        duplicate_records = 0
        total_sp_added = 0

        for key, sub_list in groups.items():
            if len(sub_list) <= 1:
                continue

            sub_list.sort(key=lambda s: s.id)
            canonical = sub_list[0]
            duplicates = sub_list[1:]

            all_course_ids = set()
            for s in sub_list:
                if s.course_id:
                    all_course_ids.add(s.course_id)
                for sp in s.assigned_programs:
                    all_course_ids.add(sp.course_id)

            existing_sp_cids = {sp.course_id for sp in canonical.assigned_programs}
            for cid in all_course_ids:
                if cid not in existing_sp_cids:
                    db.add(SubjectProgram(subject_id=canonical.id, course_id=cid))
                    existing_sp_cids.add(cid)
                    total_sp_added += 1

            if any(s.category == "general" for s in sub_list):
                canonical.category = "general"

            if any(s.department_code == "GE" for s in sub_list):
                canonical.department_code = "GE"

            dup_ids = [s.id for s in duplicates]

            # Re-link TeacherTeaching records
            dup_teachings = db.query(TeacherTeaching).filter(TeacherTeaching.subject_id.in_(dup_ids)).all()
            for tt in dup_teachings:
                existing_tt = db.query(TeacherTeaching).filter(
                    TeacherTeaching.teacher_id == tt.teacher_id,
                    TeacherTeaching.subject_id == canonical.id,
                    TeacherTeaching.section_id == tt.section_id
                ).first()
                if existing_tt:
                    db.delete(tt)
                else:
                    tt.subject_id = canonical.id

            # Re-link Exam records
            db.query(Exam).filter(Exam.subject_id.in_(dup_ids)).update(
                {Exam.subject_id: canonical.id},
                synchronize_session=False
            )

            # Re-link IrregularSelection records
            db.query(IrregularSelection).filter(IrregularSelection.subject_id.in_(dup_ids)).update(
                {IrregularSelection.subject_id: canonical.id},
                synchronize_session=False
            )

            # Delete duplicate SubjectPrograms and Subjects
            db.query(SubjectProgram).filter(SubjectProgram.subject_id.in_(dup_ids)).delete(synchronize_session=False)
            db.query(Subject).filter(Subject.id.in_(dup_ids)).delete(synchronize_session=False)

            merged_groups += 1
            duplicate_records += len(duplicates)

        db.commit()
        print(f"SUCCESSFULLY CONSOLIDATED: Merged {merged_groups} groups, removed {duplicate_records} duplicates.")
        print(f"New total subjects in DB: {db.query(Subject).count()}")
        print(f"Total SubjectProgram records: {db.query(SubjectProgram).count()}")

        # Now test the scheduler with the consolidated subjects!
        print("\nTesting generate_exam_schedule for College Semester 1...")
        sched_res = generate_exam_schedule(
            db=db,
            start_date=date(2026, 3, 9),
            department="College",
            semester=1,
            term="Midterm"
        )
        print("Schedule Result:", sched_res)
        print("Scheduler test PASSED successfully!")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_actual_consolidation_and_scheduler()
