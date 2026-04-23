#!/usr/bin/env python3
"""
Simplified version using SQLite instead of PostgreSQL
"""
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Date, Time
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import datetime

# Use SQLite for easier setup
DATABASE_URL = "sqlite:///./exam_scheduler_lite.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Simplified models
class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class YearLevel(Base):
    __tablename__ = "year_levels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class Section(Base):
    __tablename__ = "sections"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"))
    year_level_id = Column(Integer, ForeignKey("year_levels.id"))

class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"))
    year_level_id = Column(Integer, ForeignKey("year_levels.id"))
    semester = Column(Integer, nullable=False)

class Teacher(Base):
    __tablename__ = "teachers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

class Timeslot(Base):
    __tablename__ = "timeslots"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

class Exam(Base):
    __tablename__ = "exams"
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    year_level_id = Column(Integer, ForeignKey("year_levels.id"))
    semester = Column(Integer, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    section_id = Column(Integer, ForeignKey("sections.id"))
    room_id = Column(Integer, ForeignKey("rooms.id"))
    timeslot_id = Column(Integer, ForeignKey("timeslots.id"))
    status = Column(String, default="draft")  # draft or posted

    subject = relationship("Subject")
    section = relationship("Section")
    room = relationship("Room")
    timeslot = relationship("Timeslot")
    course = relationship("Course")
    year_level = relationship("YearLevel")

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Exam Scheduler (SQLite Lite)")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Seed initial data
@app.on_event("startup")
def seed_data():
    db = SessionLocal()
    try:
        # Check if data already exists
        if db.query(Course).first():
            print("Data already seeded")
            return

        print("Seeding initial data...")

        # Courses
        courses = [
            Course(id=1, name="BSIT"),
            Course(id=2, name="BSCS"),
            Course(id=3, name="BSCpE"),
            Course(id=4, name="BSTM"),
            Course(id=5, name="BSHM"),
            Course(id=6, name="BSA"),
            Course(id=7, name="BSPsych"),
            Course(id=8, name="BSCrim"),
            Course(id=9, name="BMMA"),
            Course(id=10, name="BACOMM")
        ]
        db.add_all(courses)

        # Year levels
        years = [
            YearLevel(id=1, name="1st Year"),
            YearLevel(id=2, name="2nd Year"),
            YearLevel(id=3, name="3rd Year"),
            YearLevel(id=4, name="4th Year")
        ]
        db.add_all(years)

        db.commit()
        print("✓ Initial data seeded")

    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

# API Routes
@app.get("/")
def root():
    return {"message": "Exam Scheduler API (SQLite Lite)"}

@app.get("/catalog/courses")
def get_courses(db: Session = Depends(get_db)):
    courses = db.query(Course).all()
    return [{"id": c.id, "name": c.name} for c in courses]

@app.get("/catalog/year-levels")
def get_year_levels(db: Session = Depends(get_db)):
    years = db.query(YearLevel).all()
    return [{"id": y.id, "name": y.name} for y in years]

@app.get("/catalog/details")
def get_details(
    course_id: int = Query(...),
    year_level_id: int = Query(...),
    semester: int = Query(...),
    db: Session = Depends(get_db)
):
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
                "teacher": "Unassigned"
            }
            for subj in subjects
        ]

        result.append({
            "id": section.id,
            "name": section.name,
            "subjects": subjects_data
        })

    return {"sections": result}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
