/**
 * Copy de la landing. Todo el texto vive acá para poder ajustar el mensaje
 * sin tocar los componentes. Los precios NO están acá: vienen de la BD vía
 * /api/public/plans (ver plans.fallback.ts).
 */

export const HERO = {
  eyebrow: 'Sistema de gestión modular',
  title: 'Tu negocio entero,\nen una sola pantalla.',
  subtitle:
    'Ventas, inventario, pedidos, citas e importaciones. Nodo reemplaza el cuaderno, la hoja de Excel y los tres grupos de WhatsApp — y le da a tus clientes una página propia para comprarte.',
  ctaPrimary: 'Crear mi cuenta gratis',
  ctaPrimaryReturning: 'Entrar al panel',
  ctaSecondary: 'Ver cómo funciona',
  reassurance: ['Prueba gratis', 'Sin tarjeta', 'Cancelas cuando quieras'],
} as const;

export const PROBLEM = {
  title: 'Sabes cuánto vendiste.\n¿Sabes cuánto ganaste?',
  subtitle:
    'La mayoría de los negocios no pierde plata por vender poco. La pierde por no ver a tiempo dónde se le escapa.',
  points: [
    {
      title: 'El margen que crees tener no es el real',
      body: 'Sin el costo exacto de cada producto, hay ventas que te dejan pérdida y nunca te enteras.',
    },
    {
      title: 'Los pedidos viven en el chat',
      body: 'Una conversación se archiva, un audio se pierde, y el cliente termina comprándole a otro.',
    },
    {
      title: 'Cierras la caja a ciegas',
      body: 'Cuadrar a mano cada noche es media hora que no recuperas, y un número en el que igual no confías.',
    },
  ],
} as const;

/** Íconos: nombres de lucide-react, resueltos en ModulesBento. */
export const MODULES = [
  { icon: 'ShoppingCart', name: 'Ventas', body: 'Punto de venta rápido, con stock que se descuenta solo.', tint: 'mint' },
  { icon: 'Boxes',        name: 'Inventario', body: 'Bodega, costos y alertas antes de quedarte sin producto.', tint: 'blue' },
  { icon: 'Globe',        name: 'Catálogo online', body: 'Tu tienda con enlace propio. Tus clientes piden solos.', tint: 'lavender' },
  { icon: 'CalendarClock',name: 'Citas', body: 'Agenda pública, recordatorios y confirmación automática.', tint: 'peach' },
  { icon: 'Ship',         name: 'Importaciones', body: 'Cotizador con impuestos, flete y margen real por producto.', tint: 'blue' },
  { icon: 'Wallet',       name: 'Cierre de caja', body: 'Cuadre en un minuto, con el detalle de cada movimiento.', tint: 'mint' },
  { icon: 'Receipt',      name: 'Gastos', body: 'Todo lo que sale, categorizado y contra el ingreso del mes.', tint: 'pink' },
  { icon: 'BarChart3',    name: 'Reportes', body: 'Qué se vende, qué deja margen y qué solo ocupa espacio.', tint: 'yellow' },
  { icon: 'Sparkles',     name: 'Personal shopper', body: 'Catálogo de Amazon, viajes de compra y reservas.', tint: 'lavender' },
] as const;

export const CUSTOMER_FACING = {
  eyebrow: 'La diferencia',
  title: 'No es un sistema que solo ves tú.\nTus clientes también.',
  subtitle:
    'Cada módulo genera una página pública con su propio enlace. Sin apps que descargar, sin registro, sin fricción. Lo compartes por WhatsApp y ya está vendiendo.',
  cards: [
    { title: 'Tu catálogo', body: 'Productos, precios y fotos. El cliente arma su pedido y te llega al instante.' },
    { title: 'Seguimiento de pedido', body: 'El cliente ve en qué va lo suyo sin escribirte. Menos "¿ya está?" en el chat.' },
    { title: 'Tu agenda', body: 'Reservan el horario que les sirve, sobre la disponibilidad real que tú definiste.' },
  ],
} as const;

export const STEPS = [
  { n: '01', title: 'Registras tu negocio', body: 'Un correo, un nombre y listo. Sin instalar nada, sin visita técnica.' },
  { n: '02', title: 'Activas los módulos que usas', body: 'Solo vendes? Solo ventas. Nodo crece cuando tu negocio crece.' },
  { n: '03', title: 'Compartes tu enlace', body: 'Tus clientes compran, reservan y siguen sus pedidos desde el celular.' },
] as const;

export const TRUST = {
  eyebrow: 'Confianza',
  title: 'Tus números son tuyos.\nY de nadie más.',
  items: [
    {
      icon: 'Lock',
      title: 'Aislamiento real entre empresas',
      body: 'La base de datos aplica seguridad a nivel de fila: ninguna consulta puede ver datos de otra empresa, ni por error de programación.',
    },
    {
      icon: 'Fingerprint',
      title: 'Sesiones que no se roban',
      body: 'Tu sesión nunca queda expuesta al navegador. Puedes entrar con huella o Face ID en vez de contraseña.',
    },
    {
      icon: 'DatabaseBackup',
      title: 'Respaldos automáticos',
      body: 'Copias periódicas y cifradas de toda tu información. Si algo pasa, se restaura.',
    },
    {
      icon: 'Smartphone',
      title: 'Funciona en el celular',
      body: 'Se instala como app, funciona con mala señal y se actualiza sola. No necesitas computadora.',
    },
  ],
} as const;

export const FAQ = [
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Cada empresa vive aislada a nivel de base de datos, las sesiones usan cookies que el navegador no puede leer, y hay respaldos automáticos cifrados. Nadie de otra empresa puede ver tu información, aunque quisiera.',
  },
  {
    q: '¿Cuánto tardan en activarme la cuenta?',
    a: 'Revisamos cada registro a mano, así nadie entra por error y tu información queda donde debe. En cuanto aprobamos tu cuenta te avisamos y ya puedes usar los módulos de tu plan.',
  },
  {
    q: '¿Qué pasa cuando termina la prueba?',
    a: 'Te avisamos antes. Si no eliges un plan, tu cuenta queda unos días en modo lectura: sigues viendo todo lo tuyo, pero no puedes registrar nuevos movimientos. No borramos nada ni te cobramos sin avisar.',
  },
  {
    q: '¿Tengo que instalar algo?',
    a: 'No. Nodo funciona en el navegador y se puede instalar como app en el celular con un toque. Sin descargas de tiendas, sin actualizaciones manuales.',
  },
  {
    q: '¿Puedo usar solo un módulo?',
    a: 'Sí, para eso es modular. Activas únicamente lo que tu negocio necesita hoy y agregas más cuando haga falta. No pagas por lo que no usas.',
  },
  {
    q: '¿Y si me quiero ir?',
    a: 'Te llevas tus datos. Cancelas cuando quieras desde el panel, sin llamadas ni formularios de retención.',
  },
] as const;

export const FINAL_CTA = {
  title: 'Empieza hoy.\nEl primer cierre de caja te va a sorprender.',
  subtitle: 'Creas tu cuenta, la activamos y pruebas todos los módulos. Sin tarjeta.',
  cta: 'Crear mi cuenta gratis',
} as const;
