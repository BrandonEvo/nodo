"""bakery_modules — Módulos operativos de panadería (Bodega, Recetas, Cocina, Mostrador, Cierre)

Revision ID: c9d8e7f6a5b4
Revises: c1f2a3b4d5e6
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'c9d8e7f6a5b4'
down_revision: Union[str, Sequence[str], None] = 'c1f2a3b4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── MÓDULO 1: BODEGA ──────────────────────────────────────────────────
    op.create_table('inventory_items',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('unit', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
        sa.Column('current_stock', sa.Float(), nullable=False),
        sa.Column('minimum_stock', sa.Float(), nullable=False),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=60), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_inventory_items_id'), 'inventory_items', ['id'], unique=False)
    op.create_index(op.f('ix_inventory_items_tenant_id'), 'inventory_items', ['tenant_id'], unique=False)

    # ── MÓDULO 2: RECETAS ─────────────────────────────────────────────────
    op.create_table('recipes',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('base_unit', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
        sa.Column('estimated_yield', sa.Integer(), nullable=False),
        sa.Column('estimated_cost', sa.Float(), nullable=False),
        sa.Column('sell_price', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_recipes_id'), 'recipes', ['id'], unique=False)
    op.create_index(op.f('ix_recipes_tenant_id'), 'recipes', ['tenant_id'], unique=False)

    op.create_table('recipe_ingredients',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('recipe_id', sa.Uuid(), nullable=False),
        sa.Column('inventory_item_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['inventory_item_id'], ['inventory_items.id']),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_recipe_ingredients_id'), 'recipe_ingredients', ['id'], unique=False)
    op.create_index(op.f('ix_recipe_ingredients_tenant_id'), 'recipe_ingredients', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_recipe_ingredients_recipe_id'), 'recipe_ingredients', ['recipe_id'], unique=False)
    op.create_index(op.f('ix_recipe_ingredients_inventory_item_id'), 'recipe_ingredients', ['inventory_item_id'], unique=False)

    # ── MÓDULO 3: COCINA ──────────────────────────────────────────────────
    op.create_table('production_orders',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('recipe_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_production_orders_id'), 'production_orders', ['id'], unique=False)
    op.create_index(op.f('ix_production_orders_tenant_id'), 'production_orders', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_production_orders_recipe_id'), 'production_orders', ['recipe_id'], unique=False)

    op.create_table('waste_logs',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('production_order_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('reason', sqlmodel.sql.sqltypes.AutoString(length=300), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['production_order_id'], ['production_orders.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_waste_logs_id'), 'waste_logs', ['id'], unique=False)
    op.create_index(op.f('ix_waste_logs_tenant_id'), 'waste_logs', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_waste_logs_production_order_id'), 'waste_logs', ['production_order_id'], unique=False)

    # ── MÓDULO 4: MOSTRADOR ───────────────────────────────────────────────
    op.create_table('sales',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('total', sa.Float(), nullable=False),
        sa.Column('payment_method', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sales_id'), 'sales', ['id'], unique=False)
    op.create_index(op.f('ix_sales_tenant_id'), 'sales', ['tenant_id'], unique=False)

    op.create_table('sale_items',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('sale_id', sa.Uuid(), nullable=False),
        sa.Column('recipe_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('freshness_tag', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id']),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sale_items_id'), 'sale_items', ['id'], unique=False)
    op.create_index(op.f('ix_sale_items_tenant_id'), 'sale_items', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_sale_items_sale_id'), 'sale_items', ['sale_id'], unique=False)
    op.create_index(op.f('ix_sale_items_recipe_id'), 'sale_items', ['recipe_id'], unique=False)

    # ── MÓDULO 5: CIERRE ──────────────────────────────────────────────────
    op.create_table('shift_registers',
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('expected_cash', sa.Float(), nullable=False),
        sa.Column('actual_cash', sa.Float(), nullable=False),
        sa.Column('difference', sa.Float(), nullable=False),
        sa.Column('card_total', sa.Float(), nullable=False),
        sa.Column('total_sales', sa.Float(), nullable=False),
        sa.Column('ticket_count', sa.Integer(), nullable=False),
        sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shift_registers_id'), 'shift_registers', ['id'], unique=False)
    op.create_index(op.f('ix_shift_registers_tenant_id'), 'shift_registers', ['tenant_id'], unique=False)


def downgrade() -> None:
    op.drop_table('shift_registers')
    op.drop_table('sale_items')
    op.drop_table('sales')
    op.drop_table('waste_logs')
    op.drop_table('production_orders')
    op.drop_table('recipe_ingredients')
    op.drop_table('recipes')
    op.drop_table('inventory_items')
