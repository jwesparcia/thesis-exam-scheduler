from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core import get_db
from pydantic import BaseModel, validator
from typing import List
from datetime import datetime, timezone
from model import Notification, User

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class NotificationSchema(BaseModel):
    id: int
    user_id: int | None
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
    # Map recipient_type and recipient_id to a user_id
    if recipient_type == "program_head" and recipient_id == "admin":
        admin_user = db.query(User).filter(User.role == "program_head").first()
        resolved_user_id = admin_user.id if admin_user else None
    else:
        try:
            resolved_user_id = int(recipient_id)
        except ValueError:
            resolved_user_id = None

    if resolved_user_id is None:
        return []

    return db.query(Notification).filter(
        Notification.user_id == resolved_user_id
    ).order_by(Notification.id.desc()).all()

@router.put("/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}

@router.delete("/clear/{recipient_type}/{recipient_id}")
def clear_all_notifications(recipient_type: str, recipient_id: str, db: Session = Depends(get_db)):
    if recipient_type == "program_head" and recipient_id == "admin":
        admin_user = db.query(User).filter(User.role == "program_head").first()
        resolved_user_id = admin_user.id if admin_user else None
    else:
        try:
            resolved_user_id = int(recipient_id)
        except ValueError:
            resolved_user_id = None

    if resolved_user_id is None:
        return {"message": "No notifications to clear"}

    db.query(Notification).filter(Notification.user_id == resolved_user_id).delete(synchronize_session=False)
    db.commit()
    return {"message": "All notifications cleared"}

@router.delete("/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notification)
    db.commit()
    return {"message": "Notification deleted"}

