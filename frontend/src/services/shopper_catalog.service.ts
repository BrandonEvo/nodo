import api, { publicApi } from '@/lib/api';
import type { CalcSnapshotPayload } from '@/apps/personal-shopper/shopperPricing';

// ── Estados de la reserva (máquina de estados relabelada al viajero) ───────────
export type ShopperResStatus =
  | 'pendiente' | 'confirmada' | 'comprada' | 'en_camino' | 'entregada'
  | 'no_disponible' | 'cancelada';

// ── Canal de publicación ──────────────────────────────────────────────────────
export type ShopperListing = 'live' | 'catalog';
export type ShopperStoreStatus = 'closed' | 'live';

// ── Settings del catálogo público ─────────────────────────────────────────────
export interface ShopperCatalogSettings {
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
  // Tienda en vivo (drop) — sólo dueño.
  store_status: ShopperStoreStatus;
  store_name?: string | null;
  store_opened_at?: string | null;
  store_closes_at?: string | null;
}

// ── Config PRIVADA de la calculadora ──────────────────────────────────────────
export interface ShopperCalcSettings {
  freight_mode: 'maleta' | 'caja';
  exchange_rate: number;
  tax_rate: number;
  default_markup_pct: number;
  suitcase_cost_usd?: number | null;
  suitcase_capacity_lbs?: number | null;
  box_cost_usd?: number | null;
  box_length_in?: number | null;
  box_width_in?: number | null;
  box_height_in?: number | null;
  dim_unit: 'in' | 'cm';
}

export interface ShopperCatalogItem {
  id: string;
  tenant_id: string;
  source: string;
  trip_item_id?: string | null;
  title: string;
  hook?: string | null;
  description?: string | null;
  category?: string | null;
  price_gtq?: number | null;
  price_usd?: number | null;
  is_made_to_order: boolean;
  stock_total: number;
  stock_sold: number;
  stock_available: number;
  listing: ShopperListing;
  expires_at?: string | null;
  is_published: boolean;
  is_offer: boolean;
  compare_at_price_gtq?: number | null;
  offer_ends_at?: string | null;
  published_at?: string | null;
  last_reserved_at?: string | null;
  amazon_url?: string | null;
  amazon_asin?: string | null;
  image_url?: string | null;
  notes?: string | null;
  calc_mode?: string | null;
  calc_weight_lbs?: number | null;
  calc_volume_in3?: number | null;
  calc_total_cost_gtq?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopperItemInput {
  title: string;
  hook?: string | null;
  description?: string | null;
  category?: string | null;
  price_gtq?: number | null;
  price_usd?: number | null;
  is_made_to_order?: boolean;
  stock_total?: number;
  is_published?: boolean;
  is_offer?: boolean;
  compare_at_price_gtq?: number | null;
  offer_ends_at?: string | null;
  listing?: ShopperListing;
  expires_at?: string | null;
  amazon_url?: string | null;
  amazon_asin?: string | null;
  image_url?: string | null;
  notes?: string | null;
  source?: string;
  cost_gtq?: number | null;        // costo manual → margen y ganancias
  calc?: CalcSnapshotPayload | null;
}

// ── Público ───────────────────────────────────────────────────────────────────
export interface PublicShopperItem {
  id: string;
  title: string;
  hook?: string | null;
  description?: string | null;
  category?: string | null;
  price_gtq?: number | null;
  is_offer: boolean;
  compare_at_price_gtq?: number | null;
  offer_ends_at?: string | null;
  is_made_to_order: boolean;
  stock_available: number;
  reserved_count: number;
  // Escasez honesta: unidades reales que quedan (null = por encargo).
  remaining?: number | null;
  closed: boolean;                 // ya no se puede apartar (cerrado / vencido / agotado)
  listing: ShopperListing;
  expires_at?: string | null;
  image_url?: string | null;
  last_reserved_at?: string | null;
  bought_with: string[];
}

export interface ShopperPayInfo {
  bank_name?: string | null;
  bank_account_holder?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
}

export interface PublicShopperCatalog {
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
  // Tienda en vivo: status efectivo (ya considera el reloj), nombre y cierre.
  store_status: ShopperStoreStatus;
  store_name?: string | null;
  store_closes_at?: string | null;
  categories: string[];
  reserved_people: number;
  reserved_units: number;
  pay_info?: ShopperPayInfo | null;
  items: PublicShopperItem[];
  v: string;                       // stamp de versión — comparar contra el pulso
}

// Latido barato del catálogo: el cliente lo pollea y solo refetchea cuando `v` cambia.
export interface PublicShopperPulse {
  v: string;
  live: boolean;
  closes_at?: string | null;
}

export interface ShopperReservation {
  id: string;
  tenant_id: string;
  catalog_item_id: string;
  order_token?: string | null;
  client_name: string;
  client_phone: string;
  client_token: string;
  quantity: number;
  status: ShopperResStatus;
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
  item_amazon_url?: string | null;
}

export interface PublicShopperReservation {
  id: string;
  client_token: string;
  order_token?: string | null;
  order_pin?: string | null;
  client_name: string;
  quantity: number;
  status: ShopperResStatus;
  deposit_amount?: number | null;
  expires_at: string;
  item_title: string;
  item_price_gtq?: number | null;
  whatsapp_number?: string | null;
  created_at: string;
}

export interface PublicShopperOrderLine {
  id: string;
  item_id: string;
  item_title: string;
  item_image_url?: string | null;
  item_price_gtq?: number | null;
  quantity: number;
  status: ShopperResStatus;
  editable: boolean;
  stock_available: number;
  expires_at: string;
  created_at: string;
  resolution?: string | null;
  resolution_note?: string | null;
  suggested_items: PublicShopperItem[];
  resolved_by_substitute: boolean;
}

export interface PublicShopperOrder {
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
  pay_info?: ShopperPayInfo | null;
  lines: PublicShopperOrderLine[];
  subtotal_gtq: number;            // antes del cupón
  total_gtq: number;               // subtotal − descuento
  total_items: number;
  // Cupón aplicado (público — nunca costo/margen/usos).
  coupon_code?: string | null;
  coupon_discount_gtq: number;
  coupon_note?: string | null;     // p.ej. "Aplica a pedidos desde Q200"
  coupon_expires_at?: string | null;
}

// ── Cupones de descuento ──────────────────────────────────────────────────────
export type CouponDiscountType = 'percent' | 'fixed';

export interface ShopperCoupon {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  percent_off?: number | null;
  amount_off_gtq?: number | null;
  max_discount_gtq?: number | null;
  min_subtotal_gtq?: number | null;
  min_margin_pct: number;
  max_redemptions?: number | null;   // null = ilimitado
  per_customer_limit: number;
  redeemed_count: number;
  starts_at?: string | null;
  expires_at?: string | null;
  label?: string | null;
  is_active: boolean;
  created_at: string;
  could_go_below_cost: boolean;      // aviso de margen (solo dueño)
}

export interface ShopperCouponInput {
  code?: string | null;
  discount_type?: CouponDiscountType;
  percent_off?: number | null;
  amount_off_gtq?: number | null;
  max_discount_gtq?: number | null;
  min_subtotal_gtq?: number | null;
  min_margin_pct?: number;
  max_redemptions?: number | null;
  per_customer_limit?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  label?: string | null;
  is_active?: boolean | null;        // solo update (toggle)
}

export interface CouponRedemption {
  id: string;
  order_token: string;
  client_phone: string;
  status: string;
  discount_gtq: number;
  subtotal_gtq: number;
  created_at: string;
  released_at?: string | null;
}

export interface CouponPreview {
  valid: boolean;
  discount_gtq: number;
  subtotal_gtq: number;
  new_total_gtq: number;
  coupon_code?: string | null;
  coupon_expires_at?: string | null;
  reason?: string | null;
}

// Reporting honesto (endpoint /stats). Tres baldes por avance real del pedido,
// todo neteado de cupón. Reemplaza el summary del front que mezclaba pendiente
// con cobrado y no restaba cupones.
export interface ShopperStatsBucket {
  revenue_gtq: number;       // bruto (precio × cantidad)
  coupon_gtq: number;        // cupón atribuido al balde
  net_revenue_gtq: number;   // bruto − cupón
  cost_gtq: number;
  profit_gtq: number;        // neto − costo
  units: number;
  lines: number;
  orders: number;
  assumed_cost_lines: number;   // líneas con costo ASUMIDO (sin calc real)
}

export interface ShopperStatsProduct {
  catalog_item_id: string;
  title: string;
  image_url?: string | null;
  units: number;
  net_revenue_gtq: number;
  profit_gtq: number;
}

export interface ShopperStats {
  period_days: number;
  generated_at: string;
  exchange_rate: number;
  potential: ShopperStatsBucket;
  committed: ShopperStatsBucket;
  realized: ShopperStatsBucket;
  realized_profit_usd: number;
  avg_ticket_gtq: number;
  fulfillment_rate: number;
  cancelled_lines: number;
  unavailable_lines: number;
  expired_lines: number;
  total_coupon_gtq: number;
  unique_customers: number;
  recurring_customers: number;
  top_products: ShopperStatsProduct[];
}

const BASE = '/api/shopper-catalog';

export const shopperCatalogService = {
  // ── Settings ────────────────────────────────────────────────────────────────
  getSettings: (): Promise<ShopperCatalogSettings> =>
    api.get(`${BASE}/settings`).then(r => r.data),
  updateSettings: (data: Partial<ShopperCatalogSettings>): Promise<ShopperCatalogSettings> =>
    api.patch(`${BASE}/settings`, data).then(r => r.data),

  // ── Tienda en vivo (drop) ────────────────────────────────────────────────────
  openStore: (data: { store_name?: string | null; minutes?: number | null; closes_at?: string | null }): Promise<ShopperCatalogSettings> =>
    api.post(`${BASE}/store/open`, data).then(r => r.data),
  closeStore: (): Promise<ShopperCatalogSettings> =>
    api.post(`${BASE}/store/close`).then(r => r.data),

  // ── Calculadora (privada) ────────────────────────────────────────────────────
  getCalcSettings: (): Promise<ShopperCalcSettings> =>
    api.get(`${BASE}/calc-settings`).then(r => r.data),
  updateCalcSettings: (data: Partial<ShopperCalcSettings>): Promise<ShopperCalcSettings> =>
    api.patch(`${BASE}/calc-settings`, data).then(r => r.data),

  // ── Catálogo (dueño) ─────────────────────────────────────────────────────────
  list: (): Promise<ShopperCatalogItem[]> =>
    api.get(`${BASE}/`).then(r => r.data),
  create: (data: ShopperItemInput): Promise<ShopperCatalogItem> =>
    api.post(`${BASE}/`, data).then(r => r.data),
  update: (id: string, data: Partial<ShopperItemInput>): Promise<ShopperCatalogItem> =>
    api.patch(`${BASE}/${id}`, data).then(r => r.data),
  remove: (id: string): Promise<void> =>
    api.delete(`${BASE}/${id}`).then(() => undefined),
  publishFromTrip: (tripItemId: string): Promise<ShopperCatalogItem> =>
    api.post(`${BASE}/from-trip/${tripItemId}`).then(r => r.data),

  // ── Reporting honesto (dueño) ────────────────────────────────────────────────
  getStats: (days = 0): Promise<ShopperStats> =>
    api.get(`${BASE}/stats`, { params: days ? { days } : {} }).then(r => r.data),

  // ── Reservas (dueño) ─────────────────────────────────────────────────────────
  listReservations: (): Promise<ShopperReservation[]> =>
    api.get(`${BASE}/reservations`).then(r => r.data),
  updateReservation: (
    id: string,
    data: {
      status?: string; payment_reference?: string | null; notes?: string | null;
      resolution?: string | null; resolution_note?: string | null; suggested_item_id?: string | null;
    },
  ): Promise<ShopperReservation> =>
    api.patch(`${BASE}/reservations/${id}`, data).then(r => r.data),
  reservationSuggestions: (id: string): Promise<ShopperCatalogItem[]> =>
    api.get(`${BASE}/reservations/${id}/suggestions`).then(r => r.data),
  markNotified: (id: string): Promise<ShopperReservation> =>
    api.post(`${BASE}/reservations/${id}/mark-notified`).then(r => r.data),

  // ── Público ──────────────────────────────────────────────────────────────────
  getPublic: (token: string, v?: string): Promise<PublicShopperCatalog> =>
    publicApi.get(`${BASE}/public/${token}${v ? `?v=${encodeURIComponent(v)}` : ''}`).then(r => r.data),

  getPulse: (token: string): Promise<PublicShopperPulse> =>
    publicApi.get(`${BASE}/public/${token}/pulse`).then(r => r.data),
  createReservation: (
    publicToken: string,
    itemId: string,
    data: { client_name: string; client_phone: string; quantity: number; deposit_amount?: number | null; notes?: string | null },
  ): Promise<PublicShopperReservation> =>
    api.post(`${BASE}/public/${publicToken}/reserve/${itemId}`, data).then(r => r.data),
  getClientReservation: (clientToken: string): Promise<PublicShopperReservation> =>
    api.get(`${BASE}/public/reservation/${clientToken}`).then(r => r.data),

  // ── Pedido acumulado ("En mi maleta") ────────────────────────────────────────
  getOrder: (orderToken: string): Promise<PublicShopperOrder> =>
    api.get(`${BASE}/public/order/${orderToken}`).then(r => r.data),
  lookupOrder: (phone: string, pin: string, catalogToken: string): Promise<PublicShopperOrder> =>
    api.post(`${BASE}/public/order/lookup`, { phone, pin, catalog_token: catalogToken }).then(r => r.data),
  updateOrderLine: (orderToken: string, reservationId: string, quantity: number): Promise<PublicShopperOrder> =>
    api.patch(`${BASE}/public/order/${orderToken}/line/${reservationId}`, { quantity }).then(r => r.data),
  deleteOrderLine: (orderToken: string, reservationId: string): Promise<PublicShopperOrder> =>
    api.delete(`${BASE}/public/order/${orderToken}/line/${reservationId}`).then(r => r.data),
  swapOrderLine: (orderToken: string, reservationId: string, newItemId: string): Promise<PublicShopperOrder> =>
    api.post(`${BASE}/public/order/${orderToken}/line/${reservationId}/swap/${newItemId}`).then(r => r.data),
  dismissOrderLine: (orderToken: string, reservationId: string): Promise<PublicShopperOrder> =>
    api.post(`${BASE}/public/order/${orderToken}/line/${reservationId}/dismiss`).then(r => r.data),

  // ── Cupones (dueño) ──────────────────────────────────────────────────────────
  listCoupons: (): Promise<ShopperCoupon[]> =>
    api.get(`${BASE}/coupons`).then(r => r.data),
  createCoupon: (data: ShopperCouponInput): Promise<ShopperCoupon> =>
    api.post(`${BASE}/coupons`, data).then(r => r.data),
  updateCoupon: (id: string, data: Partial<ShopperCouponInput>): Promise<ShopperCoupon> =>
    api.patch(`${BASE}/coupons/${id}`, data).then(r => r.data),
  deleteCoupon: (id: string): Promise<void> =>
    api.delete(`${BASE}/coupons/${id}`).then(() => undefined),
  getCouponRedemptions: (id: string): Promise<CouponRedemption[]> =>
    api.get(`${BASE}/coupons/${id}/redemptions`).then(r => r.data),

  // ── Cupones (cliente, en el pedido) ──────────────────────────────────────────
  previewCoupon: (orderToken: string, code: string): Promise<CouponPreview> =>
    api.post(`${BASE}/public/order/${orderToken}/coupon/preview`, { code }).then(r => r.data),
  applyCoupon: (orderToken: string, code: string): Promise<PublicShopperOrder> =>
    api.post(`${BASE}/public/order/${orderToken}/coupon`, { code }).then(r => r.data),
  removeCoupon: (orderToken: string): Promise<PublicShopperOrder> =>
    api.delete(`${BASE}/public/order/${orderToken}/coupon`).then(r => r.data),
};
