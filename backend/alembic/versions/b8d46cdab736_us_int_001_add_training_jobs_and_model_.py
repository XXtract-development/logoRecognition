"""US-INT-001: Add training_jobs and model_registry tables with all required fields

Revision ID: b8d46cdab736
Revises: 3ed182f9d91b
Create Date: 2025-10-02 22:50:10.987236

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b8d46cdab736'
down_revision = '3ed182f9d91b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create categories table
    op.create_table('categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('categorie', sa.String(length=100), nullable=False),
    sa.Column('categorie_naam', sa.String(length=255), nullable=True),
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('code_naam', sa.String(length=255), nullable=True),
    sa.Column('definitie', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('categorie', 'code', name='uq_category_code')
    )
    op.create_index('idx_categorie', 'categories', ['categorie'], unique=False)
    op.create_index('idx_category_code', 'categories', ['categorie', 'code'], unique=False)
    op.create_index('idx_code', 'categories', ['code'], unique=False)
    op.create_index(op.f('ix_categories_id'), 'categories', ['id'], unique=False)

    # US-INT-001: Create training_jobs table with all 13+ required fields
    op.create_table('training_jobs',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
    sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
    sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    sa.Column('started_at', sa.DateTime(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('phase_progress', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('resources', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('current_epoch', sa.Integer(), nullable=True),
    sa.Column('total_epochs', sa.Integer(), nullable=True),
    sa.Column('notifications', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('celery_task_id', sa.String(length=255), nullable=True),
    sa.Column('error_message', sa.String(), nullable=True),
    sa.Column('model_version', sa.String(length=100), nullable=True),
    sa.Column('user_id', sa.String(), nullable=True),
    sa.Column('dataset_info', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_training_jobs_celery_task', 'training_jobs', ['celery_task_id'], unique=False)
    op.create_index('idx_training_jobs_status_created', 'training_jobs', ['status', 'created_at'], unique=False)
    op.create_index(op.f('ix_training_jobs_status'), 'training_jobs', ['status'], unique=False)

    # US-INT-001: Create model_registry table
    op.create_table('model_registry',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
    sa.Column('version', sa.String(length=100), nullable=False),
    sa.Column('training_job_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('model_path', sa.String(), nullable=False),
    sa.Column('onnx_path', sa.String(), nullable=True),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('model_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
    sa.ForeignKeyConstraint(['training_job_id'], ['training_jobs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('version')
    )
    op.create_index('idx_model_registry_active', 'model_registry', ['is_active'], unique=False)
    op.create_index('idx_model_registry_training_job', 'model_registry', ['training_job_id'], unique=False)
    op.create_index('idx_model_registry_version', 'model_registry', ['version'], unique=False)
    op.create_index(op.f('ix_model_registry_version'), 'model_registry', ['version'], unique=True)


def downgrade() -> None:
    # Drop model_registry table
    op.drop_index(op.f('ix_model_registry_version'), table_name='model_registry')
    op.drop_index('idx_model_registry_version', table_name='model_registry')
    op.drop_index('idx_model_registry_training_job', table_name='model_registry')
    op.drop_index('idx_model_registry_active', table_name='model_registry')
    op.drop_table('model_registry')

    # Drop training_jobs table
    op.drop_index(op.f('ix_training_jobs_status'), table_name='training_jobs')
    op.drop_index('idx_training_jobs_status_created', table_name='training_jobs')
    op.drop_index('idx_training_jobs_celery_task', table_name='training_jobs')
    op.drop_table('training_jobs')

    # Drop categories table
    op.drop_index(op.f('ix_categories_id'), table_name='categories')
    op.drop_index('idx_code', table_name='categories')
    op.drop_index('idx_category_code', table_name='categories')
    op.drop_index('idx_categorie', table_name='categories')
    op.drop_table('categories')