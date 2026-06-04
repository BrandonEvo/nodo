import api from '@/lib/api';
import type { Cotizacion } from './importaciones.service';

export interface Cliente {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  cotizaciones_count: number;
  total_pagado_gtq: string;
  last_cotizacion_at: string | null;
}

export interface ClienteDetail extends Cliente {
  cotizaciones: Cotizacion[];
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
