"""estimated_yield float and ingredient update endpoint

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-05-17 00:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'recipes',
        'estimated_yield',
        type_=sa.Float(),
        existing_nullable=False,
        existing_server_default='1',
    )


def downgrade() -> None:
    op.alter_column(
        'recipes',
        'estimated_yield',
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default='1',
    )
