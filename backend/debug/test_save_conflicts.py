import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import requests

BASE_URL = "http://localhost:8000"

def save_conflicting_selections():
    # 1. Login
    print("Logging in as irregular student...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "irreg@school.edu",
        "password": "student123"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Let's fetch all available subjects and see if there is an overlapping slot
    print("\nFetching available subjects...")
    avail_res = requests.get(f"{BASE_URL}/student/available-subjects", headers=headers)
    avail_subjects = avail_res.json()
    
    # We want to select subjects whose exam timeslots overlap.
    # Let's inspect all posted exams to find two exams that overlap in timeslots but belong to different subjects or sections.
    print("\nInspecting all posted exams to find overlapping timeslots...")
    # Log in as admin to see all exams if needed, or query public endpoints.
    # But we can just login as regular student to see exams, or we can look at the DB.
    # Actually, let's query the database using python or find exams.
    
if __name__ == "__main__":
    save_conflicting_selections()
