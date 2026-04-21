from sqlalchemy import create_engine, text

engine = create_engine('postgresql+psycopg2://postgres:may312005@localhost:5432/exam_scheduler')
with engine.connect() as conn:
    res = conn.execute(text("SELECT name, email FROM users WHERE role = 'proctor' AND email LIKE '%.%@school.edu' ORDER BY name ASC"))
    print("PROCTOR ACCOUNTS (Format: Name: Email)")
    print("-" * 50)
    for r in res:
        print(f"{r[0]}: {r[1]}")
