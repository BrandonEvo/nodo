import api from '@/lib/api';

export interface ShopperCatalogSettings {
  public_token: string;
  business_name?: string | null;
  whatsapp_number?: string | null;
}

export interface ShopperCatalogItem {
  id: string;
  tenant_id: string;
  source: string;
  trip_item_id?: string | null;
  title: string;
  description?: string | null;
  price_gtq?: number | null;
  stock_total: number;
  stock_sold: number;
  stock_available: number;
  is_published: boolean;
  published_at?: string | null;
  amazon_url?: string | null;
  image_url?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicCatalogItem {
  id: string;
  title: string;
  description?: string | null;
  price_gtq?: number | null;
  stock_available: number;
  stock_total: number;
  amazon_url?: string | null;
  image_url?: string | null;
}

export interface PublicCatalog {
  business_name?: string | null;
  whatsapp_number?: string | null;
  items: PublicCatalogItem[];
}

export interface ShopperReservation {
  id: string;
  tenant_id: string;
  catalog_item_id: string;
  client_name: string;
  client_phone: string;
  client_token: string;
  quantity: number;
  status: 'pendiente' | 'confirmada' | 'completada' | 'cancelada';
  deposit_amount?: number | null;
  payment_reference?: string | null;
  notes?: string | null;
  expires_at: string;
  confirmed_at?: string | null;
  completed_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  item_title?: string | null;
  item_price_gtq?: number | null;
}

export interface PublicReservation {
  id: string;
  client_token: string;
  client_name: string;
  quantity: number;
  status: 'pendiente' | 'confirmada' | 'completada' | 'cancelada';
  deposit_amount?: number | null;
  expires_at: string;
  item_title: string;
  item_price_gtq?: number | null;
  whatsapp_number?: string | null;
  created_at: string;
}

export const shopperCatalogService = {
  getSettings: (): Promise<ShopperCatalogSettings> =>
    api.get('/api/shopper-catalog/settings').then(r => r.data),

  updateSettings: (data: { business_name?: string | null; whatsapp_number?: string | null }): Promise<ShopperCatalogSettings> =>
    api.patch('/api/shopper-catalog/settings', data).then(r => r.data),

  list: (): Promise<ShopperCatalogItem[]> =>
    api.get('/api/shopper-catalog/').then(r => r.data),

  create: (data: {
    title: string;
    description?: string | null;
    price_gtq?: number | null;
    stock_total: number;
    is_published: boolean;
    amazon_url?: string | null;
    image_url?: string | null;
    notes?: string | null;
    source?: string;
  }): Promise<ShopperCatalogItem> =>
    api.post('/api/shopper-catalog/', data).then(r => r.data),

  publishFromTrip: (tripItemId: string): Promise<ShopperCatalogItem> =>
    api.post(`/api/shopper-catalog/from-trip/${tripItemId}`).then(r => r.data),

  update: (id: string, data: Partial<Pick<ShopperCatalogItem,
    'title' | 'description' | 'price_gtq' | 'stock_total' | 'stock_sold' | 'is_published' | 'amazon_url' | 'notes'
  >>): Promise<ShopperCatalogItem> =>
    api.patch(`/api/shopper-catalog/${id}`, data).then(r => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/api/shopper-catalog/${id}`).then(() => undefined),

  getPublic: (token: string): Promise<PublicCatalog> =>
    api.get(`/api/shopper-catalog/public/${token}`).then(r => r.data),

  // ── Reservas (vendor) ──────────────────────────────────────────────────────

  listReservations: (): Promise<ShopperReservation[]> =>
    api.get('/api/shopper-catalog/reservations').then(r => r.data),

  updateReservation: (
    id: string,
    data: { status?: string; payment_reference?: string | null; notes?: string | null },
  ): Promise<ShopperReservation> =>
    api.patch(`/api/shopper-catalog/reservations/${id}`, data).then(r => r.data),

  // ── Reservas (público) ────────────────────────────────────────────────────

  createReservation: (
    publicToken: string,
    itemId: string,
    data: {
      client_name: string;
      client_phone: string;
      quantity: number;
      deposit_amount?: number | null;
      notes?: string | null;
    },
  ): Promise<PublicReservation> =>
    api.post(`/api/shopper-catalog/public/${publicToken}/reserve/${itemId}`, data).then(r => r.data),

  getClientReservation: (clientToken: string): Promise<PublicReservation> =>
    api.get(`/api/shopper-catalog/public/reservation/${clientToken}`).then(r => r.data),
};
