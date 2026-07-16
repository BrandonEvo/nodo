"""import: fichaje de clientes (cliente_id, source, verificación) + ofertas por tiempo

Añade:
  - import_clientes:        source, attribution, phone_verified, phone_verified_at
  - import_reservations:    cliente_id (FK) — costura reserva ↔ ficha
  - import_catalog_items:   is_offer, compare_at_price_gtq, offer_ends_at
Backfill: crea fichas para reservas huérfanas y las liga por teléfono.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── import_clientes: fichaje / atribución / verificación ──────────────
    op.add_column('import_clientes',
        sa.Column('source', sa.String(20), nullable=False, server_default='manual'))
    op.add_column('import_clientes',
        sa.Column('attribution', sa.String(120), nullable=True))
    op.add_column('import_clientes',
        sa.Column('phone_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('import_clientes',
        sa.Column('phone_verified_at', sa.DateTime(), nullable=True))

    # ── import_reservations: FK a la ficha del cliente ───────────────────
    op.add_column('import_reservations',
        sa.Column('cliente_id', sa.UUID(), sa.ForeignKey('import_clientes.id'), nullable=True))
    op.create_index('ix_import_reservations_cliente_id', 'import_reservations', ['cliente_id'])

    # ── import_catalog_items: oferta por tiempo limitado ─────────────────
    op.add_column('import_catalog_items',
        sa.Column('is_offer', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('import_catalog_items',
        sa.Column('compare_at_price_gtq', sa.Numeric(12, 2), nullable=True))
    op.add_column('import_catalog_items',
        sa.Column('offer_ends_at', sa.DateTime(), nullable=True))

    # ── Backfill: fichar reservas huérfanas y ligarlas por teléfono ──────
    # 1) crear una ficha por cada (tenant, teléfono) de reserva que aún no exista
    op.execute("""
        INSERT INTO import_clientes
            (id, tenant_id, name, phone, source, phone_verified, created_at, updated_at, is_active)
        SELECT DISTINCT ON (r.tenant_id, r.client_phone)
               gen_random_uuid(), r.tenant_id, r.client_name, r.client_phone,
               'catalogo', false, NOW(), NOW(), true
        FROM import_reservations r
        WHERE r.client_phone IS NOT NULL AND r.client_phone <> ''
          AND NOT EXISTS (
              SELECT 1 FROM import_clientes c
              WHERE c.tenant_id = r.tenant_id
                AND c.phone = r.client_phone
                AND c.is_active = true
          )
        ORDER BY r.tenant_id, r.client_phone, r.created_at
    """)
    # 2) ligar cada reserva a su ficha por (tenant, teléfono)
    op.execute("""
        UPDATE import_reservations r
        SET cliente_id = c.id
        FROM import_clientes c
        WHERE r.cliente_id IS NULL
          AND c.tenant_id = r.tenant_id
          AND c.phone = r.client_phone
          AND c.is_active = true
    """)


def downgrade() -> None:
    op.drop_column('import_catalog_items', 'offer_ends_at')
    op.drop_column('import_catalog_items', 'compare_at_price_gtq')
    op.drop_column('import_catalog_items', 'is_offer')

    op.drop_index('ix_import_reservations_cliente_id', table_name='import_reservations')
    op.drop_column('import_reservations', 'cliente_id')

    op.drop_column('import_clientes', 'phone_verified_at')
    op.drop_column('import_clientes', 'phone_verified')
    op.drop_column('import_clientes', 'attribution')
    op.drop_column('import_clientes', 'source')
