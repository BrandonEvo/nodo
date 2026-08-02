import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchPublicPlans, type PublicPlan } from '@/services/public_plans.service';
import { FALLBACK_PLANS } from './plans.fallback';
import { useReveal } from '@/hooks/useReveal';

const CURRENCY_PREFIX: Record<string, string> = { GTQ: 'Q', USD: '$', MXN: '$', EUR: '€' };

function formatPrice(price: number, currency: string): string {
  const prefix = CURRENCY_PREFIX[currency] ?? `${currency} `;
  return `${prefix}${price.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`;
}

function PeriodSuffix({ period }: { period: string }) {
  const label = period === 'year' ? '/año' : period === 'month' ? '/mes' : `/${period}`;
  return <span className="text-sm font-bold text-nodo-sub">{label}</span>;
}

function PlanSkeleton() {
  return (
    <div className="liquid-glass h-[420px] animate-pulse rounded-nodo-lg" />
  );
}

/** La grilla se adapta al número de planes publicados: con 4 no puede quedar
 *  una tarjeta huérfana en una fila propia. */
function gridClass(count: number): string {
  if (count === 1) return 'mx-auto max-w-md';
  if (count === 2) return 'sm:grid-cols-2 mx-auto max-w-3xl';
  if (count === 3) return 'lg:grid-cols-3';
  return 'sm:grid-cols-2 xl:grid-cols-4';
}

function PlanCard({ plan, count }: { plan: PublicPlan; count: number }) {
  const featured = plan.is_featured;
  // El destacado solo se eleva cuando la fila ya es horizontal: con 4 tarjetas
  // eso ocurre en `xl`, no en `lg`.
  const lift = count >= 4 ? 'xl:-translate-y-3 xl:scale-[1.03]' : 'lg:-translate-y-3 lg:scale-[1.03]';

  return (
    <div
      className={`liquid-glass relative overflow-hidden rounded-nodo-lg p-6 ${
        featured ? `liquid-glass-hero nodo-shimmer ${lift}` : ''
      }`}
      style={featured ? { borderColor: 'transparent', backgroundImage: 'var(--nodo-iris-soft)' } : undefined}
    >
      {featured && plan.badge_label && (
        <span
          className="absolute right-5 top-5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em]"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          {plan.badge_label}
        </span>
      )}

      <h3 className="text-lg font-black text-nodo-ink">{plan.name}</h3>
      {plan.tagline && <p className="mt-0.5 text-xs font-medium text-nodo-sub">{plan.tagline}</p>}

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-[44px] font-black leading-none tracking-tighter text-nodo-ink tabular-nums">
          {formatPrice(plan.price, plan.currency)}
        </span>
        <PeriodSuffix period={plan.billing_period} />
      </div>

      {plan.description && (
        <p className="mt-3 text-sm font-medium leading-relaxed text-nodo-sub">{plan.description}</p>
      )}

      <ul className="mt-6 flex flex-col gap-2.5">
        {(plan.features.length > 0 ? plan.features : plan.module_names).map(feature => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check size={15} className="mt-0.5 shrink-0 text-nodo-success-tx" />
            <span className="text-sm font-semibold text-nodo-ink">{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href="/portal?registro=1"
        className={`mt-7 flex h-14 w-full items-center justify-center rounded-full px-6 text-sm font-black transition-transform active:scale-[0.97] ${
          featured ? '' : 'border-2 border-nodo-line-s text-nodo-ink hover:bg-nodo-raised'
        }`}
        style={featured ? { background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' } : undefined}
      >
        {plan.cta_label || 'Empezar gratis'}
      </a>
    </div>
  );
}

export function Pricing() {
  // `undefined` = cargando; `null` = el backend no respondió.
  const [plans, setPlans] = useState<PublicPlan[] | null | undefined>(undefined);
  const ref = useReveal<HTMLDivElement>();

  useEffect(() => {
    let alive = true;
    fetchPublicPlans().then(result => {
      if (alive) setPlans(result);
    });
    return () => { alive = false; };
  }, []);

  // Backend caído → snapshot de respaldo, si es que hay uno cargado.
  const resolved = plans === null ? FALLBACK_PLANS : plans;
  const loading = resolved === undefined;
  const empty = !loading && resolved!.length === 0;

  return (
    <section id="precios" className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <div ref={ref} className="mx-auto mb-14 max-w-2xl text-center">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-nodo-dim">Planes</p>
        <h2 className="mt-3 text-[34px] font-black leading-[1.05] tracking-tight text-nodo-ink sm:text-[44px]">
          Cuesta menos que una venta perdida.
        </h2>
        <p className="mt-4 text-base font-medium leading-relaxed text-nodo-sub">
          Creas tu cuenta y nosotros te la activamos con la prueba incluida. Sin tarjeta, sin
          compromiso, sin llamada de ventas.
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <PlanSkeleton />
          <PlanSkeleton />
          <PlanSkeleton />
        </div>
      )}

      {/* Sin planes publicados (o backend caído sin snapshot): no inventamos
          precios — mandamos al portal, donde el precio real sí está. */}
      {empty && (
        <div className="liquid-glass mx-auto max-w-lg rounded-nodo-lg p-10 text-center">
          <h3 className="text-xl font-black text-nodo-ink">Empieza con tu prueba gratis</h3>
          <p className="mt-2 text-sm font-medium leading-relaxed text-nodo-sub">
            Crea tu cuenta y dinos qué plan te sirve. Revisamos tu registro y te habilitamos los
            módulos para que los pruebes. No pedimos tarjeta.
          </p>
          <a
            href="/portal?registro=1"
            className="mt-6 inline-flex h-14 items-center justify-center rounded-full px-8 text-sm font-black transition-transform active:scale-[0.97]"
            style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
          >
            Crear mi cuenta gratis
          </a>
        </div>
      )}

      {!loading && !empty && (
        <div className={`grid grid-cols-1 items-start gap-5 ${gridClass(resolved!.length)}`}>
          {resolved!.map(plan => (
            <PlanCard key={plan.id} plan={plan} count={resolved!.length} />
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs font-medium text-nodo-dim">
        Precios en quetzales. Puedes cambiar de plan o cancelar cuando quieras.
      </p>
    </section>
  );
}
