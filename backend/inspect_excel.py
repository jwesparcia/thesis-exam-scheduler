import pandas as pd
import sys

try:
    file_path = "e:/thesis-exam-scheduler/ICT SY2526 T2.xlsx"
    # List sheet names
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    
    # Read the first sheet or a specific one if possible
    df = pd.read_excel(file_path, sheet_name=0)
    print("\nFirst 10 rows:")
    print(df.head(10).to_string())
    
    print("\nColumns:")
    print(df.columns.tolist())
except Exception as e:
    print(f"Error: {e}")
