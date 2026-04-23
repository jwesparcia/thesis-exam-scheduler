#!/usr/bin/env python3
"""
Simple test server to verify FastAPI setup works without database
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Test Server")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Test server running - no database needed!"}

@app.get("/catalog/courses")
def get_courses():
    return [
        {"id": 1, "name": "BSIT"},
        {"id": 2, "name": "BSCS"},
        {"id": 3, "name": "BSCpE"},
        {"id": 4, "name": "BSTM"},
        {"id": 5, "name": "BSHM"},
        {"id": 6, "name": "BSA"},
        {"id": 7, "name": "BSPsych"},
        {"id": 8, "name": "BSCrim"},
        {"id": 9, "name": "BMMA"},
        {"id": 10, "name": "BACOMM"}
    ]

@app.get("/catalog/year-levels")
def get_year_levels():
    return [
        {"id": 1, "name": "1st Year"},
        {"id": 2, "name": "2nd Year"},
        {"id": 3, "name": "3rd Year"},
        {"id": 4, "name": "4th Year"}
    ]
