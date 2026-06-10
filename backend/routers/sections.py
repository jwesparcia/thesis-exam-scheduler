# routers/sections.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import crud
from models import Section 
from pydantic import BaseModel
from typing import Optional
from .exams import is_generation_ongoing

router = APIRouter(prefix="/sections", tags=["Sections"])

class PreferredRoomRequest(BaseModel):
    preferred_room_id: Optional[int] = None

@router.put("/{section_id}/preferred-room")
def update_preferred_room(section_id: int, body: PreferredRoomRequest, db: Session = Depends(get_db)):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot update preferred room while schedule generation is ongoing")
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    section.preferred_room_id = body.preferred_room_id
    db.commit()
    return {"message": "Preferred room updated", "preferred_room_id": section.preferred_room_id}


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