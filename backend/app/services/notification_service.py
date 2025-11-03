"""Notification service triggered by DATABASE changes.

US-INT-006: Database-triggered Notifications
This module handles email and Slack notifications when training job status changes.

Key Features:
- Email notifications via SMTP
- Slack notifications via webhooks
- Retry logic with exponential backoff
- Throttling to prevent spam
- Audit trail in database
- Privacy-compliant (no sensitive data)
"""

import logging
import smtplib
from collections import defaultdict
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Optional

import requests
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings
from app.models.training import TrainingJob
from app.models.notification import NotificationLog
from app.utils.email_validator import is_valid_email
from app.core.database import get_db

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service for email and Slack notifications from DATABASE events.

    Acceptance Criteria Coverage:
    - AC1: Email Notification on Database Status Change
    - AC2: Slack Notification on Database Status Change
    - AC3: Notification Templates
    - AC5: Notification Retry Logic (handled by Celery task)
    - AC6: Notification Privacy (no sensitive data)
    - AC7: Notification Throttling & Audit Trail
    """

    def __init__(self):
        """Initialize notification service."""
        # SMTP configuration (AC1)
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL

        # Template environment (AC3)
        self.template_env = Environment(
            loader=FileSystemLoader('app/templates/notifications'),
            autoescape=select_autoescape(['html', 'xml'])
        )

        # Throttling state (AC7) - TODO: Move to Redis for production
        self.last_sent: Dict[str, Dict[str, datetime]] = defaultdict(dict)
        self.throttle_window_email = timedelta(hours=1)
        self.throttle_window_slack = timedelta(minutes=5)

    def _log_notification(
        self,
        job_id: str,
        channel: str,
        recipient: str,
        event_type: str,
        status: str,
        error_message: Optional[str] = None
    ):
        """
        Log notification to audit trail (AC7).

        Args:
            job_id: Training job UUID
            channel: 'email' or 'slack'
            recipient: Email address or webhook URL
            event_type: Event type (started, completed, failed)
            status: Notification status (sent, throttled, failed)
            error_message: Optional error message
        """
        try:
            db = next(get_db())
            log_entry = NotificationLog(
                job_id=job_id,
                channel=channel,
                recipient=recipient,
                event_type=f"training.{event_type}",
                status=status,
                error_message=error_message
            )
            db.add(log_entry)
            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Failed to log notification to audit trail: {e}")
            # Don't fail notification on logging error

    def should_throttle(self, job_id: str, channel: str) -> bool:
        """
        Check if notification should be throttled (AC7).

        Args:
            job_id: Training job UUID
            channel: 'email' or 'slack'

        Returns:
            True if should be throttled, False otherwise
        """
        if job_id not in self.last_sent or channel not in self.last_sent[job_id]:
            return False

        last_sent_time = self.last_sent[job_id][channel]
        threshold = self.throttle_window_email if channel == 'email' else self.throttle_window_slack

        return (datetime.utcnow() - last_sent_time) < threshold

    def send_training_started(self, job: TrainingJob) -> bool:
        """
        Send notification when job status → "running" in DATABASE.

        Args:
            job: TrainingJob loaded from database

        Returns:
            True if any notification sent successfully
        """
        if not job.notifications:
            logger.debug(f"No notifications configured for job {job.id}")
            return False

        context = self._build_context_from_db(job, "started")
        success = False

        if job.notifications.get("email"):
            email = job.notifications["email"]

            # AC4: Validate email address
            if not is_valid_email(email):
                logger.error(f"Invalid email address: {email}")
                self._log_notification(
                    str(job.id), 'email', email, 'started', 'failed',
                    error_message="Invalid email address format"
                )
                return False

            if not self.should_throttle(str(job.id), 'email'):
                if self._send_email(
                    to=email,
                    template="training_started",
                    context=context,
                    job_id=str(job.id)
                ):
                    self.last_sent[str(job.id)]['email'] = datetime.utcnow()
                    self._log_notification(str(job.id), 'email', email, 'started', 'sent')
                    success = True
            else:
                logger.info(f"Email throttled for job {job.id}")
                self._log_notification(str(job.id), 'email', email, 'started', 'throttled')

        if job.notifications.get("slack"):
            webhook = job.notifications["slack"]

            if not self.should_throttle(str(job.id), 'slack'):
                if self._send_slack(
                    webhook_url=webhook,
                    template="training_started",
                    context=context,
                    color="#808080",  # Gray
                    job_id=str(job.id)
                ):
                    self.last_sent[str(job.id)]['slack'] = datetime.utcnow()
                    self._log_notification(str(job.id), 'slack', webhook, 'started', 'sent')
                    success = True
            else:
                logger.info(f"Slack throttled for job {job.id}")
                self._log_notification(str(job.id), 'slack', webhook, 'started', 'throttled')

        return success

    def send_training_completed(self, job: TrainingJob) -> bool:
        """
        Send notification when job status → "completed" in DATABASE (AC1, AC2).

        Args:
            job: TrainingJob loaded from database

        Returns:
            True if any notification sent successfully
        """
        if not job.notifications:
            logger.debug(f"No notifications configured for job {job.id}")
            return False

        context = self._build_context_from_db(job, "completed")
        success = False

        if job.notifications.get("email"):
            email = job.notifications["email"]

            # AC4: Validate email address
            if not is_valid_email(email):
                logger.error(f"Invalid email address: {email}")
                self._log_notification(
                    str(job.id), 'email', email, 'completed', 'failed',
                    error_message="Invalid email address format"
                )
                return False

            if not self.should_throttle(str(job.id), 'email'):
                if self._send_email(
                    to=email,
                    template="training_completed",
                    context=context,
                    job_id=str(job.id)
                ):
                    self.last_sent[str(job.id)]['email'] = datetime.utcnow()
                    self._log_notification(str(job.id), 'email', email, 'completed', 'sent')
                    success = True
            else:
                logger.info(f"Email throttled for job {job.id}")
                self._log_notification(str(job.id), 'email', email, 'completed', 'throttled')

        if job.notifications.get("slack"):
            webhook = job.notifications["slack"]

            if not self.should_throttle(str(job.id), 'slack'):
                if self._send_slack(
                    webhook_url=webhook,
                    template="training_completed",
                    context=context,
                    color="good",  # Green
                    job_id=str(job.id)
                ):
                    self.last_sent[str(job.id)]['slack'] = datetime.utcnow()
                    self._log_notification(str(job.id), 'slack', webhook, 'completed', 'sent')
                    success = True
            else:
                logger.info(f"Slack throttled for job {job.id}")
                self._log_notification(str(job.id), 'slack', webhook, 'completed', 'throttled')

        return success

    def send_training_failed(self, job: TrainingJob) -> bool:
        """
        Send notification when job status → "failed" in DATABASE (AC1, AC2).

        Args:
            job: TrainingJob loaded from database

        Returns:
            True if any notification sent successfully
        """
        if not job.notifications:
            logger.debug(f"No notifications configured for job {job.id}")
            return False

        context = self._build_context_from_db(job, "failed")
        success = False

        if job.notifications.get("email"):
            email = job.notifications["email"]

            # AC4: Validate email address
            if not is_valid_email(email):
                logger.error(f"Invalid email address: {email}")
                self._log_notification(
                    str(job.id), 'email', email, 'failed', 'failed',
                    error_message="Invalid email address format"
                )
                return False

            if not self.should_throttle(str(job.id), 'email'):
                if self._send_email(
                    to=email,
                    template="training_failed",
                    context=context,
                    job_id=str(job.id)
                ):
                    self.last_sent[str(job.id)]['email'] = datetime.utcnow()
                    self._log_notification(str(job.id), 'email', email, 'failed', 'sent')
                    success = True
            else:
                logger.info(f"Email throttled for job {job.id}")
                self._log_notification(str(job.id), 'email', email, 'failed', 'throttled')

        if job.notifications.get("slack"):
            webhook = job.notifications["slack"]

            if not self.should_throttle(str(job.id), 'slack'):
                if self._send_slack(
                    webhook_url=webhook,
                    template="training_failed",
                    context=context,
                    color="danger",  # Red
                    job_id=str(job.id)
                ):
                    self.last_sent[str(job.id)]['slack'] = datetime.utcnow()
                    self._log_notification(str(job.id), 'slack', webhook, 'failed', 'sent')
                    success = True
            else:
                logger.info(f"Slack throttled for job {job.id}")
                self._log_notification(str(job.id), 'slack', webhook, 'failed', 'throttled')

        return success

    def _send_email(self, to: str, template: str, context: Dict, job_id: Optional[str] = None) -> bool:
        """
        Send email via SMTP (AC1).

        Args:
            to: Recipient email address
            template: Template name (without .html extension)
            context: Template context variables

        Returns:
            True if sent successfully, False otherwise

        Raises:
            SMTPException on failures (for retry logic)
        """
        try:
            # Load template (AC3)
            tmpl = self.template_env.get_template(f"{template}.html")
            html_content = tmpl.render(**context)

            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = context['subject']
            msg['From'] = self.from_email
            msg['To'] = to

            # Add unsubscribe link (AC7 - Privacy compliance)
            footer = f"\n\n<p style='font-size:11px;color:#999;'>Don't want these emails? <a href='{settings.FRONTEND_URL}/settings/notifications'>Manage preferences</a></p>"
            html_content += footer

            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)

            # Send via SMTP
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            logger.info(f"Email sent successfully to {to} for template {template}")
            return True

        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {e}")
            if job_id:
                self._log_notification(job_id, 'email', to, template.replace('training_', ''), 'failed', str(e))
            raise  # Raise for Celery retry logic
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            if job_id:
                self._log_notification(job_id, 'email', to, template.replace('training_', ''), 'failed', str(e))
            return False

    def _send_slack(
        self,
        webhook_url: str,
        template: str,
        context: Dict,
        color: str,
        job_id: Optional[str] = None
    ) -> bool:
        """
        Send Slack message via webhook (AC2).

        Args:
            webhook_url: Slack incoming webhook URL
            template: Template name
            context: Message context
            color: Attachment color (good, warning, danger, or hex)

        Returns:
            True if sent successfully, False otherwise

        Raises:
            requests.HTTPError on failures (for retry logic)
        """
        try:
            # Validate webhook URL (security - AC4)
            if not webhook_url.startswith('https://hooks.slack.com/'):
                logger.error(f"Invalid Slack webhook URL: {webhook_url}")
                if job_id:
                    self._log_notification(
                        job_id, 'slack', webhook_url,
                        template.replace('training_', ''), 'failed',
                        "Invalid webhook URL - must be https://hooks.slack.com/*"
                    )
                return False

            # Build Slack blocks (AC2)
            blocks = self._build_slack_blocks(template, context, color)

            # Send to webhook
            response = requests.post(
                webhook_url,
                json=blocks,
                timeout=10
            )
            response.raise_for_status()

            logger.info(f"Slack notification sent successfully for template {template}")
            return True

        except requests.HTTPError as e:
            logger.error(f"HTTP error sending Slack message: {e}")
            if job_id:
                self._log_notification(job_id, 'slack', webhook_url, template.replace('training_', ''), 'failed', str(e))
            raise  # Raise for Celery retry logic
        except Exception as e:
            logger.error(f"Failed to send Slack message: {e}")
            if job_id:
                self._log_notification(job_id, 'slack', webhook_url, template.replace('training_', ''), 'failed', str(e))
            return False

    def _build_context_from_db(self, job: TrainingJob, event_type: str) -> Dict:
        """
        Build notification context from DATABASE job (AC3, AC6).

        Only includes PUBLIC metadata, NO sensitive data.

        Args:
            job: TrainingJob from database
            event_type: "started", "completed", or "failed"

        Returns:
            Template context dictionary
        """
        duration = None
        if job.started_at is not None and job.completed_at is not None:
            duration_delta = job.completed_at - job.started_at
            hours, remainder = divmod(int(duration_delta.total_seconds()), 3600)
            minutes, seconds = divmod(remainder, 60)
            duration = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m {seconds}s"

        # AC6: Only public metadata from database (NO sensitive data)
        return {
            "job_id": str(job.id),
            "model_name": job.config.get("model_name", "Untitled Model") if job.config else "Untitled Model",
            "status": job.status,
            "event_type": event_type,
            "created_at": job.created_at.strftime("%Y-%m-%d %H:%M:%S") if job.created_at is not None else "N/A",
            "started_at": job.started_at.strftime("%Y-%m-%d %H:%M:%S") if job.started_at is not None else "N/A",
            "completed_at": job.completed_at.strftime("%Y-%m-%d %H:%M:%S") if job.completed_at is not None else "N/A",
            "duration": duration or "N/A",
            "accuracy": f"{job.metrics.get('accuracy'):.2%}" if job.metrics and 'accuracy' in job.metrics else "N/A",
            "loss": f"{job.metrics.get('loss'):.4f}" if job.metrics and 'loss' in job.metrics else "N/A",
            "error_message": job.error_message or "Unknown error",
            "dashboard_url": f"{settings.FRONTEND_URL}/training?jobId={job.id}",
            "subject": self._get_subject(event_type, job),
            # AC6: NEVER include these:
            # - dataset_samples
            # - model_weights
            # - training_data
            # - raw image data
        }

    def _get_subject(self, event_type: str, job: TrainingJob) -> str:
        """
        Generate email subject line.

        Args:
            event_type: "started", "completed", or "failed"
            job: TrainingJob from database

        Returns:
            Email subject string
        """
        model_name = job.config.get("model_name", "Model")

        subjects = {
            "started": f"🚀 Training Started: {model_name}",
            "completed": f"✅ Training Completed: {model_name}",
            "failed": f"❌ Training Failed: {model_name}"
        }

        return subjects.get(event_type, f"Training Update: {model_name}")

    def _build_slack_blocks(self, template: str, context: Dict, color: str) -> Dict:
        """
        Build Slack message blocks (AC2).

        Args:
            template: Template name
            context: Message context
            color: Attachment color

        Returns:
            Slack message payload
        """
        if template == "training_started":
            text = f"🚀 Training started: *{context['model_name']}*"
            fields = [
                {"title": "Job ID", "value": context['job_id'][:8] + "...", "short": True},
                {"title": "Started", "value": context['started_at'], "short": True}
            ]

        elif template == "training_completed":
            text = f"✅ Training completed: *{context['model_name']}*"
            fields = [
                {"title": "Duration", "value": context['duration'], "short": True},
                {"title": "Accuracy", "value": context['accuracy'], "short": True},
                {"title": "Loss", "value": context['loss'], "short": True}
            ]

        else:  # failed
            text = f"❌ Training failed: *{context['model_name']}*"
            fields = [
                {"title": "Error", "value": context['error_message'][:200], "short": False},
                {"title": "Duration", "value": context['duration'], "short": True}
            ]

        # AC2: Slack message with rich formatting
        return {
            "attachments": [{
                "color": color,
                "text": text,
                "fields": fields,
                "actions": [{
                    "type": "button",
                    "text": "View Dashboard",
                    "url": context['dashboard_url']
                }],
                "footer": "Logo Recognition System",
                "ts": int(datetime.utcnow().timestamp())
            }]
        }


# Global singleton
notification_service = NotificationService()
