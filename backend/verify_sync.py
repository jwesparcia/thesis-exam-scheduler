from database import SessionLocal
from models import Exam, Timeslot, Section, Subject

db = SessionLocal()
exams = db.query(Exam).filter(Exam.status == "draft").all()
print(f"Total draft exams: {len(exams)}")

# Check dates and synchronization
sync_check = {} # subject_id -> (date, start_time, sections_count)
dates = set()

errors = []

for e in exams:
    ts = db.query(Timeslot).get(e.timeslot_id)
    d = str(ts.date)
    st = str(ts.start_time)
    dates.add(d)
    
    if e.subject_id not in sync_check:
        sync_check[e.subject_id] = (d, st, 1)
    else:
        orig_d, orig_st, count = sync_check[e.subject_id]
        if d != orig_d or st != orig_st:
            errors.append(f"DESYNC: Subject {e.subject_id} has different schedules! {orig_d} {orig_st} vs {d} {st}")
        sync_check[e.subject_id] = (orig_d, orig_st, count + 1)

print(f"Unique dates across all exams: {sorted(dates)}")
print(f"Number of unique dates: {len(dates)}")

if not errors:
    print("SUCCESS: All sections are synchronized for each subject.")
else:
    for err in errors:
        print(err)

# Check per section spread
section_days = {}
for e in exams:
    ts = db.query(Timeslot).get(e.timeslot_id)
    d = str(ts.date)
    section_days.setdefault(e.section_id, set()).add(d)

print("\nSection Spread Check:")
for sid, days in section_days.items():
    sec = db.query(Section).get(sid)
    name = sec.name if sec else str(sid)
    print(f"{name}: {len(days)} days used.")
    if len(days) < 3:
        print(f"WARNING: Section {name} uses only {len(days)} days!")
