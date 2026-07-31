import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Share2, X } from 'lucide-react';
import type { AppProps } from '../index';
import { useModuleChrome, ModuleActions } from '@/components/chrome/ModuleChrome';
import {
  citasService,
  type BookingAgenda, type BookingService, type BookingSettings,
} from '@/services/citas.service';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { copyToClipboard, canNativeShare, nativeShare } from '@/lib/utils';
import { AgendaPanel } from './AgendaPanel';
import { ServiciosPanel } from './ServiciosPanel';
import { HorariosPanel } from './HorariosPanel';
import { OfertasPanel } from './OfertasPanel';
import { todayISO } from './shared';

type View = 'agenda' | 'servicios' | 'horarios' | 'ofertas';

const VIEW_OPTS = [
  { value: 'agenda' as View, label: 'Agenda' },
  { value: 'servicios' as View, label: 'Servicios' },
  { value: 'horarios' as View, label: 'Horarios' },
  { value: 'ofertas' as View, label: 'Ofertas' },
];

export function CitasApp(_props: AppProps) {
  const [view, setView] = useState<View>('agenda');

  useModuleChrome('Citas', 'Agenda, servicios y reservas en línea');

  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [services, setServices] = useState<BookingService[]>([]);
  const [agendaDate, setAgendaDate] = useState(todayISO());
  const [agenda, setAgenda] = useState<BookingAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(t);
  }, [success]);

  const loadAgenda = useCallback(async (date: string) => {
    try {
      setAgenda(await citasService.getAgenda(date));
    } catch {
      // silencioso: el polling reintenta en el próximo tick
    }
  }, []);

  const loadServices = useCallback(async () => {
    try {
      setServices(await citasService.listServices());
    } catch {
      setError('Error al cargar los servicios');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, sv, a] = await Promise.all([
          citasService.getSettings(),
          citasService.listServices(),
          citasService.getAgenda(todayISO()),
        ]);
        setSettings(s);
        setServices(sv);
        setAgenda(a);
      } catch {
        setError('Error al cargar el módulo de citas');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // La agenda se refresca sola — las reservas del link público entran sin recargar
  useEffect(() => {
    const id = setInterval(() => loadAgenda(agendaDate), 15_000);
    return () => clearInterval(id);
  }, [loadAgenda, agendaDate]);

  const handleChangeDate = async (date: string) => {
    setAgendaDate(date);
    await loadAgenda(date);
  };

  const handleShareAgenda = async () => {
    if (!settings) return;
    const url = `${window.location.origin}/agenda/${settings.public_token}`;
    if (canNativeShare()) {
      const ok = await nativeShare({ title: 'Reserva tu cita', text: 'Agenda en línea aquí:', url });
      if (ok) return;
    }
    const copied = await copyToClipboard(url);
    if (copied) setSuccess('Link de la agenda copiado');
    else setError('No se pudo copiar el link');
  };

  const handleUpdateSettings = async (body: Parameters<typeof citasService.updateSettings>[0]) => {
    try {
      setSettings(await citasService.updateSettings(body));
      setSuccess('Configuración guardada');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo actualizar la configuración');
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

      <ModuleActions>
        <button
          onClick={handleShareAgenda}
          disabled={!settings}
          className="nodo-appbar-action"
          aria-label="Compartir agenda"
        >
          <Share2 size={16} />
        </button>
      </ModuleActions>

      <div className="flex flex-col gap-6 max-w-4xl mx-auto">
        <SegmentedControl options={VIEW_OPTS} value={view} onChange={v => setView(v)} />

        {loading ? (
          <div className="nodo-spinner-container">
            <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-nodo-ink" />
          </div>
        ) : view === 'agenda' ? (
          <AgendaPanel
            agenda={agenda}
            date={agendaDate}
            settings={settings}
            services={services}
            onChangeDate={handleChangeDate}
            onReload={() => loadAgenda(agendaDate)}
            onError={setError}
            onSuccess={setSuccess}
          />
        ) : view === 'servicios' ? (
          <ServiciosPanel
            services={services}
            onReload={loadServices}
            onError={setError}
            onSuccess={setSuccess}
          />
        ) : view === 'ofertas' ? (
          <OfertasPanel
            services={services}
            onError={setError}
            onSuccess={setSuccess}
          />
        ) : (
          <HorariosPanel
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onError={setError}
            onSuccess={setSuccess}
          />
        )}
      </div>
    </>
  );
}
