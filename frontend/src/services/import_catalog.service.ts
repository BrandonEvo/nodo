// Catálogo público de Importaciones — espejo de shopper_catalog.service.ts,
// apuntando a /api/import-catalog.
import api from '@/lib/api';

// Último catálogo visitado en este navegador. La página /mi-pedido lo usa como
// respaldo para acotar la consulta al negocio correcto cuando el cliente llega
// sin el parámetro `?c=` en la URL (bookmark, link pegado a mano).
export const LAST_CATALOG_KEY = 'nodo_import_last_catalog';

// Máquina de estados de la reserva (ver models/import_catalog.py).
export type ReservationStatus =
  | 'pendiente' | 'confirmada' | 'comprada' | 'en_camino' | 'entregada'
  | 'no_disponible' | 'cancelada';

export interface PayInfo {
  bank_name?: string | null;
  bank_account_holder?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;   // monetaria | ahorro
}

export interface ImportCatalogSettings {
  public_token: string;
  business_name?: string | null;
  whatsapp_number?: string | null;
  delivery_days_min: number;
  delivery_days_max: number;
  trip_name?: string | null;
  trip_close_at?: string | null;
  trip_label?: string | null;
  origin_label?: string | null;
  bank_name?: string | null;
  bank_account_holder?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  ai_copy_enabled: boolean;
}

export interface ImportCatalogItem {
  id: string;
  tenant_id: string;
  source: string;
  cotizacion_id?: string | null;
  title: string;
  hook?: string | null;
  description?: string | null;
  category?: string | null;
  price_gtq?: number | null;
  is_offer: boolean;
  compare_at_price_gtq?: number | null;
  offer_ends_at?: string | null;
  is_made_to_order: boolean;
  stock_total: number;
  stock_sold: number;
  stock_available: number;
  is_published: boolean;
  published_at?: string | null;
  last_reserved_at?: string | null;
  amazon_url?: string | null;
  amazon_asin?: string | null;
  image_url?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicImportCatalogItem {
  id: string;
  title: string;
  hook?: string | null;
  description?: string | null;
  category?: string | null;
  price_gtq?: number | null;
  is_offer: boolean;
  compare_at_price_gtq?: number | null;
  offer_ends_at?: string | null;
  // Por encargo: se compra cuando el cliente aparta, no hay inventario que agotar.
  // El catálogo no muestra escasez de unidades en estos ítems.
  is_made_to_order: boolean;
  // Tope de unidades que el cliente puede pedir (no es el inventario del negocio).
  stock_available: number;
  // Unidades ya apartadas de este ítem — demanda real, sin denominador inventado.
  reserved_count: number;
  image_url?: string | null;
  last_reserved_at?: string | null;
  // IDs de ítems que otros apartaron junto a éste (co-ocurrencia real, sin IA).
  // El front los resuelve contra `items` para priorizar "Te puede gustar".
  bought_with?: string[];
}

export interface PublicImportCatalog {
  business_name?: string | null;
  whatsapp_number?: string | null;
  logo_url?: string | null;
  theme_color?: string | null;
  delivery_days_min: number;
  delivery_days_max: number;
  trip_name?: string | null;
  trip_close_at?: string | null;
  trip_label?: string | null;
  origin_label?: string | null;
  categories: string[];
  // Momentum real del lote en vuelo (personas y unidades ya apartadas).
  reserved_people: number;
  reserved_units: number;
  pay_info?: PayInfo | null;
  items: PublicImportCatalogItem[];
}

export interface ImportReservation {
  id: string;
  tenant_id: string;
  catalog_item_id: string;
  order_token?: string | null;
  client_name: string;
  client_phone: string;
  client_token: string;
  quantity: number;
  status: ReservationStatus;
  deposit_amount?: number | null;
  payment_reference?: string | null;
  notes?: string | null;
  expires_at: string;
  confirmed_at?: string | null;
  comprada_at?: string | null;
  en_camino_at?: string | null;
  completed_at?: string | null;
  no_disponible_at?: string | null;
  cancelada_at?: string | null;
  resolution?: string | null;
  resolution_note?: string | null;
  suggested_item_id?: string | null;
  replaces_reservation_id?: string | null;
  client_notified_at?: string | null;
  resolved_by_substitute: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  item_title?: string | null;
  item_image_url?: string | null;
  item_price_gtq?: number | null;
  // Link de compra en Amazon del ítem — sólo visible para el dueño en su bandeja
  // de reservas, para comprar la referencia exacta al confirmar.
  item_amazon_url?: string | null;
}

export interface PublicImportReservation {
  id: string;
  client_token: string;
  order_token?: string | null;
  order_pin?: string | null;
  client_name: string;
  quantity: number;
  status: ReservationStatus;
  deposit_amount?: number | null;
  expires_at: string;
  item_title: string;
  item_price_gtq?: number | null;
  whatsapp_number?: string | null;
  created_at: string;
}

export interface PublicImportOrderLine {
  id: string;
  item_id: string;
  item_title: string;
  item_image_url?: string | null;
  item_price_gtq?: number | null;
  quantity: number;
  status: ReservationStatus;
  editable: boolean;
  stock_available: number;
  expires_at: string;
  created_at: string;
  resolution?: string | null;
  resolution_note?: string | null;
  suggested_items: PublicImportCatalogItem[];
  resolved_by_substitute: boolean;
}

export interface PublicImportOrder {
  order_token: string;
  order_pin?: string | null;
  catalog_token?: string | null;
  client_name: string;
  business_name?: string | null;
  whatsapp_number?: string | null;
  logo_url?: string | null;
  theme_color?: string | null;
  trip_name?: string | null;
  trip_close_at?: string | null;
  trip_label?: string | null;
  origin_label?: string | null;
  delivery_days_min: number;
  delivery_days_max: number;
  pay_info?: PayInfo | null;
  lines: PublicImportOrderLine[];
  total_gtq: number;
  total_items: number;
}

export const importCatalogService = {
  getSettings: (): Promise<ImportCatalogSettings> =>
    api.get('/api/import-catalog/settings').then(r => r.data),

  updateSettings: (data: {
    business_name?: string | null;
    whatsapp_number?: string | null;
    delivery_days_min?: number;
    delivery_days_max?: number;
    trip_name?: string | null;
    trip_close_at?: string | null;
    trip_label?: string | null;
    origin_label?: string | null;
    bank_name?: string | null;
    bank_account_holder?: string | null;
    bank_account_number?: string | null;
    bank_account_type?: string | null;
    ai_copy_enabled?: boolean;
  }): Promise<ImportCatalogSettings> =>
    api.patch('/api/import-catalog/settings', data).then(r => r.data),

  list: (): Promise<ImportCatalogItem[]> =>
    api.get('/api/import-catalog/').then(r => r.data),

  create: (data: {
    title: string;
    hook?: string | null;
    description?: string | null;
    category?: string | null;
    price_gtq?: number | null;
    is_offer?: boolean;
    compare_at_price_gtq?: number | null;
    offer_ends_at?: string | null;
    is_made_to_order?: boolean;
    stock_total?: number;
    is_published: boolean;
    amazon_url?: string | null;
    amazon_asin?: string | null;
    image_url?: string | null;
    notes?: string | null;
    source?: string;
  }): Promise<ImportCatalogItem> =>
    api.post('/api/import-catalog/', data).then(r => r.data),

  publishFromCotizacion: (cotizacionId: string): Promise<ImportCatalogItem> =>
    api.post(`/api/import-catalog/from-cotizacion/${cotizacionId}`).then(r => r.data),

  // IA Fase 2 (opt-in por tenant): genera gancho + descripción para un producto.
  generateCopy: (data: { title: string; category?: string | null; notes?: string | null }): Promise<{ hook: string; description: string }> =>
    api.post('/api/import-catalog/ai/generate-copy', data).then(r => r.data),

  update: (id: string, data: Partial<Pick<ImportCatalogItem,
    'title' | 'hook' | 'description' | 'category' | 'price_gtq' | 'is_offer'
    | 'compare_at_price_gtq' | 'offer_ends_at' | 'is_made_to_order'
    | 'stock_total' | 'stock_sold' | 'is_published' | 'amazon_url' | 'amazon_asin' | 'notes'
  >>): Promise<ImportCatalogItem> =>
    api.patch(`/api/import-catalog/${id}`, data).then(r => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/api/import-catalog/${id}`).then(() => undefined),

  getPublic: (token: string): Promise<PublicImportCatalog> =>
    api.get(`/api/import-catalog/public/${token}`).then(r => r.data),

  // ── Reservas (vendor) ──────────────────────────────────────────────────────

  listReservations: (): Promise<ImportReservation[]> =>
    api.get('/api/import-catalog/reservations').then(r => r.data),

  updateReservation: (
    id: string,
    data: {
      status?: ReservationStatus;
      payment_reference?: string | null;
      notes?: string | null;
      resolution?: string | null;
      resolution_note?: string | null;
      suggested_item_id?: string | null;
    },
  ): Promise<ImportReservation> =>
    api.patch(`/api/import-catalog/reservations/${id}`, data).then(r => r.data),

  // Alternativas parecidas para el picker de «no disponible».
  reservationSuggestions: (id: string): Promise<ImportCatalogItem[]> =>
    api.get(`/api/import-catalog/reservations/${id}/suggestions`).then(r => r.data),

  markReservationNotified: (id: string): Promise<ImportReservation> =>
    api.post(`/api/import-catalog/reservations/${id}/mark-notified`).then(r => r.data),

  // ── Reservas (público) ─────────────────────────────────────────────────────

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
    src?: string | null,
  ): Promise<PublicImportReservation> =>
    api.post(`/api/import-catalog/public/${publicToken}/reserve/${itemId}`, data, {
      params: src ? { src } : undefined,
    }).then(r => r.data),

  getClientReservation: (clientToken: string): Promise<PublicImportReservation> =>
    api.get(`/api/import-catalog/public/reservation/${clientToken}`).then(r => r.data),

  getClientOrder: (orderToken: string): Promise<PublicImportOrder> =>
    api.get(`/api/import-catalog/public/order/${orderToken}`).then(r => r.data),

  // Recupera el pedido acumulado con WhatsApp + PIN (sin el link directo).
  // `catalogToken` acota la búsqueda al negocio dueño del catálogo: sin él, un
  // (teléfono, PIN) que coincidiera en dos negocios podría devolver el pedido del otro.
  lookupOrder: (phone: string, pin: string, catalogToken: string): Promise<PublicImportOrder> =>
    api.post('/api/import-catalog/public/order/lookup',
      { phone, pin, catalog_token: catalogToken }).then(r => r.data),

  // El cliente ajusta o quita una línea de su pedido mientras siga pendiente.
  updateOrderLine: (orderToken: string, reservationId: string, quantity: number): Promise<PublicImportOrder> =>
    api.patch(`/api/import-catalog/public/order/${orderToken}/line/${reservationId}`, { quantity }).then(r => r.data),

  removeOrderLine: (orderToken: string, reservationId: string): Promise<PublicImportOrder> =>
    api.delete(`/api/import-catalog/public/order/${orderToken}/line/${reservationId}`).then(r => r.data),

  // El cliente acepta un reemplazo de una línea no_disponible.
  swapOrderLine: (orderToken: string, reservationId: string, newItemId: string): Promise<PublicImportOrder> =>
    api.post(`/api/import-catalog/public/order/${orderToken}/line/${reservationId}/swap/${newItemId}`).then(r => r.data),

  // El cliente quita de su vista una línea ya cerrada (no_disponible/cancelada).
  dismissOrderLine: (orderToken: string, reservationId: string): Promise<PublicImportOrder> =>
    api.post(`/api/import-catalog/public/order/${orderToken}/line/${reservationId}/dismiss`).then(r => r.data),
};
