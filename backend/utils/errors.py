"""Translate raw/technical exceptions into messages end users can act on."""
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
    (r"connection (refused|to server)|could not connect|OperationalError|server closed the connection|psycopg2|SSL SYSCALL",
     "Cannot reach the database right now. Please try again in a few moments."),
    (r"Permission denied|PermissionError|Errno 13|being used by another process",
     "The file is locked or cannot be accessed. Close it in Excel (or any other program) and try again."),
    (r"Excel|xlrd|openpyxl|BadZipFile|zipfile|read_excel",
     "The uploaded file could not be read. Make sure it is a valid Excel (.xlsx) file that is not open or corrupted, and that it uses the expected columns."),
    (r"KeyError|IndexError|AttributeError|TypeError|NoneType|object has no attribute|unsupported operand|list index|not subscriptable|\[SQL:|Traceback|sqlalchemy|Background on this error",
     None),  # technical -> fall through to generic
]

GENERIC = "Something went wrong while processing your request. Please try again, and contact the system administrator if the problem continues."


def humanize_error(exc, action=None):
    """Return a user-friendly message for `exc` and log the technical details."""
    raw = str(exc) or exc.__class__.__name__
    logger.error("%s failed: %s: %s", action or "Request", exc.__class__.__name__, raw, exc_info=exc)
    haystack = f"{exc.__class__.__name__}: {raw}"
    friendly = None
    matched = False
    for pattern, message in _RULES:
        if re.search(pattern, haystack, re.IGNORECASE):
            matched = True
            friendly = message
            break
    if not matched and isinstance(exc, (ValueError, RuntimeError)) and len(raw) < 300:
        # Errors raised deliberately by the application are already readable.
        friendly = raw
    friendly = friendly or GENERIC
    if action:
        return f"{action}. {friendly}"
    return friendly
