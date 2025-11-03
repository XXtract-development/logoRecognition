"""Add notification_preferences table for unsubscribe support

Revision ID: 007_notification_prefs
Revises: 006_add_notification_log_table
Create Date: 2025-10-03 17:30:00

US-INT-006 AC7: User notification preferences and unsubscribe mechanism
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007_notification_prefs'
down_revision = '006_notification_log'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add notification_preferences table"""

    op.create_table(
        'notification_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.String(length=255), nullable=False, unique=True),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('slack_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('email_events', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='["started", "completed", "failed"]'),
        sa.Column('slack_events', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='["started", "completed", "failed"]'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )

    # Create index on user_id for fast lookups
    op.create_index('idx_notification_preferences_user_id', 'notification_preferences', ['user_id'], unique=True)


def downgrade() -> None:
    """Remove notification_preferences table"""

    op.drop_index('idx_notification_preferences_user_id', table_name='notification_preferences')
    op.drop_table('notification_preferences')
