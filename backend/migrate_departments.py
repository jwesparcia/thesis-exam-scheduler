import os
import dotenv
import bcrypt
from sqlalchemy import create_engine, text

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, ".env")
dotenv.load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in environment or .env")

engine = create_engine(DATABASE_URL)

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def run_department_migration():
    print("Running Department & Multi-Admin migration...")
    with engine.connect() as conn:
        # 1. Create departments table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                code VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(150) UNIQUE NOT NULL,
                description TEXT NULL,
                is_general_education BOOLEAN DEFAULT FALSE,
                is_super BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.commit()
        print("[OK] departments table ensured.")

        # 2. Seed departments
        departments = [
            ("GE", "General Education", "Oversees core curriculum, general education courses, and university-wide scheduling.", True, True),
            ("ICT", "Information and Communications Technology", "Department for BSIT, BSCS, and BSCpE programs.", False, False),
            ("BM", "Business and Management", "Department for Accountancy (BSA) and Business Administration.", False, False),
            ("THM", "Tourism and Hospitality Management", "Department for BSTM and BSHM programs.", False, False),
            ("AS", "Arts and Sciences", "Department for BSPsych, BMMA, and BACOMM programs.", False, False),
            ("CRIM", "Criminology", "Department for BSCrim program.", False, False),
            ("SHS", "Senior High School", "Department for all Senior High School strands (STEM, ABM, HUMMS, etc.).", False, False),
        ]
        for code, name, desc, is_ge, is_super in departments:
            conn.execute(text("""
                INSERT INTO departments (code, name, description, is_general_education, is_super)
                VALUES (:code, :name, :desc, :is_ge, :is_super)
                ON CONFLICT (code) DO UPDATE
                SET name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    is_general_education = EXCLUDED.is_general_education,
                    is_super = EXCLUDED.is_super;
            """), {"code": code, "name": name, "desc": desc, "is_ge": is_ge, "is_super": is_super})
        conn.commit()
        print("[OK] Seeded 7 departments.")

        # 3. Add department_code to courses
        conn.execute(text("""
            ALTER TABLE courses
            ADD COLUMN IF NOT EXISTS department_code VARCHAR(20) REFERENCES departments(code);
        """))
        conn.commit()

        # Update course department mappings
        course_dept_map = {
            "BSIT": "ICT",
            "BSCS": "ICT",
            "BSCpE": "ICT",
            "BSTM": "THM",
            "BSHM": "THM",
            "BSA": "BM",
            "BSPsych": "AS",
            "BSCrim": "CRIM",
            "BMMA": "AS",
            "BACOMM": "AS",
            "STEM": "SHS",
            "ABM": "SHS",
            "HUMMS": "SHS",
            "Culinary": "SHS",
            "Digital Arts": "SHS",
            "IT-MAWDEV": "SHS",
            "Tourism": "SHS",
        }
        for cname, dcode in course_dept_map.items():
            conn.execute(text("""
                UPDATE courses SET department_code = :dcode WHERE name = :cname;
            """), {"dcode": dcode, "cname": cname})
        conn.commit()
        print("[OK] Linked courses to department codes.")

        # 4. Add department_code to subjects
        conn.execute(text("""
            ALTER TABLE subjects
            ADD COLUMN IF NOT EXISTS department_code VARCHAR(20) REFERENCES departments(code);
        """))
        conn.commit()

        # Update subjects: if general education category or starts with GE -> GE, else course's department_code
        conn.execute(text("""
            UPDATE subjects
            SET department_code = 'GE'
            WHERE category = 'general'
               OR LOWER(code) LIKE 'ge%'
               OR LOWER(name) IN (
                   'understanding the self', 'the contemporary world', 'purposive communication',
                   'art appreciation', 'ethics', 'readings in philippine history', 'mathematics in the modern world',
                   'science, technology, and society', 'life and works of rizal', 'physical education 1',
                   'physical education 2', 'physical education 3', 'physical education 4', 'nstp 1', 'nstp 2',
                   'euthenics 1', 'euthenics 2', 'philippine popular culture', 'the entrepreneurial mind'
               );
        """))
        conn.execute(text("""
            UPDATE subjects s
            SET department_code = c.department_code
            FROM courses c
            WHERE s.course_id = c.id
              AND (s.department_code IS NULL OR s.department_code = '');
        """))
        conn.commit()
        print("[OK] Initialized subject department_code assignments.")

        # 5. Create subject_programs table for multiple program assignments
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS subject_programs (
                id SERIAL PRIMARY KEY,
                subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_subject_course UNIQUE (subject_id, course_id)
            );
        """))
        conn.commit()

        # Populate subject_programs from existing subjects
        conn.execute(text("""
            INSERT INTO subject_programs (subject_id, course_id)
            SELECT id, course_id FROM subjects
            WHERE course_id IS NOT NULL
            ON CONFLICT (subject_id, course_id) DO NOTHING;
        """))
        conn.commit()
        print("[OK] subject_programs junction table initialized.")

        # 6. Add department_code and is_super_admin to users
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS department_code VARCHAR(20) REFERENCES departments(code);
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
        """))
        conn.commit()
        print("[OK] user columns department_code and is_super_admin added.")

        # 7. Update existing admin to GE Super Admin
        conn.execute(text("""
            UPDATE users
            SET department_code = 'GE', is_super_admin = TRUE
            WHERE email = 'admin@school.edu' OR role = 'program_head' AND is_super_admin IS NOT TRUE;
        """))
        conn.commit()

        # 8. Seed dedicated administrator account per department
        admin_accounts = [
            ("GE Administrator (Super Admin)", "ge.admin@school.edu", "GE", True),
            ("ICT Department Administrator", "ict.admin@school.edu", "ICT", False),
            ("BM Department Administrator", "bm.admin@school.edu", "BM", False),
            ("THM Department Administrator", "thm.admin@school.edu", "THM", False),
            ("AS Department Administrator", "as.admin@school.edu", "AS", False),
            ("CRIM Department Administrator", "crim.admin@school.edu", "CRIM", False),
            ("SHS Department Administrator", "shs.admin@school.edu", "SHS", False),
        ]
        hashed = hash_password("admin123")
        for aname, aemail, adcode, asuper in admin_accounts:
            conn.execute(text("""
                INSERT INTO users (name, email, hashed_password, role, department_code, is_super_admin, is_first_login)
                VALUES (:name, :email, :hashed, 'program_head', :dcode, :is_super, FALSE)
                ON CONFLICT (email) DO UPDATE
                SET name = EXCLUDED.name,
                    department_code = EXCLUDED.department_code,
                    is_super_admin = EXCLUDED.is_super_admin,
                    role = 'program_head';
            """), {"name": aname, "email": aemail, "hashed": hashed, "dcode": adcode, "is_super": asuper})
        conn.commit()
        print("[OK] Ensured dedicated administrator accounts for all 7 departments.")

        # 9. Add department_code to rescheduling_requests and backfill
        conn.execute(text("""
            ALTER TABLE rescheduling_requests
            ADD COLUMN IF NOT EXISTS department_code VARCHAR(20) REFERENCES departments(code);
        """))
        conn.commit()

        # Backfill rescheduling_requests department_code based on student program or course
        for cname, dcode in course_dept_map.items():
            conn.execute(text("""
                UPDATE rescheduling_requests
                SET department_code = :dcode
                WHERE (program = :cname OR course_code LIKE :cprefix)
                  AND (department_code IS NULL OR department_code = '');
            """), {"dcode": dcode, "cname": cname, "cprefix": f"{cname}%"})
        conn.commit()

        # Fallback for any remaining unassigned requests: match via exam's course
        conn.execute(text("""
            UPDATE rescheduling_requests r
            SET department_code = c.department_code
            FROM exams e
            JOIN courses c ON e.course_id = c.id
            WHERE r.exam_id = e.id
              AND (r.department_code IS NULL OR r.department_code = '');
        """))
        conn.commit()
        print("[OK] Backfilled rescheduling_requests with department_code.")

    print("\n=== MIGRATION COMPLETE! ===")

if __name__ == "__main__":
    run_department_migration()
