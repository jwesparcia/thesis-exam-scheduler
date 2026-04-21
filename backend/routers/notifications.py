from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from pydantic import BaseModel, validator
from typing import List
from datetime import datetime, timezone
from models import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class NotificationSchema(BaseModel):
    id: int
    recipient_type: str
    recipient_id: str
    message: str
    type: str
    is_read: bool
    related_id: int | None
    created_at: datetime | None

    @validator('created_at', pre=True)
    def ensure_utc(cls, v):
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    class Config:
        orm_mode = True

@router.get("/{recipient_type}/{recipient_id}", response_model=List[NotificationSchema])
def get_notifications(recipient_type: str, recipient_id: str, db: Session = Depends(get_db)):
    return db.query(Notification).filter(
        Notification.recipient_type == recipient_type,
        Notification.recipient_id == recipient_id
    ).order_by(Notification.id.desc()).all()

@router.put("/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}
