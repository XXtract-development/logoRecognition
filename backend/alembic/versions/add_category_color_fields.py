"""Add color and description fields to categories table

Revision ID: add_category_color_fields
Revises:
Create Date: 2025-09-30

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_category_color_fields'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add color and description columns to categories table"""
    # Add color column with default value
    op.add_column('categories',
        sa.Column('color', sa.String(7), nullable=False, server_default='#3B82F6')
    )

    # Add description column
    op.add_column('categories',
        sa.Column('description', sa.String(500), nullable=True)
    )

    # Remove server default after migration
    op.alter_column('categories', 'color', server_default=None)


def downgrade() -> None:
    """Remove color and description columns from categories table"""
    op.drop_column('categories', 'description')
    op.drop_column('categories', 'color')