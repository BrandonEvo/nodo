import { useEffect, useState } from 'react'
import { ScanFace, Trash2, Loader2, ShieldCheck, Plus } from 'lucide-react'
import { useToast } from '@/components/ui/Toaster'
import { webauthnService, isPasskeyCancel, isCeremonyTimeout, savePasskeyHint, clearPasskeyHint, type PasskeyInfo } from '@/services/webauthn.service'

function guessDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh|Mac OS/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Este dispositivo'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export function PasskeyManager({ displayName }: { displayName?: string }) {
  const toast = useToast()
  const [supported] = useState(() => webauthnService.isSupported())
  const [items, setItems] = useState<PasskeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [regOptions, setRegOptions] = useState<any>(null)

  const load = async () => {
    try {
      setItems(await webauthnService.listCredentials())
    } finally {
      setLoading(false)
    }
  }

  // Pre-cargar opciones: preserva el gesto de usuario en iOS Safari. Sin
  // opciones el botón queda en "Preparando…" → si el fetch falla, reintento
  // corto acotado (el interval de 4 min sigue siendo el refresco de fondo).
  const prefetch = (attempt = 0) => {
    webauthnService.registerBegin()
      .then(setRegOptions)
      .catch(() => {
        setRegOptions(null)
        if (attempt < 3) setTimeout(() => prefetch(attempt + 1), 8000)
      })
  }

  useEffect(() => {
    load()
    if (!supported) return
    // El challenge del backend caduca a los 5 min → refrescar mientras la vista viva.
    prefetch()
    const timer = setInterval(() => prefetch(), 4 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const handleEnroll = async () => {
    // El botón está deshabilitado hasta tener opciones pre-cargadas: cualquier
    // await antes de la ceremonia haría que WebKit descarte el gesto de usuario
    // y create() se cuelgue sin diálogo. Guard por si acaso.
    const options = regOptions
    if (!options) return
    setEnrolling(true)
    try {
      await webauthnService.registerFinish(options, guessDeviceName())
      // Habilita el desbloqueo rápido en este dispositivo la próxima vez.
      savePasskeyHint({ name: displayName || '' })
      await load()
      toast.success('Face ID activado en este dispositivo.')
    } catch (err: any) {
      if (!isPasskeyCancel(err)) {
        console.error('[passkey] enroll', err)
        if (isCeremonyTimeout(err)) {
          toast.error('iOS no completó el registro. Si te pidió activar el Llavero de iCloud, hazlo en Ajustes → tu nombre → iCloud → Contraseñas y Llavero, y vuelve a intentar.')
        } else {
          toast.error(`No se pudo activar (${err?.name || 'error'}). Inténtalo de nuevo.`)
        }
      }
    } finally {
      setEnrolling(false)
      if (supported) prefetch()   // opciones de un solo uso
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await webauthnService.deleteCredential(id)
      setItems(prev => {
        const next = prev.filter(i => i.id !== id)
        if (next.length === 0) clearPasskeyHint()
        return next
      })
    } catch {
      toast.error('No se pudo eliminar el passkey.')
    } finally {
      setDeletingId(null)
    }
  }

  if (!supported) return null

  return (
    <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-1">
        <ShieldCheck className="w-5 h-5 text-nodo-sub" />
        <h3 className="text-lg font-bold text-nodo-ink">Face ID / huella</h3>
      </div>
      <p className="text-sm text-nodo-sub font-medium mb-5">
        Vuelve a entrar a tu sesión en este dispositivo con Face ID, huella o el PIN, sin escribir tu contraseña.
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-16">
          <Loader2 className="w-6 h-6 animate-spin text-nodo-sub" />
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2 mb-5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-nodo-inset rounded-2xl px-4 py-3">
              <ScanFace className="w-5 h-5 text-nodo-sub shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-nodo-ink truncate">
                  {item.device_name || 'Passkey'}
                </p>
                <p className="text-xs text-nodo-sub">
                  Activado el {formatDate(item.created_at)}
                  {item.last_used_at ? ` · usado ${formatDate(item.last_used_at)}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-nodo-danger-tx hover:bg-nodo-danger-bg transition-colors active:scale-90 disabled:opacity-40"
                aria-label="Eliminar passkey"
              >
                {deletingId === item.id
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Trash2 size={16} />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 mb-4 text-center">
          <ScanFace size={30} className="text-nodo-dim mb-2" />
          <p className="text-sm font-bold text-nodo-dim">Aún no hay dispositivos activados</p>
        </div>
      )}

      <button
        onClick={handleEnroll}
        disabled={enrolling || !regOptions}
        className="w-full h-12 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-40"
      >
        {enrolling || !regOptions
          ? <Loader2 size={18} className="animate-spin" />
          : <Plus size={18} />}
        {!enrolling && !regOptions ? 'Preparando…' : 'Activar en este dispositivo'}
      </button>
      {/iPhone|iPad/.test(navigator.userAgent) && (
        <p className="text-[11px] text-nodo-dim font-medium text-center mt-3">
          Requiere el Llavero de iCloud activo — Ajustes → tu nombre → iCloud → Contraseñas y Llavero.
        </p>
      )}
    </div>
  )
}
