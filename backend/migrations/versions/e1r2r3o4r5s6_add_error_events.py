"""add error_events (monitoreo de 500s)

Revision ID: e1r2r3o4r5s6
Revises: o9g1i2m3a4g5
Create Date: 2026-08-02

Tabla de PLATAFORMA: la lee el súper admin, no el dueño del negocio. Por eso no
lleva RLS ni GRANT a nodo_app — el router va por `current_superuser`, no por
`get_current_tenant_id`. `tenant_id` es contexto (quién sufrió el error), no
aislamiento, y por eso tampoco es FK: el error debe sobrevivir al borrado del
tenant, que es justo cuando más se quiere leer.
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "e1r2r3o4r5s6"
down_revision = "o9g1i2m3a4g5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fingerprint", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("exc_type", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("message", sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=False),
        sa.Column("method", sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
        sa.Column("path", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column("traceback", sqlmodel.sql.sqltypes.AutoString(length=20000), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("user_email", sqlmodel.sql.sqltypes.AutoString(length=320), nullable=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("notified_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    # Único: el upsert por firma es lo que evita una fila por cada repetición.
    op.create_index("ix_error_events_fingerprint", "error_events", ["fingerprint"], unique=True)
    op.create_index("ix_error_events_last_seen_at", "error_events", ["last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_error_events_last_seen_at", table_name="error_events")
    op.drop_index("ix_error_events_fingerprint", table_name="error_events")
    op.drop_table("error_events")
