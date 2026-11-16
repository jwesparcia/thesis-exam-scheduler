"""Current program labels and compatibility with older import files."""

import re

PROGRAM_RENAMES = {"BSA": "BA", "BSPSYCH": "BAPSYCH"}
ACCOUNTANCY_PROGRAM_NAMES = ("BA", "BSA")


def normalize_program_name(value):
    if not isinstance(value, str):
        return value
    name = value.strip()
    return PROGRAM_RENAMES.get(name.upper(), name)


def normalize_program_section(value):
    if not isinstance(value, str):
        return value
    return re.sub(
        r"^(\s*)(BSA|BSPSYCH)(?=$|[\s-]|\d)",
        lambda match: match[1] + PROGRAM_RENAMES[match[2].upper()],
        value,
        flags=re.IGNORECASE,
    )
