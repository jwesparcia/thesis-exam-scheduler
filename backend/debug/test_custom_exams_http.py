import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import requests

BASE_URL = "http://localhost:8000"

def test_custom_exams():
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

    print("Fetching custom exams...")
    exams_res = requests.get(f"{BASE_URL}/student/custom-exams", headers=headers)
    if exams_res.status_code != 200:
        print(f"Failed to fetch custom exams: {exams_res.text}")
        return
    
    exams = exams_res.json()
    print(f"Successfully fetched {len(exams)} custom exams:")
    for e in exams:
        print(f"- {e['subject_name']} ({e['subject_code']}) | Section: {e['section_name']} | Date: {e['exam_date']} | Time: {e['start_time']} - {e['end_time']} | Room: {e['room']}")

if __name__ == "__main__":
    test_custom_exams()
