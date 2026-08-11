from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from core import get_db
from model import User
import bcrypt
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import os
import time
from collections import defaultdict
from dotenv import load_dotenv
from utils.logging import log_activity

load_dotenv()

# Rate limiting
login_attempts = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_ATTEMPT_WINDOW = 60  # seconds

# JWT Constants
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-for-development-only-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

router = APIRouter(prefix="/auth", tags=["Auth"])

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Security Dependencies
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

def require_role(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)):
        user_role = current_user.role
        # Map roles for check
        effective_roles = [user_role]
        if user_role == "program_head":
            effective_roles.append("admin")
        if user_role == "teacher":
            effective_roles.append("proctor")
            
        if not any(role in allowed_roles for role in effective_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have enough permissions to perform this action"
            )
        return current_user
    return role_checker

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login", response_model=Token)
def login(request: Request, login_data: LoginRequest, db: Session = Depends(get_db)):
    ip_address = request.client.host
    
    # Rate Limiting
    current_time = time.time()
    login_attempts[ip_address] = [t for t in login_attempts[ip_address] if current_time - t < LOGIN_ATTEMPT_WINDOW]
    
    if len(login_attempts[ip_address]) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again in a minute."
        )
    
    # Record attempt
    login_attempts[ip_address].append(current_time)

    clean_email = login_data.email.strip().lower() if login_data.email else ""
    if not clean_email or not login_data.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password cannot be empty"
        )

    user = db.query(User).filter(User.email == clean_email).first()
    
    if not user or not verify_password(login_data.password, user.hashed_password):
        log_activity(db, user.id if user else None, "LOGIN_FAILED", f"Email: {clean_email}", ip_address)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Normalize role for compatibility
    role = user.role
    if role == "teacher":
        role = "proctor"
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": role},
        expires_delta=access_token_expires
    )
    
    log_activity(db, user.id, "LOGIN_SUCCESS", f"Role: {role}", ip_address)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": role,
            "section_name": user.section_name,
            "teacher_id": user.teacher_id,
            "proctor_id": user.proctor_id,
            "student_type": user.student_type,
            "course_id": user.course_id
        }
    }

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    role = current_user.role
    if role == "teacher":
        role = "proctor"
        
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": role,
        "section_name": current_user.section_name,
        "teacher_id": current_user.teacher_id,
        "proctor_id": current_user.proctor_id,
        "student_type": current_user.student_type,
        "course_id": current_user.course_id
    }