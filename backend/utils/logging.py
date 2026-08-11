from sqlalchemy.orm import Session
from model import ActivityLog
from datetime import datetime, timezone

def log_activity(db: Session, user_id: int, action: str, details: str = None, ip_address: str = None):
    try:
        log_entry = ActivityLog(
            user_id=user_id,
            action=action,
            details=details,
            ip_address=ip_address
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"Error logging activity: {e}")
        db.rollback()
