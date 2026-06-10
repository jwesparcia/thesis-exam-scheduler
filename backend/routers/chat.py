from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ChatMessage, User
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .auth import get_current_user, require_role

router = APIRouter(prefix="/chat", tags=["Chat"])

class SendMessageBody(BaseModel):
    recipient_id: int
    message: str

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    message: str
    created_at: datetime
    is_read: bool
    sender_name: str
    recipient_name: str

    class Config:
        orm_mode = True

@router.post("/send", response_model=MessageResponse)
def send_message(
    body: SendMessageBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validate recipient exists
    recipient = db.query(User).filter(User.id == body.recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
        
    db_msg = ChatMessage(
        sender_id=current_user.id,
        recipient_id=body.recipient_id,
        message=body.message
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    
    return {
        "id": db_msg.id,
        "sender_id": db_msg.sender_id,
        "recipient_id": db_msg.recipient_id,
        "message": db_msg.message,
        "created_at": db_msg.created_at,
        "is_read": db_msg.is_read,
        "sender_name": current_user.name,
        "recipient_name": recipient.name
    }

@router.get("/messages/{other_user_id}", response_model=List[MessageResponse])
def get_messages(
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    messages = (
        db.query(ChatMessage)
        .filter(
            ((ChatMessage.sender_id == current_user.id) & (ChatMessage.recipient_id == other_user_id)) |
            ((ChatMessage.sender_id == other_user_id) & (ChatMessage.recipient_id == current_user.id))
        )
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    
    res = []
    for m in messages:
        res.append({
            "id": m.id,
            "sender_id": m.sender_id,
            "recipient_id": m.recipient_id,
            "message": m.message,
            "created_at": m.created_at,
            "is_read": m.is_read,
            "sender_name": m.sender.name,
            "recipient_name": m.recipient.name
        })
    return res

@router.put("/read/{other_user_id}")
def mark_read(
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(ChatMessage).filter(
        ChatMessage.sender_id == other_user_id,
        ChatMessage.recipient_id == current_user.id,
        ChatMessage.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "Messages marked as read"}

@router.get("/conversations")
def get_conversations(
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    students = db.query(User).filter(User.student_type == "irregular").all()
    
    conversations = []
    for s in students:
        last_msg = (
            db.query(ChatMessage)
            .filter(
                ((ChatMessage.sender_id == current_user.id) & (ChatMessage.recipient_id == s.id)) |
                ((ChatMessage.sender_id == s.id) & (ChatMessage.recipient_id == current_user.id))
            )
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        
        unread_count = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.sender_id == s.id,
                ChatMessage.recipient_id == current_user.id,
                ChatMessage.is_read == False
            )
            .count()
        )
        
        conversations.append({
            "student_id": s.id,
            "student_name": s.name,
            "student_email": s.email,
            "last_message": last_msg.message if last_msg else None,
            "last_message_time": last_msg.created_at if last_msg else None,
            "unread_count": unread_count
        })
        
    conversations.sort(key=lambda x: (x["unread_count"] > 0, x["last_message_time"] or datetime.min), reverse=True)
    return conversations

@router.get("/admins")
def get_admins(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    admins = db.query(User).filter(User.role.in_(["admin", "program_head"])).all()
    return [{"id": a.id, "name": a.name, "email": a.email} for a in admins]
