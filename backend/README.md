# Thesis Exam Scheduler - Backend

FastAPI backend service powering the Automated Examination Timetable and Proctor Scheduling System.

## Technologies Used

- **Python 3.11+**
- **FastAPI** (REST API framework with OpenAPI documentation)
- **SQLAlchemy** (PostgreSQL ORM)
- **Redis** (In-memory caching and session rate limiting)
- **Genetic Algorithm Optimization Engine** (Multi-objective timetable and proctor assignment solver)
- **OpenPyXL / Pandas** (Excel ingestion and master schedule generation)
- **JWT & bcrypt** (Role-based authentication)

---

## Quickstart Setup

### 1. Environment Setup

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL database credentials and mail settings:
```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/exam_scheduler
SECRET_KEY=your-secret-key-for-development-only-change-in-production
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@example.com
SMTP_PASSWORD=your_app_password
SMTP_SENDER=your_email@example.com
```

### 3. Initialize Database

Ensure PostgreSQL is running and the database `exam_scheduler` exists:
```sql
CREATE DATABASE exam_scheduler;
```

Run the baseline database initialization script:
```bash
python setup_db.py
```

This creates all database tables, default year levels, examination rooms, baseline distribution rules, timeslots, and the initial Administrator account (`admin@school.edu` / `admin123`).

### 4. Run the Backend

```bash
python -m uvicorn main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`
