"""Emailing a bill PDF over SMTP (settings SMTP_*). Off when SMTP_HOST is empty."""
import asyncio
import smtplib
from email.message import EmailMessage

from app._shared.core.config import settings
from app._shared.exceptions.base import AppException, ValidationException


def _send(msg: EmailMessage) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
        if settings.SMTP_TLS:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_bill(to: str, subject: str, body: str, pdf: bytes, filename: str) -> None:
    if not settings.SMTP_HOST:
        raise ValidationException("Email isn't set up on the server yet. Download the PDF and send it yourself.")
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    msg.add_attachment(pdf, maintype="application", subtype="pdf", filename=filename)
    try:
        await asyncio.to_thread(_send, msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise AppException(f"The email could not be sent ({exc.__class__.__name__}). Try again or download the PDF.",
                           "EMAIL_FAILED", 502)
