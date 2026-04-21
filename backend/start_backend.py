#!/usr/bin/env python3
"""
Backend startup script with detailed error checking
"""
import sys
import subprocess

def check-python():
    """Check if Python 3 is available"""
    try:
        version = sys.version_info
        print(f"✓ Python {version.major}.{version.minor}.{version.micro} found")
        return True
    except Exception as e:
        print(f"❌ Python not found: {e}")
        return False

def check-dependencies():
    """Check if required packages are installed"""
    packages = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("sqlalchemy", "SQLAlchemy"),
        ("psycopg2", "psycopg2/binary"),
        ("python-dotenv", "python-dotenv")
    ]

    missing = []
    for pkg, name in packages:
        try:
            if pkg == "psycopg2":
                import psycopg2
            else:
                __import__(pkg.replace("-", "_"))
            print(f"✓ {name} installed")
        except ImportError:
            print(f"❌ {name} not installed")
            missing.append(pkg)

    if missing:
        print(f"\n🔧 Install missing packages:")
        print(f"pip install {' '.join(missing)}")
        return False
    return True

def check-postgresql():
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
        print("✓ PostgreSQL connection successful")
        return True
    except Exception as e:
        print(f"❌ PostgreSQL connection failed: {e}")
        print("   Make sure PostgreSQL is running and database exists")
        return False

def test-import():
    """Test importing our main modules"""
    try:
        import database
        print("✓ database module imported")
    except Exception as e:
        print(f"❌ database import failed: {e}")
        return False

    try:
        import models
        print("✓ models module imported")
    except Exception as e:
        print(f"❌ models import failed: {e}")
        return False

    try:
        from routers import catalog, exams
        print("✓ routers imported")
    except Exception as e:
        print(f"❌ routers import failed: {e}")
        return False

    return True

def start-backend():
    """Try to start the backend"""
    print("\n🚀 Starting backend...")
    try:
        import uvicorn
        print("Starting uvicorn...")
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, log_level="info")
    except Exception as e:
        print(f"❌ Failed to start backend: {e}")

def main():
    print("🔍 Backend Diagnostic Tool\n")

    # Step 1: Python
    if not check-python():
        return

    # Step 2: Dependencies
    if not check_dependencies():
        return

    # Step 3: PostgreSQL
    if not check_postgresql():
        print("\n💡 Try creating the database:")
        print("   psql -U postgres -c 'CREATE DATABASE exam_scheduler;'")
        return

    # Step 4: Imports
    if not test_import():
        return

    print("\n✅ All checks passed! Starting backend...\n")

    # Step 5: Start backend
    start_backend()

if __name__ == "__main__":
    main()
