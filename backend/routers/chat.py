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

@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    count = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.recipient_id == current_user.id,
            ChatMessage.is_read == False,
            ChatMessage.deleted_by_recipient == False
        )
        .count()
    )
    return {"unread_count": count}

@router.get("/messages/{other_user_id}", response_model=List[MessageResponse])
def get_messages(
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    messages = (
        db.query(ChatMessage)
        .filter(
            ((ChatMessage.sender_id == current_user.id) & (ChatMessage.recipient_id == other_user_id) & (ChatMessage.deleted_by_sender == False)) |
            ((ChatMessage.sender_id == other_user_id) & (ChatMessage.recipient_id == current_user.id) & (ChatMessage.deleted_by_recipient == False))
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
        ChatMessage.is_read == False,
        ChatMessage.deleted_by_recipient == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "Messages marked as read"}

@router.get("/conversations")
def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Fetch user IDs of users who have exchanged messages with the current user
    chatted_senders = db.query(ChatMessage.sender_id).filter(
        ChatMessage.recipient_id == current_user.id
    ).distinct().all()
    chatted_recipients = db.query(ChatMessage.recipient_id).filter(
        ChatMessage.sender_id == current_user.id
    ).distinct().all()
    
    chatted_user_ids = {uid[0] for uid in chatted_senders + chatted_recipients if uid[0] != current_user.id}
    
    # If admin: show irregular students, and any user we chatted with
    if current_user.role in ["admin", "program_head"]:
        users = db.query(User).filter(
            (User.id.in_(list(chatted_user_ids))) |
            ((User.role == "student") & (User.student_type == "irregular"))
        ).all()
    else:
        # Otherwise, just show users we chatted with
        users = db.query(User).filter(User.id.in_(list(chatted_user_ids))).all()
        
    conversations = []
    for u in users:
        last_msg = (
            db.query(ChatMessage)
            .filter(
                ((ChatMessage.sender_id == current_user.id) & (ChatMessage.recipient_id == u.id) & (ChatMessage.deleted_by_sender == False)) |
                ((ChatMessage.sender_id == u.id) & (ChatMessage.recipient_id == current_user.id) & (ChatMessage.deleted_by_recipient == False))
            )
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        
        unread_count = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.sender_id == u.id,
                ChatMessage.recipient_id == current_user.id,
                ChatMessage.is_read == False,
                ChatMessage.deleted_by_recipient == False
            )
            .count()
        )
        
        conversations.append({
            "student_id": u.id,
            "student_name": u.name,
            "student_email": u.email,
            "student_type": u.student_type if u.role == "student" else "proctor" if u.role in ["proctor", "teacher"] else u.role,
            "role": u.role,
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

@router.get("/proctors")
def get_proctors(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    proctors = db.query(User).filter(User.role.in_(["proctor", "teacher"])).all()
    return [{"id": p.id, "name": p.name, "email": p.email} for p in proctors]

@router.get("/students")
def get_students(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    students = db.query(User).filter(User.role == "student").all()
    return [{"id": s.id, "name": s.name, "email": s.email, "student_type": s.student_type} for s in students]

class EditMessageBody(BaseModel):
    message: str

@router.put("/messages/{message_id}", response_model=MessageResponse)
def edit_message(
    message_id: int,
    body: EditMessageBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
        
    msg.message = body.message.strip()
    db.commit()
    db.refresh(msg)
    
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "recipient_id": msg.recipient_id,
        "message": msg.message,
        "created_at": msg.created_at,
        "is_read": msg.is_read,
        "sender_name": msg.sender.name,
        "recipient_name": msg.recipient.name
    }

@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
        
    db.delete(msg)
    db.commit()
    return {"message": "Message deleted successfully"}

@router.delete("/conversations/{other_user_id}")
def delete_conversation(
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(ChatMessage).filter(
        ChatMessage.sender_id == current_user.id,
        ChatMessage.recipient_id == other_user_id
    ).update({"deleted_by_sender": True}, synchronize_session=False)

    db.query(ChatMessage).filter(
        ChatMessage.sender_id == other_user_id,
        ChatMessage.recipient_id == current_user.id
    ).update({"deleted_by_recipient": True}, synchronize_session=False)

    db.commit()
    return {"message": "Conversation cleared successfully"}

