import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import api from '@/lib/api';

export interface PasskeyInfo {
  id: string;
  device_name: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

/**
 * IMPORTANTE (iOS Safari): navigator.credentials.create()/get() exige activación
 * por gesto de usuario. Si se hace `await begin()` ANTES de la ceremonia, WebKit
 * descarta el gesto y la llamada se cuelga sin mostrar diálogo. Por eso `begin` y
 * `finish` están separados: la vista pre-carga las opciones (begin) al montar, y
 * el click invoca `finish` directamente (la ceremonia es la primera línea, sin
 * `await` previo) → el gesto se preserva.
 */
/**
 * Si WebKit descartó la activación de usuario, create()/get() queda pendiente
 * PARA SIEMPRE: sin diálogo, sin error y sin respetar options.timeout. Este
 * race es el backstop: al vencer, aborta la ceremonia colgada y rechaza con un
 * error distinguible (name: 'CeremonyTimeout') para soltar el spinner de la UI.
 * El plazo sigue a options.timeout (+5s de margen para que, si el timeout
 * nativo sí funciona, gane su NotAllowedError con contexto real).
 */
const CEREMONY_TIMEOUT_MS = 60_000;

function withCeremonyTimeout<T>(ceremony: Promise<T>, optionsTimeout?: unknown): Promise<T> {
  const ms = typeof optionsTimeout === 'number' && optionsTimeout > 0
    ? optionsTimeout + 5_000
    : CEREMONY_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      WebAuthnAbortService.cancelCeremony();
      const err = new Error('El sistema nunca mostró el diálogo de Face ID / huella.');
      err.name = 'CeremonyTimeout';
      reject(err);
    }, ms);
    ceremony.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function isCeremonyTimeout(err: any): boolean {
  return err?.name === 'CeremonyTimeout';
}

export const webauthnService = {
  /** true si el navegador soporta WebAuthn (Face ID, huella, Windows Hello, PIN). */
  isSupported(): boolean {
    return browserSupportsWebAuthn();
  },

  // ── Enrolar ──
  async registerBegin(): Promise<any> {
    const { data } = await api.post('/api/auth/webauthn/register/begin');
    return data;
  },
  async registerFinish(options: any, deviceName?: string): Promise<void> {
    // La ceremonia arranca en la PRIMERA línea, sin await previo (ver nota arriba).
    const credential = await withCeremonyTimeout(startRegistration(options), options?.timeout);
    await api.post('/api/auth/webauthn/register/complete', { credential, device_name: deviceName });
  },

  // ── Login por passkey ──
  async loginBegin(): Promise<any> {
    const { data } = await api.post('/api/auth/webauthn/login/begin');
    return data;
  },
  async loginFinish(options: any): Promise<void> {
    const credential = await withCeremonyTimeout(startAuthentication(options), options?.timeout);
    await api.post('/api/auth/webauthn/login/complete', { credential });
  },

  async listCredentials(): Promise<PasskeyInfo[]> {
    const { data } = await api.get<PasskeyInfo[]>('/api/auth/webauthn/credentials');
    return data;
  },

  async deleteCredential(id: string): Promise<void> {
    await api.delete(`/api/auth/webauthn/credentials/${id}`);
  },
};

/** El usuario canceló/cerró el prompt biométrico — no es un error a reportar. */
export function isPasskeyCancel(err: any): boolean {
  return err?.name === 'NotAllowedError'
    || err?.name === 'AbortError'
    || err?.code === 'ERROR_CEREMONY_ABORTED';
}

// ── Pista local de desbloqueo ─────────────────────────────────────────────────
// El desbloqueo con Face ID solo se ofrece en dispositivos donde ya hubo una
// sesión con passkeys registrados. La pista vive en localStorage (solo el nombre
// para el saludo — nada sensible; la credencial real está en el enclave del SO).

const HINT_KEY = 'nodo_passkey_hint';

export interface PasskeyHint {
  name: string;
}

export function getPasskeyHint(): PasskeyHint | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePasskeyHint(hint: PasskeyHint): void {
  try { localStorage.setItem(HINT_KEY, JSON.stringify(hint)); } catch { /* modo privado */ }
}

export function clearPasskeyHint(): void {
  try { localStorage.removeItem(HINT_KEY); } catch { /* modo privado */ }
}

/**
 * Con sesión activa, alinea la pista con el estado real del servidor: si el
 * usuario tiene passkeys, este dispositivo ofrecerá desbloqueo con Face ID la
 * próxima vez; si los revocó todos, deja de ofrecerlo.
 */
export async function syncPasskeyHint(displayName: string): Promise<void> {
  if (!webauthnService.isSupported()) return;
  try {
    const creds = await webauthnService.listCredentials();
    if (creds.length > 0) savePasskeyHint({ name: displayName });
    else clearPasskeyHint();
  } catch { /* sin red o sesión inválida: no tocar la pista */ }
}
