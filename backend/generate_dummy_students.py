import pandas as pd
import random
import os
import sys

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core import SessionLocal
from model import Section, Course, Subject

# List of common last names in the Philippines
last_names = [
    "Santos", "Reyes", "Cruz", "Diaz", "Ramos", "Mendoza", "Garcia", "Castillo", 
    "Flores", "Villanueva", "Aquino", "Lopez", "Dela Cruz", "Bautista", "Torres", 
    "Gonzales", "Sy", "Tan", "Lim", "Castro", "Corpuz", "Valenzuela", "Salvador",
    "Santiago", "Rivera", "Mercado", "Del Rosario", "Pascual", "Gomez", "Aquino"
]

# List of first names
first_names = [
    "Juan", "Maria", "Jose", "Pedro", "Ana", "Angela", "Bryan", "Christian", 
    "David", "Elaine", "Fiona", "Gabriel", "Hannah", "Ian", "Joshua", "Karen", 
    "Leo", "Mark", "Nikki", "Olivia", "Paul", "Rachel", "Sarah", "Timothy", 
    "Vanessa", "William", "Zachary", "John", "James", "Mary", "Grace", "Patricia", 
    "Michael", "Robert", "Joseph", "Daniel", "Christopher", "Matthew", "Anthony", 
    "Elizabeth", "Jennifer", "Linda", "Barbara", "Susan", "Margaret", "Dorothy", 
    "Lisa", "Nancy", "Sandra", "Donna", "Carol", "Ruth", "Sharon", "Michelle", 
    "Laura", "Kimberly", "Deborah", "Jessica", "Shirley", "Cynthia", "Melissa", 
    "Brenda", "Amy", "Anna", "Rebecca", "Virginia", "Kathleen", "Pamela", "Martha", 
    "Debra", "Amanda", "Stephanie", "Carolyn", "Christine", "Marie", "Janet", 
    "Catherine", "Frances", "Ann", "Joyce", "Diane", "Alice", "Julie", "Heather", 
    "Teresa", "Doris", "Gloria", "Evelyn", "Jean", "Cheryl", "Mildred", "Katherine", 
    "Joan", "Ashley", "Judith", "Rose", "Janice", "Kelly", "Nicole", "Judy", 
    "Christina", "Kathy", "Theresa", "Beverly", "Denise", "Tammy", "Irene", "Jane"
]

def generate_students():
    db = SessionLocal()
    try:
        # Fetch all sections with their course names
        db_sections = db.query(Section).join(Course).all()
        if not db_sections:
            print("No sections found in database. Seeding must be run first.")
            return

        db_subjects = db.query(Subject).join(Course).filter(Subject.exam_type == "written").all()
        
        # Build index of sections for each subject
        subject_sections_map = {}
        for s in db_subjects:
            matching_secs = [sec for sec in db_sections if sec.course_id == s.course_id]
            if s.year_level_id:
                secs_same_year = [sec for sec in matching_secs if sec.year_level_id == s.year_level_id]
                if secs_same_year:
                    matching_secs = secs_same_year
            if not matching_secs:
                matching_secs = db_sections
            subject_sections_map[s.id] = matching_secs

        subjects_by_course = {}
        all_ge_subjects = []
        for s in db_subjects:
            c_name = s.course.name if s.course else "General"
            subjects_by_course.setdefault(c_name, []).append(s)
            if s.category == "general":
                all_ge_subjects.append(s)

        print(f"Loaded {len(db_sections)} sections and {len(db_subjects)} subjects from database.")

        students = []
        used_emails = set()
        used_ids = set()
        
        # Helper to generate unique student ID: format 02000 + 6 digits (e.g. 02000352553)
        def generate_unique_id():
            while True:
                six_digits = f"{random.randint(100000, 999999)}"
                sid = f"02000{six_digits}"
                if sid not in used_ids:
                    used_ids.add(sid)
                    return sid

        # Generate regular students: 35 to 40 per section
        for sec in db_sections:
            num_students = random.randint(35, 40)
            for _ in range(num_students):
                school_id = generate_unique_id()
                while True:
                    first = random.choice(first_names)
                    last = random.choice(last_names)
                    name = f"{first} {last}"
                    clean_last = last.lower().replace(" ", "").replace(".", "")
                    email = f"{clean_last}_{school_id}_@ortigas-cainta.sti.edu"
                    if email not in used_emails:
                        break
                
                used_emails.add(email)
                students.append({
                    "ID": school_id,
                    "NAME": name,
                    "COURSE": sec.course.name,
                    "SECTION": sec.name,
                    "SCHOOL EMAIL": email,
                    "STATUS": "regular",
                    "SUBJECT 1": "",
                    "SECTION 1": "",
                    "SUBJECT 2": "",
                    "SECTION 2": "",
                    "SUBJECT 3": "",
                    "SECTION 3": "",
                    "SUBJECT 4": "",
                    "SECTION 4": "",
                    "SUBJECT 5": "",
                    "SECTION 5": "",
                    "SUBJECT 6": "",
                    "SECTION 6": "",
                })

        # Add 150 irregular students with their subjects in different sections
        for _ in range(150):
            school_id = generate_unique_id()
            while True:
                first = random.choice(first_names)
                last = random.choice(last_names)
                name = f"{first} {last}"
                clean_last = last.lower().replace(" ", "").replace(".", "")
                email = f"{clean_last}_{school_id}_@ortigas-cainta.sti.edu"
                if email not in used_emails:
                    break
            
            used_emails.add(email)
            random_sec = random.choice(db_sections)
            student_course = random_sec.course
            course_name = student_course.name
            student_dept = student_course.category  # "College" or "SHS"

            # ── Subject selection rules ──────────────────────────────────────
            # RULE 1: Major subjects MUST be strictly from their own course.
            #         Irregular students take major subjects across low or high year levels of their own course.
            own_majors = [
                s for s in db_subjects 
                if s.course_id == student_course.id and s.category == "major"
            ]
            
            # RULE 2: Minor/General subjects can be from their own course OR other courses,
            #         BUT strictly within the same department (College for College, SHS for SHS).
            same_dept_minors = [
                s for s in db_subjects 
                if s.category == "general" and s.course and s.course.category == student_dept
            ]

            # Pick 2-4 major subjects from their own course
            n_majors = min(random.randint(2, 4), len(own_majors))
            picked_majors = random.sample(own_majors, n_majors) if own_majors else []

            # Pick 1-3 minor/general subjects from the same department
            n_minors = min(random.randint(1, 3), len(same_dept_minors))
            picked_minors = random.sample(same_dept_minors, n_minors) if same_dept_minors else []

            picked_subs = picked_majors + picked_minors

            # Fallback if needed to have at least 4 subjects
            if len(picked_subs) < 4:
                own_remaining = [s for s in db_subjects if s.course_id == student_course.id and s not in picked_subs]
                if own_remaining:
                    picked_subs.extend(random.sample(own_remaining, min(4 - len(picked_subs), len(own_remaining))))

            # Assign each subject to a DIFFERENT section that actually offers that subject/course
            student_used_sections = set()
            paired_subjects_sections = []
            
            for sub in picked_subs:
                valid_secs = subject_sections_map.get(sub.id, [])
                if not valid_secs:
                    valid_secs = [sec for sec in db_sections if sec.course_id == sub.course_id]
                if not valid_secs:
                    valid_secs = [sec for sec in db_sections if sec.course and sec.course.category == student_dept]
                
                # Filter for unused sections to ensure subjects are in different sections
                unused_secs = [s for s in valid_secs if s.name not in student_used_sections]
                chosen_sec = random.choice(unused_secs) if unused_secs else (random.choice(valid_secs) if valid_secs else random_sec)
                student_used_sections.add(chosen_sec.name)
                paired_subjects_sections.append((sub.name, chosen_sec.name))

            row = {
                "ID": school_id,
                "NAME": name,
                "COURSE": course_name,
                "SECTION": "IRREGULAR",
                "SCHOOL EMAIL": email,
                "STATUS": "irregular",
            }
            
            # Populate SUBJECT 1..6 and SECTION 1..6
            for idx in range(1, 7):
                if idx <= len(paired_subjects_sections):
                    sub_name, sec_name = paired_subjects_sections[idx - 1]
                    row[f"SUBJECT {idx}"] = sub_name
                    row[f"SECTION {idx}"] = sec_name
                else:
                    row[f"SUBJECT {idx}"] = ""
                    row[f"SECTION {idx}"] = ""

            students.append(row)

        df = pd.DataFrame(students)
        
        # Define output paths
        # Primary destination: data/import/dummy_students.xlsx
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        data_import_dir = os.path.join(project_root, "data", "import")
        os.makedirs(data_import_dir, exist_ok=True)
        dest_data_import = os.path.join(data_import_dir, "dummy_students.xlsx")

        frontend_public_dir = os.path.join(project_root, "frontend", "public")
        os.makedirs(frontend_public_dir, exist_ok=True)
        dest_frontend_default = os.path.join(frontend_public_dir, "dummy_students.xlsx")
        dest_frontend_3000 = os.path.join(frontend_public_dir, "dummy_students_3000.xlsx")
        dest_root_default = os.path.join(project_root, "dummy_students.xlsx")
        dest_root_3000 = os.path.join(project_root, "dummy_students_3000.xlsx")
        
        # Save Excel files to all required destinations
        df.to_excel(dest_data_import, index=False)
        df.to_excel(dest_frontend_default, index=False)
        df.to_excel(dest_frontend_3000, index=False)
        df.to_excel(dest_root_default, index=False)
        df.to_excel(dest_root_3000, index=False)
        
        reg_count = sum(1 for s in students if s["STATUS"] == "regular")
        irr_count = sum(1 for s in students if s["STATUS"] == "irregular")
        print(f"Generated Excel with {len(students)} dummy students ({reg_count} regular, {irr_count} irregular):")
        print(f"  - Primary (data/import): {dest_data_import}")
        print(f"  - Frontend public: {dest_frontend_default}")
        print(f"  - Project root: {dest_root_default}")
        
    except Exception as e:
        print(f"Error generating dummy students: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    generate_students()
