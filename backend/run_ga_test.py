import importlib
from datetime import date
from database import SessionLocal

def run_small_schedule():
    # Import the scheduler module and adjust GA parameters for faster execution
    scheduler = importlib.import_module('utils.scheduler')
    # Reduce population size and generations to make the algorithm finish quickly
    scheduler.POP_SIZE = 20  # original was 50
    scheduler.GENERATIONS = 30  # original was 80
    scheduler.MUTATION_RATE = 0.2  # keep mutation rate
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
    run_small_schedule()
