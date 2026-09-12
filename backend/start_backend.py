#!/usr/bin/env python3
"""
Backend startup script with detailed error checking
"""
import sys
import io
import subprocess

# Fix Unicode encoding on Windows terminals (cp1252 can't handle emoji)
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

def check_python():
    """Check if Python 3 is available"""
    try:
        version = sys.version_info
        print(f"[OK] Python {version.major}.{version.minor}.{version.micro} found")
        return True
    except Exception as e:
        print(f"[ERROR] Python not found: {e}")
        return False

def check_dependencies():
    """Check if required packages are installed"""
    packages = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("sqlalchemy", "SQLAlchemy"),
        ("psycopg2", "psycopg2/binary"),
        ("dotenv", "python-dotenv")
    ]

    missing = []
    for pkg, name in packages:
        try:
            if pkg == "psycopg2":
                import psycopg2
            else:
                __import__(pkg.replace("-", "_"))
            print(f"[OK] {name} installed")
        except ImportError:
            print(f"[ERROR] {name} not installed")
            missing.append(pkg)

    if missing:
        print(f"\n[INFO] Install missing packages:")
        print(f"pip install {' '.join(missing)}")
        return False
    return True

def check_postgresql():
    """Check PostgreSQL connection"""
    try:
        import psycopg2
        conn = psycopg2.connect(
            host="localhost",
            database="exam_scheduler",
            user="postgres",
            password="may312005"
        )
        conn.close()
        print("[OK] PostgreSQL connection successful")
        return True
    except Exception as e:
        print(f"[ERROR] PostgreSQL connection failed: {e}")
        print("   Make sure PostgreSQL is running and database exists")
        return False

def test_import():
    """Test importing our main modules"""
    try:
        from core import database
        print("[OK] database module imported")
    except Exception as e:
        print(f"[ERROR] database import failed: {e}")
        return False

    try:
        from model import models
        print("[OK] models module imported")
    except Exception as e:
        print(f"[ERROR] models import failed: {e}")
        return False

    try:
        from routers import catalog, exams
        print("[OK] routers imported")
    except Exception as e:
        print(f"[ERROR] routers import failed: {e}")
        return False

    return True

def start_backend():
    """Try to start the backend"""
    print("\nStarting backend...")
    try:
        import uvicorn
        print("Starting uvicorn...")
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, log_level="info")
    except Exception as e:
        print(f"[ERROR] Failed to start backend: {e}")

def main():
    print("Backend Diagnostic Tool\n")

    # Step 1: Python
    if not check_python():
        return

    # Step 2: Dependencies
    if not check_dependencies():
        return

    # Step 3: PostgreSQL
    if not check_postgresql():
        print("\n[INFO] Try creating the database:")
        print("   psql -U postgres -c 'CREATE DATABASE exam_scheduler;'")
        return

    # Step 4: Imports
    if not test_import():
        return

    print("\n[OK] All checks passed! Starting backend...\n")

    # Step 5: Start backend
    start_backend()

if __name__ == "__main__":
    main()
