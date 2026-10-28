import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core import SessionLocal
from model import Subject, SubjectProgram, Course, Section, TeacherTeaching, Teacher
from fastapi import UploadFile
import io
from routers.catalog import upload_catalog_excel

class DummyUser:
    id = 1
    role = "admin"

def test_upload_aligned_curriculum():
    db = SessionLocal()
    try:
        excel_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/import/school_curriculum.xlsx"))
        with open(excel_path, "rb") as f:
            content = f.read()

        file_obj = UploadFile(
            filename="school_curriculum.xlsx",
            file=io.BytesIO(content)
        )

        print("Testing upload_catalog_excel with aligned school_curriculum.xlsx...")
        # Note: clear_existing=False to test incremental update / consolidation
        result = upload_catalog_excel(
            file=file_obj,
            clear_existing=False,
            db=db,
            current_user=DummyUser()
        )
        print("Upload Result:", result)
        print(f"Total Subjects in DB: {db.query(Subject).count()}")
        print(f"Total SubjectPrograms in DB: {db.query(SubjectProgram).count()}")
        print(f"Total TeacherTeachings in DB: {db.query(TeacherTeaching).count()}")
        print("Import test PASSED successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    test_upload_aligned_curriculum()
