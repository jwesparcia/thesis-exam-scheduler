from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import DistributionRule, YearLevel
from pydantic import BaseModel
from typing import List, Optional
from .auth import get_current_user, require_role
from utils.logging import log_activity
from models import User

router = APIRouter(prefix="/rules", tags=["Distribution Rules"])

# Pydantic Schemas
class RuleCreate(BaseModel):
    category_type: str # general, major
    year_level_id: Optional[int] = None
    allowed_days: List[int] # [1, 2]
    allowed_session: str # morning, afternoon, any

class RuleSchema(RuleCreate):
    id: int
    year_level_name: Optional[str] = None

    class Config:
        orm_mode = True

@router.get("/", response_model=List[RuleSchema])
def get_rules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rules = db.query(DistributionRule).options(joinedload(DistributionRule.year_level)).all()
    
    # Manually map to schema to handle flattening if needed, 
    # but Pydantic orm_mode + joinedload should handle relationships if defined.
    # Let's add computed field for year_level_name
    result = []
    for r in rules:
        r_dict = {
            "id": r.id,
            "category_type": r.category_type,
            "year_level_id": r.year_level_id,
            "allowed_days": r.allowed_days,
            "allowed_session": r.allowed_session,
            "year_level_name": r.year_level.name if r.year_level else "All Levels"
        }
        result.append(r_dict)
    return result

@router.post("/")
def create_rule(rule: RuleCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    new_rule = DistributionRule(
        category_type=rule.category_type,
        year_level_id=rule.year_level_id,
        allowed_days=rule.allowed_days,
        allowed_session=rule.allowed_session
    )
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    log_activity(db, current_user.id, "RULE_CREATE", f"Type: {rule.category_type}, YearLevel: {rule.year_level_id}")
    return new_rule

@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    rule = db.query(DistributionRule).filter(DistributionRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    db.delete(rule)
    db.commit()
    log_activity(db, current_user.id, "RULE_DELETE", f"Rule ID: {rule_id}")
    return {"message": "Rule deleted"}
