"""Private attendance photos and lightweight metadata for dashboard lists."""

import io
import warnings

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from model import ProctorAttendanceProof

MAX_ATTENDANCE_PHOTO_BYTES = 10 * 1024 * 1024
PHOTO_CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def validate_attendance_photo(content):
    if not content:
        raise HTTPException(status_code=400, detail="Choose a photo showing that you are in the assigned exam room.")
    if len(content) > MAX_ATTENDANCE_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="The attendance photo is too large. Upload a JPG, PNG, or WebP photo up to 10 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as photo:
                content_type = PHOTO_CONTENT_TYPES.get(photo.format)
                if not content_type:
                    raise HTTPException(status_code=400, detail="Upload a JPG, PNG, or WebP photo. Other file types are not supported.")
                photo.verify()
                return content_type
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable photo. Choose a valid JPG, PNG, or WebP image.") from exc


def proof_matches_assignment(proof, exam):
    slot = exam.timeslot
    return bool(
        proof and slot
        and proof.proctor_id == exam.proctor_id
        and proof.room_id == exam.room_id
        and proof.timeslot_id == exam.timeslot_id
        and (proof.exam_date, proof.start_time, proof.end_time) == (slot.date, slot.start_time, slot.end_time)
    )


def attendance_proof_metadata(db, exams):
    assigned = {exam.id: exam for exam in exams if exam.proctor_id}
    if not assigned:
        return {}
    rows = db.query(ProctorAttendanceProof).filter(ProctorAttendanceProof.exam_id.in_(assigned)).all()
    return {
        proof.exam_id: {
            "id": proof.id,
            "url": f"/proctors/{proof.proctor_id}/attendance-proof/{proof.exam_id}",
            "uploaded_at": proof.uploaded_at.isoformat() + "Z",
            "room": proof.room_name,
            "matches_assignment": proof_matches_assignment(proof, assigned[proof.exam_id]),
        }
        for proof in rows
        if proof.proctor_id == assigned[proof.exam_id].proctor_id
    }
