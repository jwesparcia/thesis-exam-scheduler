import importlib
from datetime import date
from database import SessionLocal

def run_schedule():
    scheduler = importlib.import_module('utils.scheduler')
    # Use closer-to-production params
    scheduler.POP_SIZE = 50
    scheduler.GENERATIONS = 100
    scheduler.MUTATION_RATE = 0.20
    result = scheduler.generate_exam_schedule(
        db=SessionLocal(),
        start_date=date(2026, 5, 20),
        department="College",
        semester=1,
    )
    print("GA schedule generation result:", result)

if __name__ == "__main__":
    run_schedule()
