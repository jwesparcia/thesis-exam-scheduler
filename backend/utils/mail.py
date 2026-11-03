import os
import smtplib
import email.utils
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv

# Ensure .env is loaded from backend directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path)

# Load SMTP configuration with reliable defaults
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT_RAW = os.getenv("SMTP_PORT", "587")
try:
    SMTP_PORT = int(SMTP_PORT_RAW)
except (ValueError, TypeError):
    SMTP_PORT = 587

SMTP_USERNAME = os.getenv("SMTP_USERNAME", "jhuneesparcia1@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "npsh ffcf oodr idwe")
SMTP_SENDER = os.getenv("SMTP_SENDER", "jhuneesparcia1@gmail.com")

LOG_FILE_PATH = os.path.join(BASE_DIR, "debug", "sent_emails.log")

def send_verification_email(recipient_email: str, code: str) -> bool:
    """
    Sends a 6-digit verification code to the recipient's email address via SMTP.
    Supports Microsoft 365 / Outlook, Gmail, and standard academic email providers
    with clean multipart plain text + HTML formatting.
    """
    subject = "STI Exam Scheduler - Password Verification Code"
    
    plain_text = f"""STI Examination Scheduling System
----------------------------------------
Hello,

You have requested a verification code to update your account password.
Please use the following 6-digit code:

    VERIFICATION CODE: {code}

This code will expire in 15 minutes.
If you did not make this request, please contact the administrator immediately.

Best regards,
STI Exam Scheduler Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #005696; padding: 26px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">STI College</h1>
              <p style="margin: 4px 0 0 0; color: #ffd100; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Examination Scheduling System</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 30px 30px 20px 30px;">
              <h2 style="margin: 0 0 10px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Account Password Verification</h2>
              <p style="margin: 0 0 18px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                We received a request to update the password for your account (<strong>{recipient_email}</strong>). Please enter the following 6-digit one-time code on the security page:
              </p>

              <!-- Code Box -->
              <div style="background-color: #f8fafc; border: 2px dashed #005696; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 6px; font-weight: 600;">One-Time Security Code</span>
                <span style="display: inline-block; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #005696;">{code}</span>
              </div>

              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                ⏱️ This code is valid for <strong>15 minutes</strong>. Do not share it with anyone.
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                If you did not initiate this request, you can safely ignore this message.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                STI Thesis Exam Scheduler &bull; Automated Identity Verification
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    if not (SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD):
        print("SMTP credentials are not configured.")
        return False

    sender_addr = SMTP_SENDER or SMTP_USERNAME
    app_password = SMTP_PASSWORD.replace(" ", "")

    msg = MIMEMultipart("alternative")
    msg["From"] = f"STI Exam Scheduler <{sender_addr}>"
    msg["To"] = recipient_email
    msg["Subject"] = subject
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid(domain="exam-scheduler.sti.edu")

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
            server.starttls()

        server.login(SMTP_USERNAME, app_password)
        server.sendmail(sender_addr, [recipient_email], msg.as_string())
        server.quit()
        print(f"SMTP Email delivered successfully to {recipient_email}")
        return True
    except Exception as e:
        print(f"Failed to dispatch SMTP email to {recipient_email}: {e}")
        try:
            os.makedirs(os.path.dirname(LOG_FILE_PATH), exist_ok=True)
            log_entry = (
                f"========================================\n"
                f"TIMESTAMP: {datetime.now().isoformat()}\n"
                f"TO: {recipient_email}\n"
                f"SUBJECT: {subject}\n"
                f"ERROR: {str(e)}\n"
                f"========================================\n\n"
            )
            with open(LOG_FILE_PATH, "a") as f:
                f.write(log_entry)
        except Exception:
            pass
        return False
