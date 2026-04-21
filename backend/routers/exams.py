from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Exam, Subject, Section, Room, Timeslot, Course, YearLevel, Teacher
from utils.scheduler import generate_exam_schedule
from datetime import datetime

router = APIRouter(prefix="/exams", tags=["Exams"])

@router.get("/")
def get_exams(
    status: str = Query(None, description="Filter by status (draft or posted)"),
    section_name: str = Query(None, description="Filter by section name (e.g., BSIT-1A)"),
    course_id: int = Query(None, description="Filter by course ID"),
    year_level_id: int = Query(None, description="Filter by year level ID"),
    semester: int = Query(None, description="Filter by semester"),
    proctor_id: int = Query(None, description="Filter by proctor (teacher) ID"),
    db: Session = Depends(get_db),
):
    """
    Fetch exams with optional filters. Students can filter by their section.
    Returns joined data so students can see full details.
    """
    print(f"[DEBUG] get_exams called filters: status={status}, section={section_name}, course={course_id}, year={year_level_id}, sem={semester}")
    
    query = db.query(Exam).options(
        joinedload(Exam.subject),
        joinedload(Exam.section),
        joinedload(Exam.room),
        joinedload(Exam.timeslot),
        joinedload(Exam.course),
        joinedload(Exam.year_level),
        joinedload(Exam.proctor),
    )

    if status:
        query = query.filter(Exam.status == status)
    
    if section_name:
        # Use has() to filter by relationship without creating duplicates
        query = query.filter(Exam.section.has(name=section_name))

    if course_id:
        query = query.filter(Exam.course_id == course_id)
    
    if year_level_id:
        query = query.filter(Exam.year_level_id == year_level_id)
        
    if semester:
        query = query.filter(Exam.semester == semester)

    if proctor_id:
        query = query.filter(Exam.proctor_id == proctor_id)

    # Join with Timeslot to order by date/time
    query = query.join(Exam.timeslot).order_by(Timeslot.date, Timeslot.start_time)

    exams = query.all()
    print(f"[DEBUG] Found {len(exams)} exams")
    
    if not exams:
        return []

    result = []
    for e in exams:
        subject = e.subject
        section = e.section
        room = e.room
        timeslot = e.timeslot
        course = e.course
        year = e.year_level
        proctor = e.proctor

        # Format date with day name to match scheduler format
        if timeslot:
            day_name = timeslot.date.strftime("%A")
            date_str = timeslot.date.strftime("%B %d, %Y")
            full_date = f"{day_name}, {date_str}"
        else:
            full_date = "-"

        proctor_name = proctor.name if proctor else "Unassigned"

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
            "start_time": timeslot.start_time.strftime("%I:%M %p") if timeslot else "-",
            "end_time": timeslot.end_time.strftime("%I:%M %p") if timeslot else "-",
            "room": room.name if room else "-",
            "proctor": proctor_name,
            "proctor_name": proctor_name,
            "proctor_attendance": e.proctor_attendance or "pending",
        })

    return result

@router.post("/generate")
def generate_schedule(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db)
):
    """
    Trigger the automatic scheduling for ALL courses based on distribution rules.
    Optionally accepts start_date (YYYY-MM-DD) in the body.
    """
    try:
        start_date = None
        end_date = None
        payload_data = payload if payload else {}
        
        start_date_str = payload_data.get("start_date")
        if start_date_str:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            
        end_date_str = payload_data.get("end_date")
        if end_date_str:
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        
        count = generate_exam_schedule(db, start_date=start_date, end_date=end_date)
        return {"message": f"Schedule generated successfully! {count} exams scheduled across the selected range."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/post")
def post_exams(
    course_id: int = Query(..., description="Course ID to post exams for"),
    year_level_id: int = Query(..., description="Year level ID to post exams for"),
    semester: int = Query(..., description="Semester to post exams for"),
    db: Session = Depends(get_db)
):
    """
    Post only the draft exams for the specified course/year/semester.
    """
    latest_drafts = db.query(Exam).filter(
        Exam.status == "draft",
        Exam.course_id == course_id,
        Exam.year_level_id == year_level_id,
        Exam.semester == semester
    ).all()
    
    if not latest_drafts:
        raise HTTPException(status_code=404, detail="No draft exams found to post")

    for exam in latest_drafts:
        exam.status = "posted"
    db.commit()

    return {"message": f"✅ Successfully posted {len(latest_drafts)} exams for course {course_id}, year {year_level_id}, semester {semester}."}

@router.delete("/clear")
def clear_exams(db: Session = Depends(get_db)):
    """
    Delete all exams (for testing reset).
    """
    count = db.query(Exam).delete()
    db.commit()
    return {"message": f"🧹 Deleted {count} exams."}
