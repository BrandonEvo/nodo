"""shopper catalog "La Maleta": paridad con import_catalog + calculadora persistida

Lleva el catálogo del Personal Shopper a la madurez del de Importaciones y
persiste la configuración de la calculadora (maleta/caja/tax) que antes vivía
hardcodeada en el frontend.

- shopper_catalog_settings : viaje (trip_name/close_at), terminología, banco, entrega, IA off
- shopper_catalog_items    : hook, category, ofertas, is_made_to_order, price_usd,
                             snapshot de cálculo (maleta/caja), image_url → TEXT (fotos data URI)
- shopper_reservations     : máquina de estados (comprada/en_camino/no_disponible/cancelada),
                             pedido acumulado (order_token) + PIN, resolution, reemplazo
- shopper_calc_settings    : TABLA NUEVA — config privada de la calculadora por tenant (RLS)

Todas las columnas nuevas son aditivas (nullable o con server_default), no rompen
el backend viejo en ejecución. El ALTER de image_url a TEXT es no reversible sin
pérdida si ya entraron data URIs (documentado en downgrade).

Revision ID: f2s3h4o5p6q7
Revises: e1n2c3a4r5g6
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2s3h4o5p6q7"
down_revision: Union[str, Sequence[str], None] = "e1n2c3a4r5g6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    for act, using in (
        ("select", "USING"),
        ("insert", "WITH CHECK"),
        ("update", "USING"),
        ("delete", "USING"),
    ):
        op.execute(f"""
            CREATE POLICY {table}_tenant_{act} ON {table} FOR {act.upper()}
            {using} (tenant_id = nullif(current_setting('app.current_tenant', TRUE), '')::uuid)
        """)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO nodo_app")


def upgrade() -> None:
    # ── shopper_catalog_settings: viaje + terminología + banco + entrega ─────────
    op.add_column("shopper_catalog_settings", sa.Column("delivery_days_min", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("shopper_catalog_settings", sa.Column("delivery_days_max", sa.Integer(), nullable=False, server_default="7"))
    op.add_column("shopper_catalog_settings", sa.Column("trip_name", sa.String(100), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("trip_close_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("trip_label", sa.String(30), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("origin_label", sa.String(60), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("bank_name", sa.String(80), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("bank_account_holder", sa.String(150), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("bank_account_number", sa.String(60), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("bank_account_type", sa.String(20), nullable=True))
    op.add_column("shopper_catalog_settings", sa.Column("ai_copy_enabled", sa.Boolean(), nullable=False, server_default="false"))

    # ── shopper_catalog_items: paridad + snapshot de cálculo ────────────────────
    op.add_column("shopper_catalog_items", sa.Column("hook", sa.String(80), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("category", sa.String(40), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("is_offer", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("shopper_catalog_items", sa.Column("compare_at_price_gtq", sa.Numeric(12, 2), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("offer_ends_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("is_made_to_order", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("shopper_catalog_items", sa.Column("last_reserved_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("amazon_asin", sa.String(20), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("price_usd", sa.Numeric(12, 2), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_mode", sa.String(10), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_weight_lbs", sa.Numeric(8, 3), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_volume_in3", sa.Numeric(10, 2), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_cost_per_lb", sa.Numeric(8, 4), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_cost_per_in3", sa.Numeric(10, 6), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_tax_rate", sa.Numeric(6, 2), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_exchange_rate", sa.Numeric(8, 4), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_shipping_usd", sa.Numeric(12, 2), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_tax_usd", sa.Numeric(12, 2), nullable=True))
    op.add_column("shopper_catalog_items", sa.Column("calc_total_cost_gtq", sa.Numeric(12, 2), nullable=True))
    op.create_index("ix_shopper_catalog_items_category", "shopper_catalog_items", ["category"])
    # image_url String(1000) → TEXT para admitir data URIs de fotos de cámara.
    op.alter_column(
        "shopper_catalog_items", "image_url",
        type_=sa.Text(), existing_type=sa.String(1000), existing_nullable=True,
    )
    # Los publicados desde Amazon fueron siempre por encargo; los manual conservan
    # false porque ahí el vendedor sí escribió una cantidad a propósito.
    op.execute("UPDATE shopper_catalog_items SET is_made_to_order = FALSE WHERE source = 'manual'")

    # ── shopper_reservations: máquina de estados + pedido acumulado + PIN ────────
    op.add_column("shopper_reservations", sa.Column("order_token", sa.UUID(), nullable=True))
    op.add_column("shopper_reservations", sa.Column("order_pin", sa.String(4), nullable=True))
    op.add_column("shopper_reservations", sa.Column("comprada_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_reservations", sa.Column("en_camino_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_reservations", sa.Column("no_disponible_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_reservations", sa.Column("cancelada_at", sa.DateTime(), nullable=True))
    op.add_column("shopper_reservations", sa.Column("resolution", sa.String(24), nullable=True))
    op.add_column("shopper_reservations", sa.Column("resolution_note", sa.String(300), nullable=True))
    op.add_column(
        "shopper_reservations",
        sa.Column("suggested_item_id", sa.UUID(), sa.ForeignKey("shopper_catalog_items.id"), nullable=True),
    )
    op.add_column(
        "shopper_reservations",
        sa.Column("replaces_reservation_id", sa.UUID(), sa.ForeignKey("shopper_reservations.id"), nullable=True),
    )
    op.add_column("shopper_reservations", sa.Column("client_notified_at", sa.DateTime(), nullable=True))
    op.create_index("ix_shopper_reservations_order_token", "shopper_reservations", ["order_token"])
    op.create_index("ix_shopper_reservations_order_pin", "shopper_reservations", ["order_pin"])
    op.create_index("ix_shopper_reservations_suggested_item", "shopper_reservations", ["suggested_item_id"])
    op.create_index("ix_shopper_reservations_replaces", "shopper_reservations", ["replaces_reservation_id"])

    # ── shopper_calc_settings: TABLA NUEVA (config privada de la calculadora) ────
    op.create_table(
        "shopper_calc_settings",
        sa.Column("id",                    sa.UUID(),        primary_key=True, nullable=False),
        sa.Column("tenant_id",             sa.UUID(),        sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("created_by",            sa.UUID(),        sa.ForeignKey("users.id"), nullable=True),
        sa.Column("freight_mode",          sa.String(10),    nullable=False, server_default="maleta"),
        sa.Column("exchange_rate",         sa.Numeric(8, 4), nullable=False, server_default="7.75"),
        sa.Column("tax_rate",              sa.Numeric(6, 2), nullable=False, server_default="7.00"),
        sa.Column("default_markup_pct",    sa.Numeric(6, 2), nullable=False, server_default="30.00"),
        sa.Column("suitcase_cost_usd",     sa.Numeric(10, 2), nullable=True),
        sa.Column("suitcase_capacity_lbs", sa.Numeric(8, 2),  nullable=True),
        sa.Column("box_cost_usd",          sa.Numeric(10, 2), nullable=True),
        sa.Column("box_length_in",         sa.Numeric(7, 2),  nullable=True),
        sa.Column("box_width_in",          sa.Numeric(7, 2),  nullable=True),
        sa.Column("box_height_in",         sa.Numeric(7, 2),  nullable=True),
        sa.Column("dim_unit",              sa.String(4),      nullable=False, server_default="in"),
        sa.Column("created_at",            sa.DateTime(),     nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at",            sa.DateTime(),     nullable=False, server_default=sa.text("NOW()")),
        sa.Column("is_active",             sa.Boolean(),      nullable=False, server_default="true"),
        sa.UniqueConstraint("tenant_id", name="uq_shopper_calc_settings_tenant"),
    )
    op.create_index("ix_shopper_calc_settings_tenant", "shopper_calc_settings", ["tenant_id"], unique=True)
    _enable_rls("shopper_calc_settings")


def downgrade() -> None:
    op.drop_index("ix_shopper_calc_settings_tenant", table_name="shopper_calc_settings")
    op.drop_table("shopper_calc_settings")

    op.drop_index("ix_shopper_reservations_replaces", table_name="shopper_reservations")
    op.drop_index("ix_shopper_reservations_suggested_item", table_name="shopper_reservations")
    op.drop_index("ix_shopper_reservations_order_pin", table_name="shopper_reservations")
    op.drop_index("ix_shopper_reservations_order_token", table_name="shopper_reservations")
    for col in (
        "client_notified_at", "replaces_reservation_id", "suggested_item_id",
        "resolution_note", "resolution", "cancelada_at", "no_disponible_at",
        "en_camino_at", "comprada_at", "order_pin", "order_token",
    ):
        op.drop_column("shopper_reservations", col)

    # image_url TEXT → String(1000): NO reversible sin pérdida si ya hay data URIs largos.
    op.alter_column(
        "shopper_catalog_items", "image_url",
        type_=sa.String(1000), existing_type=sa.Text(), existing_nullable=True,
    )
    op.drop_index("ix_shopper_catalog_items_category", table_name="shopper_catalog_items")
    for col in (
        "calc_total_cost_gtq", "calc_tax_usd", "calc_shipping_usd", "calc_exchange_rate",
        "calc_tax_rate", "calc_cost_per_in3", "calc_cost_per_lb", "calc_volume_in3",
        "calc_weight_lbs", "calc_mode", "price_usd", "amazon_asin", "last_reserved_at",
        "is_made_to_order", "offer_ends_at", "compare_at_price_gtq", "is_offer",
        "category", "hook",
    ):
        op.drop_column("shopper_catalog_items", col)

    for col in (
        "ai_copy_enabled", "bank_account_type", "bank_account_number", "bank_account_holder",
        "bank_name", "origin_label", "trip_label", "trip_close_at", "trip_name",
        "delivery_days_max", "delivery_days_min",
    ):
        op.drop_column("shopper_catalog_settings", col)
