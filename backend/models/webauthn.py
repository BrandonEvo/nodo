# Tabla: WEBAUTHN_CREDENTIALS — passkeys (Face ID, huella, Windows Hello, PIN)
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel


class WebAuthnCredential(SQLModel, table=True):
    """Credencial FIDO2/WebAuthn ligada a un User (no a un tenant).

    Igual que refresh_tokens: sin tenant_id y sin RLS. Las queries se acotan
    siempre por user_id de la sesión autenticada.
    """
    __tablename__ = "webauthn_credentials"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    credential_id: str = Field(max_length=512, index=True, unique=True)  # base64url del raw id
    public_key: str = Field(max_length=1024)                             # base64url clave pública COSE
    sign_count: int = Field(default=0)
    transports: Optional[str] = Field(default=None, max_length=255)      # csv: "internal,hybrid"
    device_name: Optional[str] = Field(default=None, max_length=120)     # etiqueta amigable
    backed_up: bool = Field(default=False)                               # passkey sincronizado (flag BE)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    last_used_at: Optional[datetime] = Field(default=None)
