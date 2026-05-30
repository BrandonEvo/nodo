import api from '@/lib/api';

export type CotizacionStatus =
  | 'pendiente'
  | 'comprado'
  | 'en_transito'
  | 'entregado'
  | 'pagado'
  | 'cancelado';

export const STATUS_LABEL: Record<CotizacionStatus, string> = {
  pendiente:   'Pendiente',
  comprado:    'Comprado',
  en_transito: 'En tránsito',
  entregado:   'Entregado',
  pagado:      'Pagado',
  cancelado:   'Cancelado',
};

export const NEXT_STATUS: Partial<Record<CotizacionStatus, CotizacionStatus>> = {
  pendiente:   'comprado',
  comprado:    'en_transito',
  en_transito: 'entregado',
  entregado:   'pagado',
};

export interface PublicCotizacion {
  product_name: string;
  status: CotizacionStatus;
  tracking_number: string | null;
  estimated_delivery: string | null;
  created_at: string;
  comprado_at: string | null;
  en_transito_at: string | null;
  entregado_at: string | null;
}

export interface Cotizacion {
  id: string;
  share_token: string;
  tenant_id: string;
  product_name: string;
  amazon_asin: string | null;
  inputs_snapshot: Record<string, unknown>;
  config_snapshot: Record<string, unknown>;
  result_snapshot: Record<string, unknown>;
  status: CotizacionStatus;
  expires_at: string;
  tracking_number: string | null;
  estimated_delivery: string | null;
  notes: string | null;
  comprado_at: string | null;
  en_transito_at: string | null;
  entregado_at: string | null;
  pagado_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CotizacionCreate {
  product_name: string;
  amazon_asin?: string | null;
  inputs_snapshot: Record<string, unknown>;
  config_snapshot: Record<string, unknown>;
  result_snapshot: Record<string, unknown>;
}

export interface LogisticsUpdate {
  tracking_number?: string | null;
  estimated_delivery?: string | null;
  notes?: string | null;
}

export interface RenovarPayload {
  inputs_snapshot: Record<string, unknown>;
  config_snapshot: Record<string, unknown>;
  result_snapshot: Record<string, unknown>;
}

export const importacionesService = {
  list: (status?: CotizacionStatus) =>
    api.get<Cotizacion[]>('/api/importaciones/cotizaciones', {
      params: status ? { status } : undefined,
    }),

  create: (data: CotizacionCreate) =>
    api.post<Cotizacion>('/api/importaciones/cotizaciones', data),

  advanceStatus: (id: string, status: CotizacionStatus) =>
    api.patch<Cotizacion>(`/api/importaciones/cotizaciones/${id}/status`, { status }),

  updateLogistics: (id: string, data: LogisticsUpdate) =>
    api.patch<Cotizacion>(`/api/importaciones/cotizaciones/${id}/logistics`, data),

  recalcular: (id: string, payload: RenovarPayload) =>
    api.patch<Cotizacion>(`/api/importaciones/cotizaciones/${id}/recalcular`, payload),

  renovar: (id: string, payload: RenovarPayload) =>
    api.post<Cotizacion>(`/api/importaciones/cotizaciones/${id}/renovar`, payload),

  getPublicTracking: (shareToken: string) =>
    api.get<PublicCotizacion>(`/api/importaciones/public/${shareToken}`),
};
