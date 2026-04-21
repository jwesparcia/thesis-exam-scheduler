# database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, ".env")

print("Looking for .env at:", dotenv_path)
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
print("Loaded DATABASE_URL:", DATABASE_URL)

if not DATABASE_URL:
    raise RuntimeError("Set DATABASE_URL in .env")

try:
    print("Attempting to connect to database...")
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    # Test the connection
    with engine.connect() as conn:
        print("Database connection successful!")
except Exception as e:
    print(f"Database connection failed: {e}")
    print("Make sure PostgreSQL is running and the database exists")
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
