# database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(os.path.dirname(BASE_DIR), ".env")

print("Looking for .env at:", dotenv_path)
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    if DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+"):
        try:
            import psycopg2  # noqa: F401
            DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
        except ImportError:
            try:
                import psycopg  # noqa: F401
                DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
            except ImportError:
                pass

print("DATABASE_URL configured" if DATABASE_URL else "DATABASE_URL is missing", flush=True)

if not DATABASE_URL:
    raise RuntimeError("Set DATABASE_URL in .env")

try:
    print("Attempting to connect to database...", flush=True)
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
    if DATABASE_URL.startswith("postgresql"):
        # Avoid an indefinitely stalled deployment when the configured
        # database endpoint cannot be reached from the hosting service.
        connect_args["connect_timeout"] = 10
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
    # Test the connection
    with engine.connect() as conn:
        print("Database connection successful!", flush=True)
except Exception as e:
    print(f"Database connection failed: {e}", flush=True)
    print("Make sure PostgreSQL is running and the database exists", flush=True)
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
