import pandas as pd
import sys

try:
    file_path = "e:/thesis-exam-scheduler/ICT SY2526 T2.xlsx"
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    
    for sheet in xl.sheet_names:
        print(f"\n--- Sheet: {sheet} ---")
        df = pd.read_excel(xl, sheet_name=sheet)
        print(df.head(20).to_string())
        
except Exception as e:
    print(f"Error: {e}")
