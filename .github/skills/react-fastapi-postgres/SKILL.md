---
name: react-fastapi-postgres
description: 'Build and extend full-stack web applications with React, JavaScript, HTML5, CSS3, FastAPI, Pydantic, SQLAlchemy, and PostgreSQL. Use when creating or modifying a React frontend and Python REST API, connecting them to persistent PostgreSQL storage, organizing frontend/backend code, or implementing validation, environment configuration, responsive UI, and end-to-end feature workflows.'
argument-hint: 'Describe the feature or full-stack application to build'
user-invocable: true
---

# React, FastAPI, and PostgreSQL Development

## Purpose

Guide the user through building or extending a practical full-stack application with a React frontend, FastAPI REST backend, SQLAlchemy persistence, and PostgreSQL. Work incrementally, explain important decisions before substantial changes, and keep code approachable without sacrificing sound development practices.

## Working Principles

- Treat the existing repository as the source of truth. Inspect its structure, conventions, current dependencies, and relevant tests before proposing changes.
- If the project already exists, preserve working behavior and modify only the files needed for the requested feature. Do not scaffold over or reorganize a functioning project without a clear need.
- If starting from scratch, keep frontend and backend in separate directories and organize code by responsibility.
- Explain the intended behavior, affected files, and important design choices before major changes. When changing existing code, identify the exact files and behavior being changed; keep the patch focused.
- Use beginner-friendly names and straightforward control flow. Explain unfamiliar framework concepts briefly when they appear.
- Ask a focused question only when a missing product decision blocks implementation. Otherwise, state a reasonable assumption and proceed.
- Never put credentials in source code, frontend bundles, logs, or committed environment files.

## Procedure

1. **Clarify the target and inspect the project.** Identify the user-visible outcome and any constraints. Inspect the relevant frontend and backend entry points, data models, API conventions, configuration, dependency files, and nearby tests. Check repository instructions. Record the existing run and test commands where available.
2. **Choose the smallest architecture that fits.** For a new project, use separate `frontend/` and `backend/` directories. Keep React components and API calls on the frontend; keep FastAPI routes, Pydantic schemas, SQLAlchemy models, database setup, and business logic in clear backend modules. Reuse existing structure and libraries where practical.
3. **Describe the next vertical slice.** Before a substantial edit, explain the feature flow from UI through REST endpoint to database and back, name the files to touch, and state the key assumptions. Deliver one useful slice at a time rather than building unrelated scaffolding.
4. **Configure the database and secrets.** Read PostgreSQL connection settings from backend environment variables. Provide a safe `.env.example` with placeholder values and ensure real `.env` files are ignored by Git. Keep database credentials server-side. Use the repository's existing migration approach; if none exists and schema changes need to persist, introduce a suitable migration workflow instead of relying on ad hoc production table creation.
5. **Implement the backend path.** Define SQLAlchemy models for persisted data and Pydantic request/response schemas for API boundaries. Add focused REST routes with appropriate HTTP methods and status codes. Keep database access and nontrivial business rules out of route handlers when the project already has a service/repository pattern. Validate inputs at the API boundary, handle expected failures with clear HTTP errors, and avoid exposing stack traces or sensitive details.
6. **Implement the frontend path.** Use reusable React components and a clear API layer consistent with the project. Handle loading, success, empty, validation-error, and server-error states. Keep API base URLs configurable without exposing server secrets. Make layouts usable at desktop and mobile widths, with semantic HTML, labels, keyboard-accessible controls, and visible focus states.
7. **Connect and secure the integration.** Configure CORS for the actual frontend origin(s), not unrestricted origins in production. Confirm the frontend request/response shapes match the Pydantic schemas. Use parameterized ORM/database operations and never trust client-side validation alone. Do not log secrets or sensitive user data.
8. **Verify the changed slice.** Run the narrowest relevant backend tests or checks, frontend lint/build/tests, and any available API integration checks. Verify database behavior against PostgreSQL when the environment supports it; otherwise report clearly which database checks were not run. Check that invalid input and expected API failures produce useful responses and that frontend states render correctly. Fix regressions in the touched slice and rerun the focused checks.
9. **Close the loop.** Summarize the feature, the important files changed, commands or configuration needed to run it, verification performed, and any remaining setup or test gaps. Keep the user moving step by step and wait for feedback before starting a separate feature.

## Structure Guidance

For a new application, prefer a modest layout similar to:

```text
frontend/
  src/
    api/
    components/
    pages/
    App.jsx
    main.jsx
  .env.example
backend/
  app/
    routers/
    schemas/
    models/
    services/
    database.py
    main.py
  .env.example
  requirements.txt
```

Adapt names and layering to the repository rather than forcing this exact tree. Avoid adding layers that do not simplify real responsibilities.

## Completion Checks

A requested feature is ready when:

- The frontend can call the matching FastAPI REST endpoint and display its result.
- Persistent data is handled through SQLAlchemy and PostgreSQL configuration is environment-based.
- Request data is validated, and expected errors are handled on both the API and UI sides.
- The main interaction is usable on mobile and desktop and does not rely on color alone to communicate state.
- Relevant checks pass, or unavailable checks and required environment setup are stated explicitly.
- The changes are focused, secrets remain out of version control, and the user understands how to run the affected parts.
