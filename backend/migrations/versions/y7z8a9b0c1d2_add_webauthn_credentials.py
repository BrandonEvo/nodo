"""add webauthn_credentials table

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-07-01 00:00:00.000000

Passkeys FIDO2/WebAuthn (Face ID, huella, Windows Hello, PIN del dispositivo).
Credencial ligada a un User, no a un tenant: sin tenant_id y sin RLS, igual
que refresh_tokens.
"""
from alembic import op
import sqlalchemy as sa

revision = 'y7z8a9b0c1d2'
down_revision = 'x6y7z8a9b0c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'webauthn_credentials',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('credential_id', sa.String(512), nullable=False),
        sa.Column('public_key', sa.String(1024), nullable=False),
        sa.Column('sign_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('transports', sa.String(255), nullable=True),
        sa.Column('device_name', sa.String(120), nullable=True),
        sa.Column('backed_up', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('credential_id'),
    )
    op.create_index('ix_webauthn_credentials_credential_id', 'webauthn_credentials', ['credential_id'], unique=True)
    op.create_index('ix_webauthn_credentials_user_id', 'webauthn_credentials', ['user_id'])

    # Defensivo: nodo_app suele tener default privileges, pero lo hacemos explícito.
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON webauthn_credentials TO nodo_app")


def downgrade() -> None:
    op.drop_index('ix_webauthn_credentials_user_id', table_name='webauthn_credentials')
    op.drop_index('ix_webauthn_credentials_credential_id', table_name='webauthn_credentials')
    op.drop_table('webauthn_credentials')
