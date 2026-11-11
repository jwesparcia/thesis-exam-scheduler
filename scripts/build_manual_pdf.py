"""
scripts/build_manual_pdf.py
─────────────────────────────────────────────────────────────
Generates a master, publication-grade PDF user manual from USER_MANUAL.md
using a styled HTML template and headless Chrome rendering.
"""

import os
import re
import sys
import subprocess
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD_PATH = os.path.join(ROOT_DIR, "USER_MANUAL.md")
HTML_OUT_PATH = os.path.join(ROOT_DIR, "USER_MANUAL_RENDER.html")
PDF_ROOT_PATH = os.path.join(ROOT_DIR, "USER_MANUAL.pdf")
PDF_FRONTEND_PATH = os.path.join(ROOT_DIR, "frontend", "public", "USER_MANUAL.pdf")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_browser():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def inline_format(text: str) -> str:
    # Escape HTML special chars first (except if already converted)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    
    # Inline code
    text = re.sub(r"`([^`]+)`", r'<code class="inline-code">\1</code>', text)
    
    # LaTeX math like $Enrollment \le RoomCapacity$
    text = re.sub(r"\$([^\$]+)\$", r'<span class="math-expr">\1</span>', text)
    
    # Bold italic
    text = re.sub(r"\*\*\*([^\*]+)\*\*\*", r"<strong><em>\1</em></strong>", text)
    # Bold
    text = re.sub(r"\*\*([^\*]+)\*\*", r"<strong>\1</strong>", text)
    # Italic
    text = re.sub(r"\*([^\*]+)\*", r"<em>\1</em>", text)
    
    # Markdown links [text](#anchor)
    text = re.sub(r"\[([^\]]+)\]\((#[^\)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^\)]+)\)", r'<a href="\2" target="_blank">\1</a>', text)
    
    return text


def markdown_to_html(md_content: str) -> str:
    lines = md_content.splitlines()
    html_lines = []
    
    in_table = False
    table_headers = []
    table_rows = []
    
    in_ul = False
    in_ol = False
    in_blockquote = False
    blockquote_lines = []
    
    def close_lists():
        nonlocal in_ul, in_ol
        res = []
        if in_ul:
            res.append("</ul>")
            in_ul = False
        if in_ol:
            res.append("</ol>")
            in_ol = False
        return res
    
    def flush_table():
        nonlocal in_table, table_headers, table_rows
        if not in_table:
            return []
        res = ['<div class="table-container"><table class="manual-table">']
        if table_headers:
            res.append("<thead><tr>")
            for h in table_headers:
                res.append(f"<th>{inline_format(h)}</th>")
            res.append("</tr></thead>")
        if table_rows:
            res.append("<tbody>")
            for row in table_rows:
                res.append("<tr>")
                for cell in row:
                    res.append(f"<td>{inline_format(cell)}</td>")
                res.append("</tr>")
            res.append("</tbody>")
        res.append("</table></div>")
        in_table = False
        table_headers = []
        table_rows = []
        return res
    
    def flush_blockquote():
        nonlocal in_blockquote, blockquote_lines
        if not in_blockquote:
            return []
        full_text = " ".join(blockquote_lines)
        callout_type = "info"
        title = "Information Notice"
        icon = "ℹ️"
        
        if "[!WARNING]" in full_text:
            callout_type = "warning"
            title = "Important Operational Safeguard"
            icon = "⚠️"
            full_text = full_text.replace("[!WARNING]", "")
        elif "[!NOTE]" in full_text:
            callout_type = "note"
            title = "Implementation Note"
            icon = "📌"
            full_text = full_text.replace("[!NOTE]", "")
        elif "[!IMPORTANT]" in full_text:
            callout_type = "important"
            title = "Critical Requirement"
            icon = "🚨"
            full_text = full_text.replace("[!IMPORTANT]", "")
            
        full_text = full_text.strip()
        res = [
            f'<div class="callout callout-{callout_type}">',
            f'  <div class="callout-header"><span class="callout-icon">{icon}</span> <strong>{title}</strong></div>',
            f'  <div class="callout-body">{inline_format(full_text)}</div>',
            '</div>'
        ]
        in_blockquote = False
        blockquote_lines = []
        return res

    i = 0
    total = len(lines)
    
    # Skip front lines until Document Version
    while i < total:
        line = lines[i].rstrip()
        
        # Handle table
        if line.startswith("|") and line.endswith("|"):
            html_lines.extend(close_lists())
            html_lines.extend(flush_blockquote())
            
            cells = [c.strip() for c in line[1:-1].split("|")]
            # Check if divider row like |:---|:---|
            if all(re.match(r"^:?-+:?$", c) for c in cells):
                i += 1
                continue
            
            if not in_table:
                in_table = True
                table_headers = cells
            else:
                table_rows.append(cells)
            i += 1
            continue
        else:
            if in_table:
                html_lines.extend(flush_table())
                
        # Handle blockquote
        if line.startswith(">"):
            html_lines.extend(close_lists())
            in_blockquote = True
            content = line.lstrip("> ").strip()
            blockquote_lines.append(content)
            i += 1
            continue
        else:
            if in_blockquote:
                html_lines.extend(flush_blockquote())
                
        # Empty line
        if not line:
            html_lines.extend(close_lists())
            i += 1
            continue
            
        # Horizontal rule
        if line == "---":
            html_lines.extend(close_lists())
            html_lines.append('<hr class="section-divider" />')
            i += 1
            continue
            
        # Headings
        if line.startswith("# "):
            html_lines.extend(close_lists())
            text = line[2:].strip()
            html_lines.append(f'<h1 class="main-title">{inline_format(text)}</h1>')
            i += 1
            continue
        if line.startswith("## "):
            html_lines.extend(close_lists())
            text = line[3:].strip()
            # Generate slug for anchor
            slug = re.sub(r"[^\w\- ]", "", text).replace(" ", "-").lower()
            html_lines.append(f'<h2 id="{slug}" class="section-title"><span class="section-marker"></span>{inline_format(text)}</h2>')
            i += 1
            continue
        if line.startswith("### "):
            html_lines.extend(close_lists())
            text = line[4:].strip()
            slug = re.sub(r"[^\w\- ]", "", text).replace(" ", "-").lower()
            html_lines.append(f'<h3 id="{slug}" class="subsection-title">{inline_format(text)}</h3>')
            i += 1
            continue
        if line.startswith("#### "):
            html_lines.extend(close_lists())
            text = line[5:].strip()
            html_lines.append(f'<h4 class="sub-subsection-title">{inline_format(text)}</h4>')
            i += 1
            continue
            
        # Ordered list
        m_ol = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        if m_ol:
            if in_ul:
                html_lines.append("</ul>")
                in_ul = False
            if not in_ol:
                html_lines.append('<ol class="manual-ol">')
                in_ol = True
            item_text = m_ol.group(3)
            html_lines.append(f'<li><span class="li-content">{inline_format(item_text)}</span></li>')
            i += 1
            continue
            
        # Unordered list
        m_ul = re.match(r"^(\s*)[-\*]\s+(.*)$", line)
        if m_ul:
            indent = len(m_ul.group(1))
            if in_ol:
                html_lines.append("</ol>")
                in_ol = False
            if not in_ul:
                html_lines.append('<ul class="manual-ul">')
                in_ul = True
            item_text = m_ul.group(2)
            subclass = "nested-li" if indent >= 2 else ""
            html_lines.append(f'<li class="{subclass}">{inline_format(item_text)}</li>')
            i += 1
            continue
            
        # Standard paragraph
        html_lines.extend(close_lists())
        html_lines.append(f'<p class="manual-p">{inline_format(line)}</p>')
        i += 1

    html_lines.extend(close_lists())
    html_lines.extend(flush_blockquote())
    html_lines.extend(flush_table())
    
    return "\n".join(html_lines)


def generate_full_html(body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Master System User Manual - Automated Examination Timetable & Proctor Scheduling System</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 16mm 14mm 18mm 14mm;
      @bottom-right {{
        content: counter(page);
        font-size: 8pt;
        color: #64748b;
      }}
    }}

    *, *::before, *::after {{
      box-sizing: border-box;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }}

    /* Cover Page */
    .cover-page {{
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 98vh;
      padding: 30px 20px 20px 20px;
      text-align: center;
      border: 2px solid #005696;
      border-radius: 12px;
      position: relative;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 50%, #f0f7ff 100%);
    }}

    .cover-top {{
      margin-top: 40px;
    }}

    .cover-badge {{
      display: inline-block;
      background-color: #005696;
      color: #ffffff;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 18px;
      border-radius: 30px;
      margin-bottom: 25px;
    }}

    .cover-title {{
      font-size: 26pt;
      font-weight: 900;
      color: #005696;
      line-height: 1.2;
      margin: 0 0 15px 0;
      letter-spacing: -0.5px;
    }}

    .cover-subtitle {{
      font-size: 13pt;
      color: #334155;
      font-weight: 600;
      max-width: 600px;
      margin: 0 auto 30px auto;
      line-height: 1.45;
    }}

    .cover-divider {{
      width: 80px;
      height: 4px;
      background-color: #ffd100;
      margin: 0 auto 35px auto;
      border-radius: 2px;
    }}

    .cover-roles-grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      max-width: 650px;
      margin: 0 auto 40px auto;
      text-align: left;
    }}

    .cover-role-card {{
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.03);
    }}

    .cover-role-card h4 {{
      margin: 0 0 4px 0;
      font-size: 9.5pt;
      color: #005696;
      font-weight: 700;
    }}

    .cover-role-card p {{
      margin: 0;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.35;
    }}

    .cover-meta {{
      background: #f1f5f9;
      border-radius: 8px;
      padding: 15px;
      max-width: 650px;
      margin: 0 auto;
      font-size: 8pt;
      color: #475569;
      display: flex;
      justify-content: space-around;
      border-left: 4px solid #005696;
    }}

    .cover-bottom {{
      margin-bottom: 20px;
      font-size: 8.5pt;
      color: #64748b;
    }}

    /* Main Headings */
    h1.main-title {{
      font-size: 18pt;
      color: #005696;
      font-weight: 800;
      border-bottom: 2px solid #005696;
      padding-bottom: 6px;
      margin-top: 25px;
      margin-bottom: 12px;
    }}

    h2.section-title {{
      font-size: 14pt;
      font-weight: 800;
      color: #005696;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 5px;
      margin-top: 28px;
      margin-bottom: 12px;
      page-break-before: always;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    h2#1-system-overview--architecture {{
      page-break-before: auto !important;
    }}

    .section-marker {{
      display: inline-block;
      width: 6px;
      height: 18px;
      background-color: #ffd100;
      border-radius: 2px;
    }}

    h3.subsection-title {{
      font-size: 11.5pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 20px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }}

    h4.sub-subsection-title {{
      font-size: 10pt;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }}

    p.manual-p {{
      margin-top: 0;
      margin-bottom: 8px;
      text-align: justify;
    }}

    /* Lists */
    ul.manual-ul, ol.manual-ol {{
      margin-top: 4px;
      margin-bottom: 10px;
      padding-left: 20px;
    }}

    li {{
      margin-bottom: 4px;
    }}

    li.nested-li {{
      margin-left: 15px;
      list-style-type: circle;
    }}

    /* Code and Math */
    code.inline-code {{
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 8.5pt;
      background-color: #f1f5f9;
      color: #005696;
      padding: 1.5px 4px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }}

    span.math-expr {{
      font-family: "Cambria Math", "Times New Roman", serif;
      font-style: italic;
      background-color: #faf5ff;
      color: #7e22ce;
      padding: 1px 4px;
      border-radius: 4px;
      border: 1px solid #f3e8ff;
    }}

    /* Callout Boxes */
    .callout {{
      border-radius: 8px;
      padding: 10px 14px;
      margin: 12px 0;
      page-break-inside: avoid;
      font-size: 9pt;
      line-height: 1.45;
    }}

    .callout-warning {{
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      color: #92400e;
    }}

    .callout-info, .callout-note {{
      background-color: #f0f9ff;
      border-left: 4px solid #0284c7;
      color: #075985;
    }}

    .callout-important {{
      background-color: #fef2f2;
      border-left: 4px solid #ef4444;
      color: #991b1b;
    }}

    .callout-header {{
      font-size: 9pt;
      font-weight: 700;
      margin-bottom: 3px;
    }}

    .callout-body {{
      font-size: 8.5pt;
    }}

    /* Tables */
    .table-container {{
      margin: 14px 0;
      page-break-inside: avoid;
    }}

    table.manual-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      line-height: 1.4;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
    }}

    table.manual-table th {{
      background-color: #005696;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #004b83;
    }}

    table.manual-table td {{
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }}

    table.manual-table tr:nth-child(even) {{
      background-color: #f8fafc;
    }}

    /* Section Divider */
    hr.section-divider {{
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 20px 0;
    }}

    a {{
      color: #005696;
      text-decoration: none;
      font-weight: 600;
    }}

    a:hover {{
      text-decoration: underline;
    }}

    /* Print Controls */
    @media print {{
      body {{
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }}
      .no-print {{
        display: none !important;
      }}
    }}
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-page">
    <div class="cover-top">
      <div class="cover-badge">STI College • Academic Year 2026–2027</div>
      <h1 class="cover-title">Automated Examination Timetable & Proctor Scheduling System</h1>
      <div class="cover-divider"></div>
      <p class="cover-subtitle">
        Comprehensive Master System User Manual & Operational Reference Guide covering Architecture, Genetic Algorithm Optimization, Multi-Departmental Timetable Administration, Live Proctor Monitoring, and Smart Irregular Student Conflict Resolution.
      </p>

      <div class="cover-roles-grid">
        <div class="cover-role-card">
          <h4>Academic Head (Super Admin)</h4>
          <p>Cross-departmental schedule generation, GA constraint balancing, and universal petition approvals.</p>
        </div>
        <div class="cover-role-card">
          <h4>Program Heads / Dept Admins</h4>
          <p>Curriculum ingestion, faculty availability tracking, room capacity management, and student reviews.</p>
        </div>
        <div class="cover-role-card">
          <h4>Faculty Proctors & Students</h4>
          <p>Live on-site attendance check-ins, teaching load submissions, and automated conflict-free slot assignments.</p>
        </div>
      </div>

      <div class="cover-meta">
        <div><strong>Document Version:</strong> 2.5.0</div>
        <div><strong>Core Engine:</strong> AI Genetic Algorithm</div>
        <div><strong>Backend:</strong> FastAPI + PostgreSQL + Redis</div>
        <div><strong>Frontend:</strong> React 19 + Vite</div>
      </div>
    </div>

    <div class="cover-bottom">
      <p style="margin: 0; font-weight: 600; color: #005696;">STI Examination Scheduling System Documentation Team</p>
      <p style="margin: 3px 0 0 0;">Official Campus Software Documentation • All Rights Reserved</p>
    </div>
  </div>

  <!-- Body Content -->
  <div class="manual-body">
    {body_html}
  </div>

</body>
</html>
"""


def main():
    print("=" * 70)
    print("BUILDING MASTER SYSTEM USER MANUAL PDF")
    print("=" * 70)

    if not os.path.exists(MD_PATH):
        print(f"[ERROR] Markdown file not found at: {MD_PATH}")
        sys.exit(1)

    with open(MD_PATH, "r", encoding="utf-8") as f:
        md_text = f.read()

    print(f"[OK] Read USER_MANUAL.md ({len(md_text)} characters)")

    # Convert Markdown to HTML
    body_html = markdown_to_html(md_text)
    full_html = generate_full_html(body_html)

    with open(HTML_OUT_PATH, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"[OK] Rendered HTML written to: {HTML_OUT_PATH}")

    # Locate Chrome / Edge
    browser_path = find_browser()
    if not browser_path:
        print("[ERROR] Chrome or Edge browser executable not found!")
        sys.exit(1)

    print(f"[OK] Using browser at: {browser_path}")

    # Generate PDF via Chrome Headless
    abs_html_path = os.path.abspath(HTML_OUT_PATH)
    abs_pdf_path = os.path.abspath(PDF_ROOT_PATH)

    cmd = [
        browser_path,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        f"--print-to-pdf={abs_pdf_path}",
        abs_html_path
    ]

    print("[RUN] Executing headless print-to-pdf command...")
    res = subprocess.run(cmd, capture_output=True, text=True)

    if not os.path.exists(PDF_ROOT_PATH):
        print(f"[ERROR] PDF generation failed: {res.stderr}")
        sys.exit(1)

    file_size = os.path.getsize(PDF_ROOT_PATH)
    print(f"[SUCCESS] Generated master PDF: {PDF_ROOT_PATH} ({file_size:,} bytes)")

    # Also copy to frontend/public for in-app one-click downloading
    os.makedirs(os.path.dirname(PDF_FRONTEND_PATH), exist_ok=True)
    shutil.copy2(PDF_ROOT_PATH, PDF_FRONTEND_PATH)
    print(f"[SUCCESS] Copied manual to frontend public directory: {PDF_FRONTEND_PATH}")

    # Clean up temporary HTML render file
    if os.path.exists(HTML_OUT_PATH):
        try:
            os.remove(HTML_OUT_PATH)
        except Exception:
            pass

    print("=" * 70)
    print("PDF MANUAL BUILD COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    main()

