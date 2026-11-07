from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from core import get_db, cache
from model import User, PasswordResetToken
import bcrypt
import uuid
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import os
import time
import random
from collections import defaultdict
from dotenv import load_dotenv
from utils.logging import log_activity
from utils.mail import send_verification_email
from utils.rate_limiter import login_rate_limiter, get_client_ip

load_dotenv()

# Rate limiting removed for seamless login access

# JWT Constants
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY or SECRET_KEY == "your-secret-key-for-development-only-change-in-production":
    raise RuntimeError("A secure SECRET_KEY must be set in the .env file. Running with a missing or default secret is forbidden.")
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

    # Enforce single active session per account
    token_sid = payload.get("sid")
    if token_sid:
        # Check active session ID in memory/cache or DB
        active_sid = user.active_session_id
        if not active_sid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or logged out. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if token_sid != active_sid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session superseded. Your account was signed in from another device or location.",
                headers={"WWW-Authenticate": "Bearer"},
            )

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
    ip_address = get_client_ip(request)
    clean_email = login_data.email.strip().lower() if login_data.email else ""

    # Pre-auth rate limiting check: verifies account cooldown, IP cooldown, and IP burst limits
    login_rate_limiter.check_rate_limit(request, clean_email, db)

    if not clean_email or not login_data.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password cannot be empty"
        )

    user = db.query(User).filter(User.email == clean_email).first()
    
    if not user or not verify_password(login_data.password, user.hashed_password):
        log_activity(db, user.id if user else None, "LOGIN_FAILED", f"Email: {clean_email}", ip_address)
        # Record failure: increments failure counts, triggers temporary cooldown if threshold is hit
        _, remaining = login_rate_limiter.record_failure(request, clean_email, db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect email or password. You have {remaining} attempt(s) remaining before a temporary account lock.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Successful login: reset failed attempts for this account (no penalty on legitimate logins)
    login_rate_limiter.record_success(request, clean_email, db)

    # Normalize role for compatibility
    role = user.role
    if role == "teacher":
        role = "proctor"
        
    # Issue a unique session identifier for this login to enforce single active session per account
    session_id = str(uuid.uuid4())
    user.active_session_id = session_id
    db.commit()

    if cache and getattr(cache, "is_available", False):
        try:
            cache.set(f"user:session:{user.id}", session_id, ttl=ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        except Exception:
            pass

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": role, "sid": session_id},
        expires_delta=access_token_expires
    )
    
    log_activity(db, user.id, "LOGIN_SUCCESS", f"Email: {clean_email} | Role: {role}", ip_address)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": role,
            "department_code": user.department_code,
            "department_name": user.department_rel.name if user.department_rel else None,
            "is_super_admin": bool(user.is_super_admin),
            "student_id": user.student_id or (f"02000{str(user.id * 123457 % 900000 + 100000)}" if user.role == "student" else None),
            "section_name": user.section_name,
            "teacher_id": user.teacher_id,
            "proctor_id": user.proctor_id,
            "student_type": user.student_type,
            "course_id": user.course_id,
            "is_first_login": user.is_first_login
        }
    }

@router.post("/logout")
def logout_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.active_session_id = None
    db.commit()
    if cache and getattr(cache, "is_available", False):
        try:
            cache.delete(f"user:session:{current_user.id}")
        except Exception:
            pass
    return {"message": "Logged out successfully"}

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
        "department_code": current_user.department_code,
        "department_name": current_user.department_rel.name if current_user.department_rel else None,
        "is_super_admin": bool(current_user.is_super_admin),
        "student_id": current_user.student_id or (f"02000{str(current_user.id * 123457 % 900000 + 100000)}" if current_user.role == "student" else None),
        "section_name": current_user.section_name,
        "teacher_id": current_user.teacher_id,
        "proctor_id": current_user.proctor_id,
        "student_type": current_user.student_type,
        "course_id": current_user.course_id,
        "is_first_login": current_user.is_first_login
    }

class RequestCodeRequest(BaseModel):
    email: Optional[str] = None

class UpdateEmailRequest(BaseModel):
    email: str

class VerifyAndChangePasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str

class DirectChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ForgotPasswordResetRequest(BaseModel):
    email: str
    code: str
    new_password: str

@router.put("/update-email")
def update_registered_email(
    payload: UpdateEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address (e.g. your official Microsoft account)."
        )
    
    existing = db.query(User).filter(User.email == clean_email, User.id != current_user.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The email {clean_email} is already linked to another account."
        )
        
    old_email = current_user.email
    current_user.email = clean_email
    db.commit()
    db.refresh(current_user)
    
    log_activity(db, current_user.id, "EMAIL_UPDATED", f"Changed registered email from {old_email} to {clean_email}", None)
    
    return {
        "message": f"Registered email successfully updated to {clean_email}.",
        "email": clean_email
    }

@router.post("/request-verification-code")
def request_verification_code(
    payload: Optional[RequestCodeRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Email is non-editable in change password; it defaults strictly to user's registered email
    target_email = current_user.email
    
    code = f"{random.randint(100000, 999999)}"
    # 5-minute expiration for password change verification codes
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=5)
    
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == current_user.id).delete()
    
    token_obj = PasswordResetToken(
        user_id=current_user.id,
        token=code,
        expires_at=expires_at
    )
    db.add(token_obj)
    db.commit()
    
    sent = send_verification_email(target_email, code)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to send verification code email to {target_email}. Please verify SMTP configuration or email address."
        )
    
    # In-app notification to inform the user that a code was dispatched
    try:
        from model import Notification
        notif = Notification(
            user_id=current_user.id,
            type="SECURITY",
            message=f"A 6-digit verification code was sent to your registered email {target_email}. This code will expire in 5 minutes. Please check your inbox or spam folder.",
        )
        db.add(notif)
        db.commit()
    except Exception as e:
        print(f"Failed to log notification for verification code: {e}")
        
    return {
        "message": f"Verification code sent to {target_email}. This code will expire in 5 minutes.",
        "email": target_email
    }

@router.post("/verify-and-change-password")
def verify_and_change_password(
    payload: VerifyAndChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.email != payload.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only change the password for your own account."
        )
        
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    token_record = db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == current_user.id,
        PasswordResetToken.token == payload.code.strip(),
        PasswordResetToken.expires_at > now_naive
    ).first()
    
    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code."
        )
        
    if len(payload.new_password) < 8 or len(payload.new_password) > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be between 8 and 12 characters long."
        )
        
    hashed = hash_password(payload.new_password)
    current_user.hashed_password = hashed
    current_user.is_first_login = False
    
    db.delete(token_record)
    db.commit()
    
    log_activity(db, current_user.id, "PASSWORD_CHANGED", "First login password change verified by email.", None)
    
    return {"message": "Password changed successfully"}

@router.post("/change-password")
def change_password_direct(
    payload: DirectChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )
    if len(payload.new_password) < 8 or len(payload.new_password) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be between 8 and 20 characters long."
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as your current password."
        )
    current_user.hashed_password = hash_password(payload.new_password)
    current_user.is_first_login = False
    db.commit()
    log_activity(db, current_user.id, "PASSWORD_CHANGED", "Password changed via Settings menu.", None)
    return {"message": "Password changed successfully"}

@router.post("/forgot-password/request-code")
def forgot_password_request_code(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    clean_email = payload.email.strip().lower() if payload.email else ""
    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid registered email address."
        )

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered account found with that email address. Please make sure you entered your registered school or Outlook email."
        )

    code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=5)

    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()

    token_obj = PasswordResetToken(
        user_id=user.id,
        token=code,
        expires_at=expires_at
    )
    db.add(token_obj)
    db.commit()

    sent = send_verification_email(user.email, code)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to send verification code email to {clean_email}. Please check SMTP configuration or try again."
        )

    log_activity(db, user.id, "FORGOT_PASSWORD_CODE_SENT", f"Verification code sent to {clean_email}", ip_address)

    return {
        "message": f"A 6-digit verification code has been sent to {user.email}. This code will expire in 5 minutes. Please check your email inbox or spam folder.",
        "email": user.email
    }

@router.post("/forgot-password/reset")
def forgot_password_reset(
    payload: ForgotPasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    ip_address = request.client.host if request.client else None
    clean_email = payload.email.strip().lower() if payload.email else ""
    clean_code = payload.code.strip() if payload.code else ""

    if not clean_email or not clean_code or not payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email, verification code, and new password are required."
        )

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered account found with that email address."
        )

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    token_record = db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.token == clean_code,
        PasswordResetToken.expires_at > now_naive
    ).first()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code. Please request a new code."
        )

    if len(payload.new_password) < 8 or len(payload.new_password) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be between 8 and 20 characters long."
        )

    user.hashed_password = hash_password(payload.new_password)
    user.is_first_login = False

    db.delete(token_record)
    db.commit()

    log_activity(db, user.id, "PASSWORD_RESET_SUCCESS", "Password reset successfully via forgot password verification code.", ip_address)

    return {
        "message": "Password reset successfully! You can now sign in with your new password."
    }
