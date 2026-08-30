import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_SENDER = os.getenv("SMTP_SENDER")

LOG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "debug", "sent_emails.log")

def send_verification_email(recipient_email: str, code: str) -> bool:
    subject = "STI Exam Scheduler - Verification Code"
    body = f"""
Hello,

You are logging in for the first time. To proceed with changing your password, please use the following verification code:

Verification Code: {code}

This code is valid for 15 minutes.

If you did not request this, please ignore this email.

Best regards,
STI Exam Scheduler Team
"""
    
    # Try sending via SMTP if credentials are configured
    if SMTP_HOST and SMTP_PORT and SMTP_USERNAME and SMTP_PASSWORD:
        try:
            port = int(SMTP_PORT)
            msg = MIMEMultipart()
            msg["From"] = SMTP_SENDER or SMTP_USERNAME
            msg["To"] = recipient_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            
            # Use SSL/TLS or StartTLS based on port
            if port == 465:
                server = smtplib.SMTP_SSL(SMTP_HOST, port)
            else:
                server = smtplib.SMTP(SMTP_HOST, port)
                server.starttls()
                
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(msg["From"], recipient_email, msg.as_string())
            server.quit()
            print(f"SMTP Email sent successfully to {recipient_email}")
            return True
        except Exception as e:
            print(f"Failed to send SMTP email: {e}")
            # Fall back to logging
            
    # Fallback to local logging
    try:
        os.makedirs(os.path.dirname(LOG_FILE_PATH), exist_ok=True)
        log_entry = f"========================================\n" \
                    f"TIMESTAMP: {datetime.now().isoformat()}\n" \
                    f"TO: {recipient_email}\n" \
                    f"SUBJECT: {subject}\n" \
                    f"BODY:\n{body.strip()}\n" \
                    f"========================================\n\n"
        with open(LOG_FILE_PATH, "a") as f:
            f.write(log_entry)
        print(f"Email fallback logged to {LOG_FILE_PATH}")
        return True
    except Exception as e:
        print(f"Failed to write email fallback log: {e}")
        return False
