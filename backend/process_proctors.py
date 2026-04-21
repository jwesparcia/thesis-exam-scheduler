import pandas as pd
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import bcrypt
from datetime import time, datetime

# Database connection
DATABASE_URL = "postgresql+psycopg2://postgres:may312005@localhost:5432/exam_scheduler"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def process_excel():
    file_path = "e:/thesis-exam-scheduler/ICT SY2526 T2.xlsx"
    xl = pd.ExcelFile(file_path)
    db = SessionLocal()

    for sheet_name in xl.sheet_names:
        if not any(sheet_name.startswith(p) for p in ['PT', 'REG', 'HO']):
            continue
            
        print(f"Processing {sheet_name}...")
        df = pd.read_excel(xl, sheet_name=sheet_name)
        
        # Get Full Name from Unnamed: 8 (Col I) Row 1 (Index 1)
        full_name = sheet_name
        try:
            if 'Unnamed: 8' in df.columns and len(df) > 1:
                val = df.iloc[1]['Unnamed: 8']
                if pd.notna(val) and isinstance(val, str) and ',' in val:
                    # Format: SANTOS, RICHARD AQUINO -> Richard Aquino Santos
                    parts = val.split(',')
                    last = parts[0].strip()
                    first = parts[1].strip()
                    full_name = f"{first} {last}".title()
        except:
            pass
            
        print(f"  Instructor: {full_name}")
        
        # Create Teacher
        teacher = db.execute(text("SELECT id FROM teachers WHERE name = :name"), {"name": full_name}).fetchone()
        if not teacher:
            db.execute(text("INSERT INTO teachers (name) VALUES (:name)"), {"name": full_name})
            teacher = db.execute(text("SELECT id FROM teachers WHERE name = :name"), {"name": full_name}).fetchone()
        
        teacher_id = teacher[0]
        
        # Create Proctor
        proctor = db.execute(text("SELECT id FROM proctors WHERE teacher_id = :tid"), {"tid": teacher_id}).fetchone()
        if not proctor:
            db.execute(text("INSERT INTO proctors (name, teacher_id) VALUES (:name, :tid)"), {"name": full_name, "tid": teacher_id})
            proctor = db.execute(text("SELECT id FROM proctors WHERE teacher_id = :tid"), {"tid": teacher_id}).fetchone()
        
        proctor_id = proctor[0]
        
        # Create User account (schedule starts empty — proctor must upload their own)
        email = f"{full_name.lower().replace(' ', '.')}@school.edu"
        user = db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email}).fetchone()
        if not user:
            db.execute(text("""
                INSERT INTO users (name, email, hashed_password, role, teacher_id, proctor_id) 
                VALUES (:name, :email, :pass, :role, :tid, :pid)
            """), {
                "name": full_name,
                "email": email,
                "pass": hash_password("proctor123"),
                "role": "proctor",
                "tid": teacher_id,
                "pid": proctor_id
            })

        # NOTE: No schedule import here.
        # Proctors upload their own schedule via their dashboard.

    db.commit()
    db.close()
    print("Done! Proctor accounts created with no pre-loaded schedules.")

if __name__ == "__main__":
    process_excel()

