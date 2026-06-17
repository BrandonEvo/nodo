import { useState } from 'react';
import { Smartphone, Download, Share, PlusSquare, Check, Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { usePWAInstall } from '@/hooks/usePWAInstall';

const IOS_STEPS = [
  { icon: Share, text: <>Tocá el botón <strong>Compartir</strong> en la barra del navegador</> },
  { icon: PlusSquare, text: <>Elegí <strong>"Añadir a pantalla de inicio"</strong></> },
  { icon: Check, text: <>Confirmá con <strong>"Añadir"</strong> — listo, Nodo queda como app</> },
];

export function InstallPWACard() {
  const { canInstall, hasNativePrompt, promptInstall } = usePWAInstall();
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!canInstall) return null;

  const handleInstall = async () => {
    if (!hasNativePrompt) {
      setShowIOSSheet(true);
      return;
    }
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <div className="flex items-start gap-4 bg-nodo-card border border-nodo-line rounded-[20px] p-4 shadow-sm">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-nodo-primary-soft flex items-center justify-center">
          <Smartphone size={18} style={{ color: 'var(--nodo-primary)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-nodo-ink leading-snug">
            Instalá Nodo en tu dispositivo
          </p>
          <p className="text-xs text-nodo-sub font-medium mt-0.5 leading-relaxed">
            Acceso directo desde tu pantalla de inicio, a pantalla completa y más rápido.
          </p>

          <button
            onClick={handleInstall}
            disabled={installing}
            className="mt-3 h-9 px-4 rounded-xl bg-nodo-ink text-nodo-canvas text-xs font-bold active:scale-[0.97] transition-transform disabled:opacity-50 flex items-center gap-1.5"
          >
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {installing ? 'Instalando…' : 'Instalar app'}
          </button>
        </div>
      </div>

      <BottomSheet
        open={showIOSSheet}
        onClose={() => setShowIOSSheet(false)}
        title="Instalar Nodo"
      >
        <div className="flex flex-col gap-5">
          <p className="text-sm text-nodo-sub font-medium leading-relaxed">
            En iPhone y iPad la instalación se hace desde el menú del navegador:
          </p>
          {IOS_STEPS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center">
                <Icon size={18} className="text-nodo-ink" />
              </div>
              <p className="text-sm font-semibold text-nodo-ink leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
