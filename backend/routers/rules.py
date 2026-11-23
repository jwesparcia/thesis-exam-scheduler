from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core import get_db
from model import ExamBreakSetting
from pydantic import BaseModel, Field
from .auth import get_current_user, require_role
from utils.logging import log_activity
from model import User
from .exams import is_generation_ongoing

router = APIRouter(prefix="/rules", tags=["Exam Break Settings"])

class ExamBreakSettingUpdate(BaseModel):
    break_seconds: int = Field(..., ge=0, le=86399)

@router.get("/break-settings")
def get_exam_break_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = {
        setting.category_type: setting.break_seconds
        for setting in db.query(ExamBreakSetting).all()
    }
    return [
        {"category_type": category, "break_seconds": settings.get(category, 0)}
        for category in ("general", "major")
    ]

@router.put("/break-settings/{category_type}")
def update_exam_break_setting(
    category_type: str,
    update: ExamBreakSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    category_type = category_type.lower()
    if category_type not in {"general", "major"}:
        raise HTTPException(status_code=404, detail="Subject category not found")
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot update break times while schedule generation is ongoing")

    setting = db.query(ExamBreakSetting).filter(ExamBreakSetting.category_type == category_type).first()
    if setting is None:
        setting = ExamBreakSetting(category_type=category_type, break_seconds=update.break_seconds)
        db.add(setting)
    else:
        setting.break_seconds = update.break_seconds

    db.commit()
    log_activity(db, current_user.id, "EXAM_BREAK_UPDATE", f"{category_type}: {update.break_seconds} seconds")
    return {"category_type": category_type, "break_seconds": update.break_seconds}
