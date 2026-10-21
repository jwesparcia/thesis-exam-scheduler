AVAILABLE_EXAM_ROOMS = [
    {"name": "B201", "building": "B", "department": "College"},
    {"name": "B202", "building": "B", "department": "College"},
    {"name": "B203", "building": "B", "department": "College"},
    {"name": "B204", "building": "B", "department": "College"},
    {"name": "B206", "building": "B", "department": "College"},
    {"name": "B207", "building": "B", "department": "College"},
    {"name": "B211", "building": "B", "department": "College"},
    {"name": "B301", "building": "B", "department": "College"},
    {"name": "B302", "building": "B", "department": "College"},
    {"name": "B303", "building": "B", "department": "College"},
    {"name": "B304", "building": "B", "department": "College"},
    {"name": "B305", "building": "B", "department": "College"},
    {"name": "B306", "building": "B", "department": "College"},
    {"name": "B307", "building": "B", "department": "College"},
    {"name": "B401", "building": "B", "department": "College"},
    {"name": "B402", "building": "B", "department": "College"},
    {"name": "B403", "building": "B", "department": "College"},
    {"name": "B404", "building": "B", "department": "College"},
    {"name": "B405", "building": "B", "department": "College"},
    {"name": "B406", "building": "B", "department": "College"},
    {"name": "B407", "building": "B", "department": "College"},
    {"name": "B408", "building": "B", "department": "College"},
    {"name": "B411", "building": "B", "department": "College"},
    {"name": "B412", "building": "B", "department": "College"},
    {"name": "B414", "building": "B", "department": "College"},
    {"name": "B415", "building": "B", "department": "College"},
    {"name": "B504", "building": "B", "department": "College"},
    {"name": "B505", "building": "B", "department": "College"},
    {"name": "B506", "building": "B", "department": "College"},
    {"name": "B507", "building": "B", "department": "College"},
    {"name": "B508", "building": "B", "department": "College"},
    {"name": "B510", "building": "B", "department": "College"},
    {"name": "B511", "building": "B", "department": "College"},
    {"name": "B605", "building": "B", "department": "College"},
    {"name": "B606", "building": "B", "department": "College"},
    {"name": "B607", "building": "B", "department": "College"},
    {"name": "B701", "building": "B", "department": "College"},
    {"name": "B702", "building": "B", "department": "College"},
    {"name": "B703", "building": "B", "department": "College"},
    {"name": "B704", "building": "B", "department": "College"},
    {"name": "B705", "building": "B", "department": "College"},
    {"name": "C201", "building": "C", "department": "SHS"},
    {"name": "C202", "building": "C", "department": "SHS"},
    {"name": "C203", "building": "C", "department": "SHS"},
    {"name": "C204", "building": "C", "department": "SHS"},
    {"name": "C205", "building": "C", "department": "SHS"},
    {"name": "C206", "building": "C", "department": "SHS"},
    {"name": "C207", "building": "C", "department": "SHS"},
    {"name": "C208", "building": "C", "department": "SHS"},
    {"name": "C210", "building": "C", "department": "SHS"},
    {"name": "C211", "building": "C", "department": "SHS"},
    {"name": "C212", "building": "C", "department": "SHS"},
    {"name": "C213", "building": "C", "department": "SHS"},
    {"name": "C301", "building": "C", "department": "SHS"},
    {"name": "C302", "building": "C", "department": "SHS"},
    {"name": "C303", "building": "C", "department": "SHS"},
    {"name": "C304", "building": "C", "department": "SHS"},
    {"name": "C305", "building": "C", "department": "SHS"},
    {"name": "C306", "building": "C", "department": "SHS"},
    {"name": "C307", "building": "C", "department": "SHS"},
    {"name": "C308", "building": "C", "department": "SHS"},
    {"name": "C310", "building": "C", "department": "SHS"},
    {"name": "C311", "building": "C", "department": "SHS"},
    {"name": "C312", "building": "C", "department": "SHS"},
    {"name": "C313", "building": "C", "department": "SHS"},
    {"name": "C402", "building": "C", "department": "SHS"},
    {"name": "C403", "building": "C", "department": "SHS"},
    {"name": "C404", "building": "C", "department": "SHS"},
    {"name": "C405", "building": "C", "department": "SHS"},
    {"name": "C406", "building": "C", "department": "SHS"},
    {"name": "C408", "building": "C", "department": "SHS"},
    {"name": "C410", "building": "C", "department": "SHS"},
    {"name": "C411", "building": "C", "department": "SHS"},
    {"name": "C412", "building": "C", "department": "SHS"},
    {"name": "C413", "building": "C", "department": "SHS"},
]

AVAILABLE_EXAM_ROOM_NAMES = [room["name"] for room in AVAILABLE_EXAM_ROOMS]
COLLEGE_ROOM_NAMES = [room["name"] for room in AVAILABLE_EXAM_ROOMS if room["department"] == "College"]
SHS_ROOM_NAMES = [room["name"] for room in AVAILABLE_EXAM_ROOMS if room["department"] == "SHS"]


def get_room_names_for_department(department=None, db=None):
    """
    Dynamically retrieve eligible room names from the database for the given department.
    Excludes virtual/special rooms like 'Consultation Area'.
    Falls back to static defaults if DB is unavailable or empty (e.g. initial setup/migration).
    """
    def _query(session):
        from model.models import Room
        from sqlalchemy import or_
        query = session.query(Room.name).filter(Room.name != "Consultation Area")
        if department == "SHS":
            query = query.filter(or_(Room.department == "SHS", Room.building == "C"))
        elif department == "College":
            query = query.filter(or_(Room.department == "College", Room.building == "B"))
        elif department:
            query = query.filter(Room.department == department)
        return [r[0] for r in query.order_by(Room.name).all()]

    if db is not None:
        try:
            names = _query(db)
            if names:
                return names
        except Exception:
            pass
    else:
        try:
            from core.database import SessionLocal
            with SessionLocal() as session:
                names = _query(session)
                if names:
                    return names
        except Exception:
            pass

    if department == "SHS":
        return list(SHS_ROOM_NAMES)
    if department == "College":
        return list(COLLEGE_ROOM_NAMES)
    return list(AVAILABLE_EXAM_ROOM_NAMES)

