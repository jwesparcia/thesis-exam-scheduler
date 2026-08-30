from sqlalchemy import text
from sqlalchemy.orm import Session
from core import SessionLocal, engine
from model import Base, Course, YearLevel, Section, Subject, Room, Timeslot, Teacher, Exam, DistributionRule, User, Proctor, ProctorAvailability, IrregularSelection
from room_data import AVAILABLE_EXAM_ROOMS
import bcrypt
from datetime import date, time, timedelta, datetime

db: Session = SessionLocal()

def reset_db():
    print("Resetting database...")
    try:
        with engine.connect() as connection:
            tables = [
                "notifications", "rescheduling_requests", "distribution_rules", "exams",
                "timeslots", "rooms", "subjects", "sections", "proctor_availabilities",
                "teacher_schedules", "teacher_teachings", "proctors", "teachers",
                "year_levels", "courses", "irregular_selections", "activity_logs",
                "password_reset_tokens", "users"
            ]
            for table in tables:
                connection.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
            connection.commit()

        Base.metadata.create_all(bind=engine)
        print("Database reset successfully!")
    except Exception as e:
        print(f"Error resetting database: {e}")

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def run_setup():
    # 1. Reset tables
    reset_db()

    # 2. Seed Year Levels
    print("Seeding baseline Year Levels...")
    year_levels = [
        YearLevel(name="1st Year"),
        YearLevel(name="2nd Year"),
        YearLevel(name="3rd Year"),
        YearLevel(name="4th Year"),
        YearLevel(name="Grade 11"),
        YearLevel(name="Grade 12"),
    ]
    db.add_all(year_levels)
    db.commit()

    # Refetch year levels for linking rules
    refetched_years = db.query(YearLevel).all()

    # 3. Seed Distribution Rules
    print("Seeding baseline Distribution Rules...")
    rules = [
        # GE / General subjects -> Day 1-3, Morning session only
        DistributionRule(category_type="general", year_level_id=None, allowed_days=[1, 2, 3], allowed_session="morning"),
    ]
    # Major Rules per year level (Day 1-4, any session)
    for y in refetched_years:
        rules.append(DistributionRule(category_type="major", year_level_id=y.id, allowed_days=[1, 2, 3, 4], allowed_session="any"))

    db.add_all(rules)
    db.commit()

    # 4. Seed Rooms
    print("Seeding physical Rooms...")
    rooms = [
        Room(
            name=room["name"], 
            building=room["building"], 
            department=room["department"], 
            capacity=room.get("capacity", 40)
        ) 
        for room in AVAILABLE_EXAM_ROOMS
    ]
    db.add_all(rooms)
    db.commit()

    # 5. Seed Timeslots
    print("Seeding baseline Timeslots...")
    base_date = date.today()
    timeslots = []

    exam_duration = timedelta(hours=1, minutes=30)
    break_duration = timedelta(minutes=30) 

    for d in range(5):  # Generate 5 exam days
        day = base_date + timedelta(days=d)

        # Skip Sunday
        if day.weekday() == 6:
            base_date += timedelta(days=1) 
            day = base_date + timedelta(days=d) 

        current = datetime.combine(day, time(7, 0))   # Start at 7:00 AM
        cutoff = datetime.combine(day, time(20, 30))  # Last slot ends <= 8:30 PM

        while current + exam_duration <= cutoff:
            start_t = current.time()
            end_t = (current + exam_duration).time()

            timeslots.append(Timeslot(
                date=day,
                start_time=start_t,
                end_time=end_t
            ))

            current += exam_duration + break_duration

    db.add_all(timeslots)
    db.commit()

    # 6. Seed Admin Account
    print("Seeding Administrator account...")
    admin_user = User(
        name="Administrator",
        email="admin@school.edu",
        hashed_password=hash_password("admin123"),
        role="program_head",
        is_first_login=True
    )
    db.add(admin_user)
    db.commit()

    print("\n=== SETUP COMPLETE ===")
    print("Database has been initialized cleanly with:")
    print(f"- {len(refetched_years)} Year Levels")
    print(f"- {len(rules)} Distribution Rules")
    print(f"- {len(rooms)} Rooms")
    print(f"- {len(timeslots)} Timeslots")
    print("- 1 Administrator Account (admin@school.edu / admin123)")
    print("System is ready for curriculum Excel import from the admin dashboard.")

if __name__ == "__main__":
    run_setup()
