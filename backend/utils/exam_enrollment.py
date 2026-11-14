"""Actual section/subject enrollment used to admit exams for generation."""

from collections import Counter, defaultdict

from model import User, Section, Subject, IrregularSelection


def _section_name(value):
    return " ".join(str(value or "").strip().upper().split())


def _subject_keys(subject_id, code, name):
    keys = [("id", subject_id)]
    normalized_name = " ".join(str(name or "").replace("&", " and ").strip().lower().split())
    normalized_code = " ".join(str(code or "").strip().lower().split())
    if normalized_name:
        keys.append(("name", normalized_name))
    if normalized_code not in {"", "-", "n/a", "none", "nan"}:
        keys.append(("code", normalized_code))
    return keys


def subjects_equivalent(left, right):
    """Same exam paper by identity/title; a reused code alone is insufficient."""
    left_name = " ".join(str(left.name or "").replace("&", " and ").strip().lower().split())
    right_name = " ".join(str(right.name or "").replace("&", " and ").strip().lower().split())
    return left.id == right.id or bool(left_name and left_name == right_name)


class ExamEnrollment:
    def __init__(self, db):
        students = db.query(User.id, User.section_name, User.student_type).filter(User.role == "student").all()
        self.has_student_accounts = bool(students)
        self.regular_counts = Counter()
        irregular_ids = set()
        for user_id, section_name, student_type in students:
            name = _section_name(section_name)
            if str(student_type or "").strip().lower() == "irregular" or name == "IRREGULAR":
                irregular_ids.add(user_id)
            elif name not in {"", "NAN", "NONE", "N/A"}:
                self.regular_counts[name] += 1

        section_names = {section_id: _section_name(name) for section_id, name in db.query(Section.id, Section.name)}
        subject_keys = {subject_id: _subject_keys(subject_id, code, name)
                        for subject_id, code, name in db.query(Subject.id, Subject.code, Subject.name)}
        self.irregular_by_section = defaultdict(set)
        self.irregular_by_subject = defaultdict(set)
        for user_id, section_id, subject_id in db.query(
            IrregularSelection.user_id, IrregularSelection.section_id, IrregularSelection.subject_id
        ):
            if user_id not in irregular_ids or section_id not in section_names or subject_id not in subject_keys:
                continue
            for section_key in {("id", section_id), ("name", section_names[section_id])}:
                self.irregular_by_section[section_key].add(user_id)
                for subject_key in subject_keys[subject_id]:
                    self.irregular_by_subject[(section_key, subject_key)].add(user_id)

    def regular_count(self, section):
        if not self.has_student_accounts:
            # Preserve standalone catalogue simulations. Both HTTP generation
            # routes require student accounts before starting a real job.
            return section.student_count or 35
        return self.regular_counts[_section_name(section.name)]

    def has_students(self, section):
        return self.regular_count(section) > 0 or any(
            self.irregular_by_section.get(key)
            for key in (("id", section.id), ("name", _section_name(section.name)))
        )

    def irregular_count(self, section, subject):
        user_ids = set()
        for section_key in (("id", section.id), ("name", _section_name(section.name))):
            for subject_key in _subject_keys(subject.id, subject.code, subject.name):
                user_ids.update(self.irregular_by_subject.get((section_key, subject_key), ()))
        return len(user_ids)

    def total_count(self, section, subject):
        return self.regular_count(section) + self.irregular_count(section, subject)
