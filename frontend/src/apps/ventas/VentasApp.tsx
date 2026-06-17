import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Share2, X, Zap } from 'lucide-react';
import type { AppProps } from '../index';
import {
  ventasService,
  type StoreMonitor, type StoreProduct, type StoreSettings,
} from '@/services/ventas.service';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { copyToClipboard, canNativeShare, nativeShare } from '@/lib/utils';
import { MonitorPedidos, type OrderAction } from './MonitorPedidos';
import { ProductosPanel } from './ProductosPanel';
import { PromocionesPanel } from './PromocionesPanel';
import { ClientesPanel } from './ClientesPanel';
import { VentaRapidaSheet } from './VentaRapidaSheet';

type View = 'pedidos' | 'productos' | 'ofertas' | 'clientes';

const VIEW_OPTS = [
  { value: 'pedidos' as View, label: 'Pedidos' },
  { value: 'productos' as View, label: 'Productos' },
  { value: 'ofertas' as View, label: 'Ofertas' },
  { value: 'clientes' as View, label: 'Clientes' },
];

export function VentasApp(_props: AppProps) {
  const [view, setView] = useState<View>('pedidos');
  const [monitor, setMonitor] = useState<StoreMonitor | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showQuickSale, setShowQuickSale] = useState(false);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(t);
  }, [success]);

  const loadMonitor = useCallback(async () => {
    try {
      setMonitor(await ventasService.getMonitor());
    } catch {
      // silencioso: el polling reintenta en el próximo tick
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await ventasService.listProducts());
    } catch {
      setError('Error al cargar productos');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [m, p, s] = await Promise.all([
          ventasService.getMonitor(),
          ventasService.listProducts(),
          ventasService.getSettings(),
        ]);
        setMonitor(m);
        setProducts(p);
        setSettings(s);
      } catch {
        setError('Error al cargar el módulo de ventas');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // El monitor se refresca solo — los pedidos del catálogo entran sin recargar
  useEffect(() => {
    const id = setInterval(loadMonitor, 10_000);
    return () => clearInterval(id);
  }, [loadMonitor]);

  const handleOrderAction = async (orderId: string, action: OrderAction) => {
    try {
      if (action === 'confirm') await ventasService.confirmOrder(orderId);
      else if (action === 'reject') await ventasService.rejectOrder(orderId);
      else if (action === 'deliver') await ventasService.deliverOrder(orderId);
      else if (action === 'charge') await ventasService.chargeOrder(orderId);
      else if (action === 'cancel') await ventasService.cancelOrder(orderId);
      await Promise.all([loadMonitor(), loadProducts()]);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo actualizar el pedido');
      await loadMonitor();
    }
  };

  const handleShareStore = async () => {
    if (!settings) return;
    const url = `${window.location.origin}/tienda/${settings.public_token}`;
    if (canNativeShare()) {
      const ok = await nativeShare({ title: 'Nuestra tienda', text: 'Haz tu pedido aquí:', url });
      if (ok) return;
    }
    const copied = await copyToClipboard(url);
    if (copied) setSuccess('Link de la tienda copiado');
    else setError('No se pudo copiar el link');
  };

  const handleUpdateSettings = async (body: Partial<Pick<StoreSettings, 'is_open' | 'reservation_ttl_minutes'>>) => {
    try {
      setSettings(await ventasService.updateSettings(body));
    } catch {
      setError('No se pudo actualizar la configuración');
    }
  };

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <Check size={16} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex flex-col gap-6 pb-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="nodo-module-title">Ventas</h1>
            <p className="nodo-module-subtitle">Catálogo, pedidos y entregas</p>
          </div>
          <button
            onClick={handleShareStore}
            disabled={!settings}
            className="nodo-btn-secondary shrink-0 flex items-center gap-2 disabled:opacity-30"
          >
            <Share2 size={15} />
            <span className="hidden sm:inline">Compartir tienda</span>
          </button>
        </div>

        <SegmentedControl options={VIEW_OPTS} value={view} onChange={v => setView(v)} />

        {loading ? (
          <div className="nodo-spinner-container">
            <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-nodo-ink" />
          </div>
        ) : view === 'pedidos' ? (
          <>
            {monitor && (
              <MonitorPedidos
                monitor={monitor}
                onAction={handleOrderAction}
                onGoToProducts={() => setView('productos')}
              />
            )}
            <button
              onClick={() => setShowQuickSale(true)}
              className="nodo-btn-primary"
            >
              <Zap size={20} />
              VENTA RÁPIDA
            </button>
          </>
        ) : view === 'productos' ? (
          <ProductosPanel
            products={products}
            settings={settings}
            onReload={loadProducts}
            onUpdateSettings={handleUpdateSettings}
            onError={setError}
            onSuccess={setSuccess}
          />
        ) : view === 'ofertas' ? (
          <PromocionesPanel
            products={products}
            onError={setError}
            onSuccess={setSuccess}
          />
        ) : (
          <ClientesPanel onError={setError} />
        )}
      </div>

      <VentaRapidaSheet
        open={showQuickSale}
        onClose={() => setShowQuickSale(false)}
        products={products}
        onDone={async (msg) => {
          setShowQuickSale(false);
          setSuccess(msg);
          await Promise.all([loadMonitor(), loadProducts()]);
        }}
        onError={setError}
      />
    </>
  );
}
