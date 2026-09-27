#schemas.py
from pydantic import BaseModel
from typing import Optional

# ----- Section Schemas -----
class SectionBase(BaseModel):
    section_name: str

class SectionCreate(SectionBase):
    pass

class Section(SectionBase):
    id: int
    class Config:
        orm_mode = True


# ----- Subject Schemas -----
class SubjectBase(BaseModel):
    subject_name: str
    teacher_name: str   # Include teacher

class SubjectCreate(SubjectBase):
    section_id: int

class Subject(SubjectBase):
    id: int
    section_id: int
    duration_minutes: int = 75
    class Config:
        orm_mode = True

class SubjectDurationUpdate(BaseModel):
    duration_minutes: int

class SubjectBulkDurationUpdate(BaseModel):
    subject_ids: list[int] = None
    course_id: int = None
    category: str = None
    year_level_id: int = None
    duration_minutes: int = 75
    preset: str = None

class ExamSettings(BaseModel):
    daily_start_time: str = "07:30"
    daily_end_time: str = "17:00"
    default_duration: int = 75


# ----- Rescheduling Request Schemas -----
class ReschedulingRequestBase(BaseModel):
    exam_id: int
    section_name: str

    # Student Information
    student_name: str
    student_id: str
    program: str
    school_email: str

    # Exam Details
    course_code: str
    course_name: str
    original_exam_date: str  # date string
    original_start_time: str  # time string
    original_end_time: str
    exam_type: str

    # Reason
    reason_type: str
    detailed_explanation: str

    # Supporting Documents
    supporting_file: str = None

    # Preferred Reschedule
    requested_mode: str = "offline"
    preferred_date: str = None
    preferred_start_time: str = None
    preferred_end_time: str = None

    # Acknowledgement
    acknowledged: bool

class ReschedulingRequestCreate(ReschedulingRequestBase):
    pass

class ReschedulingRequest(ReschedulingRequestBase):
    id: int
    status: str
    reviewer_comments: str = None
    instructor_approval: str
    program_head_approval: str
    class Config:
        orm_mode = True

class ReschedulingRequestUpdate(BaseModel):
    status: str
    reviewer_comments: str = None
    room_id: Optional[int] = None
    proctor_id: Optional[int] = None


# ----- Room Schemas -----
class RoomBase(BaseModel):
    name: str
    building: str
    capacity: int

class RoomCreate(RoomBase):
    pass

class Room(RoomBase):
    id: int
    department: str
    class Config:
        orm_mode = True
