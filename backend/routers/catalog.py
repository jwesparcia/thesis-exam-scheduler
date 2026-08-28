# routers/catalog.py
from fastapi import APIRouter, Depends, Query, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from core import get_db
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
    # Students are kept but their curriculum references are cleared since the data is gone.
    db.query(User).filter(User.role == "student").update(
        {User.course_id: None, User.section_name: None},
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
def get_courses(db: Session = Depends(get_db)):
    courses = crud.list_courses(db)
    return [{"id": c.id, "name": c.name, "category": c.category} for c in courses]

@router.get("/year-levels")
def get_year_levels(db: Session = Depends(get_db)):
    year_levels = crud.list_year_levels(db)
    return [{"id": y.id, "name": y.name} for y in year_levels]

@router.get("/details")
def get_details(
    course_id: int = Query(...),
    year_level_id: int = Query(...),
    semester: int = Query(...),
    db: Session = Depends(get_db)
):
    return crud.get_course_year_sem_details(course_id, year_level_id, semester, db)

@router.get("/stats")
def get_catalog_stats(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """
    Get counts of courses, sections, subjects, and teachers in the database.
    """
    return {
        "courses": db.query(Course).count(),
        "sections": db.query(Section).count(),
        "subjects": db.query(Subject).count(),
        "teachers": db.query(Teacher).count()
    }

@router.get("/student-stats")
def get_student_stats(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """
    Get counts of total, regular, and irregular student accounts.
    """
    total_students = db.query(User).filter(User.role == "student").count()
    regular_students = db.query(User).filter(User.role == "student", User.student_type == "regular").count()
    irregular_students = db.query(User).filter(User.role == "student", User.student_type == "irregular").count()
    return {
        "total": total_students,
        "regular": regular_students,
        "irregular": irregular_students
    }

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
                    category=subj_cat_val
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
        db.commit()
        log_activity(db, current_user.id, "CURRICULUM_UPLOAD", f"Uploaded curriculum Excel. Imported details: {str(stats)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error: {str(e)}")

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

    # Pre-cache course mapping and section mapping to minimize DB roundtrips
    courses_cache = {c.name.upper(): c.id for c in db.query(Course).all()}
    sections_cache = {s.name.upper(): s for s in db.query(Section).all()}

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

        # Find course ID
        course_id = courses_cache.get(course_name.upper())
        if not course_id and course_name and course_name.lower() != "nan":
            # Create course if not found
            new_course = Course(name=course_name, category="College")
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
        if student_type == "regular" and section_name and section_name.lower() not in ["nan", "none", "n/a"]:
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
        else:
            # Irregular students might not have a section
            sec_name = None

        # Check if student exists
        existing_student = db.query(User).filter(User.email == email).first()
        if existing_student:
            existing_student.name = name
            existing_student.role = "student"
            existing_student.section_name = sec_name
            existing_student.student_type = student_type
            existing_student.course_id = course_id
            stats["updated"] += 1
        else:
            new_student = User(
                name=name,
                email=email,
                hashed_password=default_pw_hash,
                role="student",
                section_name=sec_name,
                student_type=student_type,
                course_id=course_id
            )
            db.add(new_student)
            stats["created"] += 1

    try:
        db.commit()
        log_activity(db, current_user.id, "STUDENTS_IMPORT", f"Imported: {stats['created']} created, {stats['updated']} updated.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction error: {str(e)}")

    return {"message": "Student list successfully imported!", "details": stats}

@router.get("/download-students-dummy")
def download_students_dummy(current_user: User = Depends(require_role(["admin"]))):
    import os
    file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dummy_students_3000.xlsx")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Dummy student file not found.")
    
    file_like = open(file_path, mode="rb")
    return StreamingResponse(
        file_like,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dummy_students_3000.xlsx"}
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
        return {"message": f"Successfully deleted {count} student account(s)!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear student accounts: {str(e)}")



