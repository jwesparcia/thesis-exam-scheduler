#schemas.py
from pydantic import BaseModel

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
    teacher_name: str   # ✅ include teacher

class SubjectCreate(SubjectBase):
    section_id: int

class Subject(SubjectBase):
    id: int
    section_id: int
    class Config:
        orm_mode = True


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
