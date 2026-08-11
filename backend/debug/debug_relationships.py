import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import engine
from sqlalchemy import inspect, text
from model import Base, Exam, Proctor

def debug_relationships():
    print("--- Debugging Relationships ---")
    try:
        from sqlalchemy.orm import configure_mappers
        configure_mappers()
        print("Mappers configured successfully.")
    except Exception as e:
        print(f"Error configuring mappers: {e}")

if __name__ == "__main__":
    debug_relationships()
