import { useState } from 'react';
import { MessageCircle, Link2, Share2, Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  copyToClipboard, buildWhatsAppUrl, canNativeShare, nativeShare,
} from '@/lib/utils';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  /** Link público de tracking a compartir */
  url: string;
  productName: string;
  clienteName?: string | null;
  clientePhone?: string | null;
}

function shareMessage(productName: string, url: string, clienteName?: string | null): string {
  const saludo = clienteName ? `Hola ${clienteName} 👋` : 'Hola 👋';
  return `${saludo} aquí puedes seguir tu pedido «${productName}»:\n${url}`;
}

export function ShareSheet({ open, onClose, url, productName, clienteName, clientePhone }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  const message = shareMessage(productName, url, clienteName);

  function openWhatsApp() {
    window.open(buildWhatsAppUrl(message, clientePhone), '_blank', 'noopener');
    onClose();
  }

  async function copyLink() {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => { setCopied(false); onClose(); }, 1000);
    }
  }

  async function doNativeShare() {
    const ok = await nativeShare({ title: productName, text: message, url });
    if (ok) onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Compartir tracking">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-nodo-sub font-medium">
          Envía al cliente el link para que siga su pedido en tiempo real.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {/* WhatsApp */}
          <button
            onClick={openWhatsApp}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-nodo-inset border border-nodo-line active:scale-95 transition-transform"
          >
            <span className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center">
              <MessageCircle size={22} className="text-white" />
            </span>
            <span className="text-[11px] font-bold text-nodo-ink">WhatsApp</span>
          </button>

          {/* Copiar link */}
          <button
            onClick={copyLink}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-nodo-inset border border-nodo-line active:scale-95 transition-transform"
          >
            <span className="w-12 h-12 rounded-full bg-nodo-raised flex items-center justify-center">
              {copied
                ? <Check size={22} className="text-nodo-success-tx" />
                : <Link2 size={22} className="text-nodo-ink" />}
            </span>
            <span className="text-[11px] font-bold text-nodo-ink">
              {copied ? 'Copiado' : 'Copiar link'}
            </span>
          </button>

          {/* Compartir nativo — solo en contextos seguros (HTTPS) */}
          {canNativeShare() && (
            <button
              onClick={doNativeShare}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-nodo-inset border border-nodo-line active:scale-95 transition-transform"
            >
              <span className="w-12 h-12 rounded-full bg-nodo-raised flex items-center justify-center">
                <Share2 size={22} className="text-nodo-ink" />
              </span>
              <span className="text-[11px] font-bold text-nodo-ink">Más…</span>
            </button>
          )}
        </div>

        {/* Preview del link */}
        <div className="bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
          <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Link de tracking</p>
          <p className="text-xs font-semibold text-nodo-sub break-all">{url}</p>
        </div>
      </div>
    </BottomSheet>
  );
}
