import api from '@/lib/api';

export interface ShopperTrip {
  id: string;
  tenant_id: string;
  store_name: string;
  notes?: string | null;
  started_at: string;
  ended_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopperTripItem {
  id: string;
  tenant_id: string;
  trip_id: string;
  title: string;
  description?: string | null;
  price_gtq?: number | null;
  stock: number;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const shopperTripsService = {
  list: (): Promise<ShopperTrip[]> =>
    api.get('/api/shopper-trips/').then(r => r.data),

  getActive: (): Promise<ShopperTrip | null> =>
    api.get('/api/shopper-trips/active').then(r => r.data).catch(e => {
      if (e.response?.status === 404) return null;
      throw e;
    }),

  start: (data: { store_name: string; notes?: string | null }): Promise<ShopperTrip> =>
    api.post('/api/shopper-trips/', data).then(r => r.data),

  update: (id: string, data: Partial<Pick<ShopperTrip, 'store_name' | 'notes' | 'ended_at'>>): Promise<ShopperTrip> =>
    api.patch(`/api/shopper-trips/${id}`, data).then(r => r.data),

  end: (id: string): Promise<ShopperTrip> =>
    api.patch(`/api/shopper-trips/${id}`, { ended_at: new Date().toISOString() }).then(r => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/api/shopper-trips/${id}`).then(() => undefined),

  listItems: (tripId: string): Promise<ShopperTripItem[]> =>
    api.get(`/api/shopper-trips/${tripId}/items`).then(r => r.data),

  addItem: (
    tripId: string,
    data: { title: string; description?: string | null; price_gtq?: number | null; stock: number; notes?: string | null },
  ): Promise<ShopperTripItem> =>
    api.post(`/api/shopper-trips/${tripId}/items`, data).then(r => r.data),

  updateItem: (
    itemId: string,
    data: Partial<Pick<ShopperTripItem, 'title' | 'description' | 'price_gtq' | 'stock' | 'notes'>>,
  ): Promise<ShopperTripItem> =>
    api.patch(`/api/shopper-trips/items/${itemId}`, data).then(r => r.data),

  removeItem: (itemId: string): Promise<void> =>
    api.delete(`/api/shopper-trips/items/${itemId}`).then(() => undefined),
};
