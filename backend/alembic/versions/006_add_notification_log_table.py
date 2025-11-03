"""Add notification_log table for audit trail

US-INT-006 AC7: Notification Throttling & Audit Trail

Revision ID: 006_notification_log
Revises: 005_...
Create Date: 2025-01-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = '006_notification_log'
down_revision = '002_missing_fields'
branch_labels = None
depends_on = None


def upgrade():
    """Create notification_log table for US-INT-006 AC7."""
    op.create_table(
        'notification_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('job_id', UUID(as_uuid=True), sa.ForeignKey('training_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('channel', sa.String(20), nullable=False),  # 'email' or 'slack'
        sa.Column('recipient', sa.String(255), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),  # 'training.started', etc.
        sa.Column('status', sa.String(20), nullable=False),  # 'sent', 'throttled', 'failed'
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.text('NOW()'), nullable=False),
    )

    # Create indexes for query performance
    op.create_index('idx_notification_log_job_id', 'notification_log', ['job_id'])
    op.create_index('idx_notification_log_created_at', 'notification_log', ['created_at'])
    op.create_index('idx_notification_log_status', 'notification_log', ['status'])
    op.create_index('idx_notification_log_channel_status', 'notification_log', ['channel', 'status'])


def downgrade():
    """Drop notification_log table."""
    op.drop_index('idx_notification_log_channel_status', table_name='notification_log')
    op.drop_index('idx_notification_log_status', table_name='notification_log')
    op.drop_index('idx_notification_log_created_at', table_name='notification_log')
    op.drop_index('idx_notification_log_job_id', table_name='notification_log')
    op.drop_table('notification_log')
