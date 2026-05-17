import api from '@/lib/api';

export interface AutosCalculoInput {
  costo_real_usd: number;
  state_code: string;
  vehicle_size: 'normal' | 'mediano' | 'grande';
  rep_llave?:     number;
  rep_repuestos?: number;
  rep_pintura?:   number;
  rep_mano_obra?: number;
  rep_otros?:     number;
  precio_venta_gtq?: number;
  tipo_cambio?:          number;
  tramite_aduanero_gtq?: number;
  porcentaje_sat?:       number;
}

export interface CostoVehiculo {
  costo_real_usd:        number;
  costo_real_gtq:        number;
  comision_bancaria_usd: number;
  comision_bancaria_gtq: number;
  total_usd:             number;
  total_gtq:             number;
}

export interface CostoImportacion {
  grua_usd:                        number;
  grua_gtq:                        number;
  comision_grua_usd:               number;
  comision_grua_gtq:               number;
  barco_usd:                       number;
  barco_gtq:                       number;
  comision_barco_usd:              number;
  comision_barco_gtq:              number;
  storage_usd:                     number;
  storage_gtq:                     number;
  comision_bancaria_logistica_usd: number;
  comision_bancaria_logistica_gtq: number;
  total_usd:                       number;
  total_gtq:                       number;
  puerto:                          string;
}

export interface ImpuestosGT {
  impuestos_sat_gtq:            number;
  tramite_aduanero_gtq:         number;
  tacuacina_gtq:                number;
  primeras_placas_gtq:          number;
  calcomania_gtq:               number;
  facturacion_legalizacion_gtq: number;
  insumos_gasolina_gtq:         number;
  contador_gtq:                 number;
  grua_local_gtq:               number;
  total_gtq:                    number;
}

export interface CostoReparacion {
  llave_gtq:     number;
  repuestos_gtq: number;
  pintura_gtq:   number;
  mano_obra_gtq: number;
  otros_gtq:     number;
  total_gtq:     number;
}

export interface AutosCalculoResult {
  state_label:          string;
  puerto:               string;
  tipo_cambio:          number;
  tramite_aduanero_gtq: number;
  porcentaje_sat:       number;
  costo_vehiculo:       CostoVehiculo;
  costo_importacion:    CostoImportacion;
  impuestos_guatemala:  ImpuestosGT;
  costo_reparacion:     CostoReparacion;
  costo_final_gtq:      number;
  precio_venta_gtq:     number;
  utilidad_gtq:         number;
}

export interface EstadoUSA {
  code:            string;
  label:           string;
  puerto:          string;
  grua_base_usd:   number;
  barco_base_usd:  number;
}

const BASE = '/api/autos';

export const autosService = {
  listarEstados: async (): Promise<EstadoUSA[]> => {
    const { data } = await api.get(`${BASE}/estados`);
    return data;
  },

  calcular: async (input: AutosCalculoInput): Promise<AutosCalculoResult> => {
    const { data } = await api.post(`${BASE}/calcular`, input);
    return data;
  },
};
