import importlib
from datetime import date
from database import SessionLocal

def run_full_schedule():
    # Import the scheduler module; it uses the production GA parameters defined in utils.scheduler
    scheduler = importlib.import_module('utils.scheduler')
    # Run the schedule generation for the default department/semester
    result = scheduler.generate_exam_schedule(
        db=SessionLocal(),
        start_date=date(2026, 5, 20),
        department="College",
        semester=1,
    )
    print("GA schedule generation result:")
    print(result)

if __name__ == "__main__":
    run_full_schedule()
