#!/usr/bin/env python3
"""
Simple working backend - just get the dropdowns populated
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Simple Exam Scheduler")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Simple backend working", "status": "✅ Dropdowns should be populated"}

@app.get("/catalog/courses")
def get_courses():
    return [
        {"id": 1, "name": "BSIT"},
        {"id": 2, "name": "BSCS"}
    ]

@app.get("/catalog/year-levels")
def get_year_levels():
    return [
        {"id": 1, "name": "1st Year"},
        {"id": 2, "name": "2nd Year"},
        {"id": 3, "name": "3rd Year"},
        {"id": 4, "name": "4th Year"}
    ]

@app.get("/catalog/details")
def get_details(course_id: int = 1, year_level_id: int = 1, semester: int = 1):
    return {"sections": []}

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting simple backend...")
    print("This will populate the dropdowns!")
    uvicorn.run(app, host="127.0.0.1", port=8000)
