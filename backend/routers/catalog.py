# routers/catalog.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
import crud

router = APIRouter(prefix="/catalog", tags=["Catalog"])

@router.get("/courses")
def get_courses(db: Session = Depends(get_db)):
    courses = crud.list_courses(db)
    return [{"id": c.id, "name": c.name, "category": c.category} for c in courses]

@router.get("/year-levels")
def get_year_levels(db: Session = Depends(get_db)):
    year_levels = crud.list_year_levels(db)
    return [{"id": y.id, "name": y.name} for y in year_levels]

@router.get("/details")
def get_details(
    course_id: int = Query(...),
    year_level_id: int = Query(...),
    semester: int = Query(...),
    db: Session = Depends(get_db)
):
    return crud.get_course_year_sem_details(course_id, year_level_id, semester, db)
