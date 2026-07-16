import type { PublicPlan } from '@/services/public_plans.service';

/**
 * Snapshot de respaldo de los planes. Solo se muestra cuando /api/public/plans
 * NO responde (backend frío o caído) — nunca cuando responde con lista vacía.
 *
 * Espeja los planes marcados como públicos en el panel de Súper Admin. Si
 * diverge, la BD manda: esto solo se usa cuando no hay BD que consultar. Al
 * cambiar un precio o el copy en el panel, actualizá también este archivo.
 */
export const FALLBACK_PLANS: PublicPlan[] = [
  {
    id: 'fallback-vehiculos',
    name: 'Vehículos',
    tagline: 'Para quien importa autos desde Estados Unidos',
    description: 'Sabe cuánto te cuesta un carro puesto en Guatemala, antes de ofertar por él.',
    price: 99,
    currency: 'GTQ',
    billing_period: 'month',
    features: [
      'Costeo desde la subasta hasta la placa',
      'Grúa, barco, impuestos SAT y tramitación',
      'Margen real por vehículo',
      'Cotizaciones que puedes compartir',
    ],
    badge_label: null,
    cta_label: 'Empezar gratis',
    is_featured: false,
    module_names: [],
  },
  {
    id: 'fallback-agenda',
    name: 'Agenda',
    tagline: 'Para quien vende su tiempo',
    description: 'Tus clientes reservan solos, en los horarios que tú definiste.',
    price: 199,
    currency: 'GTQ',
    billing_period: 'month',
    features: [
      'Calendario público con tu propio enlace',
      'Catálogo de servicios y precios',
      'Confirmación automática de reservas',
      'Comprobante de cita para el cliente',
    ],
    badge_label: null,
    cta_label: 'Empezar gratis',
    is_featured: false,
    module_names: [],
  },
  {
    id: 'fallback-importa-vende',
    name: 'Importa y Vende',
    tagline: 'Para quien trae producto de afuera y lo revende',
    description: 'Del costo de importación al pedido entregado, sin salir del sistema.',
    price: 299,
    currency: 'GTQ',
    billing_period: 'month',
    features: [
      'Calculadora de costos de importación con aduana GT',
      'Pedidos personalizados de tus clientes',
      'Catálogo público con apartado de stock',
      'Monitor de entregas y seguimiento',
    ],
    badge_label: 'Más popular',
    cta_label: 'Empezar gratis',
    is_featured: true,
    module_names: [],
  },
  {
    id: 'fallback-punto-de-venta',
    name: 'Punto de Venta',
    tagline: 'Para el negocio que produce y vende a diario',
    description: 'Inventario, producción, mostrador y cierre de caja, cuadrados entre sí.',
    price: 599,
    currency: 'GTQ',
    billing_period: 'month',
    features: [
      'Punto de venta en mostrador',
      'Inventario y materias primas',
      'Fichas técnicas y costeo de recetas',
      'Producción diaria y control de mermas',
      'Cierre de caja y arqueo de efectivo',
    ],
    badge_label: null,
    cta_label: 'Empezar gratis',
    is_featured: false,
    module_names: [],
  },
];
