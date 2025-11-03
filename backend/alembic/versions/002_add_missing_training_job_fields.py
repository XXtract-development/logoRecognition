"""Add missing training_jobs fields for US-INT-001 and US-INT-003

Revision ID: 002_missing_fields
Revises: b8d46cdab736
Create Date: 2025-10-03 16:45:00

This migration adds the 9 missing fields from the TrainingJob model:
- dataset_version_id (UUID, indexed, for US-INT-003)
- augmentation_factor (Integer)
- target_categories (JSONB)
- accuracy_threshold (Float)
- eta_seconds (Integer, progress tracking)
- checksum (String(64), indexed, duplicate detection)
- created_by (String(255), indexed, user tracking)
- version (Integer, optimistic locking)
- batch_size (Integer, training parameter)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_missing_fields'
down_revision = 'b8d46cdab736'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add missing fields to training_jobs table."""

    # Add training configuration fields
    op.add_column('training_jobs',
        sa.Column('dataset_version_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column('training_jobs',
        sa.Column('augmentation_factor', sa.Integer(), nullable=True)
    )
    op.add_column('training_jobs',
        sa.Column('target_categories', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )
    op.add_column('training_jobs',
        sa.Column('accuracy_threshold', sa.Float(), nullable=True)
    )
    op.add_column('training_jobs',
        sa.Column('batch_size', sa.Integer(), nullable=True, server_default='32')
    )

    # Add progress tracking field
    op.add_column('training_jobs',
        sa.Column('eta_seconds', sa.Integer(), nullable=True)
    )

    # Add duplicate detection field
    op.add_column('training_jobs',
        sa.Column('checksum', sa.String(length=64), nullable=True)
    )

    # Add user tracking field
    op.add_column('training_jobs',
        sa.Column('created_by', sa.String(length=255), nullable=True)
    )

    # Add optimistic locking version field
    op.add_column('training_jobs',
        sa.Column('version', sa.Integer(), nullable=False, server_default='1')
    )

    # Create indexes for performance
    op.create_index('idx_training_jobs_checksum', 'training_jobs', ['checksum'], unique=False)
    op.create_index('idx_training_jobs_created_by', 'training_jobs', ['created_by'], unique=False)
    op.create_index('idx_training_jobs_dataset_version', 'training_jobs', ['dataset_version_id'], unique=False)


def downgrade() -> None:
    """Remove added fields from training_jobs table."""

    # Drop indexes
    op.drop_index('idx_training_jobs_dataset_version', table_name='training_jobs')
    op.drop_index('idx_training_jobs_created_by', table_name='training_jobs')
    op.drop_index('idx_training_jobs_checksum', table_name='training_jobs')

    # Drop columns in reverse order
    op.drop_column('training_jobs', 'version')
    op.drop_column('training_jobs', 'created_by')
    op.drop_column('training_jobs', 'checksum')
    op.drop_column('training_jobs', 'eta_seconds')
    op.drop_column('training_jobs', 'batch_size')
    op.drop_column('training_jobs', 'accuracy_threshold')
    op.drop_column('training_jobs', 'target_categories')
    op.drop_column('training_jobs', 'augmentation_factor')
    op.drop_column('training_jobs', 'dataset_version_id')
