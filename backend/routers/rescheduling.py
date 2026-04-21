from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ReschedulingRequest, Exam, Notification
from schemas import ReschedulingRequestCreate, ReschedulingRequest as ReschedulingRequestSchema, ReschedulingRequestUpdate
from datetime import datetime

router = APIRouter(prefix="/rescheduling", tags=["Rescheduling Requests"])

@router.post("/submit")
def submit_rescheduling_request(request: ReschedulingRequestCreate, db: Session = Depends(get_db)):
    # Check if exam exists
    exam = db.query(Exam).filter(Exam.id == request.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Check if section matches the exam's section
    if request.section_name != exam.section.name:
        raise HTTPException(status_code=403, detail="Unauthorized: Section mismatch")

    # Check if a pending request already exists
    existing = db.query(ReschedulingRequest).filter(
        ReschedulingRequest.exam_id == request.exam_id,
        ReschedulingRequest.status == "pending"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A pending request already exists for this exam")

    # For online mode, room and times should be optional
    if request.requested_mode == "online":
        request.requested_room = None
        # Optionally clear times if online

    # Parse dates
    orig_exam_date = datetime.strptime(request.original_exam_date, "%Y-%m-%d").date()
    orig_start = datetime.strptime(request.original_start_time, "%H:%M:%S").time()
    orig_end = datetime.strptime(request.original_end_time, "%H:%M:%S").time()

    pref_date = datetime.strptime(request.preferred_date, "%Y-%m-%d").date() if request.preferred_date else None
    pref_start = datetime.strptime(request.preferred_start_time, "%H:%M:%S").time() if request.preferred_start_time else None
    pref_end = datetime.strptime(request.preferred_end_time, "%H:%M:%S").time() if request.preferred_end_time else None

    db_request = ReschedulingRequest(
        exam_id=request.exam_id,
        section_name=request.section_name,
        student_name=request.student_name,
        student_id=request.student_id,
        program=request.program,
        school_email=request.school_email,
        course_code=request.course_code,
        course_name=request.course_name,
        original_exam_date=orig_exam_date,
        original_start_time=orig_start,
        original_end_time=orig_end,
        exam_type=request.exam_type,
        reason_type=request.reason_type,
        detailed_explanation=request.detailed_explanation,
        supporting_file=request.supporting_file,
        requested_mode=request.requested_mode,
        preferred_date=pref_date,
        preferred_start_time=pref_start,
        preferred_end_time=pref_end,
        acknowledged=request.acknowledged,
        reason=request.detailed_explanation  # compatibility
    )
    db.add(db_request)
    db.commit()
    db.refresh(db_request)

    # Create Notification for Program Head
    notification = Notification(
        recipient_type="program_head",
        recipient_id="admin",  # Assuming single admin/program head for now
        message=f"New rescheduling request from {request.student_name} ({request.section_name}) for {request.course_name}",
        type="info",
        related_id=db_request.id
    )
    db.add(notification)
    db.commit()

    return {"message": "Rescheduling request submitted successfully", "id": db_request.id}

@router.get("/pending")
def get_pending_requests(db: Session = Depends(get_db)):
    requests = db.query(ReschedulingRequest).options(
        ReschedulingRequest.exam  # load exam details
    ).filter(ReschedulingRequest.status == "pending").all()

    result = []
    for req in requests:
        result.append({
            "id": req.id,
            "exam_id": req.exam_id,
            "section_name": req.section_name,
            "student_name": req.student_name,
            "course_name": req.course_name,
            "original_exam_date": req.original_exam_date.strftime("%A, %B %d, %Y") if req.original_exam_date else "Unknown",
            "original_time": f"{req.original_start_time.strftime('%I:%M %p')} - {req.original_end_time.strftime('%I:%M %p')}" if req.original_start_time and req.original_end_time else "Unknown",
            "exam_type": req.exam_type,
            "reason_type": req.reason_type,
            "detailed_explanation": req.detailed_explanation,
            "supporting_file": req.supporting_file,
            "requested_mode": req.requested_mode,
            "preferred_date": req.preferred_date.strftime("%Y-%m-%d") if req.preferred_date else None,
            "preferred_time": f"{req.preferred_start_time.strftime('%I:%M %p')} - {req.preferred_end_time.strftime('%I:%M %p')}" if req.preferred_start_time and req.preferred_end_time else None,
            "acknowledged": req.acknowledged
        })
    return result

@router.put("/{request_id}/review")
def review_request(request_id: int, update: ReschedulingRequestUpdate, db: Session = Depends(get_db)):
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    request.status = update.status
    request.reviewer_comments = update.reviewer_comments
    
    # Create Notification for Student
    notification = Notification(
        recipient_type="student",
        recipient_id=request.section_name,  # Using section_name as identifier for now
        message=f"Your rescheduling request for {request.course_name} has been {update.status}.",
        type="success" if update.status == "approved" else "error",
        related_id=request.id
    )
    db.add(notification)
    
    db.commit()
    return {"message": f"Request {update.status}"}

@router.get("/my-requests/{section_name}")
def get_my_requests(section_name: str, db: Session = Depends(get_db)):
    requests = db.query(ReschedulingRequest).filter(ReschedulingRequest.section_name == section_name).all()
    return [ReschedulingRequestSchema.from_orm(req) for req in requests]
