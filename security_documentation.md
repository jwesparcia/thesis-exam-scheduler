# Security Architecture Documentation

This document provides a detailed technical overview of the security measures implemented in the Thesis Exam Scheduler.

## 1. Authentication Layer
The system uses **JWT (JSON Web Tokens)** for stateless, secure authentication.

- **Token Generation**: Upon successful login, the server issues a JWT signed with a `SECRET_KEY` using the `HS256` algorithm.
- **Payload**: The token contains the user's `email` (subject), `role`, and `expiration time`.
- **Security**: 
  - Tokens expire after **8 hours**, minimizing the window for token misuse.
  - Passwords are never stored in plain text; they are hashed using **Bcrypt** with a secure salt.

## 2. Authorization (RBAC)
Role-Based Access Control is enforced at both the backend and frontend layers.

### Backend Enforcement
Every API endpoint is protected by a dependency-based check:
- `get_current_user`: Validates the JWT and retrieves the user from the database.
- `require_role(["role_name"])`: Ensures the authenticated user belongs to the required group.

| Role | Access Level |
| :--- | :--- |
| **Admin** | Full system access, schedule generation, proctor management, rules configuration. |
| **Proctor** | View schedules, update availability, receive reminders. |
| **Student** | View personal/section exams, submit rescheduling requests, manage irregular status. |

### Frontend Enforcement
The React application uses a `ProtectedRoute` component to wrap restricted routes, preventing unauthorized users from accessing dashboard UIs via direct URL manipulation.

## 3. Auditing & Accountability (Activity Logs)
To ensure transparency and traceability, the system maintains an **Activity Log**.

- **Recorded Data**: User ID, Action Type, Details, Timestamp, and **IP Address**.
- **Monitored Events**:
  - Login Success/Failure.
  - Exam Schedule Generation & Posting.
  - Proctor Reminders & Exclusions.
  - Rescheduling Request Submissions & Reviews.
  - Rules & Configuration Changes.

## 4. Session Management
- **Statelessness**: No session data is stored on the server, enhancing scalability and reducing memory-based attacks.
- **Inactivity Timeout**: The frontend monitors user interaction (mouse, keyboard, touch). If the user is idle for **30 minutes**, the session is destroyed, and the user is redirected to the login page.
- **Secure Storage**: Tokens are stored in `localStorage` and automatically cleared upon logout.

## 5. Input Validation & Data Security
- **Pydantic Models**: All incoming API requests are validated against strict schemas to prevent **SQL Injection** and malformed data entry.
- **SQLAlchemy ORM**: Used for all database interactions to automatically escape queries and prevent direct SQL execution risks.
- **XSS Protection**: React automatically escapes content rendered in the UI, protecting against Cross-Site Scripting.

## 6. File Upload Security
For proctor schedule uploads:
- **Format Filtering**: Only `.xlsx` and `.xls` extensions are permitted.
- **Size Limitation**: Files are capped at **5MB** to prevent server resource exhaustion.
- **Memory Processing**: Files are processed in memory using `io.BytesIO` rather than being saved to disk, reducing the risk of persistent malware storage.

## 7. Recommended Production Settings
When deploying the system, ensure the following:
1. **HTTPS/SSL**: Use a reverse proxy (like Nginx) to encrypt data in transit.
2. **Environment Secrets**: Ensure `SECRET_KEY` in `.env` is a long, random string.
3. **Database Restriction**: Ensure the database port (default 5432 or 3306) is not accessible from the public internet.
