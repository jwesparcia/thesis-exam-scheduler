import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import requests

BASE_URL = "http://localhost:8000"

def test_flow():
    # 1. Login as Admin
    print("Logging in as Admin...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@school.edu",
        "password": "admin123"
    })
    if login_res.status_code != 200:
        print(f"Admin login failed: {login_res.text}")
        return
    admin_token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}
    print("Admin login successful!")

    # 2. Clear previous exams
    print("Clearing existing exams...")
    clear_res = requests.delete(f"{BASE_URL}/exams/clear", headers=headers)
    print(f"Clear response: {clear_res.json()}")

    # 3. Generate Exam Schedule
    print("Generating exam schedule...")
    gen_res = requests.post(f"{BASE_URL}/exams/generate", json={
        "department": "College",
        "semester": 1,
        "start_date": "2026-06-01"
    }, headers=headers)
    print(f"Generate response: {gen_res.json()}")

    # 3b. Generate Semester 2 Exam Schedule
    print("Generating Semester 2 exam schedule...")
    gen_res2 = requests.post(f"{BASE_URL}/exams/generate", json={
        "department": "College",
        "semester": 2,
        "start_date": "2026-06-08"
    }, headers=headers)
    print(f"Generate Semester 2 response: {gen_res2.json()}")

    # 4. Post All College Schedules
    print("Posting all College schedules...")
    post_res = requests.post(f"{BASE_URL}/exams/post?semester=1&department=College", headers=headers)
    print(f"Post response: {post_res.json()}")

    # 4b. Post All College Semester 2 Schedules
    print("Posting all College Semester 2 schedules...")
    post_res2 = requests.post(f"{BASE_URL}/exams/post?semester=2&department=College", headers=headers)
    print(f"Post Semester 2 response: {post_res2.json()}")

    # 5. Login as Student
    print("Logging in as regular student...")
    # bsit_subjects Y1 S1: student_bsit_1st_year
    student_login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "student_bsit_1st_year@school.edu",
        "password": "student123"
    })
    if student_login_res.status_code != 200:
        print(f"Student login failed: {student_login_res.text}")
        return
    student_token = student_login_res.json()["access_token"]
    student_headers = {"Authorization": f"Bearer {student_token}"}
    print("Student login successful!")

    # 6. Fetch Student Exams
    print("Fetching student exams...")
    exams_res = requests.get(f"{BASE_URL}/student/exams", headers=student_headers)
    exams = exams_res.json()
    print(f"Fetched {len(exams)} exams for student.")
    if exams:
        print(f"First exam details: {exams[0]}")
        # Verify status is posted
        posted_count = sum(1 for e in exams if e["status"] == "posted")
        print(f"Exams with status 'posted': {posted_count}/{len(exams)}")
        if posted_count == len(exams):
            print("SUCCESS: All student exams are successfully posted!")
        else:
            print("FAILURE: Some exams do not have status 'posted'.")
    else:
        print("No exams found. Make sure exams were generated and posted.")

if __name__ == "__main__":
    test_flow()
