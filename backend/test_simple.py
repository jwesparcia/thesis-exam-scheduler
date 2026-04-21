#!/usr/bin/env python3
"""
Ultra simple test - just check if we can import and run basic FastAPI
"""
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    print("✓ FastAPI imported successfully")

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root():
        return {"message": "Backend is working! No database needed."}

    @app.get("/catalog/courses")
    def get_courses():
        return [
            {"id": 1, "name": "BSIT"},
            {"id": 2, "name": "BSCS"}
        ]

    @app.get("/catalog/year-levels")
    def get_year_levels():
        return [
            {"id": 1, "name": "1st Year"},
            {"id": 2, "name": "2nd Year"},
            {"id": 3, "name": "3rd Year"},
            {"id": 4, "name": "4th Year"}
        ]

    if __name__ == "__main__":
        import uvicorn
        print("Starting test server...")
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        print("✓ FastAPI app created successfully")

except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Please run: pip install fastapi uvicorn")

except Exception as e:
    print(f"❌ Other error: {e}")
