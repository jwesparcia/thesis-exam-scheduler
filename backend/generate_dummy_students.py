import pandas as pd
import random
import os
import sys

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Section, Course

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

        section_pool = []
        for sec in db_sections:
            section_pool.append({
                "course": sec.course.name,
                "section": sec.name
            })
        
        print(f"Loaded {len(section_pool)} sections from database.")

        students = []
        used_emails = set()
        
        # Generate regular students: 35 to 40 per section
        for sec in db_sections:
            num_students = random.randint(35, 40)
            for _ in range(num_students):
                # Retry until email is unique
                while True:
                    first = random.choice(first_names)
                    last = random.choice(last_names)
                    name = f"{first} {last}"
                    school_id = f"02{random.randint(10000000, 99999999)}"
                    clean_last = last.lower().replace(" ", "").replace(".", "")
                    email = f"{clean_last}_{school_id}_@ortigas-cainta.sti.edu"
                    if email not in used_emails:
                        break
                
                used_emails.add(email)
                students.append({
                    "COURSE": sec.course.name,
                    "SECTION": sec.name,
                    "NAME": name,
                    "SCHOOL EMAIL": email,
                    "STATUS": "regular"
                })

        # Add 150 irregular students for testing irregular features
        for _ in range(150):
            while True:
                first = random.choice(first_names)
                last = random.choice(last_names)
                name = f"{first} {last}"
                school_id = f"02{random.randint(10000000, 99999999)}"
                clean_last = last.lower().replace(" ", "").replace(".", "")
                email = f"{clean_last}_{school_id}_@ortigas-cainta.sti.edu"
                if email not in used_emails:
                    break
            
            used_emails.add(email)
            
            # Pick a random course
            random_sec = random.choice(db_sections)
            students.append({
                "COURSE": random_sec.course.name,
                "SECTION": "",
                "NAME": name,
                "SCHOOL EMAIL": email,
                "STATUS": "irregular"
            })

        df = pd.DataFrame(students)
        
        # Define output paths
        frontend_public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public"))
        if not os.path.exists(frontend_public_dir):
            os.makedirs(frontend_public_dir)
            
        dest_frontend = os.path.join(frontend_public_dir, "dummy_students_3000.xlsx")
        dest_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dummy_students_3000.xlsx"))
        
        # Save Excel file
        df.to_excel(dest_frontend, index=False)
        df.to_excel(dest_root, index=False)
        
        print(f"Generated Excel with {len(students)} dummy students:")
        print(f"  - Saved to: {dest_frontend}")
        print(f"  - Saved to: {dest_root}")
        
    except Exception as e:
        print(f"Error generating dummy students: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    generate_students()
