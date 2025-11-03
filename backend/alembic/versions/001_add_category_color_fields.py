"""Add color and description fields to categories

Revision ID: 001_add_category_color
Revises:
Create Date: 2025-09-30

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001_add_category_color'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add color and description columns to categories table"""

    # First check if the columns already exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Get existing columns
    existing_columns = [col['name'] for col in inspector.get_columns('categories')]

    # Add color column if it doesn't exist
    if 'color' not in existing_columns:
        op.add_column('categories',
            sa.Column('color', sa.String(7), nullable=False, server_default='#3B82F6')
        )
        # Remove server default after adding the column
        op.alter_column('categories', 'color', server_default=None)
    else:
        print("Column 'color' already exists, skipping...")

    # Add description column if it doesn't exist
    if 'description' not in existing_columns:
        op.add_column('categories',
            sa.Column('description', sa.String(500), nullable=True)
        )
    else:
        print("Column 'description' already exists, skipping...")


def downgrade() -> None:
    """Remove color and description columns from categories table"""

    # Check if columns exist before trying to drop them
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [col['name'] for col in inspector.get_columns('categories')]

    if 'description' in existing_columns:
        op.drop_column('categories', 'description')

    if 'color' in existing_columns:
        op.drop_column('categories', 'color')