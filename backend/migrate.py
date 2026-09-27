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
    result_rescheduled_exam = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='rescheduling_requests' AND column_name='rescheduled_exam_id';
    """)).fetchone()

    if not result_rescheduled_exam:
        print("Column 'rescheduled_exam_id' not found in table 'rescheduling_requests'. Adding column...")
        conn.execute(text("""
            ALTER TABLE rescheduling_requests
            ADD COLUMN rescheduled_exam_id INTEGER REFERENCES exams(id);
        """))
        conn.commit()
        print("Migration successful! Column 'rescheduled_exam_id' added to rescheduling_requests.")

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

    # Check if notifications table still has recipient_id column
    result_notif_recipient = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='notifications' AND column_name='recipient_id';
    """)).fetchone()
    
    if result_notif_recipient:
        print("Migrating notifications table: Dropping recipient_type/recipient_id and adding user_id...")
        conn.execute(text("""
            ALTER TABLE notifications 
            DROP COLUMN IF EXISTS recipient_type,
            DROP COLUMN IF EXISTS recipient_id;
        """))
        conn.execute(text("""
            ALTER TABLE notifications 
            ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NULL;
        """))
        conn.commit()
        print("Migration successful! Notifications table updated to use user_id foreign key.")
    else:
        # Also check if user_id column is missing for some reason
        result_notif_user = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='notifications' AND column_name='user_id';
        """)).fetchone()
        if not result_notif_user:
            print("Column 'user_id' not found in table 'notifications'. Adding column...")
            conn.execute(text("""
                ALTER TABLE notifications 
                ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NULL;
            """))
            conn.commit()
            print("Migration successful! Column 'user_id' added to table 'notifications'.")
        else:
            print("Notifications table is already up-to-date with 'user_id' column.")

    # Check if users table has is_first_login column
    result_first_login = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='users' AND column_name='is_first_login';
    """)).fetchone()
    
    if not result_first_login:
        print("Column 'is_first_login' not found in table 'users'. Adding column...")
        conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN is_first_login BOOLEAN DEFAULT TRUE;
        """))
        conn.commit()
        print("Migration successful! Column 'is_first_login' added to table 'users'.")
    else:
        print("Column 'is_first_login' already exists in table 'users'. No migration needed.")

    # Check if sections table has student_count column
    result_student_count = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='sections' AND column_name='student_count';
    """)).fetchone()
    
    if not result_student_count:
        print("Column 'student_count' not found in table 'sections'. Adding column...")
        conn.execute(text("""
            ALTER TABLE sections 
            ADD COLUMN student_count INTEGER DEFAULT 35;
        """))
        conn.commit()
        print("Migration successful! Column 'student_count' added to table 'sections'.")
    else:
        print("Column 'student_count' already exists in table 'sections'. No migration needed.")

    # Drop uq_exam_room_timeslot if it exists — irregular student rescheduling requires
    # placing a student's exam into a room+timeslot that already has another exam.
    # Room conflict checks for regular scheduling are enforced at the application level.
    result_idx = conn.execute(text("""
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'exams' AND indexname = 'uq_exam_room_timeslot';
    """)).fetchone()

    if result_idx:
        print("Dropping unique index 'uq_exam_room_timeslot' to allow irregular student room assignment...")
        conn.execute(text("DROP INDEX IF EXISTS uq_exam_room_timeslot;"))
        conn.commit()
        print("Migration successful! Unique index 'uq_exam_room_timeslot' dropped.")
    else:
        print("Unique index 'uq_exam_room_timeslot' does not exist. No migration needed.")

    # Check if subjects table has duration_minutes column
    result_duration = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='subjects' AND column_name='duration_minutes';
    """)).fetchone()

    if not result_duration:
        print("Column 'duration_minutes' not found in table 'subjects'. Adding column...")
        conn.execute(text("""
            ALTER TABLE subjects 
            ADD COLUMN duration_minutes INTEGER DEFAULT 75;
        """))
        conn.commit()
        print("Migration successful! Column 'duration_minutes' added to table 'subjects'.")
    else:
        print("Column 'duration_minutes' already exists in table 'subjects'.")

    # Ensure all null durations are 75, and BSA major subjects are set to 120 (2h)
    conn.execute(text("""
        UPDATE subjects SET duration_minutes = 75 WHERE duration_minutes IS NULL;
    """))
    conn.execute(text("""
        UPDATE subjects 
        SET duration_minutes = 120 
        WHERE course_id IN (SELECT id FROM courses WHERE name = 'BSA') 
          AND (category = 'major' OR lower(name) LIKE '%accounting%' OR lower(name) LIKE '%taxation%' OR lower(name) LIKE '%auditing%');
    """))
    conn.commit()
    print("Subject durations initialized: 75m default, 120m for BSA major subjects.")

    # Check if system_settings table exists
    result_sys_tbl = conn.execute(text("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name='system_settings';
    """)).fetchone()

    if not result_sys_tbl:
        print("Table 'system_settings' not found. Creating table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_settings (
                id SERIAL PRIMARY KEY,
                key VARCHAR UNIQUE,
                value VARCHAR
            );
        """))
        conn.commit()
        print("Migration successful! Table 'system_settings' created.")
    else:
        print("Table 'system_settings' already exists.")

    # Seed default system settings if not present
    conn.execute(text("""
        INSERT INTO system_settings (key, value)
        VALUES 
            ('daily_start_time', '07:30'),
            ('daily_end_time', '17:00'),
            ('default_allotted_time', '75')
        ON CONFLICT (key) DO NOTHING;
    """))
    conn.commit()
    print("System settings verified/initialized.")

    # Check if users table has student_id column
    result_student_id = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='users' AND column_name='student_id';
    """)).fetchone()

    if not result_student_id:
        print("Column 'student_id' not found in table 'users'. Adding column...")
        conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN student_id VARCHAR;
            CREATE INDEX IF NOT EXISTS ix_users_student_id ON users (student_id);
        """))
        conn.commit()
        print("Migration successful! Column 'student_id' added to table 'users'.")
    else:
        print("Column 'student_id' already exists in table 'users'.")

    # Backfill student_id for students with format 02000XXXXXX
    rows = conn.execute(text("SELECT id, email, student_id FROM users WHERE role = 'student'")).fetchall()
    import re
    updated_count = 0
    for r in rows:
        uid, email, sid = r[0], r[1] or "", r[2]
        if not sid or not sid.startswith("02000") or len(sid) != 11:
            digits = re.findall(r'\d+', email)
            if digits:
                num_str = "".join(digits)
                tail = num_str[-6:].zfill(6)
            else:
                tail = f"{((uid * 123457 + 352553) % 900000 + 100000):06d}"
            new_sid = f"02000{tail}"
            conn.execute(text("UPDATE users SET student_id = :sid WHERE id = :uid"), {"sid": new_sid, "uid": uid})
            updated_count += 1
    if updated_count > 0:
        conn.commit()
        print(f"Backfilled {updated_count} student IDs to 02000XXXXXX format.")

    # Check and insert SHS Semester 3 subjects for tri-sem
    shs_sem3_count = conn.execute(text("""
        SELECT count(*) FROM subjects s
        JOIN courses c ON s.course_id = c.id
        WHERE c.category = 'SHS' AND s.semester = 3;
    """)).scalar()

    if not shs_sem3_count or shs_sem3_count == 0:
        print("No Semester 3 subjects found for SHS. Adding SHS Semester 3 subjects for tri-sem...")
        shs_sem3_data = {
            "STEM": [
                ("ST5301", "General Chemistry 1", 5, "written", "major", 75),
                ("ST5302", "Earth and Life Science", 5, "written", "general", 75),
                ("ST5303", "Disaster Readiness and Risk Reduction", 5, "written", "general", 75),
                ("ST5304", "Physical Education and Health 2B", 5, "practical", "general", 75),
                ("ST5305", "English for Academic and Professional Purposes", 5, "written", "general", 75),
                ("ST6301", "General Physics 2", 6, "written", "major", 75),
                ("ST6302", "Inquiries, Investigations and Immersion", 6, "written", "general", 75),
                ("ST6303", "Media Arts and Design", 6, "written", "major", 75),
                ("ST6304", "Work Immersion/Culminating Activity", 6, "practical", "major", 75),
            ],
            "Digital Arts": [
                ("DA5301", "3D Basics", 5, "written", "major", 75),
                ("DA5302", "Vector Graphics", 5, "written", "major", 75),
                ("DA5303", "Media and Information Literacy 2", 5, "written", "general", 75),
                ("DA5304", "English for Academic and Professional Purposes", 5, "written", "general", 75),
                ("DA6301", "Interactive Media", 6, "written", "major", 75),
                ("DA6302", "Visual Effects and Motion Graphics", 6, "written", "major", 75),
                ("DA6303", "Portfolio Development", 6, "practical", "major", 75),
            ],
            "Culinary": [
                ("CU5301", "Food Sanitation and Safety", 5, "written", "major", 75),
                ("CU5302", "Baking Science", 5, "written", "major", 75),
                ("CU5303", "Kitchen Operations", 5, "written", "major", 75),
                ("CU6301", "International Gastronomy", 6, "written", "major", 75),
                ("CU6302", "Beverage Management", 6, "written", "major", 75),
                ("CU6303", "Menu Planning and Costing", 6, "written", "major", 75),
            ],
            "HUMMS": [
                ("HU5301", "Philippine Politics and Governance", 5, "written", "general", 75),
                ("HU5302", "Creative Nonfiction", 5, "written", "major", 75),
                ("HU5303", "Social Science Research", 5, "written", "major", 75),
                ("HU6301", "Community Engagement and Solidarity", 6, "written", "general", 75),
                ("HU6302", "Trends, Networks, and Critical Thinking", 6, "written", "general", 75),
            ],
            "ABM": [
                ("AB5301", "Applied Economics", 5, "written", "major", 75),
                ("AB5302", "Business Finance Basics", 5, "written", "major", 75),
                ("AB5303", "Marketing Principles", 5, "written", "major", 75),
                ("AB6301", "Business Enterprise Simulation", 6, "written", "major", 75),
                ("AB6302", "Business Ethics and Social Responsibility", 6, "written", "major", 75),
            ],
            "IT-MAWDEV": [
                ("IT5301", "Database Management Systems", 5, "written", "major", 75),
                ("IT5302", "Object-Oriented Programming (Java)", 5, "written", "major", 75),
                ("IT5303", "Client-Side Scripting", 5, "written", "major", 75),
                ("IT6301", "Mobile Applications Development", 6, "written", "major", 75),
                ("IT6302", "Web Systems and Technologies", 6, "written", "major", 75),
                ("IT6303", "IT Capstone Project", 6, "practical", "major", 75),
            ],
            "Tourism": [
                ("TO5301", "Tourism Promotion Services", 5, "written", "major", 75),
                ("TO5302", "Philippine Tourism Geography", 5, "written", "major", 75),
                ("TO5303", "Customer Service in Tourism", 5, "written", "major", 75),
                ("TO6301", "Tour Guiding Services", 6, "written", "major", 75),
                ("TO6302", "Travel Agency Management", 6, "written", "major", 75),
                ("TO6303", "Events Management", 6, "written", "major", 75),
            ],
        }
        for cname, subs in shs_sem3_data.items():
            cid_row = conn.execute(text("SELECT id FROM courses WHERE name = :name"), {"name": cname}).fetchone()
            if not cid_row:
                continue
            cid = cid_row[0]
            for code, name, yl_id, exam_t, cat, dur in subs:
                conn.execute(text("""
                    INSERT INTO subjects (code, name, course_id, year_level_id, semester, exam_type, category, duration_minutes)
                    VALUES (:code, :name, :cid, :yl_id, 3, :exam_t, :cat, :dur)
                """), {
                    "code": code, "name": name, "cid": cid, "yl_id": yl_id,
                    "exam_t": exam_t, "cat": cat, "dur": dur
                })
        conn.commit()
        print("SHS Semester 3 subjects seeded successfully.")
    else:
        print(f"SHS Semester 3 subjects verified ({shs_sem3_count} subjects found).")

