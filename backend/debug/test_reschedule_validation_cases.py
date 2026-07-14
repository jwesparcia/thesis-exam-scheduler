import requests

BASE_URL = "http://localhost:8000"

def run_tests():
    print("=== Testing Rescheduling Validation Cases ===")
    
    # 1. Login as irregular student
    print("Logging in as irregular student...")
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

    # Fetch custom exams to get a valid exam ID
    exams_res = requests.get(f"{BASE_URL}/student/custom-exams", headers=headers)
    exams = exams_res.json()
    if not exams:
        print("No exams found to test rescheduling.")
        return
    target_exam = exams[0]
    print(f"Target Exam ID: {target_exam['id']} | Subject: {target_exam['subject_name']}")

    # Case A: Reschedule to a time ending after 7:00 PM (e.g. 6:00 PM - 7:30 PM) -> should be BLOCKED (400)
    print("\nCase A: Rescheduling to end after 7:00 PM...")
    payload_a = {
        "exam_id": target_exam["id"],
        "section_name": target_exam["section_name"],
        "student_name": "Test Irreg",
        "student_id": "123456",
        "program": "BSCS",
        "school_email": "irreg@school.edu",
        "course_code": target_exam["subject_code"],
        "course_name": target_exam["subject_name"],
        "original_exam_date": "2026-07-02",
        "original_start_time": "01:00 PM",
        "original_end_time": "02:30 PM",
        "exam_type": "Midterm",
        "reason_type": "exam conflict",
        "detailed_explanation": "Test explanation",
        "supporting_file": None,
        "requested_mode": "offline",
        "preferred_date": "2026-07-02",
        "preferred_start_time": "18:00",
        "preferred_end_time": "19:30",
        "acknowledged": True
    }
    res_a = requests.post(f"{BASE_URL}/student/reschedule-request", json=payload_a, headers=headers)
    print(f"Status: {res_a.status_code} | Response: {res_a.text}")
    assert res_a.status_code == 400
    assert "cannot end after 7:00 PM" in res_a.text

    # Case B: Reschedule backward/not onward for irregular student (e.g. orig is 1:00 PM - 2:30 PM, preferred is 10:00 AM - 11:30 AM) -> should be BLOCKED (400)
    print("\nCase B: Rescheduling backward/not onward...")
    payload_b = {
        **payload_a,
        "preferred_start_time": "10:00",
        "preferred_end_time": "11:30"
    }
    res_b = requests.post(f"{BASE_URL}/student/reschedule-request", json=payload_b, headers=headers)
    print(f"Status: {res_b.status_code} | Response: {res_b.text}")
    assert res_b.status_code == 400
    assert "only reschedule onward" in res_b.text

    # Case C: Valid onward rescheduling (e.g. preferred is 3:00 PM - 4:30 PM) -> should succeed
    print("\nCase C: Valid onward rescheduling...")
    payload_c = {
        **payload_a,
        "preferred_start_time": "15:00",
        "preferred_end_time": "16:30"
    }
    res_c = requests.post(f"{BASE_URL}/student/reschedule-request", json=payload_c, headers=headers)
    print(f"Status: {res_c.status_code} | Response: {res_c.text}")
    assert res_c.status_code == 200 or ("already exists" in res_c.text)
    
    print("\n=== All backend validation test cases passed successfully! ===")

if __name__ == "__main__":
    run_tests()
