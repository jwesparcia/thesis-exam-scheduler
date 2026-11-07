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

LOG_FILE_PATH = os.path.join(BASE_DIR, "debug", "sent_emails.log")

def get_smtp_config():
    """Dynamically reads SMTP settings from environment or fallback defaults."""
    load_dotenv(dotenv_path)
    host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    port_raw = os.getenv("SMTP_PORT", "587").strip()
    try:
        port = int(port_raw)
    except (ValueError, TypeError):
        port = 587
        
    username = os.getenv("SMTP_USERNAME", "jhuneesparcia1@gmail.com").strip()
    raw_pwd = os.getenv("SMTP_PASSWORD", "npsh ffcf oodr idwe").strip()
    password = raw_pwd.replace(" ", "")
    sender = os.getenv("SMTP_SENDER", username).strip() or username
    return host, port, username, password, sender

def send_verification_email(recipient_email: str, code: str) -> bool:
    """
    Sends a 6-digit verification code to the recipient's email address via SMTP.
    Supports Microsoft 365 / Outlook, Gmail, and standard academic email providers
    with clean multipart plain text + HTML formatting.
    """
    host, preferred_port, username, password, sender_addr = get_smtp_config()
    
    clean_recipient = recipient_email.strip().lower()
    subject = f"STI Exam Scheduler: Your Verification Code is {code}"
    
    plain_text = f"""STI Examination Scheduling System
----------------------------------------
Hello,

You have requested a verification code to update your account password.
Please use the following 6-digit code:

    VERIFICATION CODE: {code}

This code will expire in 5 minutes.
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
                We received a request to update the password for your account (<strong>{clean_recipient}</strong>). Please enter the following 6-digit one-time code on the security page:
              </p>

              <!-- Code Box -->
              <div style="background-color: #f8fafc; border: 2px dashed #005696; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 6px; font-weight: 600;">One-Time Security Code</span>
                <span style="display: inline-block; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #005696;">{code}</span>
              </div>

              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                ⏱️ This code is valid for <strong>5 minutes</strong>. Do not share it with anyone.
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

    if not (host and username and password):
        print(f"SMTP credentials missing. Host: {host}, User: {username}")
        return False

    sender_domain = sender_addr.split("@")[-1] if "@" in sender_addr else "gmail.com"

    msg = MIMEMultipart("alternative")
    msg["From"] = f"STI Exam Scheduler <{sender_addr}>"
    msg["To"] = clean_recipient
    msg["Reply-To"] = sender_addr
    msg["Subject"] = subject
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid(domain=sender_domain)

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    # Try preferred port first, then alternate standard port (587 STARTTLS <-> 465 SSL)
    ports_to_try = [preferred_port]
    alternate_port = 465 if preferred_port == 587 else 587
    if alternate_port not in ports_to_try:
        ports_to_try.append(alternate_port)

    last_error = None
    msg_str = msg.as_string()

    for port in ports_to_try:
        try:
            print(f"Attempting SMTP delivery to {clean_recipient} via {host}:{port}...")
            if port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                server = smtplib.SMTP(host, port, timeout=15)
                server.starttls()

            server.login(username, password)
            server.sendmail(sender_addr, [clean_recipient], msg_str)
            server.quit()
            print(f"SMTP Email delivered successfully to {clean_recipient} via {host}:{port}")
            return True
        except Exception as e:
            last_error = e
            print(f"SMTP delivery attempt failed via port {port}: {e}")

    # Fallback error logging for diagnostics
    try:
        os.makedirs(os.path.dirname(LOG_FILE_PATH), exist_ok=True)
        log_entry = (
            f"========================================\n"
            f"TIMESTAMP: {datetime.now().isoformat()}\n"
            f"TO: {clean_recipient}\n"
            f"SUBJECT: {subject}\n"
            f"ERROR: {str(last_error)}\n"
            f"========================================\n\n"
        )
        with open(LOG_FILE_PATH, "a") as f:
            f.write(log_entry)
    except Exception:
        pass

    return False
