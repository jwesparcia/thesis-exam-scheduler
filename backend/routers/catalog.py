from fastapi import APIRouter, Depends, Query, HTTPException, File, UploadFile, Form, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from core import get_db, cache
from core.cache import TTL_STATIC, TTL_CATALOG_STATS, TTL_CATALOG_DETAILS
from services import crud
import io
import pandas as pd
import bcrypt
from typing import List, Optional
from sqlalchemy import or_
from model import (
    Course, YearLevel, Section, Subject, Teacher, Proctor, User, TeacherTeaching, 
    Exam, ReschedulingRequest, IrregularSelection, ActivityLog, PasswordResetToken, 
    ChatMessage, TeacherSchedule, ProctorAvailability
)
from routers.auth import require_role, get_current_user
from utils.logging import log_activity
from pydantic import BaseModel

# ── cache keys ────────────────────────────────────────────────────────
_KEY_COURSES       = "courses:all"
_KEY_YEAR_LEVELS   = "year_levels:all"
_KEY_STATS         = "catalog:stats"
_KEY_STUDENT_STATS = "catalog:student_stats"

def _invalidate_student_exam_schedules():
    cache.delete_pattern("exam_schedule:section:*")
    cache.delete_pattern("exam_schedule:irregular:*")

def _details_key(course_id: int, year_level_id: int, semester: int) -> str:
    return f"catalog:details:{course_id}:{year_level_id}:{semester}"

def safe_clear_catalog_data(db: Session, exclude_program_head: bool = True):
    """
    Safely delete all catalog, scheduling, and proctor/teacher user data in dependency order.
    Student accounts are intentionally preserved — they are managed separately.
    Their course_id and section_name are nulled out since the curriculum is being wiped.
    """
    # Delete proctor and teacher user accounts only; preserve students and program_head
    roles_to_delete = ["proctor", "teacher", "admin"] if not exclude_program_head else ["proctor", "teacher"]
    users_to_delete = db.query(User).filter(User.role.in_(roles_to_delete)).all()
    
    user_ids = [u.id for u in users_to_delete]

    if user_ids:
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id.in_(user_ids)).delete(synchronize_session=False)
        db.query(ChatMessage).filter(or_(ChatMessage.sender_id.in_(user_ids), ChatMessage.recipient_id.in_(user_ids))).delete(synchronize_session=False)
        db.query(ActivityLog).filter(ActivityLog.user_id.in_(user_ids)).update({ActivityLog.user_id: None}, synchronize_session=False)

    db.query(ReschedulingRequest).delete(synchronize_session=False)
    db.query(IrregularSelection).delete(synchronize_session=False)
    db.query(Exam).delete(synchronize_session=False)
    db.query(TeacherTeaching).delete(synchronize_session=False)
    db.query(TeacherSchedule).delete(synchronize_session=False)
    db.query(ProctorAvailability).delete(synchronize_session=False)
    db.query(Subject).delete(synchronize_session=False)
    db.query(Section).delete(synchronize_session=False)

    if user_ids:
        db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)

    # Null out course_id on student accounts before deleting courses to avoid FK violations.
    # Preserve User.section_name so student section assignments are not destroyed.
    db.query(User).filter(User.role == "student").update(
        {User.course_id: None},
        synchronize_session=False
    )

    db.query(Proctor).delete(synchronize_session=False)
    db.query(Teacher).delete(synchronize_session=False)
    db.query(Course).delete(synchronize_session=False)

def safe_clear_student_accounts(db: Session) -> int:
    """
    Safely delete all student user accounts and dependent records to prevent FK violations.
    Returns the count of deleted student accounts.
    """
    student_users = db.query(User).filter(User.role == "student").all()
    student_ids = [u.id for u in student_users]
    count = len(student_ids)
    
    if student_ids:
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id.in_(student_ids)).delete(synchronize_session=False)
        db.query(ChatMessage).filter(or_(ChatMessage.sender_id.in_(student_ids), ChatMessage.recipient_id.in_(student_ids))).delete(synchronize_session=False)
        db.query(ActivityLog).filter(ActivityLog.user_id.in_(student_ids)).update({ActivityLog.user_id: None}, synchronize_session=False)
        db.query(IrregularSelection).filter(IrregularSelection.user_id.in_(student_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.role == "student").delete(synchronize_session=False)
        
    return count

router = APIRouter(prefix="/catalog", tags=["Catalog"])

def classify_subject(name: str):
    name_lower = name.lower()
    # Practical subjects
    practical_keywords = [
        "physical education", "national service training program", "euthenics", 
        "thesis", "practicum", "nstp", "immersion", "capstone", "laboratory",
        "pathfit", "p.e.", "lab",
        "methods of research", "practical research", "research methods",
        "inquiries, investigations", "work immersion",
    ]
    if any(keyword in name_lower for keyword in practical_keywords):
        exam_type = "practical"
    else:
        exam_type = "written"

    # General Education subjects
    general_keywords = [
        "oral communication", "general mathematics", "21st century literature",
        "reading and writing", "statistics and probability", "understanding self",
        "contemporary world", "purposive communication", "ethics", "art appreciation",
        "komunikasyon at pananaliksik", "pagbasa at pagsusuri", "personal development",
        "philosophy", "literature", "media and information literacy",
        "rotc", "readings in philippine history", "rizal", "philippine popular culture",
        "the entrepreneurial mind", "mathematics in the modern world", "science, technology, and society",
        "great books", "foreign language", "general physics", "general chemistry", "general biology"
    ]
    if name_lower.startswith("ge") or any(keyword in name_lower for keyword in general_keywords):
        category = "general"
    else:
        category = "major"

    return exam_type, category

@router.get("/courses")
def get_courses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cached = cache.get(_KEY_COURSES)
    if cached is not None:
        return cached
    courses = crud.list_courses(db)
    result = [{"id": c.id, "name": c.name, "category": c.category} for c in courses]
    cache.set(_KEY_COURSES, result, TTL_STATIC)
    return result

@router.get("/year-levels")
def get_year_levels(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cached = cache.get(_KEY_YEAR_LEVELS)
    if cached is not None:
        return cached
    year_levels = crud.list_year_levels(db)
    result = [{"id": y.id, "name": y.name} for y in year_levels]
    cache.set(_KEY_YEAR_LEVELS, result, TTL_STATIC)
    return result

@router.get("/exams/attendance-roster")
def get_exams_attendance_roster(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "program_head"]))
):
    """
    Returns all generated exams with their attendance roster (students who will take each exam).
    For each exam:
    - Regular students: User.section_name == exam.section.name
    - Irregular students: IrregularSelection where section_id == exam.section_id
      AND their selected subject_id shares the same subject name as the exam subject
    Students are sorted alphabetically by name.
    """
    from sqlalchemy.orm import joinedload as jl

    exams = (
        db.query(Exam)
        .options(
            jl(Exam.subject),
            jl(Exam.section),
            jl(Exam.room),
            jl(Exam.timeslot),
            jl(Exam.course),
            jl(Exam.year_level),
        )
        .filter(Exam.status.in_(["posted", "draft"]))
        .order_by(Exam.id)
        .all()
    )

    # Pre-fetch all student users
    all_students = db.query(User).filter(User.role == "student").all()
    student_by_id = {s.id: s for s in all_students}
    student_by_email = {s.email: s for s in all_students}

    # Build map: section_name -> list of regular students
    regular_map = {}
    for student in all_students:
        if student.student_type == "regular" and student.section_name:
            regular_map.setdefault(student.section_name, []).append(student)

    # Pre-fetch all irregular selections with subject info
    # map: (section_id, subject_name) -> set of user_ids
    from model import Subject as SubjectModel
    all_subjects = db.query(SubjectModel).all()
    subject_name_by_id = {s.id: s.name for s in all_subjects}

    all_selections = db.query(IrregularSelection).all()
    # Build map: (section_id, subject_name) -> set of user_ids
    irr_map = {}
    for sel in all_selections:
        subj_name = subject_name_by_id.get(sel.subject_id, "")
        key = (sel.section_id, subj_name.lower().strip())
        irr_map.setdefault(key, set()).add(sel.user_id)

    consultation_requests = db.query(ReschedulingRequest).filter(
        ReschedulingRequest.status == "approved",
        ReschedulingRequest.rescheduled_exam_id.isnot(None),
    ).all()
    consultation_request_by_exam = {req.rescheduled_exam_id: req for req in consultation_requests}
    consultation_emails_by_source_exam = {}
    for req in consultation_requests:
        consultation_emails_by_source_exam.setdefault(req.exam_id, set()).add(req.school_email)

    result = []
    for exam in exams:
        section = exam.section
        subject = exam.subject
        timeslot = exam.timeslot
        room = exam.room
        course = exam.course
        year_level = exam.year_level

        # Build time/date strings
        if timeslot:
            day_name = timeslot.date.strftime("%A")
            date_str = timeslot.date.strftime("%B %d, %Y")
            full_date = f"{day_name}, {date_str}"
            start_time = timeslot.start_time.strftime("%I:%M %p")
            end_time = timeslot.end_time.strftime("%I:%M %p")
            date_iso = timeslot.date.isoformat()
        else:
            full_date = "Unscheduled"
            start_time = "-"
            end_time = "-"
            date_iso = None

        section_name = section.name if section else ""
        consultation_request = consultation_request_by_exam.get(exam.id)
        if consultation_request:
            student = student_by_email.get(consultation_request.school_email)
            all_students_list = [{
                "id": student.id,
                "name": student.name,
                "email": student.email,
                "student_id": student.student_id or "",
                "student_type": "irregular",
            }] if student else []
        else:
            reg_students = regular_map.get(section_name, [])
            reg_list = [
                {
                    "id": s.id,
                    "name": s.name,
                    "email": s.email,
                    "student_id": s.student_id or "",
                    "student_type": "regular",
                }
                for s in reg_students
            ]

            # Irregular students who selected this subject for this section
            irr_list = []
            if section and subject:
                exam_subj_name = (subject.name or "").lower().strip()
                key = (section.id, exam_subj_name)
                irr_user_ids = irr_map.get(key, set())
                for uid in irr_user_ids:
                    s = student_by_id.get(uid)
                    if s:
                        irr_list.append({
                            "id": s.id,
                            "name": s.name,
                            "email": s.email,
                            "student_id": s.student_id or "",
                            "student_type": "irregular",
                        })

            rescheduled_emails = consultation_emails_by_source_exam.get(exam.id, set())
            if rescheduled_emails:
                irr_list = [student for student in irr_list if student["email"] not in rescheduled_emails]

            # Alphabetical sort by last name (last word of the full name)
            def last_name_key(s):
                parts = (s["name"] or "").strip().split()
                return parts[-1].lower() if parts else ""
            all_students_list = sorted(reg_list + irr_list, key=last_name_key)

        result.append({
            "exam_id": exam.id,
            "subject_code": subject.code if subject else "-",
            "subject_name": subject.name if subject else "-",
            "section_name": section_name,
            "course_name": course.name if course else "-",
            "year_level": year_level.name if year_level else "-",
            "semester": exam.semester,
            "term": exam.term,
            "status": exam.status,
            "room": room.name if room else "Unassigned",
            "exam_date": full_date,
            "date_iso": date_iso,
            "start_time": start_time,
            "end_time": end_time,
            "student_count": len(all_students_list),
            "students": all_students_list,
        })

    # Sort by date, then time, then section
    def sort_key(e):
        return (e["date_iso"] or "9999", e["start_time"], e["section_name"])

    result.sort(key=sort_key)
    return result


@router.get("/details")
def get_details(
    course_id: int = Query(...),
    year_level_id: int = Query(...),
    semester: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    key = _details_key(course_id, year_level_id, semester)
    cached = cache.get(key)
    if cached is not None:
        return cached
    result = crud.get_course_year_sem_details(course_id, year_level_id, semester, db)
    cache.set(key, result, TTL_CATALOG_DETAILS)
    return result

@router.get("/stats")
def get_catalog_stats(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """
    Get counts of courses, sections, subjects, and teachers in the database.
    """
    cached = cache.get(_KEY_STATS)
    if cached is not None:
        return cached
    result = {
        "courses": db.query(Course).count(),
        "sections": db.query(Section).count(),
        "subjects": db.query(Subject).count(),
        "teachers": db.query(Teacher).count()
    }
    cache.set(_KEY_STATS, result, TTL_CATALOG_STATS)
    return result

@router.get("/student-stats")
def get_student_stats(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """
    Get counts of total, regular, and irregular student accounts.
    """
    cached = cache.get(_KEY_STUDENT_STATS)
    if cached is not None:
        return cached
    total_students = db.query(User).filter(User.role == "student").count()
    regular_students = db.query(User).filter(User.role == "student", User.student_type == "regular").count()
    irregular_students = db.query(User).filter(User.role == "student", User.student_type == "irregular").count()
    result = {
        "total": total_students,
        "regular": regular_students,
        "irregular": irregular_students
    }
    cache.set(_KEY_STUDENT_STATS, result, TTL_CATALOG_STATS)
    return result

class SubjectCreateRequest(BaseModel):
    code: Optional[str] = None
    name: str
    course_id: int
    year_level_id: Optional[int] = None
    semester: int = 1
    term: Optional[str] = "All"
    category: str = "major"
    exam_type: str = "written"
    duration_minutes: int = 75

class SubjectUpdateRequest(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    course_id: Optional[int] = None
    year_level_id: Optional[int] = None
    semester: Optional[int] = None
    term: Optional[str] = None
    category: Optional[str] = None
    exam_type: Optional[str] = None
    duration_minutes: Optional[int] = None

@router.get("/subjects")
@router.get("/subjects/durations")
def get_subject_durations(
    department: Optional[str] = Query(None),
    course_id: Optional[int] = Query(None),
    year_level_id: Optional[int] = Query(None),
    semester: Optional[int] = Query(None),
    term: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    # Normalize FastAPI Query defaults if called directly
    department = department if isinstance(department, str) else None
    course_id = course_id if isinstance(course_id, int) else None
    year_level_id = year_level_id if isinstance(year_level_id, int) else None
    semester = semester if isinstance(semester, int) else None
    term = term if isinstance(term, str) else None
    category = category if isinstance(category, str) else None
    search = search if isinstance(search, str) else None

    query = db.query(Subject).join(Course).join(YearLevel)
    if department:
        query = query.filter(Course.category == department)
    if course_id:
        query = query.filter(Subject.course_id == course_id)
    if year_level_id:
        query = query.filter(Subject.year_level_id == year_level_id)
    if semester:
        query = query.filter(Subject.semester == semester)
    if term and term != "All":
        query = query.filter(or_(Subject.term == term, Subject.term == "All", Subject.term.is_(None)))
    if category:
        if category.lower() in ["minor", "general"]:
            query = query.filter(Subject.category != "major")
        else:
            query = query.filter(Subject.category == category.lower())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(Subject.name.ilike(s), Subject.code.ilike(s)))
    
    subjects = query.order_by(Course.name, YearLevel.name, Subject.name).all()
    return [
        {
            "id": s.id,
            "code": s.code,
            "name": s.name,
            "course_id": s.course_id,
            "course_name": s.course.name if s.course else "-",
            "course_category": s.course.category if s.course else "-",
            "year_level_id": s.year_level_id,
            "year_level_name": s.year_level.name if s.year_level else "-",
            "semester": s.semester or 1,
            "term": s.term or "All",
            "category": s.category or "major",
            "exam_type": s.exam_type or "written",
            "duration_minutes": s.duration_minutes or 75
        }
        for s in subjects
    ]

@router.post("/subjects")
def create_subject(
    payload: SubjectCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "program_head"]))
):
    """
    Create a new subject with category (major/minor), semester, term, and duration.
    """
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Subject name is required")
    if not payload.course_id:
        raise HTTPException(status_code=400, detail="Course is required")
    
    course = db.query(Course).filter(Course.id == payload.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Selected course not found")

    # If code not provided, auto-generate one
    code = payload.code.strip() if payload.code else ""
    if not code:
        prefix = "".join(w[0] for w in payload.name.split()[:3]).upper()
        code = f"{prefix}{payload.semester or 1}01"

    # Category normalization: 'minor' is stored as 'general' or 'minor'
    cat = payload.category.lower().strip() if payload.category else "major"
    if cat == "minor":
        cat = "general"

    # Duration default: 120 for BSA majors, 75 for others
    duration = payload.duration_minutes
    if not duration or duration <= 0:
        if course.name == "BSA" and cat == "major":
            duration = 120
        else:
            duration = 75

    new_sub = Subject(
        code=code,
        name=payload.name.strip(),
        course_id=payload.course_id,
        year_level_id=payload.year_level_id,
        semester=payload.semester or 1,
        term=payload.term.strip() if payload.term else "All",
        category=cat,
        exam_type=payload.exam_type or "written",
        duration_minutes=duration
    )
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)

    # Invalidate cache
    cache.delete_pattern("catalog:details:*")
    cache.delete("catalog:stats")
    if current_user:
        log_activity(db, current_user.id, "SUBJECT_CREATE", f"Created subject {new_sub.code} - {new_sub.name} ({new_sub.category}, Sem {new_sub.semester}, Term {new_sub.term})")

    return {
        "message": f"Subject '{new_sub.name}' created successfully.",
        "subject": {
            "id": new_sub.id,
            "code": new_sub.code,
            "name": new_sub.name,
            "course_id": new_sub.course_id,
            "course_name": course.name,
            "year_level_id": new_sub.year_level_id,
            "semester": new_sub.semester,
            "term": new_sub.term,
            "category": new_sub.category,
            "exam_type": new_sub.exam_type,
            "duration_minutes": new_sub.duration_minutes
        }
    }

@router.put("/subjects/{subject_id}")
def update_subject(
    subject_id: int,
    payload: SubjectUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "program_head"]))
):
    """
    Update any subject attributes (code, name, course, year level, semester, term, category, duration).
    """
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    if payload.name is not None and payload.name.strip():
        subject.name = payload.name.strip()
    if payload.code is not None:
        subject.code = payload.code.strip()
    if payload.course_id is not None:
        subject.course_id = payload.course_id
    if payload.year_level_id is not None:
        subject.year_level_id = payload.year_level_id
    if payload.semester is not None:
        subject.semester = payload.semester
    if payload.term is not None:
        subject.term = payload.term.strip() or "All"
    if payload.category is not None:
        cat = payload.category.lower().strip()
        if cat == "minor":
            cat = "general"
        subject.category = cat
    if payload.exam_type is not None:
        subject.exam_type = payload.exam_type.strip()
    if payload.duration_minutes is not None and payload.duration_minutes > 0:
        subject.duration_minutes = payload.duration_minutes

    db.commit()
    db.refresh(subject)

    cache.delete_pattern("catalog:details:*")
    if payload.duration_minutes is not None:
        _invalidate_student_exam_schedules()
    if current_user:
        log_activity(db, current_user.id, "SUBJECT_UPDATE", f"Updated subject {subject.code} - {subject.name}")

    return {
        "message": f"Subject '{subject.name}' updated successfully.",
        "subject": {
            "id": subject.id,
            "code": subject.code,
            "name": subject.name,
            "course_id": subject.course_id,
            "year_level_id": subject.year_level_id,
            "semester": subject.semester,
            "term": subject.term,
            "category": subject.category,
            "exam_type": subject.exam_type,
            "duration_minutes": subject.duration_minutes
        }
    }

@router.delete("/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "program_head"]))
):
    """
    Delete a subject. Blocks if posted exams reference it.
    """
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Check if posted exams exist for this subject
    posted_count = db.query(Exam).filter(Exam.subject_id == subject_id, Exam.status == "posted").count()
    if posted_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete subject '{subject.name}' because {posted_count} posted exam(s) reference it.")

    # Remove draft exams and irregular selections if any
    db.query(Exam).filter(Exam.subject_id == subject_id, Exam.status == "draft").delete(synchronize_session=False)
    db.query(IrregularSelection).filter(IrregularSelection.subject_id == subject_id).delete(synchronize_session=False)
    db.query(TeacherTeaching).filter(TeacherTeaching.subject_id == subject_id).delete(synchronize_session=False)

    sub_name = subject.name
    db.delete(subject)
    db.commit()

    cache.delete_pattern("catalog:details:*")
    cache.delete("catalog:stats")
    if current_user:
        log_activity(db, current_user.id, "SUBJECT_DELETE", f"Deleted subject {sub_name}")

    return {"message": f"Subject '{sub_name}' has been deleted."}

@router.put("/subjects/{subject_id}/duration")
def update_subject_duration(
    subject_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    duration = payload.get("duration_minutes")
    if not duration or int(duration) <= 0:
        raise HTTPException(status_code=400, detail="Valid duration_minutes is required")
    subject.duration_minutes = int(duration)
    db.commit()
    _invalidate_student_exam_schedules()
    log_activity(db, current_user.id, "SUBJECT_DURATION_UPDATE", f"Subject {subject.name}: {duration}m")
    return {"message": f"Updated duration for {subject.name} to {duration} minutes", "duration_minutes": subject.duration_minutes}

@router.put("/subjects/bulk-duration")
def bulk_update_subject_durations(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    preset = payload.get("preset")
    if preset == "school_defaults":
        # All 75, BSA majors 120
        db.query(Subject).update({Subject.duration_minutes: 75}, synchronize_session=False)
        bsa_courses = db.query(Course.id).filter(Course.name == "BSA").all()
        bsa_ids = [c[0] for c in bsa_courses]
        if bsa_ids:
            db.query(Subject).filter(
                Subject.course_id.in_(bsa_ids),
                or_(Subject.category == "major", Subject.name.ilike("%accounting%"), Subject.name.ilike("%taxation%"), Subject.name.ilike("%auditing%"))
            ).update({Subject.duration_minutes: 120}, synchronize_session=False)
        db.commit()
        _invalidate_student_exam_schedules()
        log_activity(db, current_user.id, "SUBJECT_DURATION_BULK", "Applied school defaults (75m, BSA majors 120m)")
        return {"message": "School default durations applied: 1h 15m (75m) for all subjects, 2h (120m) for BSA major subjects."}
    
    elif preset == "bsa_majors_2h":
        bsa_courses = db.query(Course.id).filter(Course.name == "BSA").all()
        bsa_ids = [c[0] for c in bsa_courses]
        updated_count = 0
        if bsa_ids:
            updated_count = db.query(Subject).filter(
                Subject.course_id.in_(bsa_ids),
                or_(Subject.category == "major", Subject.name.ilike("%accounting%"), Subject.name.ilike("%taxation%"), Subject.name.ilike("%auditing%"))
            ).update({Subject.duration_minutes: 120}, synchronize_session=False)
        db.commit()
        _invalidate_student_exam_schedules()
        log_activity(db, current_user.id, "SUBJECT_DURATION_BULK", f"Applied 2h (120m) to {updated_count} BSA major subjects")
        return {"message": f"Updated {updated_count} BSA major subjects from 1st year to 4th year to 2 hours (120 mins)."}

    duration = payload.get("duration_minutes")
    if not duration or int(duration) <= 0:
        raise HTTPException(status_code=400, detail="Valid duration_minutes is required")
    duration = int(duration)
    
    subject_ids = payload.get("subject_ids")
    if subject_ids:
        updated = db.query(Subject).filter(Subject.id.in_(subject_ids)).update({Subject.duration_minutes: duration}, synchronize_session=False)
        db.commit()
        _invalidate_student_exam_schedules()
        log_activity(db, current_user.id, "SUBJECT_DURATION_BULK", f"Updated {updated} subjects to {duration}m")
        return {"message": f"Updated {updated} subjects to {duration} minutes."}

    query = db.query(Subject).join(Course)
    course_id = payload.get("course_id")
    category = payload.get("category")
    year_level_id = payload.get("year_level_id")
    department = payload.get("department")

    if department:
        query = query.filter(Course.category == department)
    if course_id:
        query = query.filter(Subject.course_id == course_id)
    if category:
        query = query.filter(Subject.category == category)
    if year_level_id:
        query = query.filter(Subject.year_level_id == year_level_id)

    matching_subjects = query.all()
    for s in matching_subjects:
        s.duration_minutes = duration
    db.commit()
    _invalidate_student_exam_schedules()
    log_activity(db, current_user.id, "SUBJECT_DURATION_BULK", f"Updated {len(matching_subjects)} filtered subjects to {duration}m")
    return {"message": f"Updated {len(matching_subjects)} matching subjects to {duration} minutes."}

@router.get("/download-template")
def download_template(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """
    Generate and stream the current curriculum data as an Excel file.
    Falls back to sample template data if database is empty.
    """
    columns = ["Course", "Category", "Year Level", "Section", "Subject Code", "Subject Name", "Teacher Name", "Subject Category", "Exam Type"]
    
    rows = []
    # Fetch all subjects and their related items
    subjects = db.query(Subject).all()
    for sub in subjects:
        # Find teaching assignments for this subject
        teachings = db.query(TeacherTeaching).filter(TeacherTeaching.subject_id == sub.id).all()
        if teachings:
            for t in teachings:
                rows.append({
                    "Course": sub.course.name if sub.course else "",
                    "Category": sub.course.category if sub.course else "",
                    "Year Level": sub.year_level.name if sub.year_level else "",
                    "Section": t.section.name if t.section else "",
                    "Subject Code": sub.code,
                    "Subject Name": sub.name,
                    "Teacher Name": t.teacher.name if t.teacher else (sub.teacher.name if sub.teacher else ""),
                    "Subject Category": sub.category,
                    "Exam Type": sub.exam_type
                })
        else:
            rows.append({
                "Course": sub.course.name if sub.course else "",
                "Category": sub.course.category if sub.course else "",
                "Year Level": sub.year_level.name if sub.year_level else "",
                "Section": "",
                "Subject Code": sub.code,
                "Subject Name": sub.name,
                "Teacher Name": sub.teacher.name if sub.teacher else "",
                "Subject Category": sub.category,
                "Exam Type": sub.exam_type
            })

    if len(rows) == 0:
        rows = [
            {
                "Course": "BSIT",
                "Category": "College",
                "Year Level": "1st Year",
                "Section": "BSIT 1-101",
                "Subject Code": "IT101",
                "Subject Name": "Introduction to Computing",
                "Teacher Name": "Richard Santos",
                "Subject Category": "major",
                "Exam Type": "written"
            },
            {
                "Course": "BSCS",
                "Category": "College",
                "Year Level": "3rd Year",
                "Section": "BSCS 3-201",
                "Subject Code": "CS301",
                "Subject Name": "Software Engineering 1",
                "Teacher Name": "Maria Santos",
                "Subject Category": "major",
                "Exam Type": "written"
            },
            {
                "Course": "STEM",
                "Category": "SHS",
                "Year Level": "Grade 11",
                "Section": "STEM-11A",
                "Subject Code": "STEM11-GENMATH",
                "Subject Name": "General Mathematics",
                "Teacher Name": "Kertney Balasuela",
                "Subject Category": "general",
                "Exam Type": "written"
            }
        ]

    df = pd.DataFrame(rows, columns=columns)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Curriculum Data')
        worksheet = writer.sheets['Curriculum Data']
        from openpyxl.utils import get_column_letter
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            worksheet.column_dimensions[col_letter].width = max(max_len + 4, 12)
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="school_curriculum.xlsx"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    }
    return StreamingResponse(
        output, 
        headers=headers, 
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@router.post("/upload")
def upload_catalog_excel(
    file: UploadFile = File(...),
    clear_existing: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Upload and parse an Excel spreadsheet containing courses, year levels, sections, subjects, and teachers.
    """
    try:
        contents = file.file.read()
        xl = pd.ExcelFile(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

    if clear_existing:
        try:
            safe_clear_catalog_data(db, exclude_program_head=True)
            db.commit()
            log_activity(db, current_user.id, "CURRICULUM_CLEAR_DATA", "Cleared curriculum catalog tables for re-upload.")
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to clear existing data: {str(e)}")

    stats = {
        "courses_created": 0,
        "year_levels_created": 0,
        "sections_created": 0,
        "subjects_created": 0,
        "teachers_created": 0,
        "proctors_created": 0,
        "users_created": 0,
        "teaching_assignments": 0
    }

    def hash_pwd(plain: str) -> str:
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    # Pre-fetch existing records to avoid duplicates
    existing_courses = {c.name.upper(): c for c in db.query(Course).all()}
    existing_years = {y.name.upper(): y for y in db.query(YearLevel).all()}
    existing_teachers = {t.name.upper(): t for t in db.query(Teacher).all()}
    
    existing_sections = {}
    for s in db.query(Section).all():
        existing_sections[(s.name.upper(), s.course_id)] = s
    
    existing_subjects = {}
    for sub in db.query(Subject).all():
        existing_subjects[(sub.code.upper(), sub.course_id)] = sub

    # For auto-generating code counters if codes are missing
    subj_code_counters = {}

    for sheet_name in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name=sheet_name)
        if df.empty:
            continue
            
        # Determine semester from sheet name as a fallback
        sheet_semester = None
        sheet_name_lower = sheet_name.lower()
        if '1st' in sheet_name_lower or 'sem 1' in sheet_name_lower or 'sem-1' in sheet_name_lower or 'first' in sheet_name_lower or 'sem1' in sheet_name_lower:
            sheet_semester = 1
        elif '2nd' in sheet_name_lower or 'sem 2' in sheet_name_lower or 'sem-2' in sheet_name_lower or 'second' in sheet_name_lower or 'sem2' in sheet_name_lower:
            sheet_semester = 2
        elif '3rd' in sheet_name_lower or 'sem 3' in sheet_name_lower or 'sem-3' in sheet_name_lower or 'third' in sheet_name_lower or 'summer' in sheet_name_lower or 'sem3' in sheet_name_lower:
            sheet_semester = 3
            
        # Normalize column headers
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        # Map columns dynamically based on fuzzy match
        # NOTE: More specific checks must come BEFORE general ones (e.g. 'subject category' before 'category')
        col_mapping = {}
        for col in df.columns:
            if 'course' in col or 'program' in col or 'strand' in col:
                col_mapping['course'] = col
            elif 'subject category' in col or 'subj_cat' in col or 'subj category' in col:
                # Must check before plain 'category' since 'category' is a substring of 'subject category'
                col_mapping['subj_category'] = col
            elif 'category' in col or 'dept' in col or 'department' in col:
                col_mapping['category'] = col
            elif 'year' in col or 'level' in col:
                col_mapping['year'] = col
            elif 'section' in col:
                col_mapping['section'] = col
            elif 'subject name' in col or 'title' in col:
                # Must check before plain 'subject' since 'subject' is a substring of 'subject name'
                col_mapping['subject_name'] = col
            elif 'subject code' in col or 'code' in col or 'subjcode' in col:
                col_mapping['code'] = col
            elif 'subject' in col:
                col_mapping['subject_name'] = col
            elif 'semester' in col or 'sem' in col:
                col_mapping['semester'] = col
            elif 'teacher' in col or 'prof' in col or 'instructor' in col:
                col_mapping['teacher'] = col
            elif 'exam' in col:
                col_mapping['exam_type'] = col

        # If a sheet doesn't contain at least a course and subject name column, skip it
        if 'subject_name' not in col_mapping and 'course' not in col_mapping:
            continue

        for idx, row in df.iterrows():
            course_val = str(row.get(col_mapping.get('course'), '')).strip() if 'course' in col_mapping else ''
            category_val = str(row.get(col_mapping.get('category'), '')).strip() if 'category' in col_mapping else ''
            year_val = str(row.get(col_mapping.get('year'), '')).strip() if 'year' in col_mapping else ''
            section_val = str(row.get(col_mapping.get('section'), '')).strip() if 'section' in col_mapping else ''
            code_val = str(row.get(col_mapping.get('code'), '')).strip() if 'code' in col_mapping else ''
            sub_name_val = str(row.get(col_mapping.get('subject_name'), '')).strip() if 'subject_name' in col_mapping else ''
            sem_val = row.get(col_mapping.get('semester')) if 'semester' in col_mapping else None
            teacher_val = str(row.get(col_mapping.get('teacher'), '')).strip() if 'teacher' in col_mapping else ''
            subj_cat_val = str(row.get(col_mapping.get('subj_category'), '')).strip() if 'subj_category' in col_mapping else ''
            exam_type_val = str(row.get(col_mapping.get('exam_type'), '')).strip() if 'exam_type' in col_mapping else ''

            # Skip empty rows
            if not course_val or not sub_name_val or str(course_val).lower() == 'nan' or str(sub_name_val).lower() == 'nan':
                continue

            # 1. Course
            course_key = course_val.upper()
            if course_key not in existing_courses:
                # Validate category_val is a proper department type (College/SHS)
                # It could be wrong (e.g. 'major'/'general' from subject category column mismatch)
                VALID_DEPT_CATS = {"college", "shs", "senior high", "senior high school"}
                if not category_val or str(category_val).lower() == 'nan' or category_val.lower() not in VALID_DEPT_CATS:
                    if course_key in ["STEM", "ABM", "HUMSS", "HUMMS", "GAS", "DIGITAL ARTS", "CULINARY", "TOURISM", "IT-MAWDEV", "ICT"]:
                        category_val = "SHS"
                    elif course_key.startswith("BS") or course_key.startswith("BA") or course_key.startswith("BM"):
                        category_val = "College"
                    else:
                        category_val = "College"
                elif category_val.lower() in ("senior high", "senior high school"):
                    category_val = "SHS"
                
                course_obj = Course(name=course_val, category=category_val)
                db.add(course_obj)
                db.flush()
                existing_courses[course_key] = course_obj
                stats["courses_created"] += 1
            
            course = existing_courses[course_key]

            # 2. Year Level
            if not year_val or str(year_val).lower() == 'nan':
                # Infer based on section / category
                if 'Grade 11' in section_val or course.category == 'SHS' and '11' in section_val:
                    year_val = 'Grade 11'
                elif 'Grade 12' in section_val or course.category == 'SHS' and '12' in section_val:
                    year_val = 'Grade 12'
                elif '1-' in section_val:
                    year_val = '1st Year'
                elif '2-' in section_val:
                    year_val = '2nd Year'
                elif '3-' in section_val:
                    year_val = '3rd Year'
                elif '4-' in section_val:
                    year_val = '4th Year'
                else:
                    year_val = '1st Year' if course.category == 'College' else 'Grade 11'

            year_key = year_val.upper()
            if year_key not in existing_years:
                year_obj = YearLevel(name=year_val)
                db.add(year_obj)
                db.flush()
                existing_years[year_key] = year_obj
                stats["year_levels_created"] += 1
            
            year_level = existing_years[year_key]

            # 3. Semester
            try:
                if pd.isna(sem_val) or sem_val == '' or str(sem_val).strip().lower() == 'nan' or sem_val is None:
                    semester = sheet_semester if sheet_semester is not None else (None if course.category == 'SHS' else 1)
                else:
                    semester = int(float(sem_val))
            except:
                semester = sheet_semester if sheet_semester is not None else (None if course.category == 'SHS' else 1)

            # 4. Teacher & Proctor & User
            teacher = None
            if teacher_val and teacher_val.lower() != 'nan' and teacher_val.strip() != '':
                teacher_key = teacher_val.upper()
                if teacher_key not in existing_teachers:
                    teacher_obj = Teacher(name=teacher_val)
                    db.add(teacher_obj)
                    db.flush()
                    existing_teachers[teacher_key] = teacher_obj
                    stats["teachers_created"] += 1

                    # Proctor record
                    proctor_obj = Proctor(name=teacher_val, teacher_id=teacher_obj.id)
                    db.add(proctor_obj)
                    db.flush()
                    stats["proctors_created"] += 1

                    # User login credentials
                    email = f"{teacher_val.lower().replace(' ', '.')}@school.edu"
                    user_exists = db.query(User).filter(User.email == email).first()
                    if not user_exists:
                        user_obj = User(
                            name=teacher_val,
                            email=email,
                            hashed_password=hash_pwd("proctor123"),
                            role="proctor",
                            teacher_id=teacher_obj.id,
                            proctor_id=proctor_obj.id
                        )
                        db.add(user_obj)
                        db.flush()
                        stats["users_created"] += 1
                
                teacher = existing_teachers[teacher_key]

            # 5. Section
            if not section_val or str(section_val).lower() == 'nan':
                if course.category == 'College':
                    section_val = f"{course.name} {year_level.id}-{semester or 1}01"
                else:
                    section_val = f"{course.name}-{year_level.id}A"
            
            sec_key = (section_val.upper(), course.id)
            if sec_key not in existing_sections:
                section_obj = Section(
                    name=section_val,
                    course_id=course.id,
                    year_level_id=year_level.id,
                    semester=semester
                )
                db.add(section_obj)
                db.flush()
                existing_sections[sec_key] = section_obj
                stats["sections_created"] += 1
            
            section = existing_sections[sec_key]

            # 6. Subject
            if not code_val or str(code_val).lower() == 'nan':
                subj_code_counters[course.id] = subj_code_counters.get(course.id, 0) + 1
                code_val = f"{course.name[:2].upper()}{year_level.id}{semester or 1}{subj_code_counters[course.id]:02d}"

            if not exam_type_val or str(exam_type_val).lower() == 'nan':
                exam_type_val, inferred_cat = classify_subject(sub_name_val)
                if not subj_cat_val or str(subj_cat_val).lower() == 'nan':
                    subj_cat_val = inferred_cat
            elif not subj_cat_val or str(subj_cat_val).lower() == 'nan':
                _, inferred_cat = classify_subject(sub_name_val)
                subj_cat_val = inferred_cat

            sub_key = (code_val.upper(), course.id)
            if sub_key not in existing_subjects:
                subject_obj = Subject(
                    code=code_val,
                    name=sub_name_val,
                    course_id=course.id,
                    year_level_id=year_level.id,
                    semester=semester,
                    teacher_id=teacher.id if teacher else None,
                    exam_type=exam_type_val,
                    category=subj_cat_val,
                    duration_minutes=120 if (course.name == "BSA" and subj_cat_val == "major") else 75
                )
                db.add(subject_obj)
                db.flush()
                existing_subjects[sub_key] = subject_obj
                stats["subjects_created"] += 1
            else:
                subject_obj = existing_subjects[sub_key]
                subject_obj.name = sub_name_val
                subject_obj.year_level_id = year_level.id
                subject_obj.semester = semester
                if teacher:
                    subject_obj.teacher_id = teacher.id
                subject_obj.exam_type = exam_type_val
                subject_obj.category = subj_cat_val
                db.flush()
            
            subject = existing_subjects[sub_key]

            # 7. TeacherTeaching Mapping
            if teacher:
                teach_exists = db.query(TeacherTeaching).filter(
                    TeacherTeaching.teacher_id == teacher.id,
                    TeacherTeaching.subject_id == subject.id,
                    TeacherTeaching.section_id == section.id
                ).first()
                if not teach_exists:
                    teaching = TeacherTeaching(
                        teacher_id=teacher.id,
                        subject_id=subject.id,
                        section_id=section.id
                    )
                    db.add(teaching)
                    db.flush()
                    stats["teaching_assignments"] += 1

    try:
        # Re-link existing students whose section_name matches newly imported sections
        sections_with_course = db.query(Section.name, Section.course_id).filter(Section.course_id.isnot(None)).all()
        for s_name, c_id in sections_with_course:
            db.query(User).filter(User.role == "student", User.section_name == s_name).update(
                {User.course_id: c_id}, synchronize_session=False
            )
        db.commit()
        log_activity(db, current_user.id, "CURRICULUM_UPLOAD", f"Uploaded curriculum Excel. Imported details: {str(stats)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error: {str(e)}")

    # ── invalidate catalog caches ─────────────────────────────────────
    cache.invalidate_catalog()
    return {"message": "Catalog data successfully imported!", "details": stats}

@router.post("/upload-students")
def upload_students_excel(
    file: UploadFile = File(...),
    clear_existing: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Upload and parse an Excel spreadsheet containing students (COURSE, SECTION, NAME, SCHOOL EMAIL).
    """
    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

    # Clean columns
    df.columns = [str(col).strip().upper() for col in df.columns]
    
    required_columns = ["COURSE", "SECTION", "NAME", "SCHOOL EMAIL"]
    for col in required_columns:
        if col not in df.columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required column: '{col}'. Columns found: {list(df.columns)}"
            )

    if clear_existing:
        try:
            safe_clear_student_accounts(db)
            db.commit()
            if current_user:
                log_activity(db, current_user.id, "STUDENTS_CLEAR_DATA", "Cleared existing student accounts.")
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to clear existing students: {str(e)}")

    stats = {
        "created": 0,
        "updated": 0,
        "skipped": 0
    }

    # Hash default password once to avoid performance issues
    default_pw_hash = bcrypt.hashpw("student123".encode(), bcrypt.gensalt()).decode()

    courses_cache = {c.name.upper(): c.id for c in db.query(Course).all()}
    sections_cache = {s.name.upper(): s for s in db.query(Section).all()}
    existing_users_cache = {u.email: u for u in db.query(User).filter(User.role == "student").all()}

    # Identify student ID column and subject columns
    id_col = next((c for c in df.columns if c in ["STUDENT ID", "ID NUMBER", "STUDENT NUMBER", "STUDENT_ID", "ID"]), None)
    subject_cols = [c for c in df.columns if c.startswith("SUBJECT") or c.startswith("SUBJ")]

    # Pre-cache subjects and sections for irregular subject mapping
    all_db_subjects = db.query(Subject).all()
    subjects_by_course_and_name = {(s.course_id, s.name.lower()): s for s in all_db_subjects}
    subjects_by_course_and_code = {(s.course_id, s.code.lower()): s for s in all_db_subjects if s.code}
    subjects_list_by_name = {}
    subjects_list_by_code = {}
    for s in all_db_subjects:
        subjects_list_by_name.setdefault(s.name.lower(), []).append(s)
        if s.code:
            subjects_list_by_code.setdefault(s.code.lower(), []).append(s)

    sections_by_course = {}
    for s in db.query(Section).all():
        sections_by_course.setdefault(s.course_id, []).append(s)
    all_sections = list(sections_cache.values())
    # Map course_id -> department category ("SHS" or "College") for cross-dept guard
    course_category_map = {c.id: c.category for c in db.query(Course).all()}
    
    from model import IrregularSelection
    import re

    # We will process in batches to be fast
    for index, row in df.iterrows():
        email = str(row["SCHOOL EMAIL"]).strip()
        name = str(row["NAME"]).strip()
        course_name = str(row["COURSE"]).strip()
        section_name = str(row["SECTION"]).strip()

        if not email or email.lower() == "nan":
            stats["skipped"] += 1
            continue

        email = email.lower()

        # Format/extract student_id to 02000XXXXXX
        raw_id = ""
        if id_col and pd.notna(row[id_col]):
            raw_id = str(row[id_col]).strip().split(".")[0]
            if len(raw_id) == 10 and raw_id.startswith("2000"):
                raw_id = f"0{raw_id}"
        if not raw_id or not raw_id.startswith("02000") or len(raw_id) != 11:
            digits = re.findall(r'\d+', email)
            if digits:
                tail = "".join(digits)[-6:].zfill(6)
            else:
                tail = f"{random.randint(100000, 999999)}"
            raw_id = f"02000{tail}"

        # Find course ID
        course_id = courses_cache.get(course_name.upper())
        if not course_id and course_name and course_name.lower() != "nan":
            # Create course if not found
            course_key = course_name.upper()
            if course_key in ["STEM", "ABM", "HUMSS", "HUMMS", "GAS", "DIGITAL ARTS", "CULINARY", "TOURISM", "IT-MAWDEV", "ICT"]:
                cat_val = "SHS"
            else:
                cat_val = "College"
            new_course = Course(name=course_name, category=cat_val)
            db.add(new_course)
            db.flush()
            courses_cache[course_name.upper()] = new_course.id
            course_id = new_course.id

        # Determine section and student type
        student_type_col = "STATUS" if "STATUS" in df.columns else ("STUDENT STATUS" if "STUDENT STATUS" in df.columns else None)
        status_val = None
        if student_type_col:
            status_val = str(row[student_type_col]).strip().lower()

        student_type = "regular"
        if status_val == "irregular":
            student_type = "irregular"
        elif status_val == "regular":
            student_type = "regular"
        else:
            # Fallback based on section name
            if not section_name or section_name.lower() in ["nan", "irregular", "none", "n/a"]:
                student_type = "irregular"

        sec_name = None
        if section_name and section_name.lower() not in ["nan", "none", "n/a", "irregular", ""]:
            sec_obj = sections_cache.get(section_name.upper())
            if not sec_obj:
                # Create section if not found
                new_sec = Section(name=section_name, course_id=course_id)
                db.add(new_sec)
                db.flush()
                sections_cache[section_name.upper()] = new_sec
                sec_name = section_name
            else:
                sec_name = sec_obj.name
                # Ensure course ID matches the section's course
                if not course_id:
                    course_id = sec_obj.course_id

        # Check if student exists (using pre-cached dict, not per-row DB query)
        existing_student = existing_users_cache.get(email)
        target_student = existing_student
        if existing_student:
            existing_student.name = name
            existing_student.student_id = raw_id
            existing_student.role = "student"
            existing_student.section_name = sec_name
            existing_student.student_type = student_type
            existing_student.course_id = course_id
            stats["updated"] += 1
        else:
            new_student = User(
                name=name,
                email=email,
                student_id=raw_id,
                hashed_password=default_pw_hash,
                role="student",
                section_name=sec_name,
                student_type=student_type,
                course_id=course_id
            )
            db.add(new_student)
            db.flush()
            target_student = new_student
            existing_users_cache[email] = new_student  # avoid duplicate inserts
            stats["created"] += 1

        # Auto-enroll irregular student subjects from Excel subject and section columns
        if student_type == "irregular" and subject_cols and target_student:
            db.query(IrregularSelection).filter(IrregularSelection.user_id == target_student.id).delete(synchronize_session=False)
            for sc in subject_cols:
                val = str(row[sc]).strip() if pd.notna(row[sc]) else ""
                if not val or val.lower() in ["nan", "none", "n/a", ""]:
                    continue

                # Check if there is a paired section column (e.g., SECTION 1 for SUBJECT 1)
                num_suffix = "".join(filter(str.isdigit, sc))
                sec_col_candidates = [
                    f"SECTION {num_suffix}", f"SECTION_{num_suffix}", f"SECTION{num_suffix}",
                    f"SEC {num_suffix}", f"SEC_{num_suffix}", f"SEC{num_suffix}"
                ] if num_suffix else []

                target_sec_name = None
                for candidate in sec_col_candidates:
                    matching_c = next((c for c in df.columns if c.strip().upper() == candidate.upper()), None)
                    if matching_c and pd.notna(row[matching_c]):
                        val_sec = str(row[matching_c]).strip()
                        if val_sec and val_sec.lower() not in ["nan", "none", "n/a", ""]:
                            target_sec_name = val_sec
                            break

                clean_sub_val = val
                if not target_sec_name and "(" in val and ")" in val:
                    m = re.search(r"\((.*?)\)", val)
                    if m:
                        potential_sec = m.group(1).strip()
                        if potential_sec.upper() in sections_cache:
                            target_sec_name = potential_sec
                            clean_sub_val = val[:val.index("(")].strip()

                # Determine the student's own department type (SHS or College)
                student_dept = course_category_map.get(course_id, "College")

                # ── Subject Matching & Department/Major Guard ────────────────────
                # 1. First priority: subject belonging to the student's own course
                matched_sub = (
                    subjects_by_course_and_name.get((course_id, clean_sub_val.lower())) or
                    subjects_by_course_and_code.get((course_id, clean_sub_val.lower())) or
                    subjects_by_course_and_name.get((course_id, val.lower())) or
                    subjects_by_course_and_code.get((course_id, val.lower()))
                )

                # 2. If not found in own course, search same-department subjects
                #    RULE:
                #    - Cross-department (SHS <-> College) is STRICTLY PROHIBITED.
                #    - Major subjects MUST be aligned to student's own course (cannot take major of another course).
                #    - Minor/General subjects can be taken cross-course within the same department.
                if not matched_sub:
                    candidates = (
                        subjects_list_by_name.get(clean_sub_val.lower(), []) +
                        subjects_list_by_code.get(clean_sub_val.lower(), []) +
                        subjects_list_by_name.get(val.lower(), []) +
                        subjects_list_by_code.get(val.lower(), [])
                    )
                    for cand in candidates:
                        cand_dept = course_category_map.get(cand.course_id, "College")
                        if cand_dept != student_dept:
                            continue  # Cross-department strictly blocked
                        if cand.category == "major" and cand.course_id != course_id:
                            continue  # Major subject of another course blocked
                        # Minor/general subject in same department accepted!
                        matched_sub = cand
                        break
                # ────────────────────────────────────────────────────────────────

                if matched_sub:
                    chosen_sec = None
                    if target_sec_name and target_sec_name.upper() in sections_cache:
                        cand_sec = sections_cache[target_sec_name.upper()]
                        # Only accept the pinned section if it belongs to same dept
                        sec_dept = course_category_map.get(cand_sec.course_id, "College")
                        if sec_dept == student_dept:
                            chosen_sec = cand_sec

                    if not chosen_sec:
                        # Pick the best section for this subject (no exclusion of already-used sections —
                        # an irregular student can legitimately have multiple subjects in the same section)
                        offering_secs = sections_by_course.get(matched_sub.course_id, [])
                        if not offering_secs:
                            offering_secs = [
                                s for s in all_sections
                                if course_category_map.get(s.course_id, "College") == student_dept
                            ]
                        chosen_sec = offering_secs[0] if offering_secs else None

                    new_sel = IrregularSelection(
                        user_id=target_student.id,
                        subject_id=matched_sub.id,
                        section_id=chosen_sec.id if chosen_sec else None
                    )
                    db.add(new_sel)
            cache.delete(f"exam_schedule:irregular:{target_student.id}")

    try:
        db.commit()
        if current_user:
            log_activity(db, current_user.id, "STUDENTS_IMPORT", f"Imported: {stats['created']} created, {stats['updated']} updated.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction error: {str(e)}")

    # ── invalidate student-related caches ─────────────────────────────
    cache.delete(_KEY_STUDENT_STATS)
    cache.delete_pattern("exam_schedule:section:*")
    return {"message": "Student list successfully imported!", "details": stats}

@router.get("/sections")
def get_catalog_sections(
    course_id: Optional[int] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of sections optionally filtered by course_id or department.
    """
    query = db.query(Section)
    if course_id:
        query = query.filter(Section.course_id == course_id)
    elif department and department != "All":
        query = query.join(Course, Section.course_id == Course.id).filter(Course.category == department)
    sections = query.order_by(Section.name).all()
    return [{"id": s.id, "name": s.name, "course_id": s.course_id} for s in sections]

@router.get("/students")
def get_students_directory(
    department: Optional[str] = Query(None),
    course_id: Optional[int] = Query(None),
    section_name: Optional[str] = Query(None),
    student_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Get list of all students filtered by department, course, section, and status.
    Returns student details and enrolled subjects (especially for irregulars).
    """
    # Normalize parameters in case called directly or via FastAPI
    department = department if isinstance(department, str) else None
    course_id = course_id if isinstance(course_id, int) else None
    section_name = section_name if isinstance(section_name, str) else None
    student_type = student_type if isinstance(student_type, str) else None
    search = search if isinstance(search, str) else None
    page = page if isinstance(page, int) else 1
    page_size = page_size if isinstance(page_size, int) else 50

    query = db.query(User).filter(User.role == "student")

    if department and department != "All":
        query = query.join(Course, User.course_id == Course.id).filter(Course.category == department)
    if course_id:
        query = query.filter(User.course_id == course_id)
    if section_name and section_name != "All":
        if section_name.lower() == "irregular":
            query = query.filter(User.student_type == "irregular")
        else:
            query = query.filter(User.section_name == section_name)
    if student_type and student_type != "All":
        query = query.filter(User.student_type == student_type.lower())
    if search:
        s = f"%{search.strip()}%"
        from sqlalchemy import or_
        query = query.filter(or_(
            User.name.ilike(s),
            User.email.ilike(s),
            User.student_id.ilike(s),
            User.section_name.ilike(s)
        ))

    total = query.count()
    users_page = query.order_by(User.name).offset((page - 1) * page_size).limit(page_size).all()

    # Pre-fetch course names
    courses_map = {c.id: c for c in db.query(Course).all()}
    
    # Pre-fetch irregular selections for users on this page
    user_ids = [u.id for u in users_page]
    irregular_map = {}
    if user_ids:
        from model import IrregularSelection, Subject
        selections = db.query(IrregularSelection).filter(IrregularSelection.user_id.in_(user_ids)).all()
        subj_ids = [sel.subject_id for sel in selections]
        subjects_map = {sub.id: sub for sub in db.query(Subject).filter(Subject.id.in_(subj_ids)).all()} if subj_ids else {}
        sections_map = {sec.id: sec for sec in db.query(Section).all()}
        for sel in selections:
            sub = subjects_map.get(sel.subject_id)
            if sub:
                sec_obj = sections_map.get(sel.section_id)
                irregular_map.setdefault(sel.user_id, []).append({
                    "id": sub.id,
                    "code": sub.code,
                    "name": sub.name,
                    "category": sub.category,
                    "duration_minutes": sub.duration_minutes,
                    "section_id": sel.section_id,
                    "section_name": sec_obj.name if sec_obj else "-"
                })

    items = []
    for u in users_page:
        c_obj = courses_map.get(u.course_id)
        assigned_secs = list(dict.fromkeys([
            s["section_name"] for s in irregular_map.get(u.id, []) 
            if s.get("section_name") and s["section_name"] != "-"
        ]))
        items.append({
            "id": u.id,
            "student_id": u.student_id or f"02000{str(u.id * 123457 % 900000 + 100000)}",
            "name": u.name,
            "email": u.email,
            "course_id": u.course_id,
            "course_name": c_obj.name if c_obj else "-",
            "department": c_obj.category if c_obj else "-",
            "section_name": u.section_name or ("Irregular" if u.student_type == "irregular" else "-"),
            "student_type": u.student_type or "regular",
            "enrolled_subjects": irregular_map.get(u.id, []),
            "assigned_sections": assigned_secs
        })

    import math
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if page_size > 0 else 1,
        "items": items
    }

@router.get("/download-students-dummy")
def download_students_dummy(current_user: User = Depends(require_role(["admin"]))):
    import os
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, "..", "..", "data", "import", "dummy_students.xlsx"),
        os.path.join(base_dir, "..", "dummy_students.xlsx"),
        os.path.join(base_dir, "..", "dummy_students_3000.xlsx"),
        os.path.join(base_dir, "..", "..", "frontend", "public", "dummy_students.xlsx"),
        os.path.join(base_dir, "..", "..", "frontend", "public", "dummy_students_3000.xlsx"),
    ]
    file_path = next((p for p in candidates if os.path.exists(p)), None)
    if not file_path:
        raise HTTPException(status_code=404, detail="Dummy student file not found.")
    
    file_like = open(file_path, mode="rb")
    return StreamingResponse(
        file_like,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dummy_students.xlsx"}
    )

class ClearDatabaseRequest(BaseModel):
    confirm_text: str

@router.post("/clear")
def clear_catalog_data(
    payload: ClearDatabaseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Delete all curriculum data (courses, sections, subjects, teachers, proctors, proctor accounts, and exam schedules).
    Student accounts are preserved. Requires typing 'confirm' in the payload.
    """
    if payload.confirm_text != "confirm":
        raise HTTPException(status_code=400, detail="Invalid confirmation text. You must type 'confirm'.")
        
    try:
        safe_clear_catalog_data(db, exclude_program_head=True)
        db.commit()
        log_activity(db, current_user.id, "CURRICULUM_CLEAR_DATA", "Admin deleted curriculum data (courses, sections, subjects, teachers, proctors). Student accounts preserved.")
        # ── invalidate all catalog + schedule caches ───────────────────
        cache.invalidate_catalog()
        cache.invalidate_proctors()
        cache.delete("distribution_rules:all")
        return {"message": "Curriculum data deleted successfully! Student accounts were not affected."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete curriculum: {str(e)}")

@router.post("/clear-students")
def clear_student_accounts_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Clear all student user accounts and dependent student records.
    Allowed for admin and program_head users.
    """
    try:
        count = safe_clear_student_accounts(db)
        db.commit()
        log_activity(db, current_user.id, "STUDENTS_CLEAR_DATA", f"Program Head / Admin cleared {count} student accounts.")
        # ── invalidate student caches ──────────────────────────────────
        cache.delete(_KEY_STUDENT_STATS)
        cache.delete_pattern("exam_schedule:section:*")
        cache.delete_pattern("exam_schedule:irregular:*")
        return {"message": f"Successfully deleted {count} student account(s)!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear student accounts: {str(e)}")



