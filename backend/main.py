from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
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
    ],
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
    except Exception as e:
        print(f"Failed to create database tables: {e}")
        print("Make sure the database is accessible and tables can be created")

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

@app.get("/")
def root():
    return {"message": "Exam Scheduler API running"}
