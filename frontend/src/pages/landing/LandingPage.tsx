import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { hasSessionHint } from '@/lib/sessionHint';
import { DeviceMockup } from './DeviceMockup';
import { Pricing } from './Pricing';
import { Reveal } from './Reveal';
import {
  CustomerFacingSection, FaqSection, FinalCta, HowItWorks, ModulesBento, ProblemSection, TrustSection,
} from './sections';
import { HERO } from './content';

const PORTAL = '/portal';
// `?registro` abre el portal directo en la vista de alta: quien hizo clic en
// "Crear mi cuenta gratis" no debería aterrizar en un formulario de login.
const SIGNUP = '/portal?registro=1';

// ── Nav flotante ─────────────────────────────────────────────────────────────
function LandingNav({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <nav
        className={`flex w-full max-w-5xl items-center justify-between rounded-full pl-6 pr-2 transition-all duration-300 ${
          scrolled ? 'liquid-glass py-2' : 'py-3'
        }`}
      >
        <a href="/" className="text-xl font-black italic tracking-tighter text-nodo-ink">
          N.
        </a>
        <a
          href={ctaHref}
          className="flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black transition-transform active:scale-[0.97]"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          {ctaLabel}
          <ArrowRight size={15} />
        </a>
      </nav>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-14 px-5 pb-16 pt-32 sm:px-8 sm:pt-40 lg:flex-row lg:justify-between lg:gap-8">
      <div className="max-w-xl text-center lg:text-left">
        <Reveal>
          <span className="inline-flex items-center rounded-full border border-nodo-line bg-nodo-inset px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-nodo-sub">
            {HERO.eyebrow}
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 whitespace-pre-line text-[42px] font-black leading-[0.98] tracking-tight text-nodo-ink sm:text-[62px]">
            {HERO.title}
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 text-base font-medium leading-relaxed text-nodo-sub sm:text-lg">
            {HERO.subtitle}
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:justify-start">
            <a
              href={ctaHref}
              className="flex h-16 items-center justify-center gap-2 rounded-full px-8 text-base font-black transition-transform active:scale-[0.97]"
              style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
            >
              {ctaLabel}
              <ArrowRight size={18} />
            </a>
            <a
              href="#modulos"
              className="flex h-16 items-center justify-center rounded-full border-2 border-nodo-line-s px-8 text-base font-black text-nodo-ink transition-colors hover:bg-nodo-raised"
            >
              {HERO.ctaSecondary}
            </a>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
            {HERO.reassurance.map(item => (
              <li key={item} className="flex items-center gap-1.5 text-xs font-bold text-nodo-sub">
                <Check size={13} className="text-nodo-success-tx" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <DeviceMockup />
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer className="border-t border-nodo-line px-5 py-12 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="text-center sm:text-left">
          <span className="text-xl font-black italic tracking-tighter text-nodo-ink">N.</span>
          <p className="mt-1 text-xs font-medium text-nodo-dim">
            © {new Date().getFullYear()} Nodo · Hecho en Guatemala
          </p>
        </div>
        <nav className="flex items-center gap-6 text-xs font-bold text-nodo-sub">
          <a href="#modulos" className="transition-colors hover:text-nodo-ink">Módulos</a>
          <a href="#precios" className="transition-colors hover:text-nodo-ink">Precios</a>
          <a href="#faq" className="transition-colors hover:text-nodo-ink">Preguntas</a>
          <a href={PORTAL} className="transition-colors hover:text-nodo-ink">Portal</a>
        </nav>
      </div>
    </footer>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function LandingPage() {
  // La landing se compromete con el tema oscuro: el cristal y el gradiente
  // iridiscente solo tienen presencia sobre fondo oscuro. `useDarkMode` vive en
  // AppShell y nunca corre en rutas públicas, así que la clase se pone acá y se
  // retira al desmontar para no contaminar la preferencia del portal.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains('dark');
    root.classList.add('dark');
    return () => { if (!had) root.classList.remove('dark'); };
  }, []);

  // Quien ya tuvo sesión en este dispositivo va al portal; el visitante nuevo,
  // directo al alta.
  const [returning] = useState(() => hasSessionHint());
  const ctaLabel = returning ? HERO.ctaPrimaryReturning : HERO.ctaPrimary;
  const ctaHref = returning ? PORTAL : SIGNUP;

  return (
    <div className="nodo-canvas-ambient min-h-screen overflow-x-hidden">
      <LandingNav ctaLabel={ctaLabel} ctaHref={ctaHref} />
      <main>
        <Hero ctaLabel={ctaLabel} ctaHref={ctaHref} />
        <ProblemSection />
        <ModulesBento />
        <CustomerFacingSection />
        <HowItWorks />
        <TrustSection />
        <Pricing />
        <FaqSection />
        <FinalCta ctaHref={SIGNUP} />
      </main>
      <LandingFooter />
    </div>
  );
}
