import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import Notification, User, Exam

db = SessionLocal()

print("Checking database notifications...")
notifications = db.query(Notification).order_by(Notification.id.desc()).limit(10).all()

if not notifications:
    print("No notifications found in the database.")
else:
    print(f"Found {len(notifications)} notifications. Last 10:")
    for n in notifications:
        msg_safe = n.message.encode('ascii', 'replace').decode('ascii')
        print(f"ID: {n.id} | Recipient Type: {n.recipient_type} | Recipient ID: {n.recipient_id} | Type: {n.type} | Message: {msg_safe}")

db.close()
