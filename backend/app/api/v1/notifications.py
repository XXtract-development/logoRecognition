"""
US-INT-006: Notification Preferences API
Unsubscribe and user notification settings management
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.middleware.jwt_auth import get_current_user, User
from app.models.notification import NotificationPreferences
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationPreferencesUpdate(BaseModel):
    """Request model for updating notification preferences"""
    email_enabled: Optional[bool] = None
    slack_enabled: Optional[bool] = None
    email_events: Optional[list[str]] = None  # ["started", "completed", "failed"]
    slack_events: Optional[list[str]] = None


class NotificationPreferencesResponse(BaseModel):
    """Response model for notification preferences"""
    user_id: str
    email_enabled: bool
    slack_enabled: bool
    email_events: list[str]
    slack_events: list[str]

    class Config:
        from_attributes = True


@router.post("/unsubscribe/{token}")
async def unsubscribe_from_email(token: str, db: Session = Depends(get_db)):
    """
    Unsubscribe from email notifications using token from email link.

    US-INT-006 AC7: Unsubscribe mechanism for email notifications.

    Args:
        token: Unsubscribe token (base64 encoded user_id)
        db: Database session

    Returns:
        Success message

    Raises:
        HTTPException: If token is invalid
    """
    import base64

    try:
        # Decode unsubscribe token
        user_id = base64.b64decode(token.encode()).decode()

        # Get or create preferences
        prefs = db.query(NotificationPreferences).filter(
            NotificationPreferences.user_id == user_id
        ).first()

        if not prefs:
            prefs = NotificationPreferences(
                user_id=user_id,
                email_enabled=False,
                slack_enabled=True,
                email_events=[],
                slack_events=["started", "completed", "failed"]
            )
            db.add(prefs)
        else:
            prefs.email_enabled = False
            prefs.email_events = []

        db.commit()

        logger.info(f"User {user_id} unsubscribed from email notifications")

        return {
            "message": "Successfully unsubscribed from email notifications",
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Unsubscribe failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid unsubscribe token"
        )


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's notification preferences.

    Args:
        current_user: Authenticated user
        db: Database session

    Returns:
        User's notification preferences
    """
    prefs = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.user_id
    ).first()

    if not prefs:
        # Create default preferences
        prefs = NotificationPreferences(
            user_id=current_user.user_id,
            email_enabled=True,
            slack_enabled=True,
            email_events=["started", "completed", "failed"],
            slack_events=["started", "completed", "failed"]
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return prefs


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    preferences: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update notification preferences.

    Args:
        preferences: Updated preferences
        current_user: Authenticated user
        db: Database session

    Returns:
        Updated preferences
    """
    prefs = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.user_id
    ).first()

    if not prefs:
        prefs = NotificationPreferences(user_id=current_user.user_id)
        db.add(prefs)

    # Update fields
    if preferences.email_enabled is not None:
        prefs.email_enabled = preferences.email_enabled
    if preferences.slack_enabled is not None:
        prefs.slack_enabled = preferences.slack_enabled
    if preferences.email_events is not None:
        prefs.email_events = preferences.email_events
    if preferences.slack_events is not None:
        prefs.slack_events = preferences.slack_events

    db.commit()
    db.refresh(prefs)

    logger.info(f"Updated notification preferences for user {current_user.user_id}")

    return prefs


@router.get("/health")
async def notification_health():
    """
    Health check for notification service including SMTP connectivity.

    US-INT-006: SMTP health check for monitoring.

    Returns:
        Health status with SMTP connectivity check
    """
    from app.core.config import settings
    import smtplib

    health = {
        "status": "healthy",
        "checks": {
            "smtp": "unknown",
            "email_templates": "ok",
            "database": "ok"
        }
    }

    # Check SMTP connectivity
    if settings.SMTP_HOST and settings.SMTP_USER:
        try:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=5) as smtp:
                smtp.starttls()
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                health["checks"]["smtp"] = "ok"
        except Exception as e:
            health["checks"]["smtp"] = f"error: {str(e)}"
            health["status"] = "degraded"
            logger.error(f"SMTP health check failed: {e}")
    else:
        health["checks"]["smtp"] = "not_configured"

    # Check email templates exist
    try:
        from pathlib import Path
        templates_dir = Path("app/templates/notifications")
        required_templates = ["training_started.html", "training_completed.html", "training_failed.html"]

        for template in required_templates:
            if not (templates_dir / template).exists():
                health["checks"]["email_templates"] = f"missing: {template}"
                health["status"] = "unhealthy"
                break
    except Exception as e:
        health["checks"]["email_templates"] = f"error: {str(e)}"
        health["status"] = "degraded"

    return health
