"""Notification audit trail database model.

US-INT-006 AC7: Notification Throttling & Audit Trail
This module defines the notification_log table for compliance and monitoring.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, String, DateTime, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class NotificationLog(Base):
    """
    Notification audit trail for compliance and monitoring (US-INT-006 AC7).

    Tracks all notification attempts including:
    - Successful sends
    - Throttled notifications
    - Failed notifications with error details
    """
    __tablename__ = "notification_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("training_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    channel = Column(String(20), nullable=False)  # 'email' or 'slack'
    recipient = Column(String(255), nullable=False)
    event_type = Column(String(50), nullable=False)  # 'training.started', 'training.completed', etc.
    status = Column(String(20), nullable=False)  # 'sent', 'throttled', 'failed'
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Indexes for query optimization and retention policy
    __table_args__ = (
        Index('idx_notification_log_job_id', 'job_id'),
        Index('idx_notification_log_created_at', 'created_at', postgresql_using='btree'),
        Index('idx_notification_log_status', 'status'),
        Index('idx_notification_log_channel_status', 'channel', 'status'),
    )


class NotificationPreferences(Base):
    """
    User notification preferences for unsubscribe support.

    US-INT-006 AC7: Users can manage their notification settings
    and unsubscribe from specific channels.
    """
    __tablename__ = "notification_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(String(255), unique=True, nullable=False, index=True)

    # Channel preferences
    email_enabled = Column(String(5), default="true", nullable=False)  # "true" or "false" for SQLite compatibility
    slack_enabled = Column(String(5), default="true", nullable=False)

    # Event preferences (comma-separated string for compatibility)
    email_events = Column(String(255), default="started,completed,failed", nullable=False)
    slack_events = Column(String(255), default="started,completed,failed", nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
