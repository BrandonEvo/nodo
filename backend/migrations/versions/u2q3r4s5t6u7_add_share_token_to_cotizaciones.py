"""add share_token to import_cotizaciones

Revision ID: u2q3r4s5t6u7
Revises: t1p2q3r4s5t6
Create Date: 2026-05-26 01:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'u2q3r4s5t6u7'
down_revision: Union[str, Sequence[str], None] = 't1p2q3r4s5t6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'import_cotizaciones',
        sa.Column('share_token', sa.UUID(), nullable=True),
    )
    # Backfill existing rows
    op.execute("UPDATE import_cotizaciones SET share_token = gen_random_uuid() WHERE share_token IS NULL")
    # Now enforce NOT NULL and unique
    op.alter_column('import_cotizaciones', 'share_token', nullable=False)
    op.create_index('uq_import_cotizaciones_share_token', 'import_cotizaciones', ['share_token'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_import_cotizaciones_share_token', table_name='import_cotizaciones')
    op.drop_column('import_cotizaciones', 'share_token')
