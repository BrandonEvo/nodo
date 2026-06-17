import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

// El SW solo busca versiones nuevas al cargar la página; en una PWA que vive
// abierta días, eso significa no actualizar nunca. Chequeo activo cada 30 min
// y al volver al primer plano, con un mínimo entre chequeos para no duplicarlos.
const CHECK_INTERVAL_MS = 30 * 60_000
const MIN_CHECK_GAP_MS = 60_000

export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const lastCheckRef = useRef(0)
  // Descartado el aviso, no reaparece en esta sesión aunque el SW siga en
  // espera: sin esto cada registration.update() volvía a poner needRefresh en
  // true y el banner salía una y otra vez. Un reload natural lo resetea.
  const [dismissed, setDismissed] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null
    },
  })

  useEffect(() => {
    const check = () => {
      const reg = registrationRef.current
      if (!reg) return
      const now = Date.now()
      if (now - lastCheckRef.current < MIN_CHECK_GAP_MS) return
      lastCheckRef.current = now
      reg.update().catch(() => {})
    }
    const id = setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!needRefresh || dismissed) return null

  return (
    <div className="fixed bottom-20 inset-x-4 z-[55] flex items-center gap-3 bg-nodo-ink text-nodo-canvas px-4 py-3 rounded-2xl shadow-lg max-w-sm mx-auto">
      <RefreshCw size={16} className="shrink-0 text-nodo-canvas/70" />
      <span className="flex-1 text-sm font-medium text-nodo-canvas/90">
        Nueva versión disponible
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="text-nodo-canvas font-black text-xs border border-nodo-canvas/30 px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
      >
        Actualizar
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-nodo-canvas/50 active:scale-90 transition-transform"
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>
    </div>
  )
}
