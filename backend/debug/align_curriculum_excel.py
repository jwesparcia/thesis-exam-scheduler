import hashlib
import os
import re
from collections import defaultdict

import openpyxl
import pandas as pd
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


COURSE_ORDER = [
    # College (10 programs)
    ("BSIT", "College", "ICT", "IT"),
    ("BSCS", "College", "ICT", "CS"),
    ("BSCpE", "College", "ICT", "CP"),
    ("BSTM", "College", "THM", "TM"),
    ("BSHM", "College", "THM", "HM"),
    ("BSA", "College", "BM", "BA"),
    ("BSPsych", "College", "AS", "PS"),
    ("BSCrim", "College", "CRIM", "CR"),
    ("BMMA", "College", "AS", "MM"),
    ("BACOMM", "College", "AS", "AC"),
    # SHS (7 strands)
    ("Tourism", "SHS", "SHS", "TO"),
    ("STEM", "SHS", "SHS", "ST"),
    ("Digital Arts", "SHS", "SHS", "DA"),
    ("Culinary", "SHS", "SHS", "CU"),
    ("HUMMS", "SHS", "SHS", "HU"),
    ("ABM", "SHS", "SHS", "AB"),
    ("IT-MAWDEV", "SHS", "SHS", "MW"),
]

YEAR_ID_TO_NAME = {
    1: "1st Year",
    2: "2nd Year",
    3: "3rd Year",
    4: "4th Year",
    5: "Grade 11",
    6: "Grade 12",
}

SHS_SEM3_DATA = {
    "STEM": [
        ("ST5301", "General Chemistry 1", 5),
        ("ST5302", "Earth and Life Science", 5),
        ("ST5303", "Disaster Readiness and Risk Reduction", 5),
        ("ST5304", "Physical Education and Health 2B", 5),
        ("ST5305", "English for Academic and Professional Purposes", 5),
        ("ST6301", "General Physics 2", 6),
        ("ST6302", "Inquiries, Investigations and Immersion", 6),
        ("ST6303", "Media Arts and Design", 6),
        ("ST6304", "Work Immersion/Culminating Activity", 6),
    ],
    "Digital Arts": [
        ("DA5301", "3D Basics", 5),
        ("DA5302", "Vector Graphics", 5),
        ("DA5303", "Media and Information Literacy 2", 5),
        ("DA5304", "English for Academic and Professional Purposes", 5),
        ("DA6301", "Interactive Media", 6),
        ("DA6302", "Visual Effects and Motion Graphics", 6),
        ("DA6303", "Portfolio Development", 6),
    ],
    "Culinary": [
        ("CU5301", "Food Sanitation and Safety", 5),
        ("CU5302", "Baking Science", 5),
        ("CU5303", "Kitchen Operations", 5),
        ("CU6301", "International Gastronomy", 6),
        ("CU6302", "Beverage Management", 6),
        ("CU6303", "Menu Planning and Costing", 6),
    ],
    "HUMMS": [
        ("HU5301", "Philippine Politics and Governance", 5),
        ("HU5302", "Creative Nonfiction", 5),
        ("HU5303", "Social Science Research", 5),
        ("HU6301", "Community Engagement and Solidarity", 6),
        ("HU6302", "Trends, Networks, and Critical Thinking", 6),
    ],
    "ABM": [
        ("AB5301", "Applied Economics", 5),
        ("AB5302", "Business Finance Basics", 5),
        ("AB5303", "Marketing Principles", 5),
        ("AB6301", "Business Enterprise Simulation", 6),
        ("AB6302", "Business Ethics and Social Responsibility", 6),
    ],
    "IT-MAWDEV": [
        ("IT5301", "Database Management Systems", 5),
        ("IT5302", "Object-Oriented Programming (Java)", 5),
        ("IT5303", "Client-Side Scripting", 5),
        ("IT6301", "Mobile Applications Development", 6),
        ("IT6302", "Web Systems and Technologies", 6),
        ("IT6303", "IT Capstone Project", 6),
    ],
    "Tourism": [
        ("TO5301", "Tourism Promotion Services", 5),
        ("TO5302", "Philippine Tourism Geography", 5),
        ("TO5303", "Customer Service in Tourism", 5),
        ("TO6301", "Tour Guiding Services", 6),
        ("TO6302", "Travel Agency Management", 6),
        ("TO6303", "Events Management", 6),
    ],
}


def clean_str(val):
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    if s.lower() == "nan":
        return ""
    s = s.replace("Pea", "Peña").replace("Pion", "Piñon")
    return s


def classify_subject(name: str):
    name_lower = name.lower()

    practical_keywords = [
        "physical education", "national service training program", "euthenics",
        "thesis", "practicum", "nstp", "immersion", "capstone", "laboratory",
        "pathfit", "p.e.", "lab",
        "methods of research", "practical research", "research methods",
        "inquiries, investigations", "work immersion", "portfolio development",
    ]
    if any(k in name_lower for k in practical_keywords):
        exam_type = "practical"
    else:
        exam_type = "written"

    general_keywords = [
        "oral communication", "general mathematics", "21st century literature",
        "reading and writing", "statistics and probability", "understanding the self",
        "understanding self", "understanding culture, society",
        "contemporary world", "purposive communication", "ethics", "art appreciation",
        "komunikasyon at pananaliksik", "pagbasa at pagsusuri", "personal development",
        "philosophy", "literature", "media and information literacy",
        "euthenics", "national service training program", "rotc", "p.e./pathfit",
        "physical education", "readings in philippine history", "rizal",
        "philippine popular culture", "the entrepreneurial mind",
        "mathematics in the modern world", "science, technology",
        "great books", "foreign language", "general physics", "general chemistry",
        "general biology", "disaster readiness", "earth science", "physical science",
        "earth and life science", "filipino sa piling larangan",
    ]
    if name_lower.startswith("ge") or any(k in name_lower for k in general_keywords):
        category = "general"
    else:
        category = "major"

    return exam_type, category


def load_subject_pools_from_seed(seed_path: str):
    with open(seed_path, "r", encoding="utf-8") as f:
        code = f.read()

    start_marker = "# Subject Pools"
    end_marker = "# Generate Sections & Subjects"
    s_idx = code.index(start_marker)
    e_idx = code.index(end_marker)
    snippet = code[s_idx:e_idx]

    ns = {}
    exec(snippet, ns)

    pools = {
        "BSIT": ns["bsit_subjects"],
        "BSCS": ns["bscs_subjects"],
        "BSCpE": ns["bscpe_subjects"],
        "BSTM": ns["bstm_subjects"],
        "BSHM": ns["bshm_subjects"],
        "BSA": ns["bsa_subjects"],
        "BSPsych": ns["bspsych_subjects"],
        "BSCrim": ns["bscrim_subjects"],
        "BMMA": ns["bmma_subjects"],
        "BACOMM": ns["bacomm_subjects"],
        "Tourism": ns["tourism_subjects"],
    }
    for strand, strand_map in ns["shs_subjects"].items():
        pools[strand] = strand_map
    return pools


def extract_sections_from_dummy_students(students_excel_path: str):
    """
    Collects all sections referenced in dummy_students.xlsx across both regular
    students (SECTION) and irregular students (SECTION 1 .. SECTION 6), mapped
    to (course_name, year_id, semester_or_none).
    """
    df = pd.read_excel(students_excel_path)
    raw_sections = set()

    for _, row in df.iterrows():
        status = clean_str(row.get("STATUS")).lower()
        sec_main = clean_str(row.get("SECTION"))
        if status != "irregular" and sec_main and sec_main.upper() != "IRREGULAR":
            raw_sections.add(sec_main)
        for i in range(1, 7):
            col = f"SECTION {i}"
            if col in df.columns:
                sv = clean_str(row.get(col))
                if sv and sv.upper() != "IRREGULAR":
                    raw_sections.add(sv)

    known_courses = [c[0] for c in COURSE_ORDER]
    known_courses_sorted = sorted(known_courses, key=len, reverse=True)

    # Key: (course_name, year_id, sem_or_none) -> sorted list of section names
    grouped = defaultdict(set)
    for sec in raw_sections:
        matched_course = None
        for cname in known_courses_sorted:
            if sec.startswith(cname + " ") or sec.startswith(cname + "-"):
                matched_course = cname
                break
        if not matched_course:
            continue

        suffix = sec[len(matched_course):].strip()
        if suffix.startswith("-"):
            suffix = suffix[1:].strip()

        # College pattern: e.g. "1-101" -> year=1, sem=1
        m_col = re.match(r"^([1-4])-([1-3])\d+$", suffix)
        if m_col:
            y_id = int(m_col.group(1))
            sem = int(m_col.group(2))
            grouped[(matched_course, y_id, sem)].add(sec)
            continue

        # SHS pattern: e.g. "5A" / "6D" -> year=5/6, sem=None (applies to Sem 1, 2, 3)
        m_shs = re.match(r"^([56])[A-Za-z]+$", suffix)
        if m_shs:
            y_id = int(m_shs.group(1))
            grouped[(matched_course, y_id, None)].add(sec)

    return {k: sorted(v) for k, v in grouped.items()}


def load_teacher_directory(proctors_path: str, bak_curriculum_path: str):
    """
    Loads existing (course, subject_name) -> teacher mappings from backup curriculum
    plus department-grouped teachers from dummy_proctors.xlsx so all teachers align.
    """
    proctors_by_dept = defaultdict(list)
    all_proctors = []
    if os.path.exists(proctors_path):
        df_p = pd.read_excel(proctors_path)
        for _, r in df_p.iterrows():
            name = clean_str(r.get("NAME"))
            dept = clean_str(r.get("DEPARTMENT")) or "College"
            if name:
                proctors_by_dept[dept].append(name)
                all_proctors.append(name)

    existing_teacher_map = {}
    if os.path.exists(bak_curriculum_path):
        xl = pd.ExcelFile(bak_curriculum_path)
        for sh in xl.sheet_names:
            df_b = pd.read_excel(xl, sh)
            if df_b.empty:
                continue
            for _, r in df_b.iterrows():
                c = clean_str(r.get("Course"))
                s = clean_str(r.get("Subject Name"))
                t = clean_str(r.get("Teacher Name"))
                if c and s and t:
                    existing_teacher_map.setdefault((c, s.lower()), t)
                    existing_teacher_map.setdefault(("*", s.lower()), t)

    def pick_teacher(course_name: str, course_cat: str, dept_code: str, subj_name: str, subj_cat: str) -> str:
        s_key = subj_name.lower()
        if (course_name, s_key) in existing_teacher_map:
            return existing_teacher_map[(course_name, s_key)]
        if subj_cat == "general" and ("*", s_key) in existing_teacher_map:
            return existing_teacher_map[("*", s_key)]

        if course_cat == "SHS":
            pool = proctors_by_dept.get("SHS") or all_proctors
        elif subj_cat == "general":
            pool = proctors_by_dept.get("GE") or proctors_by_dept.get("AS") or all_proctors
        else:
            # CRIM courses can be taught by AS/CRIM faculty if CRIM proctors aren't listed separately
            pool = (
                proctors_by_dept.get(dept_code)
                or proctors_by_dept.get("AS")
                or proctors_by_dept.get("ICT")
                or all_proctors
            )
        if not pool:
            return "TBA"
        digest = int(hashlib.md5(f"{course_name}:{subj_name}".encode("utf-8")).hexdigest(), 16)
        return pool[digest % len(pool)]

    return pick_teacher


def generate_aligned_curriculum():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    seed_path = os.path.join(project_root, "backend", "seed.py")

    students_candidates = [
        os.path.join(project_root, "data", "import", "dummy_students.xlsx"),
        os.path.join(project_root, "dummy_students.xlsx"),
    ]
    students_path = next((p for p in students_candidates if os.path.exists(p)), None)
    if not students_path:
        raise FileNotFoundError("dummy_students.xlsx not found!")

    proctors_path = os.path.join(project_root, "data", "import", "dummy_proctors.xlsx")
    if not os.path.exists(proctors_path):
        proctors_path = os.path.join(project_root, "dummy_proctors.xlsx")

    bak_curriculum_path = os.path.join(project_root, "data", "import", "school_curriculum_sample_edited.xlsx.bak")

    pools = load_subject_pools_from_seed(seed_path)
    section_groups = extract_sections_from_dummy_students(students_path)
    pick_teacher = load_teacher_directory(proctors_path, bak_curriculum_path)

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    data_font = Font(name="Calibri", size=10)
    data_align_left = Alignment(horizontal="left", vertical="center")
    data_align_center = Alignment(horizontal="center", vertical="center")

    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    columns = [
        "Course", "Category", "Year Level", "Section",
        "Subject Code", "Subject Name", "Teacher Name",
        "Subject Category", "Exam Type",
    ]

    sheet_configs = [
        ("1st Semester", 1),
        ("2nd Semester", 2),
        ("3rd Semester", 3),
    ]

    summary_counts = {}
    unique_sections_written = set()

    for sheet_name, sem_num in sheet_configs:
        ws = wb.create_sheet(title=sheet_name)
        ws.row_dimensions[1].height = 28
        for col_idx, col_name in enumerate(columns, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align

        row_idx = 2
        sheet_secs = set()

        for course_name, course_cat, dept_code, code_prefix in COURSE_ORDER:
            course_pool = pools.get(course_name, {})
            year_ids = [1, 2, 3, 4] if course_cat == "College" else [5, 6]

            for y_id in year_ids:
                year_label = YEAR_ID_TO_NAME[y_id]

                if course_cat == "College":
                    if sem_num in (1, 2):
                        secs = section_groups.get((course_name, y_id, sem_num), [])
                        raw_subs = course_pool.get(y_id, {}).get(sem_num, [])
                    else:
                        # 3rd Semester (Summer/Practicum) reuses 2nd-semester sections of that year
                        raw_subs = course_pool.get(y_id, {}).get(3, [])
                        secs = section_groups.get((course_name, y_id, 2), []) if raw_subs else []
                else:
                    secs = section_groups.get((course_name, y_id, None), [])
                    if sem_num in (1, 2):
                        raw_subs = course_pool.get(y_id, {}).get(sem_num, [])
                    else:
                        raw_subs = [
                            (c, n) for (c, n, yl) in SHS_SEM3_DATA.get(course_name, [])
                            if yl == y_id
                        ]

                if not secs or not raw_subs:
                    continue

                # Build canonical subject entries for this (course, year, sem)
                subj_entries = []
                for idx_s, item in enumerate(raw_subs, 1):
                    if isinstance(item, tuple):
                        s_code, s_name = item[0], item[1]
                    else:
                        s_name = item
                        s_code = f"{code_prefix}{y_id}{sem_num}{idx_s:02d}"

                    exam_type, subj_cat = classify_subject(s_name)
                    teacher_name = pick_teacher(course_name, course_cat, dept_code, s_name, subj_cat)
                    subj_entries.append((s_code, s_name, teacher_name, subj_cat, exam_type))

                for sec_name in secs:
                    sheet_secs.add(sec_name)
                    unique_sections_written.add(sec_name)
                    for s_code, s_name, teacher_name, subj_cat, exam_type in subj_entries:
                        row_data = [
                            course_name,
                            course_cat,
                            year_label,
                            sec_name,
                            s_code,
                            s_name,
                            teacher_name,
                            subj_cat,
                            exam_type,
                        ]
                        ws.row_dimensions[row_idx].height = 20
                        is_alt = (row_idx % 2 == 1)
                        for col_idx, val in enumerate(row_data, 1):
                            cell = ws.cell(row=row_idx, column=col_idx, value=val)
                            cell.font = data_font
                            cell.border = thin_border
                            if is_alt:
                                cell.fill = alt_fill
                            if col_idx in (2, 3, 4, 5, 8, 9):
                                cell.alignment = data_align_center
                            else:
                                cell.alignment = data_align_left
                        row_idx += 1

        for col in ws.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 62)

        summary_counts[sheet_name] = (row_idx - 2, len(sheet_secs))

    target_paths = [
        os.path.join(project_root, "data", "import", "school_curriculum.xlsx"),
        os.path.join(project_root, "data", "import", "school_curriculum_sample_edited.xlsx"),
        os.path.join(project_root, "frontend", "public", "school_curriculum.xlsx"),
    ]
    dist_dir = os.path.join(project_root, "frontend", "dist")
    if os.path.isdir(dist_dir):
        target_paths.append(os.path.join(dist_dir, "school_curriculum.xlsx"))

    for out_p in target_paths:
        os.makedirs(os.path.dirname(out_p), exist_ok=True)
        wb.save(out_p)
        print(f"[OK] Saved aligned curriculum to: {out_p}")

    print(f"Total unique sections across workbook: {len(unique_sections_written)}")
    for sh, (rcnt, scnt) in summary_counts.items():
        print(f"  - {sh}: {rcnt} rows across {scnt} sections")


if __name__ == "__main__":
    generate_aligned_curriculum()
