"""activate importaciones module for all existing tenants

Revision ID: s0o1p2q3r4s5
Revises: r9n0o1p2q3r4
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 's0o1p2q3r4s5'
down_revision: Union[str, Sequence[str], None] = 'r9n0o1p2q3r4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODULE_CODE = 'IMPORT'


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO subscriptions (id, tenant_id, module_id, status, assigned_at,
                                   is_active, created_at, updated_at)
        SELECT gen_random_uuid(),
               t.id,
               m.id,
               'active',
               NOW(), true, NOW(), NOW()
        FROM tenants t, modules m
        WHERE m.code = '{MODULE_CODE}'
          AND t.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.tenant_id = t.id AND s.module_id = m.id
          )
    """)


def downgrade() -> None:
    op.execute(f"""
        DELETE FROM subscriptions
        WHERE module_id = (SELECT id FROM modules WHERE code = '{MODULE_CODE}')
    """)
