import pandas as pd
import os
import random
from openpyxl.utils import get_column_letter

# Define Teachers
teachers = [
    "Kertney Balasuela", "M Besa", "J Buenafrancisca", "A Bundang", "M Cadiente",
    "P Cali", "A Dela Peña", "P Flores", "M Garcia", "V Garcia",
    "S Gascon", "I Giray", "D Gongora", "N Guerrero", "J Loreno",
    "L Macaspac", "D Maraya", "R Mariano", "C Mateo", "J Nuque",
    "J Onlagada", "E Pasco", "J Payusan", "L Piñon", "A Ramos",
    "R Salem", "B San Juan", "R Santos", "M See", "J Sison",
    "C Sulapas", "V Vargas", "J Villaganas", "R Villarete"
]

# Define Courses
courses = [
    {"name": "BSIT", "category": "College"},
    {"name": "BSCS", "category": "College"},
    {"name": "BSCpE", "category": "College"},
    {"name": "BSTM", "category": "College"},
    {"name": "BSHM", "category": "College"},
    {"name": "BSA", "category": "College"},
    {"name": "BSPsych", "category": "College"},
    {"name": "BSCrim", "category": "College"},
    {"name": "BMMA", "category": "College"},
    {"name": "BACOMM", "category": "College"},
    {"name": "Tourism", "category": "SHS"},
    {"name": "STEM", "category": "SHS"},
    {"name": "Digital Arts", "category": "SHS"},
    {"name": "Culinary", "category": "SHS"},
    {"name": "HUMMS", "category": "SHS"},
    {"name": "ABM", "category": "SHS"},
    {"name": "IT-MAWDEV", "category": "SHS"},
]

# Define Year Levels
year_levels = [
    {"id": 1, "name": "1st Year"},
    {"id": 2, "name": "2nd Year"},
    {"id": 3, "name": "3rd Year"},
    {"id": 4, "name": "4th Year"},
    {"id": 5, "name": "Grade 11"},
    {"id": 6, "name": "Grade 12"},
]

# Subject Pools
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
        2: ["Modeling and Simulation", "Game Programming", "Programming Languages", "Computer Organization", "Software Engineering 2", "Advanced Web Programming", "CS Thesis 1"]},
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

bscpe_subjects = {
    1: {
        1: ["Programming Logic and Design", "The Contemporary World", "Euthenics 1", "Mathematics in the Modern World", "National Service Training Program 1", "P.E./PATHFIT 1: Movement Competency Training", "Understanding the Self", "College Calculus (Differential)", "Chemistry for Engineers", "Computer Engineering as a Discipline"],
        2: ["Object-Oriented Programming", "Discrete Mathematics", "Art Appreciation", "National Service Training Program 2", "P.E./PATHFIT 2: Exercise-based Fitness Activities", "Purposive Communication", "Science, Technology, and Society", "College Calculus (Integral)", "Physics for Engineers"]
    },
    2: {
        1: ["Fundamentals of Electrical Circuits", "Operating Systems", "Data Structures and Algorithms", "Emerging Technologies in CpE", "The Entrepreneurial Mind", "Rizal's Life and Works", "P.E./PATHFIT 3: Individual-Dual Sports", "Readings in Philippine History", "Differential Equations"],
        2: ["Numerical Methods", "Fundamentals of Electronic Circuits", "Software Design", "Philippine Popular Culture", "Ethics", "P.E./PATHFIT 4: Team Sports", "Great Books", "Technopreneurship", "Engineering Data Analysis"]
    },
    3: {
        1: ["Fundamentals of Mixed Signals and Sensors", "CpE Elective 1", "Logic Circuits and Design", "Data and Digital Communications (Data Communications)", "Computer-Aided Drafting", "Computer Engineering Drafting and Design", "Engineering Economics", "Feedback and Control Systems", "Methods of Research"],
        2: ["Basic Occupational Health and Safety", "Microprocessors", "CpE Elective 2", "Introduction to HDL", "Digital Signal Processing", "Capstone Design 1"]
    },
    4: {
        1: ["Computer Architecture and Organization", "Computer Network and Security", "CpE Laws and Professional Practice", "CpE Elective 3", "Embedded Systems", "Euthenics 2", "Capstone Design 2", "Seminars and Fieldtrips"],
        2: ["CpE Practicum (300 hours)"]
    }
}

bstm_subjects = {
    1: {
        1: ["Euthenics 1", "Mathematics in the Modern World", "National Service Training Program 1", "P.E./PATHFIT 1: Movement Competency Training", "Readings in Philippine History", "Understanding the Self", "Macro Perspective of Tourism and Hospitality", "Risk Management as Applied to Safety, Security, and Sanitation"],
        2: ["National Service Training Program 2", "P.E./PATHFIT 2: Exercise-based Fitness Activities", "Purposive Communication", "Computer Productivity Tools", "Philippine Culture and Tourism Geography", "Micro Perspective of Tourism and Hospitality", "Global Culture and Tourism Geography"]
    },
    2: {
        1: ["Art Appreciation", "P.E./PATHFIT 3: Individual-Dual Sports", "Quality Service Management in Tourism and Hospitality", "Accommodation Operations and Management", "Tour and Travel Management", "Foreign Language 1", "Sustainable Tourism"],
        2: ["Ethics", "P.E./PATHFIT 4: Team Sports", "Science, Technology, and Society", "Tour Planning, Packaging, and Pricing", "Tourism Policy Planning and Development", "Introduction to Meetings Incentives, Conferences, and Events (MICE)", "Foreign Language 2"]
    },
    3: {
        1: ["Operations Management (TQM)", "The Entrepreneurial Mind", "Great Books", "Professional Development and Applied Ethics", "Tourism and Hospitality Marketing", "Multicultural Diversity in Workplace for the Tourism Professional", "Applied Business Tools and Technologies in Tourism"],
        2: ["Strategic Management", "Philippine Popular Culture", "Legal Aspects in Tourism and Hospitality", "Entrepreneurship in Tourism and Hospitality", "Travel Writing and Photography", "Professional Tour Guiding", "Transportation Management"]
    }
}

bshm_subjects = {
    1: {
        1: ["Euthenics 1", "Mathematics in the Modern World", "National Service Training Program 1", "P.E./PATHFIT 1: Movement Competency Training", "Readings in Philippine History", "Understanding the Self", "Macro Perspective of Tourism and Hospitality", "Risk Management as Applied to Safety, Security, and Sanitation"],
        2: ["National Service Training Program 2", "P.E./PATHFIT 2: Exercise-based Fitness Activities", "Purposive Communication", "Kitchen Essentials and Basic Food Preparation", "Computer Productivity Tools", "Philippine Culture and Tourism Geography", "Micro Perspective of Tourism and Hospitality"]
    },
    2: {
        1: ["Art Appreciation", "P.E./PATHFIT 3: Individual-Dual Sports", "Hotel Front Office Operations Management", "Philippine Regional Cuisines with Food Styling and Design", "Fundamentals in Lodging Operations", "Foreign Language 1", "Quality Service Management in Tourism and Hospitality"],
        2: ["Ethics", "P.E./PATHFIT 4: Team Sports", "Science, Technology, and Society", "International Cuisines with Food Styling and Design", "Supply Chain Management in Hospitality Industry", "Fundamentals in Food Service Operations", "Introduction to Meetings Incentives, Conferences, and Events (MICE)", "Foreign Language 2"]
    },
    3: {
        1: ["Operations Management (TQM)", "The Entrepreneurial Mind", "Great Books", "Pastry Arts and Bakery Management", "Applied Business Tools and Technologies in Hospitality", "Professional Development and Applied Ethics", "Tourism and Hospitality Marketing", "Multicultural Diversity in Workplace for the Tourism Professional"],
        2: ["Strategic Management", "Philippine Popular Culture", "Catering Operations Management", "Modern Gastronomy with Fusion of Cuisines", "Ergonomics and Facilities Planning for the Hospitality Industry", "Legal Aspects in Tourism and Hospitality", "Entrepreneurship in Tourism and Hospitality"]
    },
    4: {
        1: ["The Contemporary World", "Euthenics 2", "Rizal's Life and Works", "Specialty Cuisine with Food Exhibit", "Research in Hospitality"],
        2: ["BSHM Practicum (600 hours)"]
    }
}

bsa_subjects = {
    1: {
        1: ["Basic Accounting", "The Contemporary World", "Euthenics 1", "Philippine Popular Culture", "National Service Training Program 1", "P.E./PATHFIT 1: Movement Competency Training", "Readings in Philippine History", "Science, Technology and Society", "Understanding the Self"],
        2: ["Conceptual Framework and Accounting Standards", "Financial Accounting and Reporting", "Income Taxation", "Law on Obligations and Contracts", "Operations Management (TQM)", "Ethics", "National Service Training Program 2", "P.E./PATHFIT 2: Exercise-based Fitness Activities", "Mathematics in the Modern World", "Computer Productivity Tools"]
    },
    2: {
        1: ["Business Laws and Regulations", "Great Books", "Intermediate Accounting 1", "IT Application Tools in Business", "Managerial Economics", "Strategic Management", "Rizal's Life and Works", "Purposive Communication", "P.E./PATHFIT 3: Individual-Dual Sports"],
        2: ["Accounting Information System", "Business Taxation", "Financial Management", "Intermediate Accounting 2", "Regulatory Framework and Legal Issues in Business", "The Entrepreneurial Mind", "Art Appreciation", "P.E./PATHFIT 4: Team Sports", "Auditing and Assurance Principles"]
    },
    3: {
        1: ["Cost Accounting and Control", "Economic Development", "Financial Markets", "Governance, Business Ethics, Risk Management, and Internal Control", "Intermediate Accounting 3", "International Business and Trade", "Statistical Analysis with Software Application", "Auditing and Assurance: Concepts and Applications 1"],
        2: ["Accounting Research Methods", "Strategic Cost Management", "Accounting for Business Combinations", "Auditing in a CIS Environment", "Accounting for Government and Non-profit Organizations", "Accounting for Special Transactions", "Auditing and Assurance: Concepts and Applications 2"]
    }
}

bspsych_subjects = {
    1: {
        1: ["Euthenics 1", "Mathematics in the Modern World", "The Contemporary World", "Understanding the Self", "Readings in Philippine History", "Introduction to Psychology", "P.E./PATHFIT 1: Movement Competency Training"],
        2: ["Ethics", "Science, Technology, and Society", "Purposive Communication", "Art Appreciation", "Great Books", "Philippine Popular Culture", "Psychological Statistics", "P.E./PATHFIT 2: Exercise-based Fitness Activities"]
    },
    2: {
        1: ["Rizal's Life and Works", "Developmental Psychology", "Physiological/Biological Psychology"],
        2: ["Art Appreciation", "Philippine Popular Culture", "P.E./PATHFIT 4: Team Sports", "Cognitive Psychology", "Experimental Psychology", "Theories of Personality"]
    },
    3: {
        1: ["Rizal's Life and Works", "Great Books", "Abnormal Psychology", "Field Methods in Psychology", "Social Psychology"],
        2: ["Filipino Psychology", "Industrial/Organizational Psychology", "Psychological Assessment", "Psychology Elective 1", "Research in Psychology 1"]
    },
    4: {
        1: ["Euthenics 2", "Research in Psychology 2", "Psychology Elective 2", "Psychology Elective 3"],
        2: ["Practicum in Psychology - 450 hours OJT"]
    }
}

shs_subjects = {
    "STEM": {
        5: {
            1: ["Oral Communication", "General Mathematics", "21st Century Literature from the Philippines and the World", "Media and Information Literacy", "Introduction to the Philosophy of the Human Person", "Physical Education and Health 1", "Pre-Calculus", "General Biology 1"],
            2: ["Reading and Writing", "Statistics and Probability", "Understanding Culture, Society and Politics", "Earth Science", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", "Physical Education and Health 2", "Practical Research 1", "Basic Calculus", "General Biology 2"]
        },
        6: {
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

def classify_subject(name: str):
    practical_keywords = [
        "Physical Education", "National Service Training Program", "Euthenics", 
        "Thesis", "Practicum", "NSTP", "Immersion", "Capstone", "Laboratory",
        "PATHFIT", "P.E.", "OJT"
    ]
    if any(keyword.lower() in name.lower() for keyword in practical_keywords):
        exam_type = "practical"
    else:
        exam_type = "written"

    general_keywords = [
        "Oral Communication", "General Mathematics", "21st Century Literature",
        "Reading and Writing", "Statistics and Probability", "Understanding Self",
        "Contemporary World", "Purposive Communication", "Ethics", "Art Appreciation",
        "Komunikasyon at Pananaliksik", "Pagbasa at Pagsusuri", "Personal Development",
        "Philosophy", "Literature", "Media and Information Literacy",
        "Euthenics", "National Service Training Program", "ROTC", "P.E./PATHFIT",
        "Physical Education", "Readings in Philippine History", "Rizal", "Philippine Popular Culture",
        "The Entrepreneurial Mind", "Mathematics in the Modern World", "Science, Technology, and Society",
        "Great Books", "Foreign Language", "General Physics", "General Chemistry", "General Biology",
        "Contemporary Philippine Arts", "Empowerment Technologies", "Understanding Culture"
    ]
    if name.startswith("GE") or any(keyword.lower() in name.lower() for keyword in general_keywords):
        category = "general"
    else:
        category = "major"

    return exam_type, category

def generate():
    # We will generate sheets for Semester 1, 2, and 3
    writer = pd.ExcelWriter('../school_curriculum_sample.xlsx', engine='openpyxl')
    
    teacher_assignments = {} # global tracking of teacher loads
    teacher_pool = list(teachers)
    
    first_names = ["Kertney", "Robert", "Patricia", "Michael", "Linda", "William", "Elizabeth", "David", "Richard", "Susan", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Margaret"]
    last_names = ["Santos", "Besa", "Buenafrancisca", "Bundang", "Cadiente", "Cali", "Dela Peña", "Flores", "Garcia", "Gascon", "Giray", "Gongora", "Guerrero", "Loreno", "Macaspac", "Maraya", "Mariano", "Mateo", "Nuque", "Onlagada", "Pasco", "Payusan", "Piñon", "Ramos", "Salem", "San Juan", "See", "Sison", "Sulapas", "Vargas", "Villaganas", "Villarete"]
    
    for semester in [1, 2, 3]:
        rows = []
        for course in courses:
            c_name = course["name"]
            c_cat = course["category"]
            
            # Select subject pool
            if c_name == "BSIT":
                pool = bsit_subjects
            elif c_name == "BSCS":
                pool = bscs_subjects
            elif c_name == "BSCpE":
                pool = bscpe_subjects
            elif c_name == "BSTM":
                pool = bstm_subjects
            elif c_name == "BSHM":
                pool = bshm_subjects
            elif c_name == "BSA":
                pool = bsa_subjects
            elif c_name == "BSPsych":
                pool = bspsych_subjects
            elif c_name in shs_subjects:
                pool = shs_subjects[c_name]
            else:
                pool = {}

            # Loop Year Levels
            for y in year_levels:
                y_id = y["id"]
                y_name = y["name"]
                
                # Verify match
                is_college_y = y_id in [1, 2, 3, 4]
                is_shs_y = y_id in [5, 6]
                
                if (c_cat == "College" and not is_college_y) or (c_cat == "SHS" and not is_shs_y):
                    continue
                    
                # Fetch subjects
                if y_id in pool and semester in pool[y_id]:
                    subj_list = pool[y_id][semester]
                else:
                    subj_list = []
                    
                if not subj_list:
                    continue
                    
                # Generate sections (typically 2 sections per sem)
                sections = []
                if c_cat == "College":
                    for s in [1, 2]:
                        sections.append(f"{c_name} {y_id}-{semester}{s:02d}")
                else:
                    for s in [1, 2]:
                        sections.append(f"{c_name}-{y_id}{chr(64+s)}")
                        
                for section in sections:
                    subject_objs = []
                    for idx, subj_name in enumerate(subj_list):
                        subj_code = f"{c_name[:2].upper()}{y_id}{semester}{idx+1:02d}"
                        exam_type, category = classify_subject(subj_name)
                        
                        # Find an available teacher with less than 7 assignments
                        available = [t for t in teacher_pool if teacher_assignments.get(t, 0) < 7]
                        if not available:
                            # Generate a new unique teacher name
                            new_t = f"{random.choice(first_names)} {random.choice(last_names)}"
                            while new_t in teacher_pool:
                                new_t = f"{random.choice(first_names)} {random.choice(last_names)}"
                            teacher_pool.append(new_t)
                            available = [new_t]
                            
                        teacher = random.choice(available)
                        teacher_assignments[teacher] = teacher_assignments.get(teacher, 0) + 1
                        
                        rows.append({
                            "Course": c_name,
                            "Category": c_cat,
                            "Year Level": y_name,
                            "Section": section,
                            "Subject Code": subj_code,
                            "Subject Name": subj_name,
                            "Teacher Name": teacher,
                            "Subject Category": category,
                            "Exam Type": exam_type
                        })
                        
        df = pd.DataFrame(rows)
        sheet_name = f"{semester}st Semester" if semester == 1 else (f"{semester}nd Semester" if semester == 2 else f"{semester}rd Semester")
        
        if df.empty:
            # empty sheet template
            df = pd.DataFrame(columns=["Course", "Category", "Year Level", "Section", "Subject Code", "Subject Name", "Teacher Name", "Subject Category", "Exam Type"])
            
        df.to_excel(writer, index=False, sheet_name=sheet_name)
        worksheet = writer.sheets[sheet_name]
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            worksheet.column_dimensions[col_letter].width = max(max_len + 4, 12)
            
    writer.close()
    print("Excel sample sheet school_curriculum_sample.xlsx generated successfully!")

if __name__ == "__main__":
    generate()
