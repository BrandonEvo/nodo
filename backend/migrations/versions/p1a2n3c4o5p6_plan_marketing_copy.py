"""planes: copy de marketing para la landing pública

Revision ID: p1a2n3c4o5p6
Revises: f1a2b3c4d5e6
Create Date: 2026-07-09 00:00:00.000000

`subscription_plans` es catálogo GLOBAL de la plataforma: no tiene `tenant_id`,
igual que `modules` y `plan_modules`. Por eso NO lleva RLS ni las 4 políticas —
la regla de CLAUDE.md aplica a tablas con `tenant_id`, y aquí no hay nada que
aislar entre empresas. Se añade GRANT SELECT a nodo_app porque el endpoint
público /api/public/plans lee esta tabla.

`is_public` nace en FALSE: la migración no debe publicar en la landing planes
internos o de prueba que ya existan en producción.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'p1a2n3c4o5p6'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("subscription_plans", sa.Column("tagline", sa.String(length=120), nullable=True))
    op.add_column("subscription_plans", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("subscription_plans", sa.Column("features", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("subscription_plans", sa.Column("badge_label", sa.String(length=40), nullable=True))
    op.add_column("subscription_plans", sa.Column("cta_label", sa.String(length=40), nullable=True))
    op.add_column("subscription_plans", sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("billing_period", sa.String(length=20), nullable=False, server_default="month"))
    op.add_column("subscription_plans", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("subscription_plans", sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.execute("GRANT SELECT ON subscription_plans TO nodo_app")
    op.execute("GRANT SELECT ON plan_modules TO nodo_app")
    op.execute("GRANT SELECT ON modules TO nodo_app")


def downgrade() -> None:
    for col in (
        "is_public", "sort_order", "billing_period", "is_featured",
        "cta_label", "badge_label", "features", "description", "tagline",
    ):
        op.drop_column("subscription_plans", col)
