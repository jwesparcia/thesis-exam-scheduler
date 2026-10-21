import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import bcrypt
import pandas as pd
from core.database import SessionLocal
from model import User, Course, Section, Subject, Proctor, Teacher, TeacherSchedule, IrregularSelection

db = SessionLocal()

def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

# 1. Admin user
admin = db.query(User).filter(User.email == "admin@school.edu").first()
if not admin:
    print("Creating admin user...")
    admin = User(
        name="Dr. Maria Santos",
        email="admin@school.edu",
        hashed_password=hash_pw("admin123"),
        role="program_head",
        is_first_login=True
    )
    db.add(admin)
    db.commit()
    print("Admin user created!")
else:
    print("Admin user already exists.")

# 2. Import proctors from dummy_proctors.xlsx
proctor_excel = r"C:\Users\jhune\thesis-exam-scheduler\data\import\dummy_proctors.xlsx"
if os.path.exists(proctor_excel):
    print("Importing proctors from dummy_proctors.xlsx...")
    df_p = pd.read_excel(proctor_excel)
    created_p = 0
    for _, r in df_p.iterrows():
        name = str(r.get("NAME") or r.get("Name") or "").strip()
        email = str(r.get("EMAIL") or r.get("Email") or "").strip()
        dept = str(r.get("DEPARTMENT") or r.get("Department") or "College").strip()
        if not name or not email or name.lower() == "nan":
            continue
        
        # Check Teacher
        teacher = db.query(Teacher).filter(Teacher.name == name).first()
        if not teacher:
            teacher = Teacher(name=name)
            db.add(teacher)
            db.flush()
            
        # Check Proctor
        proc = db.query(Proctor).filter(Proctor.teacher_id == teacher.id).first()
        if not proc:
            proc = Proctor(name=name, teacher_id=teacher.id, department=dept)
            db.add(proc)
            db.flush()
        
        # Check User
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                name=name,
                email=email,
                hashed_password=hash_pw("proctor123"),
                role="proctor",
                teacher_id=teacher.id,
                proctor_id=proc.id
            )
            db.add(user)
            created_p += 1
            
    db.commit()
    print(f"Proctors imported: {created_p} created (total proctors: {db.query(Proctor).count()})")

# 3. Add proctor schedules
try:
    from debug.add_dummy_schedules import add_dummy_schedules
    print("Adding proctor schedules...")
    add_dummy_schedules()
    print("Proctor schedules added. Total schedules:", db.query(TeacherSchedule).count())
except Exception as e:
    print("Error adding proctor schedules:", e)

# 4. Import students from dummy_students.xlsx
student_excel = r"C:\Users\jhune\thesis-exam-scheduler\data\import\dummy_students.xlsx"
if os.path.exists(student_excel):
    print("Importing students from dummy_students.xlsx using catalog import logic...")
    from io import BytesIO
    from fastapi import UploadFile
    
    with open(student_excel, "rb") as f:
        content = f.read()
    
    upload_file = UploadFile(filename="dummy_students.xlsx", file=BytesIO(content))
    from routers.catalog import upload_students_excel
    res = upload_students_excel(
        file=upload_file,
        clear_existing=True,
        db=db,
        current_user=admin
    )
    print("Student import result:", res)

# 5. Check statistics
total_students = db.query(User).filter(User.role == "student").count()
irreg_students = db.query(User).filter(User.role == "student", User.student_type == "irregular").count()
total_selections = db.query(IrregularSelection).count()

print(f"\n=== POST-IMPORT STATS ===")
print(f"Total students: {total_students}")
print(f"Irregular students: {irreg_students}")
print(f"Total IrregularSelection rows: {total_selections}")

# Analyze selections per irregular student
sels_per_user = []
for u in db.query(User).filter(User.role == "student", User.student_type == "irregular").all():
    c = db.query(IrregularSelection).filter(IrregularSelection.user_id == u.id).count()
    sels_per_user.append(c)

from collections import Counter
print(f"Distribution of subject counts per irregular student: {Counter(sels_per_user)}")

db.close()
