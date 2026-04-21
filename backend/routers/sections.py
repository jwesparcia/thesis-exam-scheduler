# routers/sections.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import crud
from models import Section 

router = APIRouter(prefix="/sections", tags=["Sections"])

@router.get("/{year_name}")
def get_sections(year_name: str, db: Session = Depends(get_db)):
    """
    Get all sections in a year level (e.g., BSIT-3),
    with their subjects and professor names.
    """
    return crud.get_sections_with_subjects(db, year_name)

@router.get("/validate/{section_name}")
def validate_section(section_name: str, db: Session = Depends(get_db)):
    """Check if a section exists for student login validation"""
    section = db.query(Section).filter(Section.name == section_name).first()
    return {"exists": section is not None, "section": section.name if section else None}