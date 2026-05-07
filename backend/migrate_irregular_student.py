from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS student_type VARCHAR DEFAULT 'regular'"))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS irregular_selections (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            subject_id INTEGER REFERENCES subjects(id),
            section_id INTEGER REFERENCES sections(id)
        )
    """))
    conn.commit()
    print("Migration complete.")