from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from database import SessionLocal, engine
from models import Base, Course, YearLevel, Section, Subject, Room, Timeslot, Teacher, Exam, DistributionRule, User, Proctor, ProctorAvailability
import bcrypt
from datetime import date, time, timedelta, datetime
import random

db: Session = SessionLocal()

def reset_db():
    print("Resetting database...")
    try:
        with engine.connect() as connection:
            # Order matters for dependencies if not using CASCADE, but CASCADE handles it.
            # List all tables to be safe.
            tables = [
                "notifications", "rescheduling_requests", "distribution_rules", "exams",
                "timeslots", "rooms", "subjects", "sections", "proctor_availabilities", "teacher_schedules", "proctors", "teachers", "year_levels", "courses", "users"
            ]
            for table in tables:
                connection.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
            connection.commit()
            
        Base.metadata.create_all(bind=engine)
        print("Database reset successfully!")
    except Exception as e:
        print(f"Error resetting database: {e}")

reset_db()

# -------------------------
# Teachers
# -------------------------
teacher_names = []

teachers = [Teacher(name=name) for name in teacher_names]
db.add_all(teachers)
db.commit()
teacher_ids = [t.id for t in db.query(Teacher).all()]

# -------------------------
# Distribution Rules
# -------------------------
# Need Course/Year for rules? Yes for ids.
# Let's seed courses and years first.


# -------------------------
# Courses
# -------------------------
courses = [
    Course(name="BSIT", category="College"),
    Course(name="BSCS", category="College"),
    Course(name="Tourism", category="SHS"),
    Course(name="STEM", category="SHS"),
    Course(name="Digital Arts", category="SHS"),
    Course(name="Culinary", category="SHS"),
    Course(name="HUMMS", category="SHS"),
    Course(name="ABM", category="SHS"),
    Course(name="IT-MAWDEV", category="SHS"),
]
db.add_all(courses)
db.commit()
courses = db.query(Course).all()

# -------------------------
# Year Levels
# -------------------------
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
year_levels = db.query(YearLevel).all()

# -------------------------
# Distribution Rules (from Tertiary Periodical Departmental Exam Schedule)
# -------------------------
# Schedule layout:
#   Day 1 Morning  : GE subjects (Comm & Lit, Math, Sciences)
#   Day 2 Morning  : GE subjects (Filipino, SOCSCI)
#   Day 1 Afternoon: Computer Fundamentals & Major for Y3 & Y4
#   Day 2 Afternoon: Major for ALL year levels
#   Day 3 (Any)   : Major for ALL year levels
#   Day 4 (Any)   : Major for ALL year levels

rules = [
    # GE / General subjects → Day 1-3, Any session
    DistributionRule(category_type="general", year_level_id=None, allowed_days=[1, 2, 3], allowed_session="any"),
]

# Major Rules per year level
for y in year_levels:
    # Major subjects → All days, Any session for maximum coverage
    rules.append(DistributionRule(category_type="major", year_level_id=y.id, allowed_days=[1, 2, 3, 4], allowed_session="any"))

db.add_all(rules)
db.commit()

# -------------------------
# Subject Pools
# -------------------------
bsit_subjects = {
    1: {  # Year 1
        1: ["Introduction to Computing", "Computer Programming 1", "The Contemporary World", "Euthenics 1", "Purposive Communication", "Understanding the Self", "Physical Education 1", "Philippine Popular Culture", "NSTP 1"],
        2: ["Computer Programming 2", "Discrete Structures 1", "Art Appreciation", "Ethics", "Mathematics in the Modern World", "Physical Education 2", "NSTP 2", "Science, Technology, and Society", "System Administration and Maintenance"]
    },
    2: {  # Year 2
        1: ["Data Structures and Algorithms", "Readings in Philippine History", "Rizal's Life and Works", "Human-Computer Interaction", "Principles of Communications", "Physical Education 3", "IT Elective 1", "Platform Technology (Operating Systems)"],
        2: ["Information Management", "The Entrepreneurial Mind", "Network Technology 1", "Quantitative Methods", "System Integration and Architecture", "Physical Education 4", "Integrative Programming"]
    },
    3: {  # Year 3
        1: ["Application Development and Emerging Technologies", "Advanced Database Systems", "Event-Driven Programming", "Data and Digital Communication (Data Communications)", "Professional Issues and Information Systems and Technology", "IT Elective 2", "Advanced System Integration and Architecture"],
        2: ["Web System and Technologies", "Management Information System", "IT Capstone Project 1", "IT Elective 3", "Great Books", "Mobile Systems and Technologies", "Information Assurance and Security (Cybersecurity Fundamentals)"]
    },
    4: {  # Year 4
        1: ["IT Capstone Project 2", "Computer Graphics Programming", "IT Service Management", "IT Elective 4", "Euthenics 2", "Information Assurance and Security (Data Privacy)", "Network Technology 2"],
        2: ["IT Practicum (486 hours)"]
    }
}

bscs_subjects = {
    1: {1: ["Introduction to Computing", "Computer Programming 1", "The Contemporary World", "Euthenics 1", "Purposive Communication", "National Service Training Program 1", "P.E./PATHFIT 1: Movement Competency Training", "Understanding the Self"],
        2: ["Computer Programming 2", "Discrete Structures 1 (Discrete Mathematics)", "Art Appreciation", "National Service Training Program 2", "P.E./PATHFIT 2: Exercise-based Fitness Activities", "Mathematics in the Modern World", "Science, Technology, and Society", "College Calculus"]},
    2: {1: ["Data Structures and Algorithms", "Discrete Structures 2", "Philippine Popular Culture", "P.E./PATHFIT 3: Individual-Dual Sports", "Readings in Philippine History", "Principles of Communication", "Computer Programming 3", "Rizal's Life and Works"],
        2: ["Design and Analysis of Algorithms", "Information Management", "The Entrepreneurial Mind", "Ethics", "P.E./PATHFIT 4: Team Sports", "Computer Systems Architecture", "Human-Computer Interaction", "Fundamentals of Web Programming", "Great Books"]},
    3: {1: ["Theory of Computations with Automata", "Application Development and Emerging Technologies", "Information Assurance and Security (Cybersecurity Fundamentals)", "Quantitative Methods (Data Analysis)", "Intermediate Web Programming", "Artificial Intelligence", "Software Engineering 1", "Methods of Research"],
        2: ["Modeling and Simulation", "Game Programming", "Programming Languages", "Computer Organization", "Software Engineering 2", "GE 11", "Advanced Web Programming", "CS Thesis 1"]},
    4: {1: ["Platform Technology (Operating Systems)", "Network Technology 1", "CS Thesis 2", "Euthenics 2", "Technopreneurship", "Professional Issues in Information Systems and Technology", "Information Assurance and Security (Data Privacy)", "Software Quality Assurance"],
        2: ["CS Practicum (300 hours)"]}
}

tourism_subjects = {
    5: { # Grade 11
        1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Introduction to Travel Services", "Tourism Sales & Marketing Principles"],
        2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth and Life Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Tourism Information Management", "Internet & E-Travel Commerce"]
    },
    6: { # Grade 12
        1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Physical Science", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "Introduction to Travel & Tourism Industry", "Elective (from any Track/Strand subjects)"],
        2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "Tour Guiding & Escorting", "Elective (from any Track/Strand subjects)", "Work Immersion/Research/Career Advocacy/Culminating Activity (Practicum Type)"]
    }
}

shs_subjects = {
    "STEM": {
        5: { # Grade 11
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Pre-Calculus", "General Biology 1"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Basic Calculus", "General Biology 2"]
        },
        6: { # Grade 12
            1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Disaster Readiness and Risk Reduction", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "General Physics 1", "General Chemistry 1"],
            2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "General Physics 2", "General Chemistry 2", "Work Immersion/Capstone Project"]
        }
    },
    "Digital Arts": {
        5: {
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "2D Concepts", "Basic Drawing & Drafting"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth and Life Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Fundamentals of Computer Drawing", "Digital Graphics Design & Image Manipulation"]
        },
        6: {
            1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Physical Science", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "Digital Photography", "Computer Animation"],
            2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "Digital Video & Audio Production", "3D Modelling", "Work Immersion/Practicum"]
        }
    },
    "Culinary": {
        5: {
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Introduction to Culinary Operations", "Basic Food Production 101"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth and Life Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Basic Food Production 102", "Basic Food Production 103"]
        },
        6: {
            1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Physical Science", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "Introduction to Commercial Cookery", "Local & International Cuisines"],
            2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "Catering Management & Control System", "Introduction to Bread & Pastry Production", "Work Immersion/Practicum"]
        }
    },
    "HUMMS": {
        5: {
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Introduction to World Religions and Belief Systems", "Disciplines and Ideas in the Social Sciences"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth and Life Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Creative Writing", "Disciplines and Ideas in the Applied Social Sciences"]
        },
        6: {
            1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Physical Science", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "Creative Nonfiction", "Philippine Politics and Governance"],
            2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "Trends, Networks, and Critical Thinking in the 21st Century", "Community Engagement, Solidarity and Citizenship", "Work Immersion/Capstone Project"]
        }
    },
    "ABM": {
        5: {
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Organization & Management", "Business Mathematics"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth and Life Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Principles of Marketing", "Fundamentals of Accountancy, Business & Management 1"]
        },
        6: {
            1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Physical Science", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "Business Finance", "Fundamentals of Accountancy, Business & Management 2"],
            2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "Applied Economics", "Business Ethics & Social Responsibility", "Work Immersion/Business Enterprise Simulation"]
        }
    },
    "IT-MAWDEV": {
        5: {
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Computer Programming 1 (Java/Intro to Programming)", "Computer Programming 2 (HTML, CSS/Web Interfaces)"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth and Life Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Computer Programming 3 (Intermediate Java Programming)", "Mobile App Programming 1 (Android OS and Java)"]
        },
        6: {
            1: ["Personal Development", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Physical Science", "Physical Education and Health 3", "Practical Research 2", "Filipino sa Piling Larangan", "English for Academic and Professional Purposes", "Computer Programming 4 (C#/Intro to .NET Programming)", "Computer Programming 5 (JavaScript, jQuery)"],
            2: ["Contemporary Philippine Arts from the Regions", "Physical Education and Health 4", "Empowerment Technologies", "Entrepreneurship", "Inquiries, Investigations and Immersion", "Computer Programming 6 (SQL/Intro to ASP.NET)", "Mobile App Programming 2 (Android OS and .NET Framework)", "Work Immersion/Practicum"]
        }
    }
}

# -------------------------
# Generate Sections & Subjects
# -------------------------
sections = []
subjects = []

def classify_subject(name: str):
    # Practical subjects
    practical_keywords = [
        "Physical Education", "National Service Training Program", "Euthenics", 
        "Thesis", "Practicum", "NSTP", "Immersion", "Capstone", "Laboratory",
        "Cookery", "Production", "3D Modelling", "Video & Audio Production",
        "Drawing", "Photography", "Animation"
    ]
    if any(keyword in name for keyword in practical_keywords):
        exam_type = "practical"
    else:
        exam_type = "written"

    # General Education subjects
    general_keywords = [
        "Oral Communication", "General Mathematics", "21st Century Literature",
        "Reading and Writing", "Statistics and Probability", "Understanding Self",
        "Contemporary World", "Purposive Communication", "Ethics", "Art Appreciation",
        "Komunikasyon at Pananaliksik", "Pagbasa at Pagsusuri", "Personal Development",
        "Philosophy", "Literature", "Media and Information Literacy"
    ]
    if name.startswith("GE") or any(keyword in name for keyword in general_keywords):
        category = "general"
    else:
        category = "major"

    return exam_type, category

def generate_subjects(course, year, semester):
    if course.name == "BSIT":
        pool = bsit_subjects
    elif course.name == "BSCS":
        pool = bscs_subjects
    elif course.name == "Tourism":
        pool = tourism_subjects
    else:
        # SHS Strands
        if course.name in shs_subjects:
            pool = shs_subjects[course.name]
        else:
            return []

    if year.id not in pool or semester not in pool[year.id]:
        return []
        
    subj_names = pool[year.id][semester]
    subject_objs = []
    for i, subj_name in enumerate(subj_names, start=1):
        exam_type, category = classify_subject(subj_name)
        
        subj = Subject(
            code=f"{course.name[:2].upper()}{year.id}{semester}{i:02d}",
            name=subj_name,
            course_id=course.id,
            year_level_id=year.id,
            semester=semester,
            teacher_id=random.choice(teacher_ids) if teacher_ids else None,
            exam_type=exam_type,
            category=category
        )
        subject_objs.append(subj)
    return subject_objs

for course in courses:
    for year in year_levels:
        for s in range(1, 5):  # 4 sections
            section = Section(
                name=f"{course.name}-{year.id}{chr(64+s)}",
                course_id=course.id,
                year_level_id=year.id,
            )
            sections.append(section)

        # Add subjects for both semesters
        for semester in [1, 2]:
            subjects.extend(generate_subjects(course, year, semester))

db.add_all(sections)
db.add_all(subjects)
db.commit()

print("Database seeded successfully!")

# -------------------------
# Rooms
# -------------------------
rooms = [Room(name=f"Room {i}") for i in range(101, 301)]  # 200 rooms to fit all sections and concurrent exams
db.add_all(rooms)

# -------------------------
# Timeslots (example: 5 days × 7 slots per day)
# -------------------------
# -------------------------
# Timeslots (7:00 AM – 8:30 PM, 1h30 exam + 30 min break)
# -------------------------
base_date = date.today()
timeslots = []

exam_duration = timedelta(hours=1, minutes=30)
break_duration = timedelta(minutes=30) # Reduced from 1h30m to 30m to create more slots

for d in range(5):  # Generate 5 exam days
    day = base_date + timedelta(days=d)

    # Skip Sunday (6)
    if day.weekday() == 6:
        base_date += timedelta(days=1) # Extend range to find next valid day
        day = base_date + timedelta(days=d) # Re-calculate

    current = datetime.combine(day, time(7, 0))   # Start at 7:00 AM
    cutoff = datetime.combine(day, time(20, 30))  # Last slot must end <= 8:30 PM

    while current + exam_duration <= cutoff:
        start_t = current.time()
        end_t = (current + exam_duration).time()

        timeslots.append(Timeslot(
            date=day,
            start_time=start_t,
            end_time=end_t
        ))

        # move to next slot (exam + break)
        current += exam_duration + break_duration

db.add_all(timeslots)
db.commit()
print("Database seeded successfully with rooms & 1h30 exam + 1h30 break slots!")

# -------------------------
# Dummy Users
# -------------------------
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

# Grab seeded data references
all_teachers = db.query(Teacher).all()
all_sections = db.query(Section).all()

# --- Users (Auth only) ---
# --- Program Head (Admin) ---
program_head = User(
    name="Dr. Maria Santos",
    email="admin@school.edu",
    hashed_password=hash_password("admin123"),
    role="program_head",
)
db.add(program_head)

# --- Proctors (Users for login) ---
proctor_names = [
    "Kertney Balasuela", "M Besa", "J Buenafrancisca", "A Bundang", "M Cadiente",
    "P Cali", "A Dela Peña", "P Flores", "M Garcia", "V Garcia",
    "S Gascon", "I Giray", "D Gongora", "N Guerrero", "J Loreno",
    "L Macaspac", "D Maraya", "R Mariano", "C Mateo", "J Nuque",
    "J Onlagada", "E Pasco", "J Payusan", "L Piñon", "A Ramos",
    "R Salem", "B San Juan", "R Santos", "M See", "J Sison",
    "C Sulapas", "V Vargas", "J Villaganas", "R Villarete"
]

# Add 100 more generic proctors to ensure coverage
for i in range(1, 101):
    proctor_names.append(f"Proctor {i}")


for name in proctor_names:
    t = Teacher(name=name)
    db.add(t)
    db.flush()
    
    p = Proctor(name=name, teacher_id=t.id)
    db.add(p)
    db.flush()
    
    email = f"{name.lower().replace(' ', '.')}@school.edu"
    u = User(
        name=name,
        email=email,
        hashed_password=hash_password("proctor123"),
        role="proctor",
        teacher_id=t.id,
        proctor_id=p.id
    )
    db.add(u)

db.commit()
print(f"Created {len(proctor_names)} test proctor accounts.")

# --- Students (Representative account for each Course + Year Level) ---
student_count = 1
for course in courses:
    # Get year levels relevant to this course's category
    relevant_years = []
    if course.category == "SHS":
        relevant_years = [y for y in year_levels if "Grade" in y.name]
    else:
        relevant_years = [y for y in year_levels if "Year" in y.name]

    for year in relevant_years:
        # Find the first section for this course + year combination
        section = db.query(Section).filter(
            Section.course_id == course.id,
            Section.year_level_id == year.id
        ).first()
        
        if section:
            email_prefix = f"student_{course.name.lower().replace(' ', '_').replace('-', '_')}_{year.name.lower().replace(' ', '_')}"
            student_user = User(
                name=f"Student {course.name} ({year.name})",
                email=f"{email_prefix}@school.edu",
                hashed_password=hash_password("student123"),
                role="student",
                section_name=section.name,
            )
            db.add(student_user)
            student_count += 1

db.commit()
print(f"Successfully seeded {student_count-1} student accounts!")
print("Dummy users seeded successfully!")
print("\n=== DUMMY LOGIN CREDENTIALS ===")
print("Program Head : admin@school.edu       / admin123")
print("Students     : student1@school.edu ... student5@school.edu / student123")

# ─── Step 2: Add missing DB columns (idempotent migration) ───────────────────
print("\n[Step 2] Running migrations...")
from sqlalchemy import text as _text
with engine.connect() as _conn:
    _conn.execute(_text("ALTER TABLE teacher_schedules ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE"))
    _conn.commit()
print("  [OK] teacher_schedules.is_published column ensured.")

# ─── Step 3: Seed proctors from Excel ───────────────────────────────────────
# print("\n[Step 3] Seeding proctor accounts from ICT SY2526 T2.xlsx...")
# try:
#     import subprocess, sys
#     result = subprocess.run(
#         [sys.executable, "process_proctors.py"],
#         capture_output=True, text=True, cwd=str(__file__).replace("seed.py", "")
#     )
#     if result.returncode == 0:
#         print("  [OK] Proctor accounts seeded successfully.")
#     else:
#         print("  [FAIL] process_proctors.py failed:")
#         print(result.stderr[-500:])
# except Exception as e:
#     print(f"  [FAIL] Error running process_proctors.py: {e}")

print("\n=== SETUP COMPLETE ===")
print("Proctors: <name>@school.edu / proctor123")
print("  e.g.  kertney.pionelo.balasuela@school.edu / proctor123")

