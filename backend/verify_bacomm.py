from database import SessionLocal
from models import Subject, Course, YearLevel

db = SessionLocal()
course = db.query(Course).filter(Course.name == 'BACOMM').first()

if course:
    for year_id in [1, 2, 3]:
        year = db.query(YearLevel).filter(YearLevel.id == year_id).first()
        if year:
            subj_1 = db.query(Subject).filter(Subject.course_id == course.id, Subject.year_level_id == year.id, Subject.semester == 1).all()
            subj_2 = db.query(Subject).filter(Subject.course_id == course.id, Subject.year_level_id == year.id, Subject.semester == 2).all()
            print(f'{year.name}: Sem 1: {len(subj_1)} subjects, Sem 2: {len(subj_2)} subjects')
    
    # Show details for 3rd year summer
    year_3 = db.query(YearLevel).filter(YearLevel.id == 3).first()
    subj_summer = db.query(Subject).filter(Subject.course_id == course.id, Subject.year_level_id == year_3.id, Subject.semester == 3).all()
    print(f'3rd Year: Summer: {len(subj_summer)} subjects')
    for s in subj_summer:
        print(f'  {s.code}: {s.name}')
else:
    print("BACOMM course not found")

db.close()
