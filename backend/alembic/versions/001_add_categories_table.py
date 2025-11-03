"""Add categories table with unique constraint

Revision ID: 001_categories
Revises:
Create Date: 2025-09-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_categories'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Create categories table with indexes and unique constraint"""
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('categorie', sa.String(length=100), nullable=False),
        sa.Column('categorie_naam', sa.String(length=255), nullable=True),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('code_naam', sa.String(length=255), nullable=True),
        sa.Column('definitie', sa.String(length=255), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False
        ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index('idx_categorie', 'categories', ['categorie'])
    op.create_index('idx_code', 'categories', ['code'])
    op.create_index('idx_category_code', 'categories', ['categorie', 'code'])

    # Create unique constraint for duplicate detection
    op.create_unique_constraint(
        'uq_category_code',
        'categories',
        ['categorie', 'code']
    )

    # Create index on primary key
    op.create_index(op.f('ix_categories_id'), 'categories', ['id'], unique=False)


def downgrade():
    """Drop categories table and all associated indexes"""
    op.drop_index(op.f('ix_categories_id'), table_name='categories')
    op.drop_constraint('uq_category_code', 'categories', type_='unique')
    op.drop_index('idx_category_code', table_name='categories')
    op.drop_index('idx_code', table_name='categories')
    op.drop_index('idx_categorie', table_name='categories')
    op.drop_table('categories')