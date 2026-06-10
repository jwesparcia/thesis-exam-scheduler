import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in environment or .env")

print("Connecting to DB to check migrations...")
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if sections table has preferred_room_id column
    result = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='sections' AND column_name='preferred_room_id';
    """)).fetchone()
    
    if not result:
        print("Column 'preferred_room_id' not found in table 'sections'. Adding column...")
        conn.execute(text("""
            ALTER TABLE sections 
            ADD COLUMN preferred_room_id INTEGER REFERENCES rooms(id) NULL;
        """))
        conn.commit()
        print("Migration successful! Column 'preferred_room_id' added to table 'sections'.")
    else:
        print("Column 'preferred_room_id' already exists in table 'sections'. No migration needed.")

    # Check if exams table has term column
    result_term = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='exams' AND column_name='term';
    """)).fetchone()
    
    if not result_term:
        print("Column 'term' not found in table 'exams'. Adding column...")
        conn.execute(text("""
            ALTER TABLE exams 
            ADD COLUMN term VARCHAR DEFAULT 'Midterm';
        """))
        conn.commit()
        print("Migration successful! Column 'term' added to table 'exams'.")
    else:
        print("Column 'term' already exists in table 'exams'. No migration needed.")

    # Check if proctors table has translated_schedule column
    result_trans = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='proctors' AND column_name='translated_schedule';
    """)).fetchone()
    
    if not result_trans:
        print("Column 'translated_schedule' not found in table 'proctors'. Adding column...")
        conn.execute(text("""
            ALTER TABLE proctors 
            ADD COLUMN translated_schedule TEXT NULL;
        """))
        conn.commit()
        print("Migration successful! Column 'translated_schedule' added to table 'proctors'.")
    else:
        print("Column 'translated_schedule' already exists in table 'proctors'. No migration needed.")
