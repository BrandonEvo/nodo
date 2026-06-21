"""add image_url to shopper_catalog_items

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-06-21 02:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'v4w5x6y7z8a9'
down_revision: Union[str, Sequence[str], None] = 'u3v4w5x6y7z8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopper_catalog_items',
        sa.Column('image_url', sa.String(1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('shopper_catalog_items', 'image_url')
