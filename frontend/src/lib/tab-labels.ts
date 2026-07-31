/**
 * Título de la AppBar para los tabs que no son módulos. Los módulos usan el `name`
 * que viene de la tabla `modules`, así que no entran acá.
 *
 * Son los títulos LARGOS (los que estaban en el `<h1>` de cada pantalla), no las
 * etiquetas cortas del Sidebar: la barra tiene ancho, el ítem de nav no.
 */
export const TAB_LABELS: Record<string, string> = {
  admin_home:            'Panel Maestro',
  admin_tenants:         'Empresas',
  admin_users:           'Usuarios y Empleados',
  admin_roles:           'Auditoría de Roles',
  admin_modules:         'Módulos Globales',
  admin_subscriptions:   'Planes',
  admin_presence:        'En línea',
  admin_backups:         'Cartuchera',
  admin_platform_config: 'Configuración de Plataforma',
  profile:               'Mi Perfil',
  mgmt_employees:        'Empleados',
  mgmt_team:             'Gestión de Equipo',
  mgmt_subscription:     'Suscripción',
  mgmt_config:           'Configuración',
};

/** Pantallas de inicio: muestran la identidad del tenant en vez de un título. */
export const HOME_TABS = new Set(['home', 'admin_home']);
