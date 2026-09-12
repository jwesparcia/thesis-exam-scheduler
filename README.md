# Automated Examination Timetable and Proctor Scheduling System

An AI-driven examination timetable and proctor management system designed for higher education institutions. The system utilizes a Genetic Algorithm (GA) to automatically generate optimal, conflict-free examination schedules adhering to institutional distribution rules, room capacities, and proctor availabilities.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture & Tech Stack](#system-architecture--tech-stack)
- [Key Features](#key-features)
  - [Program Head / Administrator](#1-program-head--administrator)
  - [Proctors / Faculty](#2-proctors--faculty)
  - [Students](#3-students)
- [Prerequisites](#prerequisites)
- [Step-by-Step Setup Guide](#step-by-step-setup-guide)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Default Login Credentials](#default-login-credentials)
- [Environment Configuration Reference](#environment-configuration-reference)
- [Project Directory Structure](#project-directory-structure)
- [License](#license)

---

## Overview

Traditional manual examination scheduling often suffers from room double-bookings, overlapping student exam slots, proctor availability conflicts, and uneven subject distribution.

This platform automates the examination scheduling workflow using a multi-objective **Genetic Algorithm (GA)**. It optimizes:
- **Hard Constraints**: Zero student section conflicts, zero room double-bookings, zero proctor overlap, and room capacity limits.
- **Soft Constraints & Distribution Rules**: Departmental examination matrices (e.g., General Education in morning sessions, Major subjects distributed evenly across examination days), balanced proctor workload distribution, and minimal gap times.

---

## System Architecture & Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **ORM & Database**: SQLAlchemy with PostgreSQL (`psycopg2-binary`)
- **Optimization Engine**: Genetic Algorithm engine with customizable generations, population size, elitism, crossover, and mutation rates
- **Caching & Performance**: Redis (optional caching for catalog queries, schedule states, and rate limiting; automatically falls back to database-only if Redis is offline)
- **Authentication**: JWT (JSON Web Tokens) with `bcrypt` password hashing and role-based access control (RBAC)
- **Data Import/Export**: OpenPyXL and Pandas for spreadsheet ingestion (proctor schedules, student lists, room data) and master schedule Excel export
- **Notifications**: SMTP integration for transactional notifications and rescheduling updates

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS with dark/light mode support
- **Icons**: Heroicons (clean SVG icons, no emoji reliance)
- **Routing & Networking**: React Router v7, Axios with Bearer token interceptors

---

## Key Features

### 1. Program Head / Administrator
- **Automated Schedule Generator**: Select department (College / SHS), semester, and term; execute the GA solver with real-time progress updates.
- **Distribution Rules Engine**: Enforce customizable rules per subject category (e.g., GE subjects confined to morning sessions on Days 1-3).
- **Proctor Allocation & Monitoring**: Track proctor availability submissions, send reminders, and view duty distribution.
- **Rescheduling Request Management**: Review, approve, or reject student rescheduling petitions.
- **Master Excel Export**: Download formatted, color-coded master exam schedules.
- **Curriculum & Student Ingestion**: Bulk-import sections, curriculum catalogs, and enrolled students via Excel templates.

### 2. Proctors / Faculty
- **Schedule Submission**: Upload teaching availability matrix via Excel or manual entry.
- **Assigned Duties Dashboard**: View assigned dates, timeslots, and room allocations.
- **Notifications**: Receive instant updates on duty assignments and institutional notices.

### 3. Students
- **Personalized Timetable**: View individual examination schedules by selecting enrolled course and section.
- **Automated Conflict Detection**: Immediate flagging of overlapping exams or tight schedules.
- **Smart Rescheduling Assistant**: Suggests available vacant slots (90-minute blocks) when requesting a schedule adjustment.
- **Direct Messaging**: In-app communication channel with administrators for scheduling inquiries.

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Python**: Version 3.11 or higher
- **Node.js**: Version 18.x or higher (with `npm`)
- **PostgreSQL**: Version 14 or higher (running locally or accessible via network)
- **Redis** *(Optional)*: Version 6 or higher (improves cache performance; system runs without it if unavailable)

---

## Step-by-Step Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/jwesparcia/thesis-exam-scheduler.git
cd thesis-exam-scheduler
```

---

### 2. Backend Setup

1. **Navigate to the backend folder**:
   ```bash
   cd backend
   ```

2. **Create and activate a Python virtual environment**:
   - **Windows (PowerShell)**:
     ```powershell
     py -3.11 -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - **Windows (Command Prompt)**:
     ```cmd
     py -3.11 -m venv venv
     venv\Scripts\activate.bat
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up PostgreSQL Database**:
   - Start your PostgreSQL service.
   - Create a database named `exam_scheduler`:
     ```sql
     CREATE DATABASE exam_scheduler;
     ```

5. **Configure environment variables**:
   - Copy the template file:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and configure your credentials:
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
     SMTP_PASSWORD=your_email_app_password
     SMTP_SENDER=your_email@example.com
     ```

6. **Initialize and seed the database**:
   Run the database setup script to generate tables, room data, year levels, default distribution rules, and the administrator account:
   ```bash
   python setup_db.py
   ```

7. **Start the backend development server**:
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```
   - API Base URL: `http://localhost:8000`
   - Interactive OpenAPI Documentation (Swagger UI): `http://localhost:8000/docs`

---

### 3. Frontend Setup

1. **Open a new terminal and navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Node.js packages**:
   ```bash
   npm install
   ```

3. **Configure frontend environment** *(Optional)*:
   - Copy the template file:
     ```bash
     cp .env.example .env
     ```
   - By default, it points to `http://localhost:8000`. You only need to edit this if your backend runs on a different port or host:
     ```env
     VITE_API_URL=http://localhost:8000
     ```

4. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   - The application will be accessible at: `http://localhost:5173`

---

## Default Login Credentials

After executing `python setup_db.py`, the following administrative account is ready for use:

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Program Head / Admin** | `admin@school.edu` | `admin123` | Full access to schedule generator, proctor monitoring, rules, and student import |

> [!NOTE]
> Additional faculty, proctor, and student accounts are created automatically upon importing Excel rosters or proctor schedules through the Admin Dashboard.

---

## Environment Configuration Reference

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/exam_scheduler` |
| `SECRET_KEY` | Secret used to sign JWT authentication tokens | `your-secret-key-change-in-production` |
| `REDIS_HOST` | Hostname of the Redis cache service | `localhost` |
| `REDIS_PORT` | Port number of the Redis service | `6379` |
| `REDIS_PASSWORD`| Password for Redis authentication (leave blank if none) | *None* |
| `REDIS_DB` | Database index for Redis | `0` |
| `SMTP_HOST` | SMTP server host for sending emails | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (typically 587 for TLS) | `587` |
| `SMTP_USERNAME` | SMTP authentication user / email address | `your_email@example.com` |
| `SMTP_PASSWORD` | SMTP password or Google App Password | `your_app_password` |
| `SMTP_SENDER` | Sender address appearing on outgoing emails | `your_email@example.com` |
| `VITE_API_URL` | Base URL used by the React frontend to reach FastAPI | `http://localhost:8000` |

---

## Project Directory Structure

```plaintext
thesis-exam-scheduler/
├── .env.example                   # Master environment template
├── .gitignore                     # Git ignore definitions
├── requirements.txt               # Top-level Python dependency pointer
├── security_documentation.md      # Security considerations & implementation notes
│
├── backend/                       # FastAPI Backend
│   ├── .env.example               # Backend environment template
│   ├── main.py                    # Application entry point & route definitions
│   ├── setup_db.py                # Database initialization & baseline seed script
│   ├── seed.py                    # Comprehensive test seed generator
│   ├── room_data.py               # Campus room inventory definitions
│   ├── requirements.txt           # Python dependency specifications
│   ├── core/                      # Database engine, base models, & Redis cache layer
│   │   ├── database.py
│   │   └── cache.py
│   ├── model/                     # SQLAlchemy ORM models
│   │   └── models.py
│   ├── schema/                    # Pydantic schemas for request/response validation
│   │   └── schemas.py
│   ├── routers/                   # API route handlers
│   │   ├── auth.py                # Authentication, JWT, and password reset
│   │   ├── catalog.py             # Courses, subjects, sections, and student import
│   │   ├── exams.py               # Exam schedule operations, save, post, & export
│   │   ├── scheduler.py           # Genetic algorithm scheduling endpoints
│   │   ├── proctors.py            # Proctor availability & scheduling
│   │   ├── rescheduling.py        # Student rescheduling requests & approvals
│   │   ├── rules.py               # Subject distribution rules management
│   │   ├── notifications.py       # Notification handling
│   │   └── chat.py                # Administrative messaging
│   └── utils/                     # Core scheduler logic, GA engine, & mail utility
│       ├── scheduler.py           # Genetic algorithm implementation
│       └── mail.py                # SMTP notification service
│
└── frontend/                      # React + Vite Frontend
    ├── .env.example               # Frontend environment template
    ├── package.json               # Node.js dependencies and build scripts
    ├── vite.config.js             # Vite configuration
    ├── index.html                 # HTML application template
    └── src/                       # React source files
        ├── App.jsx                # Route declarations & ErrorBoundary
        ├── api.js                 # Configured Axios instance with interceptors
        ├── components/            # Reusable UI widgets and manager modules
        │   ├── ExamScheduler.jsx  # Schedule generation console with GA progress
        │   ├── DistributionRulesManager.jsx
        │   ├── ProctorMonitoring.jsx
        │   ├── Header.jsx
        │   └── Sidebar.jsx
        └── pages/                 # Role-specific dashboard views
            ├── Login.jsx          # User authentication page
            ├── ProgramHeadDashboard.jsx
            ├── ProctorDashboard.jsx
            └── StudentDashboard.jsx
```
