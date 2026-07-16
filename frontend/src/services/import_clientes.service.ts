import api from '@/lib/api';
import type { Cotizacion } from './importaciones.service';

export interface Cliente {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  source: 'manual' | 'catalogo' | 'qr' | string;
  attribution: string | null;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
  cotizaciones_count: number;
  total_pagado_gtq: string;
  last_cotizacion_at: string | null;
  // Acumulado del pedido en línea (reservas del catálogo) por estado.
  reservado_gtq: string;
  pedido_actual_gtq: string;
  entregado_gtq: string;
  reservas_activas: number;
}

export interface ClienteReserva {
  id: string;
  item_title: string;
  item_image_url: string | null;
  quantity: number;
  status: string;
  line_total_gtq: string;
  created_at: string;
  order_token: string | null;
}

export interface ClienteDetail extends Cliente {
  cotizaciones: Cotizacion[];
  reservas: ClienteReserva[];
}

export interface ClienteCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export type ClienteUpdate = Partial<ClienteCreate>;

export const importClientesService = {
  list: (search?: string) =>
    api.get<Cliente[]>('/api/importaciones/clientes', {
      params: search ? { search } : undefined,
    }),

  get: (id: string) =>
    api.get<ClienteDetail>(`/api/importaciones/clientes/${id}`),

  create: (data: ClienteCreate) =>
    api.post<Cliente>('/api/importaciones/clientes', data),

  update: (id: string, data: ClienteUpdate) =>
    api.patch<Cliente>(`/api/importaciones/clientes/${id}`, data),

  remove: (id: string) =>
    api.delete(`/api/importaciones/clientes/${id}`),
};
