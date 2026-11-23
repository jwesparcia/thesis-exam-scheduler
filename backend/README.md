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

This creates all database tables, default year levels, examination rooms, timeslots, and the initial Administrator account (`admin@school.edu` / `admin123`).

### 4. Run the Backend

```bash
python -m uvicorn main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`

## Independent examination terms

Generated schedules are stored separately by department, semester, and examination term.
Generating or replacing Midterm preserves Prelim and the other terms. New schedules
remain private to admins until the selected term is posted.

- `GET /exams/schedules?department=College&semester=1` lists the stored terms and their draft, saved, and posted counts.
- Generation accepts one specific `term`. The count, save, and post endpoints also require a term.
- `DELETE /exams/clear` deletes only the supplied department, semester, and term. Bulk deletion across terms requires the explicit `all_terms=true` parameter.
- College and SHS use the same separation, including SHS semesters 1, 2, and 3.
- Student and proctor dashboards provide an examination-term selector for their posted schedules. Semester and department keep repeated term names separate; student requests and proctor attendance counts follow the selected schedule.

## Fixed examination batches

Fixed papers share a coordinated room plan before ordinary subjects are placed. When
multiple fixed subjects compete for the same rooms, or one paper needs more rooms
than a slot provides, sections take successive room-safe batches at or after the
configured start on that fixed examination day. A section's next fixed paper is
prioritized before starting another set of sections, retaining the existing break
and daily-limit checks. Room seat capacity, posted bookings, and proctor constraints
remain enforced. If the fixed day cannot hold all batches, generation reports the
problem without moving the paper to a later day. Ordinary shared papers retain
their single-sitting rule.

Overflow exams show Batch 2, Batch 3, and subsequent labels in admin, student, and
proctor schedules, attendance sheets, and the master Excel export. Original batches
have no extra badge. New schedules store batch numbers; older schedules derive
labels from their saved sittings without changing exam assignments. Backend startup
adds the nullable `exams.batch_number` column to existing databases automatically.
