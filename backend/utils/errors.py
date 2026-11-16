"""Explain failures without discarding the cause needed to diagnose them."""
import logging
import re

logger = logging.getLogger("app.errors")

# (regex on the raw message, friendly message). First match wins.
_RULES = [
    (r"foreign key|violates foreign|still referenced|IntegrityError.*(delete|update)",
     "This record is still being used by other data (such as exams, students or schedules), so it cannot be changed or removed. Remove the related records first."),
    (r"duplicate key|unique constraint|already exists|UniqueViolation",
     "This record already exists. Please check for duplicates and try again."),
    (r"not-null|null value in column|NotNullViolation",
     "A required value is missing. Please complete all required fields and try again."),
    (r"value too long|StringDataRightTruncation",
     "One of the values is too long. Please shorten it and try again."),
    (r"deadlock|could not serialize|lock timeout|canceling statement",
     "The system is busy processing another request. Please wait a moment and try again."),
    (r"UndefinedColumn|UndefinedTable|no such (column|table)|(?:column|relation) .+ does not exist",
     "The database schema is missing a required table or column. Ask the developer to check the database migrations."),
    (r"connection (refused|to server)|could not connect|server closed the connection|SSL SYSCALL|could not translate host name|password authentication failed",
     "Cannot connect to the database. Ask the administrator or developer to check the database service and connection settings."),
    (r"TimeoutError|timed out|timeout",
     "The operation timed out. Check the server or database availability and the timeout details below."),
    (r"Permission denied|PermissionError|Errno 13|being used by another process",
     "The file is locked or cannot be accessed. Close it in Excel (or any other program) and try again."),
    (r"FileNotFoundError|No such file or directory",
     "A required file could not be found. Check the file name and location shown below."),
    (r"xlrd|openpyxl|BadZipFile|zipfile|read_excel|Excel file format",
     "The uploaded file could not be read. Make sure it is a valid Excel (.xlsx) file that is not open or corrupted, and that it uses the expected columns."),
    (r"KeyError",
     "Required data is missing a field or lookup key. Ask the developer to check the key shown below."),
    (r"IndexError|list index",
     "The server tried to access an item that is missing from a list. Ask the developer to check the failing operation."),
    (r"AttributeError|object has no attribute",
     "The server tried to read an unavailable property or a missing record. Ask the developer to check the object and property shown below."),
    (r"TypeError|unsupported operand|not subscriptable",
     "The server received a value of an unexpected type. Ask the developer to check the operation and value shown below."),
]


def _diagnostic_text(raw):
    """Keep the cause, omitting SQL payloads, credentials and tracebacks."""
    text = re.split(
        r"\n\s*(?:\[SQL:|\[parameters:|\(Background on this error|Traceback|LINE \d+:|DETAIL:\s*Failing row contains)",
        raw,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    text = re.sub(r"([a-z][a-z0-9+.-]*://)[^\s/@]+@", r"\1[redacted]@", text, flags=re.IGNORECASE)
    text = re.sub(r"\bBearer\s+[\w.~+/-]+=*", "Bearer [redacted]", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\b(password|passwd|secret(?:_key)?|access_token|refresh_token|authorization|api[_-]?key)\b"
        r"([\"']?\s*[:=]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;]+)",
        r"\1\2[redacted]",
        text,
        flags=re.IGNORECASE,
    )
    text = " ".join(text.split())
    return text if len(text) <= 1000 else text[:1000] + "... (full details in server logs)"


def humanize_error(exc, action=None):
    """Return an explanation and the actual cause; log the full exception."""
    raw = str(exc) or exc.__class__.__name__
    logger.error("%s: %s: %s", action or "Request failed", exc.__class__.__name__, raw, exc_info=exc)

    # HTTP errors already contain the application's specific validation reason.
    detail = getattr(exc, "detail", None)
    if isinstance(detail, str) and detail.strip():
        message = _diagnostic_text(detail)
        return f"{action}. {message}" if action else message

    # SQLAlchemy wrappers include queries and bound values in str(exc). The
    # driver's exception contains the useful database cause without that payload.
    original = getattr(exc, "orig", None)
    diagnostic = _diagnostic_text(str(original) if original is not None else raw)
    error_type = exc.__class__.__name__
    if original is not None:
        error_type += f"/{original.__class__.__name__}"
    haystack = f"{error_type}: {diagnostic}"
    for pattern, message in _RULES:
        if re.search(pattern, haystack, re.IGNORECASE):
            break
    else:
        if isinstance(exc, (ValueError, RuntimeError)):
            # Deliberate application errors already explain the problem.
            return f"{action}. {diagnostic}" if action else diagnostic
        message = "An unexpected server error stopped this action. Ask the developer to investigate the cause below."
    result = f"{message} Developer details: {error_type}: {diagnostic}"
    return f"{action}. {result}" if action else result


def add_error_reporting(app):
    """Report uncaught request errors. Register before CORS middleware."""
    from starlette.responses import JSONResponse

    @app.middleware("http")
    async def report_request_error(request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"detail": humanize_error(exc, f"{request.method} {request.url.path} failed")},
            )
