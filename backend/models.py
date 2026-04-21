from sqlalchemy import Column, Integer, String, ForeignKey, Date, Time, Enum, Boolean, DateTime, JSON
from passlib.context import CryptContext
from datetime import datetime, timezone
from sqlalchemy.orm import relationship
from database import Base

class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    category = Column(String, default="College") # College, SHS
    
    sections = relationship("Section", back_populates="course")
    subjects = relationship("Subject", back_populates="course")
    exams = relationship("Exam")

class YearLevel(Base):
    __tablename__ = "year_levels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    
    sections = relationship("Section", back_populates="year_level")
    subjects = relationship("Subject", back_populates="year_level")
    exams = relationship("Exam")

class Teacher(Base):
    __tablename__ = "teachers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    
    subjects = relationship("Subject", back_populates="teacher")
    schedules = relationship("TeacherSchedule", back_populates="teacher")

class Section(Base):
    __tablename__ = "sections"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    year_level_id = Column(Integer, ForeignKey("year_levels.id"))
    
    course = relationship("Course", back_populates="sections")
    year_level = relationship("YearLevel", back_populates="sections")

class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, index=True)
    name = Column(String, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    year_level_id = Column(Integer, ForeignKey("year_levels.id"))
    semester = Column(Integer)
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    
    # New fields
    exam_type = Column(String, default="written") # written, practical
    category = Column(String, default="major")    # general, major
    
    course = relationship("Course", back_populates="subjects")
    year_level = relationship("YearLevel", back_populates="subjects")
    teacher = relationship("Teacher", back_populates="subjects")

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class Proctor(Base):
    __tablename__ = "proctors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    department = Column(String, nullable=True)
    contact = Column(String, nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    
    teacher = relationship("Teacher")
    availabilities = relationship("ProctorAvailability", back_populates="proctor")

class TeacherSchedule(Base):
    __tablename__ = "teacher_schedules"
    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    day_of_week = Column(Integer) # 0=Monday, 6=Sunday
    start_time = Column(Time)
    end_time = Column(Time)
    subject_name = Column(String, nullable=True)
    
    teacher = relationship("Teacher")
    is_published = Column(Boolean, default=False)
    
    teacher = relationship("Teacher", back_populates="schedules")

class ProctorAvailability(Base):
    __tablename__ = "proctor_availabilities"
    id = Column(Integer, primary_key=True, index=True)
    proctor_id = Column(Integer, ForeignKey("proctors.id"))
    day_of_week = Column(Integer) # 0=Monday, 6=Sunday
    start_time = Column(Time)
    end_time = Column(Time)
    
    proctor = relationship("Proctor", back_populates="availabilities")

class Timeslot(Base):
    __tablename__ = "timeslots"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date)
    start_time = Column(Time)
    end_time = Column(Time)
    
    exams = relationship("Exam", back_populates="timeslot", foreign_keys="[Exam.timeslot_id]")

class Exam(Base):
    __tablename__ = "exams"
    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    section_id = Column(Integer, ForeignKey("sections.id"))
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    timeslot_id = Column(Integer, ForeignKey("timeslots.id"), nullable=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    year_level_id = Column(Integer, ForeignKey("year_levels.id"))
    semester = Column(Integer)
    status = Column(String, default="draft") # draft, posted
    proctor_attendance = Column(String, default="pending") # pending, attended
    
    # Updated to link to proctors table
    proctor_id = Column(Integer, ForeignKey("proctors.id"), nullable=True)
    
    subject = relationship("Subject")
    section = relationship("Section")
    room = relationship("Room")
    timeslot = relationship("Timeslot")
    course = relationship("Course")
    year_level = relationship("YearLevel")
    proctor = relationship("Proctor")

class ReschedulingRequest(Base):
    __tablename__ = "rescheduling_requests"
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"))
    section_name = Column(String)
    student_name = Column(String)
    student_id = Column(String)
    program = Column(String)
    school_email = Column(String)
    course_code = Column(String)
    course_name = Column(String)
    
    original_exam_date = Column(Date)
    original_start_time = Column(Time)
    original_end_time = Column(Time)
    
    exam_type = Column(String)
    reason_type = Column(String)
    detailed_explanation = Column(String)
    supporting_file = Column(String, nullable=True)
    
    requested_mode = Column(String)
    preferred_date = Column(Date, nullable=True)
    preferred_start_time = Column(Time, nullable=True)
    preferred_end_time = Column(Time, nullable=True)
    
    acknowledged = Column(Boolean, default=False)
    status = Column(String, default="pending") # pending, approved, rejected
    reviewer_comments = Column(String, nullable=True)
    
    exam = relationship("Exam", foreign_keys=[exam_id], primaryjoin="ReschedulingRequest.exam_id == Exam.id")

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    recipient_type = Column(String) # student, program_head, proctor
    recipient_id = Column(String)   # section_name, "admin", teacher_name
    message = Column(String)
    type = Column(String) # info, success, error, warning
    related_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class DistributionRule(Base):
    __tablename__ = "distribution_rules"
    id = Column(Integer, primary_key=True, index=True)
    category_type = Column(String) # general, major
    year_level_id = Column(Integer, ForeignKey("year_levels.id"), nullable=True) # Null for general
    allowed_days = Column(JSON) # e.g., [1, 2]
    allowed_session = Column(String) # morning, afternoon, any
    
    year_level = relationship("YearLevel", foreign_keys=[year_level_id])

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # program_head, teacher, student
    section_name = Column(String, nullable=True)  # for students only
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)  # for teachers
    proctor_id = Column(Integer, ForeignKey("proctors.id"), nullable=True)  # for proctors
