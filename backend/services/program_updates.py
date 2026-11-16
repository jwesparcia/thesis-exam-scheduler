"""Apply program-label and administrator updates without changing schedules."""

import re

from sqlalchemy import func, or_

from model import Course, Department, ReschedulingRequest, Section, User
from utils.program_names import PROGRAM_RENAMES, normalize_program_name, normalize_program_section

BM_THM_ADMIN_ACCOUNTS = (
    ("BM Department Administrator", "bm.admin@school.edu", "BM", False),
    ("THM Department Administrator", "thm.admin@school.edu", "THM", False),
)


def rename_programs(db):
    """Rename existing labels in place, retaining all IDs and foreign keys."""
    counts = {"courses": 0, "sections": 0, "student_sections": 0, "request_labels": 0, "departments": 0}
    courses = db.query(Course).all()
    for course in courses:
        if (course.name or "").strip().upper() not in PROGRAM_RENAMES:
            continue
        updated = normalize_program_name(course.name)
        if updated == course.name:
            continue
        if any(other.id != course.id and (other.name or "").upper() == updated.upper() for other in courses):
            raise ValueError(f"Cannot rename {course.name} to {updated}: that program already exists. Resolve the duplicate programs before applying this update.")
        course.name = updated
        counts["courses"] += 1

    for model, column, label, normalize in (
        (Section, Section.name, "sections", normalize_program_section),
        (User, User.section_name, "student_sections", normalize_program_section),
        (ReschedulingRequest, ReschedulingRequest.section_name, "request_labels", normalize_program_section),
        (ReschedulingRequest, ReschedulingRequest.program, "request_labels", normalize_program_name),
    ):
        rows = db.query(model.id, column).filter(or_(column.ilike("BSA%"), column.ilike("BSPSYCH%"))).all()
        for record_id, value in rows:
            updated = normalize(value)
            if updated != value:
                db.query(model).filter(model.id == record_id).update({column: updated}, synchronize_session=False)
                counts[label] += 1

    for department in db.query(Department).filter(Department.code.in_(["BM", "AS"])).all():
        description = department.description or ""
        updated = re.sub(r"\b(BSA|BSPSYCH)\b", lambda match: PROGRAM_RENAMES[match[0].upper()], description, flags=re.IGNORECASE)
        if updated != description:
            department.description = updated
            counts["departments"] += 1
    db.flush()
    return counts


def ensure_separate_bm_thm_admins(db, hash_password):
    """Keep existing credentials and history; create a missing department login."""
    created = []
    for name, email, department, is_super in BM_THM_ADMIN_ACCOUNTS:
        admin = db.query(User).filter(func.lower(User.email) == email).first()
        if admin is None:
            admin = User(email=email, hashed_password=hash_password("admin123"), is_first_login=False)
            db.add(admin)
            created.append(email)
        admin.name = name
        admin.role = "program_head"
        admin.department_code = department
        admin.is_super_admin = is_super
    db.flush()
    return created
