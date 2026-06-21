import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

const CHECK_INTERVAL_MS = 30 * 60_000
const MIN_CHECK_GAP_MS = 60_000

export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const lastCheckRef = useRef(0)

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

  if (!needRefresh) return null

  return (
    <>
      {/* Overlay bloqueante — no se puede ignorar sin actualizar */}
      <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-x-4 bottom-8 z-[81] max-w-sm mx-auto
                      bg-nodo-card border border-nodo-line rounded-3xl shadow-xl p-6
                      flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--nodo-iris)' }}>
          <RefreshCw size={24} color="white" />
        </div>
        <div>
          <p className="text-base font-black text-nodo-ink">Nueva versión disponible</p>
          <p className="text-sm text-nodo-sub mt-1">
            Actualiza para ver las últimas mejoras de Nodo.
          </p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="w-full h-14 rounded-full font-black text-base flex items-center justify-center gap-2
                     active:scale-[0.97] transition-transform"
          style={{ background: 'var(--nodo-iris)', color: 'white' }}
        >
          <RefreshCw size={18} />
          Actualizar ahora
        </button>
      </div>
    </>
  )
}
