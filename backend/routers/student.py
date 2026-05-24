from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Exam, Timeslot, ReschedulingRequest, User, IrregularSelection, Subject, Section
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .auth import get_current_user, require_role
from utils.logging import log_activity

router = APIRouter(prefix="/student", tags=["Student"])

# Helper function to build exam response
def build_exam_response(exams):
    result = []
    for e in exams:
        subject = e.subject
        section = e.section
        room = e.room
        timeslot = e.timeslot
        course = e.course
        year = e.year_level
        proctor = e.proctor

        if timeslot:
            day_name = timeslot.date.strftime("%A")
            date_str = timeslot.date.strftime("%B %d, %Y")
            full_date = f"{day_name}, {date_str}"
            start_time = timeslot.start_time.strftime("%I:%M %p")
            end_time = timeslot.end_time.strftime("%I:%M %p")
        else:
            full_date = "-"
            start_time = "-"
            end_time = "-"

        result.append({
            "id": e.id,
            "subject_code": subject.code if subject else "-",
            "subject_name": subject.name if subject else "-",
            "exam_type": subject.exam_type if subject else "-",
            "category": subject.category if subject else "-",
            "section_name": section.name if section else "-",
            "course_name": course.name if course else "-",
            "year_level": year.name if year else "-",
            "semester": e.semester,
            "exam_date": full_date,
            "start_time": start_time,
            "end_time": end_time,
            "room": room.name if room else "-",
            "proctor": proctor.name if proctor else "Unassigned",
            "status": e.status,
        })
    return result

# Authentication
# Authentication is now handled by auth.py

# Regular student: exams for their section
@router.get("/exams")
def get_student_exams(
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db),
):
    if current_user.student_type == "irregular":
        raise HTTPException(status_code=400, detail="Irregular students use /custom-exams")
    if not current_user.section_name:
        return []
    exams = (
        db.query(Exam)
        .options(
            joinedload(Exam.subject),
            joinedload(Exam.section),
            joinedload(Exam.room),
            joinedload(Exam.timeslot),
            joinedload(Exam.course),
            joinedload(Exam.year_level),
            joinedload(Exam.proctor),
        )
        .filter(Exam.status == "posted")
        .filter(Exam.section.has(name=current_user.section_name))
        .join(Exam.timeslot)
        .order_by(Timeslot.date, Timeslot.start_time)
        .all()
    )
    return build_exam_response(exams)

# Student: conflict detection (supports regular and irregular students)
@router.get("/conflicts")
def get_student_conflicts(
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db),
):
    if current_user.student_type == "irregular":
        selections = db.query(IrregularSelection).filter(IrregularSelection.user_id == current_user.id).all()
        if not selections:
            return []
        
        # Get all subject names from the selected subject_ids
        selected_subject_ids = [sel.subject_id for sel in selections]
        selected_subjects = db.query(Subject).filter(Subject.id.in_(selected_subject_ids)).all()
        selected_names = [sub.name for sub in selected_subjects]
        
        all_matching_subjects = db.query(Subject).filter(
            Subject.name.in_(selected_names),
            Subject.exam_type == "written"
        ).all()
        
        subject_name_to_ids = {}
        for sub in all_matching_subjects:
            subject_name_to_ids.setdefault(sub.name, []).append(sub.id)
        
        from sqlalchemy import or_
        conditions = []
        for sel in selections:
            subject = db.query(Subject).get(sel.subject_id)
            if subject and subject.name in subject_name_to_ids:
                matching_ids = subject_name_to_ids[subject.name]
                conditions.append(
                    (Exam.subject_id.in_(matching_ids)) & (Exam.section_id == sel.section_id)
                )
        
        if not conditions:
            return []
        
        exams = (
            db.query(Exam)
            .options(joinedload(Exam.timeslot))
            .filter(
                Exam.status == "posted",
                or_(*conditions)
            )
            .all()
        )
    else:
        if not current_user.section_name:
            return []
        exams = (
            db.query(Exam)
            .options(joinedload(Exam.timeslot))
            .filter(Exam.status == "posted")
            .filter(Exam.section.has(name=current_user.section_name))
            .all()
        )
    
    conflicts = []
    for i, e1 in enumerate(exams):
        for e2 in exams[i+1:]:
            ts1 = e1.timeslot
            ts2 = e2.timeslot
            if ts1 and ts2 and ts1.date == ts2.date:
                if ts1.start_time < ts2.end_time and ts2.start_time < ts1.end_time:
                    conflicts.append({
                        "exam1": {"id": e1.id},
                        "exam2": {"id": e2.id},
                    })
    return conflicts

# Student: rescheduling requests (supports regular and irregular students)
@router.get("/requests")
def get_student_requests(
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db),
):
    if current_user.student_type == "irregular":
        requests = (
            db.query(ReschedulingRequest)
            .filter(ReschedulingRequest.school_email == current_user.email)
            .all()
        )
    else:
        if not current_user.section_name:
            return []
        requests = (
            db.query(ReschedulingRequest)
            .filter(ReschedulingRequest.section_name == current_user.section_name)
            .all()
        )
    return [
        {
            "id": r.id,
            "exam_id": r.exam_id,
            "section_name": r.section_name,
            "student_name": r.student_name,
            "course_name": r.course_name,
            "reason": r.detailed_explanation,
            "requested_mode": r.requested_mode,
            "status": r.status,
        }
        for r in requests
    ]

# Student: submit reschedule request
class RescheduleRequestBody(BaseModel):
    exam_id: int
    section_name: str
    student_name: str
    student_id: str
    program: str
    school_email: str
    course_code: str
    course_name: str
    original_exam_date: str
    original_start_time: str
    original_end_time: str
    exam_type: str
    reason_type: str
    detailed_explanation: str
    supporting_file: Optional[str] = None
    requested_mode: str
    preferred_date: Optional[str] = None
    preferred_start_time: Optional[str] = None
    preferred_end_time: Optional[str] = None
    acknowledged: bool

@router.post("/reschedule-request")
def submit_reschedule_request(
    body: RescheduleRequestBody,
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db),
):
    exam = db.query(Exam).filter(Exam.id == body.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user.student_type == "irregular":
        is_selected = False
        if exam.subject and exam.section_id:
            selections = db.query(IrregularSelection).filter(IrregularSelection.user_id == current_user.id).all()
            for sel in selections:
                sel_subject = db.query(Subject).filter(Subject.id == sel.subject_id).first()
                if sel_subject and sel_subject.name == exam.subject.name and sel.section_id == exam.section_id:
                    is_selected = True
                    break
        if not is_selected:
            raise HTTPException(status_code=403, detail="Unauthorized: this exam is not in your selected schedule")
    else:
        if exam.section and exam.section.name != current_user.section_name:
            raise HTTPException(status_code=403, detail="Unauthorized: section mismatch")
    
    def parse_date(s):
        return datetime.strptime(s, "%Y-%m-%d").date() if s else None
    def parse_time(s):
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                return datetime.strptime(s, fmt).time()
            except:
                pass
        return None

    db_req = ReschedulingRequest(
        exam_id=body.exam_id,
        section_name=body.section_name,
        student_name=body.student_name,
        student_id=body.student_id,
        program=body.program,
        school_email=body.school_email,
        course_code=body.course_code,
        course_name=body.course_name,
        original_exam_date=parse_date(body.original_exam_date),
        original_start_time=parse_time(body.original_start_time),
        original_end_time=parse_time(body.original_end_time),
        exam_type=body.exam_type,
        reason_type=body.reason_type,
        detailed_explanation=body.detailed_explanation,
        supporting_file=body.supporting_file,
        requested_mode=body.requested_mode,
        preferred_date=parse_date(body.preferred_date),
        preferred_start_time=parse_time(body.preferred_start_time),
        preferred_end_time=parse_time(body.preferred_end_time),
        acknowledged=body.acknowledged,
    )
    db.add(db_req)
    db.commit()
    db.refresh(db_req)
    log_activity(db, current_user.id, "STUDENT_RESCHED_SUBMIT", f"Exam ID: {body.exam_id}")
    return {"message": "Request submitted successfully", "id": db_req.id}

# ========== ENDPOINTS FOR IRREGULAR STUDENTS ==========

class StudentTypeRequest(BaseModel):
    student_type: str
    course_id: Optional[int] = None

@router.post("/set-student-type")
def set_student_type(
    req: StudentTypeRequest,
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db)
):
    if req.student_type not in ["regular", "irregular"]:
        raise HTTPException(status_code=400, detail="Invalid type")
    current_user.student_type = req.student_type
    if req.course_id is not None:
        current_user.course_id = req.course_id
    db.commit()
    log_activity(db, current_user.id, "STUDENT_TYPE_CHANGE", f"New Type: {req.student_type}, Course: {req.course_id}")
    return {"student_type": req.student_type, "course_id": current_user.course_id}

class SetCourseRequest(BaseModel):
    course_id: int

@router.post("/set-course")
def set_student_course(
    req: SetCourseRequest,
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db)
):
    current_user.course_id = req.course_id
    db.commit()
    log_activity(db, current_user.id, "STUDENT_COURSE_CHANGE", f"New Course ID: {req.course_id}")
    return {"course_id": current_user.course_id}

@router.get("/available-subjects")
def get_available_subjects(
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db)
):
    """
    Return unique subject names with sections related to the student's selected course.
    """
    from collections import defaultdict

    if not current_user.course_id:
        return []

    # Group sections by subject name
    subject_map = defaultdict(lambda: {
        "id": None,          
        "code": None,
        "name": None,
        "sections": []      
    })

    # Filter subjects by student's course and ensure it is a written exam
    subjects = db.query(Subject).filter(
        Subject.course_id == current_user.course_id,
        Subject.exam_type == "written"
    ).all()
    for sub in subjects:
        name = sub.name
        # Use first occurrence's id and code
        if subject_map[name]["id"] is None:
            subject_map[name]["id"] = sub.id
            subject_map[name]["code"] = sub.code
            subject_map[name]["name"] = name
        
        # Get all sections that have this subject in their curriculum
        sections = db.query(Section).filter(
            Section.course_id == sub.course_id,
            Section.year_level_id == sub.year_level_id
        ).all()
        
        for sec in sections:
            # Avoid duplicate sections for the same subject name
            if not any(s["id"] == sec.id for s in subject_map[name]["sections"]):
                subject_map[name]["sections"].append({"id": sec.id, "name": sec.name})
    
    # Convert to list and sort by name
    result = list(subject_map.values())
    result.sort(key=lambda x: x["name"])
    return result

class SelectionItem(BaseModel):
    subject_id: int
    section_id: int

@router.post("/save-selected")
def save_selected_subjects(
    selections: List[SelectionItem],
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db)
):
   
    db.query(IrregularSelection).filter(IrregularSelection.user_id == current_user.id).delete()
    for sel in selections:
        new_sel = IrregularSelection(
            user_id=current_user.id,
            subject_id=sel.subject_id,
            section_id=sel.section_id
        )
        db.add(new_sel)
    db.commit()
    log_activity(db, current_user.id, "IRREGULAR_SELECTION_SAVE", f"Count: {len(selections)}")
    return {"message": "Selection saved"}

@router.get("/selected-subjects")
def get_selected_subjects(
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db)
):
    selections = db.query(IrregularSelection).filter(IrregularSelection.user_id == current_user.id).all()
    return [{"subject_id": s.subject_id, "section_id": s.section_id} for s in selections]

@router.get("/custom-exams")
def get_custom_exams(
    current_user: User = Depends(require_role(["student"])),
    db: Session = Depends(get_db)
):
    """For irregular students: get exams based on saved selections (match by subject name)"""
    if current_user.student_type != "irregular":
        raise HTTPException(status_code=400, detail="Not an irregular student")
    
    selections = db.query(IrregularSelection).filter(IrregularSelection.user_id == current_user.id).all()
    if not selections:
        return []
    
    # Get all subject names from the selected subject_ids
    selected_subject_ids = [sel.subject_id for sel in selections]
    selected_subjects = db.query(Subject).filter(Subject.id.in_(selected_subject_ids)).all()
    selected_names = [sub.name for sub in selected_subjects]
    
    all_matching_subjects = db.query(Subject).filter(
        Subject.name.in_(selected_names),
        Subject.exam_type == "written"
    ).all()
    
    subject_name_to_ids = {}
    for sub in all_matching_subjects:
        subject_name_to_ids.setdefault(sub.name, []).append(sub.id)
    
    from sqlalchemy import or_
    conditions = []
    for sel in selections:
        subject = db.query(Subject).get(sel.subject_id)
        if subject and subject.name in subject_name_to_ids:
            matching_ids = subject_name_to_ids[subject.name]
            conditions.append(
                (Exam.subject_id.in_(matching_ids)) & (Exam.section_id == sel.section_id)
            )
    
    if not conditions:
        return []
    
    exams = db.query(Exam).options(
        joinedload(Exam.subject),
        joinedload(Exam.section),
        joinedload(Exam.room),
        joinedload(Exam.timeslot),
        joinedload(Exam.course),
        joinedload(Exam.year_level),
        joinedload(Exam.proctor),
    ).filter(
        Exam.status == "posted",
        or_(*conditions)
    ).join(Exam.timeslot).order_by(Timeslot.date, Timeslot.start_time).all()
    
    return build_exam_response(exams)