from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User
import bcrypt
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Auth"])

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return {
        "access_token": f"dummy-token-{user.id}",
        "token_type": "bearer",
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "section_name": user.section_name,
        "teacher_id": user.teacher_id,
        "proctor_id": user.proctor_id,
        "user_id": user.id
    }

@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "section_name": u.section_name,
            "teacher_id": u.teacher_id
        }
        for u in users
    ]
