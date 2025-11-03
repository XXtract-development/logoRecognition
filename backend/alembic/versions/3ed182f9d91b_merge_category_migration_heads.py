"""Merge category migration heads

Revision ID: 3ed182f9d91b
Revises: 001_categories, 001_add_category_color, add_category_color_fields
Create Date: 2025-10-02 22:48:32.098477

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3ed182f9d91b'
down_revision = ('001_categories', '001_add_category_color', 'add_category_color_fields')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass