from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core import Base, engine
from routers import catalog, scheduler, sections, exams, proctors, rescheduling, auth, student
from utils.errors import add_error_reporting
from services.program_updates import BM_THM_ADMIN_ACCOUNTS, rename_programs

app = FastAPI()
add_error_reporting(app)

# CORS (only once)
import os

frontend_env = os.getenv("FRONTEND_URL")
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
    "http://localhost:5176",
    "http://localhost:5175",
]
if frontend_env:
    for u in frontend_env.split(","):
        clean_u = u.strip().rstrip("/")
        if clean_u and clean_u not in allowed_origins:
            allowed_origins.append(clean_u)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"(https://.*\.onrender\.com|http://(localhost|127\.0\.0\.1):\d+)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    program_labels_changed = False
    try:
        print("Creating database tables...", flush=True)
        Base.metadata.create_all(bind=engine)
        print("Database tables created successfully!", flush=True)
        
        # Only apply legacy schema changes when a column is actually absent.
        # PostgreSQL takes an exclusive table lock even for `ADD COLUMN IF NOT
        # EXISTS`, which made every Render deployment wait before binding its
        # HTTP port.
        from sqlalchemy import inspect as _inspect, text as _text
        with engine.connect() as _conn:
            _inspector = _inspect(_conn)

            def _column_names(table_name):
                return {column["name"] for column in _inspector.get_columns(table_name)}

            def _add_column_if_missing(table_name, column_name, ddl):
                if column_name not in _column_names(table_name):
                    print(f"Applying one-time schema update: {table_name}.{column_name}", flush=True)
                    _conn.execute(_text(ddl))

            _add_column_if_missing(
                "chat_messages",
                "deleted_by_sender",
                "ALTER TABLE chat_messages ADD COLUMN deleted_by_sender BOOLEAN DEFAULT FALSE",
            )
            _add_column_if_missing(
                "chat_messages",
                "deleted_by_recipient",
                "ALTER TABLE chat_messages ADD COLUMN deleted_by_recipient BOOLEAN DEFAULT FALSE",
            )
            _add_column_if_missing(
                "rescheduling_requests",
                "rescheduled_exam_id",
                "ALTER TABLE rescheduling_requests ADD COLUMN rescheduled_exam_id INTEGER REFERENCES exams(id)",
            )
            _add_column_if_missing(
                "exams",
                "batch_number",
                "ALTER TABLE exams ADD COLUMN batch_number INTEGER",
            )
            _add_column_if_missing(
                "users",
                "active_session_id",
                "ALTER TABLE users ADD COLUMN active_session_id VARCHAR(255)",
            )

            # `break_minutes` belongs to an older schema. New installations
            # use exam_break_settings directly, so copy it only when present.
            if "break_minutes" in _column_names("distribution_rules"):
                _conn.execute(_text("""
                    INSERT INTO exam_break_settings (category_type, break_seconds)
                    SELECT LOWER(category_type), MAX(COALESCE(break_minutes, 0)) * 60
                    FROM distribution_rules
                    WHERE LOWER(category_type) IN ('general', 'major')
                    GROUP BY LOWER(category_type)
                    ON CONFLICT (category_type) DO NOTHING
                """))
            _conn.execute(_text("""
                UPDATE subjects
                SET category = 'general'
                WHERE LOWER(TRIM(name)) = 'understanding the self' AND category != 'general'
            """))
            _conn.execute(_text("UPDATE users SET role = 'program_head' WHERE role = 'admin'"))
            _conn.commit()
        print("Startup schema checks completed.", flush=True)

        # Seed default data if missing (useful for fresh databases on Render)
        from core import SessionLocal
        from model import (
            ActivityLog,
            ChatMessage,
            IrregularSelection,
            Notification,
            PasswordResetToken,
            Room,
            User,
            YearLevel,
        )
        from room_data import AVAILABLE_EXAM_ROOMS
        from routers.auth import hash_password

        with SessionLocal() as db_session:
            # 1. Ensure departments table is seeded
            from model import Department, Course
            departments_data = [
                ("GE", "General Education", "Oversees core curriculum, general education courses, and university-wide scheduling.", True, True),
                ("ICT", "Information and Communications Technology", "Department for BSIT, BSCS, and BSCpE programs.", False, False),
                ("BM", "Business and Management", "Department for Accountancy (BA) and Business Administration.", False, False),
                ("THM", "Tourism and Hospitality Management", "Department for BSTM and BSHM programs.", False, False),
                ("AS", "Arts and Sciences", "Department for BAPSYCH, BMMA, and BACOMM programs.", False, False),
                ("CRIM", "Criminology", "Department for BSCrim program.", False, False),
                ("SHS", "Senior High School", "Department for all Senior High School strands (STEM, ABM, HUMMS, etc.).", False, False),
            ]
            for code_dept, name_dept, desc_dept, is_ge, is_super in departments_data:
                dept = db_session.query(Department).filter(Department.code == code_dept).first()
                if not dept:
                    db_session.add(Department(
                        code=code_dept,
                        name=name_dept,
                        description=desc_dept,
                        is_general_education=is_ge,
                        is_super=is_super,
                    ))
            db_session.commit()

            # Retire the old Academic Head account while preserving its user ID and
            # related history by converting it back to the GE administrator account.
            ge_admin = db_session.query(User).filter(User.email == "ge.admin@school.edu").first()
            academic_head = db_session.query(User).filter(User.email == "academic.head@school.edu").first()
            if academic_head:
                if ge_admin:
                    related_user_columns = [
                        (ActivityLog, ActivityLog.user_id),
                        (ChatMessage, ChatMessage.sender_id),
                        (ChatMessage, ChatMessage.recipient_id),
                        (IrregularSelection, IrregularSelection.user_id),
                        (Notification, Notification.user_id),
                        (PasswordResetToken, PasswordResetToken.user_id),
                    ]
                    for model, user_column in related_user_columns:
                        db_session.query(model).filter(user_column == academic_head.id).update(
                            {user_column: ge_admin.id},
                            synchronize_session=False,
                        )
                    db_session.delete(academic_head)
                else:
                    academic_head.email = "ge.admin@school.edu"
                    ge_admin = academic_head

            if ge_admin:
                ge_admin.name = "General Academic Administrator"
                ge_admin.role = "program_head"
                ge_admin.department_code = "GE"
                ge_admin.is_super_admin = False
                ge_admin.active_session_id = None
            db_session.commit()

            # 2. Separate Program Head accounts for each department.
            admin_accounts = [
                ("General Academic Administrator", "ge.admin@school.edu", "GE", False),
                ("Dr. Maria Santos", "admin@school.edu", "GE", True),
                ("ICT Department Administrator", "ict.admin@school.edu", "ICT", False),
                *BM_THM_ADMIN_ACCOUNTS,
                ("AS Department Administrator", "as.admin@school.edu", "AS", False),
                ("CRIM Department Administrator", "crim.admin@school.edu", "CRIM", False),
                ("SHS Department Administrator", "shs.admin@school.edu", "SHS", False),
            ]
            for aname, aemail, adcode, asuper in admin_accounts:
                head_user = db_session.query(User).filter(User.email == aemail).first()
                if not head_user:
                    head_user = User(
                        name=aname,
                        email=aemail,
                        hashed_password=hash_password("admin123"),
                        role="program_head",
                        department_code=adcode,
                        is_super_admin=asuper,
                        is_first_login=False,
                    )
                    db_session.add(head_user)
                else:
                    head_user.name = aname
                    head_user.role = "program_head"
                    head_user.department_code = adcode
                    head_user.is_super_admin = asuper

            # Also seed default irregular student if missing
            irreg_user = db_session.query(User).filter(User.email == "irreg@school.edu").first()
            if not irreg_user:
                db_session.add(User(
                    name="Irregular Student",
                    email="irreg@school.edu",
                    hashed_password=hash_password("student123"),
                    role="student",
                    student_type="irregular",
                    is_first_login=False,
                ))

            # Update program labels without replacing courses or schedules.
            program_labels_changed = any(rename_programs(db_session).values())

            # Course to department mapping backfill
            course_dept_map = {
                "BSIT": "ICT", "BSCS": "ICT", "BSCpE": "ICT",
                "BSTM": "THM", "BSHM": "THM", "BA": "BM",
                "BAPSYCH": "AS", "BSCrim": "CRIM", "BMMA": "AS", "BACOMM": "AS",
                "STEM": "SHS", "ABM": "SHS", "HUMMS": "SHS", "Culinary": "SHS",
                "Digital Arts": "SHS", "IT-MAWDEV": "SHS", "Tourism": "SHS",
            }
            for cname, dcode in course_dept_map.items():
                c = db_session.query(Course).filter(Course.name == cname).first()
                if c and not c.department_code:
                    c.department_code = dcode

            db_session.commit()
            print("Program Head accounts and department links ensured on startup (separate BM and THM accounts)!")

            # 2. Default YearLevels
            if db_session.query(YearLevel).count() == 0:
                default_years = [
                    YearLevel(name="1st Year"),
                    YearLevel(name="2nd Year"),
                    YearLevel(name="3rd Year"),
                    YearLevel(name="4th Year"),
                    YearLevel(name="Grade 11"),
                    YearLevel(name="Grade 12"),
                ]
                db_session.add_all(default_years)
                db_session.commit()
                print("Default YearLevels seeded on startup")

            # 3. Exam Rooms (College & SHS)
            existing_room_names = {r[0] for r in db_session.query(Room.name).all()}
            rooms_to_add = []
            for r in AVAILABLE_EXAM_ROOMS:
                if r["name"] not in existing_room_names:
                    rooms_to_add.append(
                        Room(
                            name=r["name"],
                            building=r["building"],
                            department=r["department"],
                            capacity=r.get("capacity", 40),
                        )
                    )
                    existing_room_names.add(r["name"])
            if "Consultation Area" not in existing_room_names:
                rooms_to_add.append(
                    Room(
                        name="Consultation Area",
                        building="Consultation Area",
                        department="College",
                        capacity=50,
                    )
                )
            if rooms_to_add:
                db_session.add_all(rooms_to_add)
                db_session.commit()
                print(f"Auto-seeded {len(rooms_to_add)} exam rooms into database!")
    except Exception as e:
        print(f"Failed to create database tables or run migrations: {e}", flush=True)
        print("Make sure the database is accessible", flush=True)

    # Connect Redis cache (non-fatal — app works without Redis)
    from core import cache
    connected = cache.connect()
    if connected and program_labels_changed:
        cache.invalidate_catalog()
        cache.delete("departments:all")
    if not connected:
        if os.getenv("REDIS_HOST"):
            print("[WARNING] Redis unavailable - running without cache (PostgreSQL only)", flush=True)
        else:
            print("Redis is not configured - running without cache.", flush=True)

@app.on_event("shutdown")
def on_shutdown():
    from core import cache
    cache.disconnect()

# Routers
app.include_router(catalog.router)
app.include_router(scheduler.router)
app.include_router(sections.router)
app.include_router(exams.router)
app.include_router(proctors.router)
app.include_router(rescheduling.router)
from routers import notifications, rules
app.include_router(notifications.router)
app.include_router(rules.router)
app.include_router(auth.router)
app.include_router(student.router)
from routers import chat
app.include_router(chat.router)

@app.get("/")
def root():
    return {"message": "Exam Scheduler API running"}
