import api from '@/lib/api';

export type OrderStatus =
  | 'pendiente' | 'cotizado' | 'aprobado'
  | 'en_proceso' | 'entregado' | 'cancelado';

export type TrackingStatus =
  | 'comprado'
  | 'en_camino'
  | 'en_guatemala'
  | 'listo_entrega'
  | 'entregado';

export const TRACKING_STEPS: {
  key: TrackingStatus;
  label: string;
  sublabel: string;
  emoji: string;
}[] = [
  { key: 'comprado',      label: 'Comprado en USA',      sublabel: 'La compra fue realizada',           emoji: '🛍️' },
  { key: 'en_camino',     label: 'En camino a Guatemala', sublabel: 'En tránsito internacional',          emoji: '✈️' },
  { key: 'en_guatemala',  label: 'En Guatemala',          sublabel: 'El paquete llegó al país',           emoji: '🇬🇹' },
  { key: 'listo_entrega', label: 'Listo para entrega',    sublabel: 'Disponible para el cliente',         emoji: '📦' },
  { key: 'entregado',     label: 'Entregado',             sublabel: 'El cliente recibió su pedido',       emoji: '✅' },
];

export interface CalcSnapshot {
  product_price_usd: number;
  tax_usd: number;
  shipping_usd: number;
  total_cost_usd: number;
  total_cost_gtq: number;
  profit_gtq: number;
  margin_pct: number;
  exchange_rate: number;
  tax_rate: number;
  weight_lbs: number;
  cost_per_lb: number;
}

export interface ShopperOrder {
  id: string;
  tenant_id: string;
  client_name: string;
  client_phone: string | null;
  product_description: string;
  quantity: number;
  unit: string;
  delivery_date: string | null;
  status: OrderStatus;
  quoted_price: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  calc_product_price_usd: number | null;
  calc_tax_usd: number | null;
  calc_shipping_usd: number | null;
  calc_total_cost_usd: number | null;
  calc_total_cost_gtq: number | null;
  calc_profit_gtq: number | null;
  calc_margin_pct: number | null;
  calc_exchange_rate: number | null;
  calc_tax_rate: number | null;
  calc_weight_lbs: number | null;
  calc_cost_per_lb: number | null;
  tracking_token: string | null;
  tracking_status: TrackingStatus | null;
  tracking_note: string | null;
  tracking_updated_at: string | null;
}

export interface PublicTrackingData {
  client_name: string;
  product_description: string;
  quantity: number;
  unit: string;
  delivery_date: string | null;
  status: OrderStatus;
  tracking_status: TrackingStatus | null;
  tracking_note: string | null;
  tracking_updated_at: string | null;
}

export interface ShopperOrderCreate {
  client_name: string;
  client_phone?: string | null;
  product_description: string;
  quantity?: number;
  unit?: string;
  delivery_date?: string | null;
  status?: OrderStatus;
  quoted_price?: number | null;
  notes?: string | null;
  calc?: CalcSnapshot | null;
}

export type ShopperOrderUpdate = Partial<Omit<ShopperOrderCreate, 'calc'>> & {
  tracking_status?: TrackingStatus | null;
  tracking_note?: string | null;
};

const BASE = '/api/personal-shopper';

export const personalShopperService = {
  list: async (status?: OrderStatus): Promise<ShopperOrder[]> => {
    const params = status ? { status } : {};
    const { data } = await api.get(`${BASE}/`, { params });
    return data;
  },

  create: async (body: ShopperOrderCreate): Promise<ShopperOrder> => {
    const { data } = await api.post(`${BASE}/`, body);
    return data;
  },

  update: async (id: string, body: ShopperOrderUpdate): Promise<ShopperOrder> => {
    const { data } = await api.patch(`${BASE}/${id}`, body);
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },

  getPublicTracking: async (token: string): Promise<PublicTrackingData> => {
    const { data } = await api.get(`/api/tracking/${token}`);
    return data;
  },
};
