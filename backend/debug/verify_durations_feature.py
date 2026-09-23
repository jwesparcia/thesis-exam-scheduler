import sys
import os
from datetime import date, time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core import SessionLocal
from model.models import Subject, Course, Exam, Timeslot, SystemSetting
from utils.scheduler import generate_exam_schedule

def run_tests():
    db = SessionLocal()
    try:
        print("=== Step 1: Check Database Subject Durations & Settings ===")
        settings = {s.key: s.value for s in db.query(SystemSetting).all()}
        print(f"System settings: {settings}")
        assert "daily_start_time" in settings, "Missing daily_start_time"
        assert "daily_end_time" in settings, "Missing daily_end_time"

        bsa_course = db.query(Course).filter((Course.name.ilike("%Accountancy%")) | (Course.name.ilike("%BSA%"))).first()
        assert bsa_course is not None, "BSA course not found"
        
        bsa_majors = db.query(Subject).filter(Subject.course_id == bsa_course.id, Subject.category == "major").all()
        print(f"BSA majors count: {len(bsa_majors)}")
        assert len(bsa_majors) > 0, "No BSA majors found"
        for s in bsa_majors:
            assert s.duration_minutes == 120, f"Expected 120m for BSA major {s.name}, found {s.duration_minutes}"
        print("All BSA major subjects have duration_minutes = 120! PASSED.")

        other_subs = db.query(Subject).filter(Subject.course_id != bsa_course.id, Subject.duration_minutes == 75).all()
        print(f"Non-BSA subjects with 75m count: {len(other_subs)}")
        assert len(other_subs) > 0, "No non-BSA 75m subjects found"
        print("General subjects with 75m default verified! PASSED.")

        print("\n=== Step 2: Test Scheduler with Multi-Duration & Daily Window ===")
        start_time_str = "07:30"
        end_time_str = "17:00"
        res = generate_exam_schedule(
            db=db,
            start_date=date(2026, 6, 1),
            department="College",
            semester=1,
            daily_start_time=start_time_str,
            daily_end_time=end_time_str
        )
        print("Scheduler result:", res)
        assert res["total_exams"] > 0, "No exams generated"

        # Check newly created draft exams
        draft_exams = db.query(Exam).join(Timeslot).filter(Exam.status == "draft").all()
        print(f"Total draft exams generated: {len(draft_exams)}")

        bsa_major_durations = []
        other_durations = []
        outside_window_count = 0
        earliest_time = time(7, 30)
        latest_time = time(17, 0)

        for e in draft_exams:
            ts = e.timeslot
            if not ts:
                continue
            dur = (ts.end_time.hour * 60 + ts.end_time.minute) - (ts.start_time.hour * 60 + ts.start_time.minute)
            if ts.start_time < earliest_time or ts.end_time > latest_time:
                outside_window_count += 1

            sub = db.query(Subject).filter(Subject.id == e.subject_id).first()
            if sub and sub.course_id == bsa_course.id and sub.category == "major":
                bsa_major_durations.append(dur)
            else:
                other_durations.append(dur)

        print(f"BSA Major durations set: {set(bsa_major_durations)} (count: {len(bsa_major_durations)})")
        print(f"Other exam durations set: {set(other_durations)} (count: {len(other_durations)})")
        print(f"Exams outside daily window ({start_time_str} - {end_time_str}): {outside_window_count}")

        assert set(bsa_major_durations) == {120}, f"Expected only 120m for BSA majors, got {set(bsa_major_durations)}"
        assert set(other_durations) == {75}, f"Expected only 75m for other exams, got {set(other_durations)}"
        assert outside_window_count == 0, f"Found {outside_window_count} exams outside configured window"
        print("Scheduler multi-duration and window constraints fully satisfied! PASSED.")

        # Clean up test drafts
        db.rollback()
        db.query(Exam).filter(Exam.status == "draft").delete()
        db.commit()
        print("Draft test exams cleaned up. ALL VERIFICATIONS PASSED!")

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
