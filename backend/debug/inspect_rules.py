import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import DistributionRule

db = SessionLocal()
try:
    rules = db.query(DistributionRule).all()
    print(f"Total rules: {len(rules)}")
    for r in rules:
        print(f"Rule ID: {r.id} | Category: {r.category_type} | Year Level: {r.year_level_id} | Session: {r.allowed_session} | Days: {r.allowed_days}")
finally:
    db.close()
