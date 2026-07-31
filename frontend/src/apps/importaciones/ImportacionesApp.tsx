import { useState } from 'react';
import { Calculator, ClipboardList, Globe, Users, Plus } from 'lucide-react';
import type { AppProps } from '../index';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CalculadoraTab } from './CalculadoraTab';
import { CotizacionesTab } from './CotizacionesTab';
import { CatalogoTab } from './CatalogoTab';
import { ClientesTab } from './ClientesTab';
import { ImportTabBar } from './ImportTabBar';
import type { Cliente } from '@/services/import_clientes.service';

type Tab = 'cotizar' | 'catalog' | 'clients';
type CotizarView = 'nueva' | 'guardadas';

const TABS = [
  { value: 'cotizar', label: 'Cotizar',  icon: <Calculator size={14} /> },
  { value: 'catalog', label: 'Catálogo', icon: <Globe size={14} /> },
  { value: 'clients', label: 'Clientes', icon: <Users size={14} /> },
];

const COTIZAR_VIEWS = [
  { value: 'nueva',     label: 'Nueva',     icon: <Plus size={13} /> },
  { value: 'guardadas', label: 'Guardadas', icon: <ClipboardList size={13} /> },
];

/**
 * Shell del módulo Importaciones — conclusión del panel UX: 3 destinos en vez
 * de 4 (Cotizaciones no es un módulo aparte, es el historial de la Calculadora
 * → SegmentedControl interno Nueva/Guardadas). Header de una sola fila para
 * ganar viewport: sin subtítulo apilado, tabs inline en desktop.
 */
export function ImportacionesApp(_props: AppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('cotizar');
  const [cotizarView, setCotizarView] = useState<CotizarView>('nueva');
  const [preselectedCliente, setPreselectedCliente] = useState<Cliente | null>(null);

  return (
    <>
      <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto">

        {/* ─── Controles de vista: el título ya vive en la AppBar ─── */}
        <div className="flex items-center gap-3 min-h-[44px]">
          {/* Sub-vista de Cotizar */}
          {activeTab === 'cotizar' && (
            <SegmentedControl
              options={COTIZAR_VIEWS}
              value={cotizarView}
              onChange={v => setCotizarView(v as CotizarView)}
              size="sm"
              className="shrink-0"
            />
          )}
          {/* Tabs desktop (móvil usa la pill flotante) */}
          <div className="hidden lg:block">
            <SegmentedControl
              options={TABS}
              value={activeTab}
              onChange={v => setActiveTab(v as Tab)}
              size="sm"
              className="w-[330px] shrink-0"
            />
          </div>
        </div>

        {/* ─── Contenido ─── */}
        {activeTab === 'cotizar' && cotizarView === 'nueva' && (
          <CalculadoraTab
            preselectedCliente={preselectedCliente}
            onSaved={() => { setPreselectedCliente(null); setCotizarView('guardadas'); }}
          />
        )}
        {activeTab === 'cotizar' && cotizarView === 'guardadas' && (
          <CotizacionesTab onNew={() => setCotizarView('nueva')} />
        )}
        {activeTab === 'catalog' && <CatalogoTab />}
        {activeTab === 'clients' && (
          <ClientesTab
            onNewCotizacion={(cliente) => {
              setPreselectedCliente(cliente);
              setActiveTab('cotizar');
              setCotizarView('nueva');
            }}
          />
        )}
      </div>

      {/* Navegación móvil al alcance del pulgar */}
      <ImportTabBar tabs={TABS} value={activeTab} onChange={v => setActiveTab(v as Tab)} />
    </>
  );
}
