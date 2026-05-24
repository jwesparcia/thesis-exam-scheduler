import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import requests

BASE_URL = "http://localhost:8000"

def run_tests():
    print("=== Testing Irregular Student Flow ===")
    
    # 1. Login
    print("1. Logging in as irregular student...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "irreg@school.edu",
        "password": "student123"
    })
    if login_res.status_code != 200:
        print(f"Login failed: {login_res.text}")
        return
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("Login successful!")

    # 2. Fetch custom exams
    print("\n2. Fetching custom exams...")
    exams_res = requests.get(f"{BASE_URL}/student/custom-exams", headers=headers)
    if exams_res.status_code != 200:
        print(f"Failed: {exams_res.text}")
        return
    exams = exams_res.json()
    print(f"Custom exams found: {len(exams)}")
    for e in exams:
        print(f"  - Exam ID: {e['id']} | Subject: {e['subject_name']} | Code: {e['subject_code']} | Section: {e['section_name']} | Date: {e['exam_date']} | Time: {e['start_time']} - {e['end_time']}")

    # 3. Check conflicts
    print("\n3. Querying /student/conflicts...")
    conflicts_res = requests.get(f"{BASE_URL}/student/conflicts", headers=headers)
    if conflicts_res.status_code != 200:
        print(f"Failed: {conflicts_res.text}")
        return
    conflicts = conflicts_res.json()
    print(f"Conflicts detected: {len(conflicts)}")
    for c in conflicts:
        print(f"  - Conflict between Exam {c['exam1']['id']} and Exam {c['exam2']['id']}")

    # 4. Submit Rescheduling Request for one of the selected exams
    if exams:
        target_exam = exams[0]
        print(f"\n4. Submitting rescheduling request for Exam ID {target_exam['id']} ({target_exam['subject_name']})...")
        # Format dates as expected by backend parser (e.g. YYYY-MM-DD)
        # Target exam dates from response is e.g. "Thursday, May 21, 2026"
        resched_payload = {
            "exam_id": target_exam["id"],
            "section_name": target_exam["section_name"],
            "student_name": "Irregular Student",
            "student_id": "123456",
            "program": "BSCS",
            "school_email": "irreg@school.edu",
            "course_code": target_exam["subject_code"],
            "course_name": target_exam["subject_name"],
            "original_exam_date": "2026-05-21",
            "original_start_time": "09:00",
            "original_end_time": "10:30",
            "exam_type": "Midterm",
            "reason_type": "exam conflict",
            "detailed_explanation": "This exam conflicts with another selected subject.",
            "supporting_file": None,
            "requested_mode": "offline",
            "preferred_date": "2026-05-25",
            "preferred_start_time": "10:00",
            "preferred_end_time": "11:30",
            "acknowledged": True
        }
        resched_res = requests.post(f"{BASE_URL}/student/reschedule-request", json=resched_payload, headers=headers)
        print(f"Rescheduling request response status: {resched_res.status_code}")
        print(f"Response text: {resched_res.text}")
        
    # 5. Fetch requests list
    print("\n5. Querying /student/requests...")
    reqs_res = requests.get(f"{BASE_URL}/student/requests", headers=headers)
    if reqs_res.status_code != 200:
        print(f"Failed: {reqs_res.text}")
        return
    reqs = reqs_res.json()
    print(f"My Rescheduling Requests: {len(reqs)}")
    for r in reqs:
        print(f"  - Request ID: {r['id']} | Exam ID: {r['exam_id']} | Subject: {r['course_name']} | Status: {r['status']}")

if __name__ == "__main__":
    run_tests()
