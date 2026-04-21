# crud.py
from sqlalchemy.orm import Session
from models import Course, YearLevel, Section, Subject

# --- List Courses ---
def list_courses(db: Session):
    return db.query(Course).all()

# --- List Year Levels ---
def list_year_levels(db: Session):
    return db.query(YearLevel).all()

# --- Get Sections + Subjects for course/year/semester ---
def get_course_year_sem_details(course_id: int, year_level_id: int, semester: int, db: Session):
    sections = db.query(Section).filter_by(
        course_id=course_id,
        year_level_id=year_level_id
    ).all()

    result = []
    for section in sections:
        subjects = db.query(Subject).filter_by(
            course_id=course_id,
            year_level_id=year_level_id,
            semester=semester
        ).all()

        subjects_data = [
            {
                "id": subj.id,
                "code": subj.code,
                "name": subj.name,
                "teacher": subj.teacher.name if subj.teacher else "Unassigned"
            }
            for subj in subjects
        ]

        result.append({
            "id": section.id,
            "name": section.name,
            "subjects": subjects_data
        })

    return {"sections": result}

def get_sections_with_subjects(db: Session, year_name: str):
    sections = db.query(Section).filter(Section.name.like(f"%{year_name}%")).all()
    result = []
    for sec in sections:
        subjects = [
            {
                "id": subj.id,
                "code": subj.code,
                "name": subj.name,
                "teacher": subj.teacher.name if subj.teacher else "Unassigned"
            }
            for subj in db.query(Subject).filter_by(
                course_id=sec.course_id,
                year_level_id=sec.year_level_id
            ).all()
        ]
        result.append({"id": sec.id, "name": sec.name, "subjects": subjects})
    return {"sections": result}

