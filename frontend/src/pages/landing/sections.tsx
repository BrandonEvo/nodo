import { useState } from 'react';
import {
  BarChart3, Boxes, CalendarClock, ChevronDown, DatabaseBackup, Fingerprint, Globe,
  Lock, Receipt, Ship, ShoppingCart, Smartphone, Sparkles, TrendingDown, Wallet,
} from 'lucide-react';
import { Reveal } from './Reveal';
import { CUSTOMER_FACING, FAQ, FINAL_CTA, MODULES, PROBLEM, STEPS, TRUST } from './content';

const ICONS = {
  ShoppingCart, Boxes, Globe, CalendarClock, Ship, Wallet, Receipt, BarChart3, Sparkles,
  Lock, Fingerprint, DatabaseBackup, Smartphone,
} as const;

// El manual permite máximo 3 pasteles por pantalla. En el bento el pastel se
// reserva para el chip del ícono, no para el fondo de la tarjeta: así caben los
// nueve módulos sin romper la regla ni saturar la vista.
const TINTS = {
  mint: 'bg-nodo-pastel-mint',
  blue: 'bg-nodo-pastel-blue',
  peach: 'bg-nodo-pastel-peach',
  pink: 'bg-nodo-pastel-pink',
  yellow: 'bg-nodo-pastel-yellow',
  lavender: 'bg-nodo-pastel-lavender',
} as const;

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <Reveal className="mx-auto mb-14 max-w-2xl text-center">
      {eyebrow && (
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-nodo-dim">{eyebrow}</p>
      )}
      <h2 className="mt-3 whitespace-pre-line text-[34px] font-black leading-[1.05] tracking-tight text-nodo-ink sm:text-[44px]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base font-medium leading-relaxed text-nodo-sub">{subtitle}</p>
      )}
    </Reveal>
  );
}

// ── Agitación del problema ───────────────────────────────────────────────────
export function ProblemSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <SectionHeader title={PROBLEM.title} subtitle={PROBLEM.subtitle} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {PROBLEM.points.map((point, i) => (
          <Reveal key={point.title} delay={i * 90} className="liquid-glass rounded-nodo-lg p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-nodo-danger-bg">
              <TrendingDown size={18} className="text-nodo-danger-tx" />
            </div>
            <h3 className="text-base font-black leading-snug text-nodo-ink">{point.title}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-nodo-sub">{point.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Bento de módulos ─────────────────────────────────────────────────────────
export function ModulesBento() {
  return (
    <section id="modulos" className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <SectionHeader
        eyebrow="Módulos"
        title={'Activas solo lo que usas.\nNodo crece contigo.'}
        subtitle="Cada módulo funciona solo y todos comparten los mismos datos. Sin integraciones, sin exportar a Excel."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((module, i) => {
          const Icon = ICONS[module.icon];
          return (
            <Reveal
              key={module.name}
              delay={(i % 3) * 90}
              className="liquid-glass group rounded-nodo-lg p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${TINTS[module.tint]} transition-transform duration-300 group-hover:scale-110`}
              >
                <Icon size={19} className="text-nodo-ink" />
              </div>
              <h3 className="text-base font-black text-nodo-ink">{module.name}</h3>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-nodo-sub">{module.body}</p>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ── El diferenciador: páginas públicas para los clientes del negocio ─────────
export function CustomerFacingSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <SectionHeader
        eyebrow={CUSTOMER_FACING.eyebrow}
        title={CUSTOMER_FACING.title}
        subtitle={CUSTOMER_FACING.subtitle}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {CUSTOMER_FACING.cards.map((card, i) => (
          <Reveal
            key={card.title}
            delay={i * 90}
            className="liquid-glass liquid-glass-hero overflow-hidden rounded-nodo-lg p-6"
            style={{ backgroundImage: 'var(--nodo-iris-soft)' }}
          >
            <h3 className="text-base font-black text-nodo-ink">{card.title}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-nodo-sub">{card.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Cómo funciona ────────────────────────────────────────────────────────────
export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <SectionHeader eyebrow="Cómo funciona" title={'Estás vendiendo\nen menos de diez minutos.'} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 110} className="liquid-glass rounded-nodo-lg p-6">
            <span
              className="text-[40px] font-black leading-none tracking-tighter text-transparent tabular-nums"
              style={{ backgroundImage: 'var(--nodo-iris)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}
            >
              {step.n}
            </span>
            <h3 className="mt-4 text-base font-black text-nodo-ink">{step.title}</h3>
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-nodo-sub">{step.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Confianza / seguridad ────────────────────────────────────────────────────
export function TrustSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <SectionHeader eyebrow={TRUST.eyebrow} title={TRUST.title} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {TRUST.items.map((item, i) => {
          const Icon = ICONS[item.icon];
          return (
            <Reveal key={item.title} delay={(i % 2) * 90} className="liquid-glass flex gap-4 rounded-nodo-lg p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-nodo-inset">
                <Icon size={18} className="text-nodo-ink" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-nodo-ink">{item.title}</h3>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-nodo-sub">{item.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="liquid-glass overflow-hidden rounded-nodo-md">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-sm font-black text-nodo-ink">{q}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-nodo-sub transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm font-medium leading-relaxed text-nodo-sub">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-5 py-24 sm:px-8">
      <SectionHeader eyebrow="Preguntas" title="Lo que todos preguntan antes de empezar." />
      <div className="flex flex-col gap-3">
        {FAQ.map(item => (
          <FaqItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </section>
  );
}

// ── CTA final ────────────────────────────────────────────────────────────────
export function FinalCta({ ctaHref }: { ctaHref: string }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <Reveal
        className="nodo-shimmer relative overflow-hidden rounded-[36px] px-6 py-20 text-center"
        style={{ background: 'var(--nodo-iris)' }}
      >
        <h2
          className="relative z-10 mx-auto max-w-2xl whitespace-pre-line text-[32px] font-black leading-[1.08] tracking-tight sm:text-[46px]"
          style={{ color: 'var(--nodo-on-iris)' }}
        >
          {FINAL_CTA.title}
        </h2>
        <p className="relative z-10 mt-5 text-base font-semibold text-white/80">{FINAL_CTA.subtitle}</p>
        <a
          href={ctaHref}
          className="relative z-10 mt-9 inline-flex h-16 items-center justify-center rounded-full bg-nodo-ink px-10 text-base font-black text-nodo-canvas transition-transform active:scale-[0.97]"
        >
          {FINAL_CTA.cta}
        </a>
      </Reveal>
    </section>
  );
}
