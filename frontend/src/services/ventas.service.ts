import api from '@/lib/api';

export type StoreOrderStatus =
  | 'solicitado' | 'apartado' | 'entregado'
  | 'rechazado' | 'expirado' | 'cancelado';

export type WasteReason = 'se_arruino' | 'perdida' | 'correccion';

export interface StoreSettings {
  public_token: string;
  is_open: boolean;
  reservation_ttl_minutes: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  compare_at_price: number | null;
  badge: string | null;
  image_url: string | null;
  stock_qty: number;
  reserved_qty: number;
  available: number;
  is_published: boolean;
}

export interface StoreProductCreate {
  name: string;
  description?: string | null;
  price: number;
  cost?: number;
  compare_at_price?: number | null;
  badge?: string | null;
  image_url?: string | null;
  stock_qty?: number;
  is_published?: boolean;
}

export type StoreProductUpdate = Partial<StoreProductCreate>;

export type PromoType = 'percent' | 'two_for_one' | 'compare_at' | 'bundle' | 'badge';

export interface StorePromotion {
  id: string;
  title: string;
  promo_type: PromoType;
  value: number | null;
  product_id: string | null;
  product_name: string | null;
  description: string | null;
  urgency_text: string | null;
  starts_on: string | null;
  ends_on: string | null;
  is_published: boolean;
  is_live: boolean;
}

export interface StorePromotionCreate {
  title: string;
  promo_type: PromoType;
  value?: number | null;
  product_id?: string | null;
  description?: string | null;
  urgency_text?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  is_published?: boolean;
}

export type StorePromotionUpdate = Partial<StorePromotionCreate>;

export interface StoreOrderItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
}

export interface StoreOrder {
  id: string;
  short_code: string;
  public_token: string;
  customer_name: string | null;
  customer_phone: string | null;
  channel: 'catalogo' | 'mostrador';
  status: StoreOrderStatus;
  expires_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  total: number;
  created_at: string;
  items: StoreOrderItem[];
}

export interface StoreKpis {
  nuevos: number;
  por_entregar: number;
  por_cobrar: number;
  cobrado_hoy: number;
  ganancia_hoy: number;
  invertido: number;
  stock_critico: number;
}

export interface StoreClient {
  customer_phone: string;
  customer_name: string;
  orders_count: number;
  total_paid: number;
  last_order_at: string;
}

export interface StoreMonitor {
  orders: StoreOrder[];
  kpis: StoreKpis;
}

export interface QuickSaleItem {
  product_id: string;
  qty: number;
  unit_price?: number | null;
}

// ── Tipos de los endpoints públicos (sin auth) ──────────────────────────────

export interface PublicCatalogProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  badge: string | null;
  available: number;
  image_url: string | null;
}

export interface PublicPromotion {
  title: string;
  promo_type: PromoType;
  value: number | null;
  product_id: string | null;
  description: string | null;
  urgency_text: string | null;
  ends_on: string | null;
}

export interface PublicCatalog {
  business_name: string | null;
  business_logo_url: string | null;
  business_color: string | null;
  is_open: boolean;
  products: PublicCatalogProduct[];
  promotions: PublicPromotion[];
}

export interface PublicOrderCreated {
  order_token: string;
  short_code: string;
  expires_at: string | null;
}

export interface PublicOrderItem {
  product_name: string;
  qty: number;
  unit_price: number;
}

export interface PublicOrder {
  short_code: string;
  status: StoreOrderStatus;
  expires_at: string | null;
  delivered_at: string | null;
  paid: boolean;
  total: number;
  items: PublicOrderItem[];
  business_name: string | null;
  business_logo_url: string | null;
  business_color: string | null;
}

const BASE = '/api/ventas';
const PUBLIC_BASE = '/api/store';

export const ventasService = {
  getSettings: async (): Promise<StoreSettings> => {
    const { data } = await api.get(`${BASE}/settings`);
    return data;
  },

  updateSettings: async (body: Partial<Pick<StoreSettings, 'is_open' | 'reservation_ttl_minutes'>>): Promise<StoreSettings> => {
    const { data } = await api.patch(`${BASE}/settings`, body);
    return data;
  },

  listProducts: async (): Promise<StoreProduct[]> => {
    const { data } = await api.get(`${BASE}/products`);
    return data;
  },

  createProduct: async (body: StoreProductCreate): Promise<StoreProduct> => {
    const { data } = await api.post(`${BASE}/products`, body);
    return data;
  },

  updateProduct: async (id: string, body: StoreProductUpdate): Promise<StoreProduct> => {
    const { data } = await api.patch(`${BASE}/products/${id}`, body);
    return data;
  },

  deleteProduct: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/products/${id}`);
  },

  getMonitor: async (): Promise<StoreMonitor> => {
    const { data } = await api.get(`${BASE}/monitor`);
    return data;
  },

  listClients: async (): Promise<StoreClient[]> => {
    const { data } = await api.get(`${BASE}/clients`);
    return data;
  },

  listOrders: async (customerPhone?: string, limit = 50): Promise<StoreOrder[]> => {
    const params: Record<string, string | number> = { limit };
    if (customerPhone) params.customer_phone = customerPhone;
    const { data } = await api.get(`${BASE}/orders`, { params });
    return data;
  },

  confirmOrder: async (id: string): Promise<StoreOrder> => {
    const { data } = await api.post(`${BASE}/orders/${id}/confirm`);
    return data;
  },

  rejectOrder: async (id: string): Promise<StoreOrder> => {
    const { data } = await api.post(`${BASE}/orders/${id}/reject`);
    return data;
  },

  deliverOrder: async (id: string): Promise<StoreOrder> => {
    const { data } = await api.post(`${BASE}/orders/${id}/deliver`);
    return data;
  },

  chargeOrder: async (id: string): Promise<StoreOrder> => {
    const { data } = await api.post(`${BASE}/orders/${id}/charge`);
    return data;
  },

  cancelOrder: async (id: string): Promise<StoreOrder> => {
    const { data } = await api.post(`${BASE}/orders/${id}/cancel`);
    return data;
  },

  quickSale: async (items: QuickSaleItem[], paymentMethod = 'efectivo'): Promise<StoreOrder> => {
    const { data } = await api.post(`${BASE}/quick-sale`, { items, payment_method: paymentMethod });
    return data;
  },

  registerWaste: async (items: { product_id: string; qty: number }[], reason: WasteReason, note?: string): Promise<StoreProduct[]> => {
    const { data } = await api.post(`${BASE}/waste`, { items, reason, note });
    return data;
  },

  // ── Promociones / ganchos de venta ──

  listPromotions: async (): Promise<StorePromotion[]> => {
    const { data } = await api.get(`${BASE}/promotions`);
    return data;
  },

  createPromotion: async (body: StorePromotionCreate): Promise<StorePromotion> => {
    const { data } = await api.post(`${BASE}/promotions`, body);
    return data;
  },

  updatePromotion: async (id: string, body: StorePromotionUpdate): Promise<StorePromotion> => {
    const { data } = await api.patch(`${BASE}/promotions/${id}`, body);
    return data;
  },

  deletePromotion: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/promotions/${id}`);
  },

  // ── Públicos (sin autenticación) ──

  getPublicCatalog: async (token: string): Promise<PublicCatalog> => {
    const { data } = await api.get(`${PUBLIC_BASE}/catalog/${token}`);
    return data;
  },

  createPublicOrder: async (
    token: string,
    body: { customer_name: string; customer_phone: string; items: { product_id: string; qty: number }[] },
  ): Promise<PublicOrderCreated> => {
    const { data } = await api.post(`${PUBLIC_BASE}/catalog/${token}/orders`, body);
    return data;
  },

  getPublicOrder: async (orderToken: string): Promise<PublicOrder> => {
    const { data } = await api.get(`${PUBLIC_BASE}/orders/${orderToken}`);
    return data;
  },

  payPublicOrder: async (orderToken: string): Promise<PublicOrder> => {
    const { data } = await api.post(`${PUBLIC_BASE}/orders/${orderToken}/pay`);
    return data;
  },
};
