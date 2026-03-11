"""add modules roles tenant_admin

Revision ID: a1b2c3d4e5f6
Revises: f8a82cf34560
Create Date: 2026-03-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f8a82cf34560"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabla modules
    op.create_table(
        "modules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("code", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("last_ip", sqlmodel.sql.sqltypes.AutoString(length=45), nullable=True),
        sa.Column("device_info", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_modules_id"), "modules", ["id"], unique=False)
    op.create_index(op.f("ix_modules_code"), "modules", ["code"], unique=True)
    op.create_index(op.f("ix_modules_name"), "modules", ["name"], unique=False)

    # Tabla tenant_modules (N:M)
    op.create_table(
        "tenant_modules",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("tenant_id", "module_id"),
    )

    # Tabla roles
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=80), nullable=False),
        sa.Column("code", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("last_ip", sqlmodel.sql.sqltypes.AutoString(length=45), nullable=True),
        sa.Column("device_info", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roles_id"), "roles", ["id"], unique=False)
    op.create_index(op.f("ix_roles_tenant_id"), "roles", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_roles_code"), "roles", ["code"], unique=False)
    op.create_index(op.f("ix_roles_name"), "roles", ["name"], unique=False)

    # users: is_tenant_admin, role_id
    op.add_column("users", sa.Column("is_tenant_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("role_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_users_role_id", "users", "roles", ["role_id"], ["id"], ondelete="SET NULL")
    op.create_index(op.f("ix_users_role_id"), "users", ["role_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_role_id"), table_name="users")
    op.drop_constraint("fk_users_role_id", "users", type_="foreignkey")
    op.drop_column("users", "role_id")
    op.drop_column("users", "is_tenant_admin")

    op.drop_index(op.f("ix_roles_name"), table_name="roles")
    op.drop_index(op.f("ix_roles_code"), table_name="roles")
    op.drop_index(op.f("ix_roles_tenant_id"), table_name="roles")
    op.drop_index(op.f("ix_roles_id"), table_name="roles")
    op.drop_table("roles")

    op.drop_table("tenant_modules")

    op.drop_index(op.f("ix_modules_name"), table_name="modules")
    op.drop_index(op.f("ix_modules_code"), table_name="modules")
    op.drop_index(op.f("ix_modules_id"), table_name="modules")
    op.drop_table("modules")
