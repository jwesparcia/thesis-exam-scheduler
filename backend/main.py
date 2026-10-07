from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core import Base, engine
from routers import catalog, scheduler, sections, exams, proctors, rescheduling, auth, student

app = FastAPI()

# CORS (only once)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
        "http://localhost:5176",
        "http://localhost:5175"
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    try:
        print("Creating database tables...")
        Base.metadata.create_all(bind=engine)
        print("Database tables created successfully!")
        
        # Add soft delete columns idempotently
        from sqlalchemy import text as _text
        with engine.connect() as _conn:
            _conn.execute(_text("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_by_sender BOOLEAN DEFAULT FALSE"))
            _conn.execute(_text("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_by_recipient BOOLEAN DEFAULT FALSE"))
            _conn.execute(_text("ALTER TABLE rescheduling_requests ADD COLUMN IF NOT EXISTS rescheduled_exam_id INTEGER REFERENCES exams(id)"))
            _conn.execute(_text("ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0"))
            _conn.execute(_text("""
                INSERT INTO exam_break_settings (category_type, break_seconds)
                SELECT LOWER(category_type), MAX(COALESCE(break_minutes, 0)) * 60
                FROM distribution_rules
                WHERE LOWER(category_type) IN ('general', 'major')
                GROUP BY LOWER(category_type)
                ON CONFLICT (category_type) DO NOTHING
            """))
            _conn.commit()
        print("Chat database soft-delete columns migration successful!")
    except Exception as e:
        print(f"Failed to create database tables or run migrations: {e}")
        print("Make sure the database is accessible")

    # Connect Redis cache (non-fatal — app works without Redis)
    from core import cache
    connected = cache.connect()
    if not connected:
        print("[WARNING] Redis unavailable - running without cache (PostgreSQL only)")

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
