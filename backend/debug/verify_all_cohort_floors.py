import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Exam, Section, Subject, Timeslot, Room

def verify():
    db = SessionLocal()
    try:
        exams = db.query(Exam).filter(Exam.status == 'draft').all()
        print(f"Total draft exams: {len(exams)}")
        
        # Group exams by department, and by (timeslot_id, subject_id, course_id, year_level_id)
        # We can inspect College specifically or all departments
        groups = {}
        for e in exams:
            if not e.timeslot_id or not e.room:
                continue
            sec = e.section
            sub = e.subject
            dept = (sec.course.category if sec and sec.course else (sub.course.category if sub and sub.course else "Unknown"))
            c_id = sub.course_id or (sec.course_id if sec else None)
            yl_id = sub.year_level_id or (sec.year_level_id if sec else None)
            key = (dept, e.timeslot_id, e.subject_id, c_id, yl_id)
            groups.setdefault(key, []).append(e)
            
        print(f"Total simultaneous course cohort exam clusters: {len(groups)}")
        multi_section_clusters = {k: v for k, v in groups.items() if len(v) > 1}
        print(f"Multi-section simultaneous clusters: {len(multi_section_clusters)}")
        
        dept_clusters = {}
        dept_violations = {}
        violations = []
        for key, exam_list in multi_section_clusters.items():
            dept, ts_id, sub_id, c_id, yl_id = key
            dept_clusters[dept] = dept_clusters.get(dept, 0) + 1
            sub_name = exam_list[0].subject.name if exam_list[0].subject else f"Sub {sub_id}"
            ts = exam_list[0].timeslot
            
            floors = {}
            for e in exam_list:
                r_name = e.room.name
                digits = "".join(ch for ch in r_name if ch.isdigit())
                fl = int(digits[0]) if digits else -1
                floors.setdefault(fl, []).append((e.section.name if e.section else f"Sec {e.section_id}", r_name))
                
            if len(floors) > 1:
                dept_violations[dept] = dept_violations.get(dept, 0) + 1
                violations.append({
                    "dept": dept,
                    "subject": sub_name,
                    "date": ts.date,
                    "time": ts.start_time,
                    "floors": floors
                })
                
        print(f"\n==========================================")
        print(f"SAME-FLOOR CONSTRAINT VERIFICATION SUMMARY")
        print(f"==========================================")
        print(f"Total multi-section clusters checked: {len(multi_section_clusters)}")
        print(f"Floor split violations: {len(violations)}")
        for dept in sorted(dept_clusters.keys()):
            v_cnt = dept_violations.get(dept, 0)
            t_cnt = dept_clusters[dept]
            print(f"  [{dept}] Clusters: {t_cnt}, Violations: {v_cnt} ({(t_cnt - v_cnt) / t_cnt * 100:.1f}% on same floor)")
        
        college_violations = [v for v in violations if v["dept"] == "College"]
        print(f"\nCOLLEGE VIOLATIONS ({len(college_violations)}):")
        for v in college_violations:
            print(f"  {v['subject']} at {v['date']} {v['time']}:")
            for fl, sec_rooms in v['floors'].items():
                print(f"    Floor {fl}: {sec_rooms}")
            
    finally:
        db.close()

if __name__ == "__main__":
    verify()
