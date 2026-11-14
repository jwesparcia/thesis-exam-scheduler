"""A generated schedule always belongs to one specific examination term."""

from fastapi import HTTPException

_CANONICAL_TERMS = {value.casefold(): value for value in (
    "Prelim", "Midterm", "Pre-Final", "Final", "ST1", "ST2", "T1", "T2", "T3",
)}


def normalize_exam_term(value):
    if not isinstance(value, str) or not value.strip() or value.strip().casefold() == "all":
        raise ValueError("Select one examination term. Schedules for different terms are managed separately.")
    value = value.strip()
    return _CANONICAL_TERMS.get(value.casefold(), value)


def require_exam_term(value):
    try:
        return normalize_exam_term(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
