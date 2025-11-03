"""Tests for notification service with DATABASE integration.

US-INT-006: Database-triggered Notifications
This module tests email and Slack notifications triggered by database changes.
"""

import pytest
from datetime import datetime, timedelta
from uuid import uuid4
from unittest.mock import Mock, patch, MagicMock
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.services.notification_service import NotificationService
from app.models.training import TrainingJob
from app.models.base import Base


class TestNotificationService:
    """Test suite for NotificationService (US-INT-006)."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @patch('smtplib.SMTP')
    def test_send_email_with_database_context(self, mock_smtp_class):
        """Test email sent with context from DATABASE (AC1)."""
        # Mock SMTP server
        mock_server = MagicMock()
        mock_smtp_class.return_value.__enter__.return_value = mock_server

        # Create job and save to database
        job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Nike Detector"},
            metrics={"accuracy": 0.95, "loss": 0.08},
            created_at=datetime(2025, 1, 2, 13, 0, 0),
            started_at=datetime(2025, 1, 2, 14, 0, 0),
            completed_at=datetime(2025, 1, 2, 14, 45, 0),
            notifications={"email": "test@example.com"}
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        service = NotificationService()
        result = service.send_training_completed(job)

        # Verify email sent
        assert result is True
        assert mock_server.send_message.called

        # Verify message contains database data
        sent_message = mock_server.send_message.call_args[0][0]
        # Check subject contains model name
        assert "Nike Detector" in sent_message['Subject'] or "Nike Detector" in sent_message.as_string()
        assert "test@example.com" in sent_message['To']

    @patch('requests.post')
    def test_send_slack_with_database_context(self, mock_post):
        """Test Slack webhook with context from DATABASE (AC2)."""
        mock_post.return_value.status_code = 200

        # Create job and save to database
        job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Adidas Detector"},
            metrics={"accuracy": 0.92, "loss": 0.12},
            created_at=datetime(2025, 1, 2, 13, 0, 0),
            started_at=datetime(2025, 1, 2, 14, 0, 0),
            completed_at=datetime(2025, 1, 2, 15, 30, 0),
            notifications={"slack": "https://hooks.slack.com/test"}
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        service = NotificationService()
        result = service.send_training_completed(job)

        # Verify Slack webhook called
        assert result is True
        assert mock_post.called

        # Verify payload structure
        sent_data = mock_post.call_args[1]["json"]
        assert "attachments" in sent_data
        assert sent_data["attachments"][0]["color"] == "good"  # Green for success

        # Verify contains model name
        assert "Adidas Detector" in sent_data["attachments"][0]["text"]

    def test_notification_privacy_no_sensitive_data(self):
        """Test NO sensitive data in notification context (AC6)."""
        job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={
                "model_name": "Test Model",
                # Simulate sensitive data in config (should NOT be in notification)
                "dataset_samples": ["sample1.jpg", "sample2.jpg"],
                "model_weights": [0.1, 0.2, 0.3]
            },
            metrics={"accuracy": 0.95}
        )

        service = NotificationService()
        context = service._build_context_from_db(job, "completed")

        # Verify NO sensitive data
        assert "dataset_samples" not in context
        assert "model_weights" not in context
        assert "training_data" not in context

        # Verify only safe metadata
        assert "job_id" in context
        assert "model_name" in context
        assert "accuracy" in context
        assert "dashboard_url" in context

    def test_notification_templates_exist(self):
        """Test all required templates exist (AC3)."""
        service = NotificationService()

        # Verify template environment configured
        assert service.template_env is not None

        # Templates should be loadable
        templates = ["training_started", "training_completed", "training_failed"]

        for template in templates:
            # This will raise if template doesn't exist
            try:
                tmpl = service.template_env.get_template(f"{template}.html")
                assert tmpl is not None
            except Exception as e:
                pytest.fail(f"Template {template}.html not found: {e}")

    def test_throttling_prevents_spam_email(self):
        """Test email throttling prevents spam (AC7)."""
        job = TrainingJob(
            id=uuid4(),
            status="running",
            config={"model_name": "Test"},
            notifications={"email": "test@example.com"}
        )

        service = NotificationService()

        # First notification should NOT be throttled
        assert service.should_throttle(str(job.id), 'email') is False

        # Mark as sent
        service.last_sent[str(job.id)]['email'] = datetime.utcnow()

        # Second notification within 1 hour SHOULD be throttled
        assert service.should_throttle(str(job.id), 'email') is True

        # After throttle window expires, should NOT be throttled
        service.last_sent[str(job.id)]['email'] = datetime.utcnow() - timedelta(hours=2)
        assert service.should_throttle(str(job.id), 'email') is False

    def test_throttling_slack_different_window(self):
        """Test Slack throttling has different window than email (AC7)."""
        job_id = str(uuid4())
        service = NotificationService()

        # Mark Slack as sent
        service.last_sent[job_id]['slack'] = datetime.utcnow()

        # Should be throttled within 5 minutes
        assert service.should_throttle(job_id, 'slack') is True

        # After 6 minutes, should NOT be throttled
        service.last_sent[job_id]['slack'] = datetime.utcnow() - timedelta(minutes=6)
        assert service.should_throttle(job_id, 'slack') is False

    @patch('smtplib.SMTP')
    def test_smtp_error_raises_for_retry(self, mock_smtp_class):
        """Test SMTP errors raise for Celery retry logic (AC5)."""
        import smtplib

        # Mock SMTP to raise error
        mock_smtp_class.return_value.__enter__.side_effect = smtplib.SMTPException("Connection timeout")

        job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Test"},
            notifications={"email": "test@example.com"}
        )

        service = NotificationService()

        # Should raise (so Celery can retry)
        with pytest.raises(smtplib.SMTPException):
            service._send_email(
                to="test@example.com",
                template="training_completed",
                context=service._build_context_from_db(job, "completed")
            )

    @patch('requests.post')
    def test_slack_http_error_raises_for_retry(self, mock_post):
        """Test Slack HTTP errors raise for Celery retry logic (AC5)."""
        import requests

        # Mock HTTP error
        mock_post.side_effect = requests.HTTPError("503 Service Unavailable")

        job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Test"},
            notifications={"slack": "https://hooks.slack.com/test"}
        )

        service = NotificationService()

        # Should raise (so Celery can retry)
        with pytest.raises(requests.HTTPError):
            service._send_slack(
                webhook_url="https://hooks.slack.com/test",
                template="training_completed",
                context=service._build_context_from_db(job, "completed"),
                color="good"
            )

    def test_invalid_slack_webhook_rejected(self):
        """Test invalid Slack webhook URLs are rejected (security)."""
        service = NotificationService()

        # Invalid URLs should return False (not raise)
        result = service._send_slack(
            webhook_url="http://malicious.com/webhook",  # Not slack.com
            template="training_started",
            context={"model_name": "Test"},
            color="gray"
        )

        assert result is False

    def test_email_subject_generation(self):
        """Test email subjects are generated correctly (AC3)."""
        service = NotificationService()

        # Test completed subject
        job_completed = TrainingJob(
            id=uuid4(),
            config={"model_name": "Nike Detector"}
        )
        subject = service._get_subject("completed", job_completed)
        assert "✅" in subject
        assert "Nike Detector" in subject
        assert "Completed" in subject

        # Test failed subject
        job_failed = TrainingJob(
            id=uuid4(),
            config={"model_name": "Adidas Detector"}
        )
        subject = service._get_subject("failed", job_failed)
        assert "❌" in subject
        assert "Adidas Detector" in subject
        assert "Failed" in subject

        # Test started subject
        job_started = TrainingJob(
            id=uuid4(),
            config={"model_name": "Puma Detector"}
        )
        subject = service._get_subject("started", job_started)
        assert "🚀" in subject
        assert "Puma Detector" in subject
        assert "Started" in subject

    def test_slack_blocks_structure(self):
        """Test Slack message blocks are structured correctly (AC2)."""
        service = NotificationService()

        context = {
            "model_name": "Test Model",
            "job_id": str(uuid4()),
            "duration": "45m",
            "accuracy": "95.20%",
            "loss": "0.0800",
            "error_message": "Test error",
            "dashboard_url": "http://localhost:4001/training?jobId=123"
        }

        # Test completed blocks
        completed_blocks = service._build_slack_blocks("training_completed", context, "good")
        assert completed_blocks["attachments"][0]["color"] == "good"
        assert "Test Model" in completed_blocks["attachments"][0]["text"]
        assert any("Duration" in field["title"] for field in completed_blocks["attachments"][0]["fields"])
        assert completed_blocks["attachments"][0]["actions"][0]["url"] == context["dashboard_url"]

        # Test failed blocks
        failed_blocks = service._build_slack_blocks("training_failed", context, "danger")
        assert failed_blocks["attachments"][0]["color"] == "danger"
        assert any("Error" in field["title"] for field in failed_blocks["attachments"][0]["fields"])

    def test_duration_calculation(self):
        """Test training duration is calculated correctly."""
        service = NotificationService()

        # Job with 2 hours 30 minutes duration
        job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Test"},
            started_at=datetime(2025, 1, 2, 10, 0, 0),
            completed_at=datetime(2025, 1, 2, 12, 30, 0)
        )

        context = service._build_context_from_db(job, "completed")

        # Should show hours and minutes
        assert "2h" in context["duration"]
        assert "30m" in context["duration"]

        # Job with only minutes
        job_short = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Test"},
            started_at=datetime(2025, 1, 2, 10, 0, 0),
            completed_at=datetime(2025, 1, 2, 10, 15, 0)
        )

        context_short = service._build_context_from_db(job_short, "completed")
        assert "15m" in context_short["duration"]


class TestNotificationCeleryTask:
    """Test Celery notification task."""

    @patch('app.tasks.notification_tasks.get_db')
    @patch('app.tasks.notification_tasks.notification_service')
    def test_send_training_notification_task(self, mock_service, mock_get_db):
        """Test Celery task loads job from database and sends notification."""
        from app.tasks.notification_tasks import send_training_notification

        # Mock database session
        mock_db = MagicMock()
        mock_get_db.return_value = iter([mock_db])

        # Mock job from database
        mock_job = TrainingJob(
            id=uuid4(),
            status="completed",
            config={"model_name": "Test"},
            notifications={"email": "test@example.com"}
        )
        mock_db.query.return_value.filter.return_value.first.return_value = mock_job

        # Mock notification service
        mock_service.send_training_completed.return_value = True

        # Execute task
        result = send_training_notification(job_id=str(mock_job.id), event_type="completed")

        # Verify job loaded from database
        assert mock_db.query.called

        # Verify notification sent
        assert mock_service.send_training_completed.called
        assert result["status"] == "success"

    @patch('app.tasks.notification_tasks.get_db')
    def test_notification_task_handles_missing_job(self, mock_get_db):
        """Test task handles job not found gracefully."""
        from app.tasks.notification_tasks import send_training_notification

        # Mock database session with no job
        mock_db = MagicMock()
        mock_get_db.return_value = iter([mock_db])
        mock_db.query.return_value.filter.return_value.first.return_value = None

        # Execute task
        result = send_training_notification(job_id=str(uuid4()), event_type="completed")

        # Should return error status
        assert result["status"] == "error"
