"""Student name presentation without changing imported account identities."""

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v", "vi"}
_SURNAME_PARTICLES = {
    "da", "das", "de", "del", "dela", "di", "do", "dos", "du",
    "la", "las", "le", "los", "san", "santa", "van", "von",
}


def format_student_name(name):
    """Display 'Surname, Given names'; retain explicitly comma-separated names.

    The database stores one full-name field. For names without a comma, use
    the final word plus common surname particles, retaining any name suffix.
    """
    full_name = " ".join(str(name or "").split())
    if not full_name:
        return ""
    if "," in full_name:
        family, _, given = full_name.partition(",")
        if given.strip().rstrip(".").casefold() in _SUFFIXES:
            full_name = f"{family.strip()} {given.strip()}"
        else:
            return f"{family.strip()}, {given.strip()}" if given.strip() else family.strip()

    parts = full_name.split()
    if len(parts) == 1:
        return full_name
    suffix = ""
    if parts[-1].rstrip(".").casefold() in _SUFFIXES:
        suffix = parts.pop()
    surname_start = len(parts) - 1
    while surname_start > 0 and parts[surname_start - 1].casefold() in _SURNAME_PARTICLES:
        surname_start -= 1
    if surname_start == 0:
        return full_name
    family = " ".join(parts[surname_start:])
    if suffix:
        family = f"{family} {suffix}"
    return f"{family}, {' '.join(parts[:surname_start])}"
