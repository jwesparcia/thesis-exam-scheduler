import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in environment or .env")

print("Connecting to DB to check migrations...")
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if sections table has preferred_room_id column
    result = conn.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='sections' AND column_name='preferred_room_id';
    """)).fetchone()
    
    if not result:
        print("Column 'preferred_room_id' not found in table 'sections'. Adding column...")
        conn.execute(text("""
            ALTER TABLE sections 
            ADD COLUMN preferred_room_id INTEGER REFERENCES rooms(id) NULL;
        """))
        conn.commit()
        print("Migration successful! Column 'preferred_room_id' added to table 'sections'.")
    else:
        print("Column 'preferred_room_id' already exists in table 'sections'. No migration needed.")
