"""seed default_trial_days platform config

Revision ID: da1b2c3d4e5f
Revises: cf2a3b4c5d6e
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'da1b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = 'cf2a3b4c5d6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO platform_config (key, value, description)
        VALUES ('default_trial_days', '14',
                'Días de prueba gratuita que recibe automáticamente una empresa al registrarse.')
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM platform_config WHERE key = 'default_trial_days'")
