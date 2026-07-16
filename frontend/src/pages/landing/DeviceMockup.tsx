import { ArrowUpRight, Boxes, ShoppingCart, Wallet } from 'lucide-react';

/**
 * Mockup del producto renderizado con los mismos tokens que la app real, dentro
 * de un marco de iPhone. Preferido sobre un screenshot: pesa menos, se ve nítido
 * en cualquier densidad y no se desactualiza cuando cambia el diseño.
 */
export function DeviceMockup() {
  return (
    <div className="relative w-[280px] sm:w-[320px] shrink-0" aria-hidden="true">
      {/* Halo iridiscente detrás del dispositivo */}
      <div
        className="absolute -inset-12 rounded-full opacity-30 blur-3xl nodo-iris-pan"
        style={{ background: 'var(--nodo-iris)' }}
      />

      <div className="relative nodo-float-slow">
        {/* Marco */}
        <div className="relative rounded-[3rem] border border-nodo-line bg-nodo-ink p-2 shadow-2xl">
          {/* Notch */}
          <div className="absolute left-1/2 top-3 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-nodo-ink" />

          <div className="nodo-canvas-ambient overflow-hidden rounded-[2.5rem] px-4 pb-5 pt-9">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-nodo-dim">Hoy</p>
                <p className="text-sm font-black text-nodo-ink">Panificadora El Sol</p>
              </div>
              <span className="text-lg font-black italic tracking-tighter text-nodo-ink">N.</span>
            </div>

            {/* Hero card — el dato protagonista */}
            <div
              className="liquid-glass liquid-glass-hero mb-3 rounded-nodo-lg p-4"
              style={{ background: 'var(--nodo-iris)' }}
            >
              <p className="text-[10px] font-semibold text-white/70">Ventas del día</p>
              <p className="text-[40px] font-black leading-none tracking-tighter text-white tabular-nums">
                Q4,820
              </p>
              <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-white/80">
                <ArrowUpRight size={12} /> 18% vs. ayer
              </p>
            </div>

            {/* Bento de KPIs */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="liquid-glass rounded-nodo-md p-3">
                <Wallet size={14} className="mb-1.5 text-nodo-sub" />
                <p className="text-lg font-black text-nodo-ink tabular-nums">Q1,340</p>
                <p className="text-[9px] font-semibold text-nodo-sub">Margen real</p>
              </div>
              <div className="liquid-glass rounded-nodo-md p-3">
                <Boxes size={14} className="mb-1.5 text-nodo-sub" />
                <p className="text-lg font-black text-nodo-ink tabular-nums">7</p>
                <p className="text-[9px] font-semibold text-nodo-sub">Por reponer</p>
              </div>
            </div>

            <div className="liquid-glass flex items-center gap-3 rounded-nodo-md p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-nodo-pastel-mint">
                <ShoppingCart size={14} className="text-nodo-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-nodo-ink">Pedido #1042</p>
                <p className="text-[10px] font-medium text-nodo-sub">Listo para entrega</p>
              </div>
              <span className="rounded-full bg-nodo-success-bg px-2 py-1 text-[9px] font-black text-nodo-success-tx">
                PAGADO
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
