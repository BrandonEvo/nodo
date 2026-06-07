import { X } from 'lucide-react';

interface PrivacyPolicyModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ open, onClose }: PrivacyPolicyModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-nodo-card rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col max-h-[85dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-nodo-line shrink-0">
          <h2 className="text-lg font-black text-nodo-ink">Política de Privacidad</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-nodo-dim hover:bg-nodo-inset transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5 text-sm text-nodo-sub font-medium leading-relaxed">

          <p className="text-xs text-nodo-dim">Última actualización: junio 2026</p>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">¿Quiénes somos?</h3>
            <p>
              Nodo es un sistema de gestión operacional para negocios. Al crear una cuenta aceptás
              que procesamos tus datos para brindarte el servicio.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">Datos que recopilamos</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Correo electrónico y nombre (al registrarte)</li>
              <li>Datos operacionales del negocio (inventario, ventas, recetas)</li>
              <li>Datos de sesión (tokens de acceso almacenados en cookies httpOnly)</li>
              <li>Suscripciones push (endpoint, clave p256dh y auth) si las activás</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">Notificaciones push</h3>
            <p>
              Si activás las notificaciones, almacenamos el endpoint de suscripción de tu dispositivo
              vinculado a tu cuenta. Este dato se usa exclusivamente para enviarte alertas del sistema
              (stock bajo, órdenes completadas, estados de pedidos). No se comparte con terceros.
            </p>
            <p>
              El consentimiento queda registrado con fecha y hora en nuestros servidores.
              Podés revocar el permiso en cualquier momento desde Configuración → Notificaciones
              o desde la configuración de notificaciones de tu navegador.
            </p>
            <p>
              Al cerrar sesión, tus suscripciones push se eliminan automáticamente de nuestros servidores.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">Cómo usamos tus datos</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Prestar el servicio de gestión operacional</li>
              <li>Enviarte notificaciones que explícitamente autorizaste</li>
              <li>Garantizar la seguridad e integridad del sistema</li>
            </ul>
            <p>No vendemos ni cedemos tus datos a terceros.</p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">Seguridad</h3>
            <p>
              Tus datos se transmiten siempre por HTTPS. Las credenciales de sesión se almacenan
              en cookies httpOnly (inaccesibles desde JavaScript). Las contraseñas se almacenan
              como hash bcrypt — nunca en texto plano.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">Retención y eliminación</h3>
            <p>
              Tus datos operacionales se conservan mientras tu cuenta esté activa. Al solicitar la
              eliminación de tu cuenta, borramos todos tus datos personales en un plazo de 30 días.
              Las suscripciones push expiradas se limpian automáticamente.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-black text-nodo-ink">Tus derechos</h3>
            <p>
              Tenés derecho a acceder, corregir o eliminar tus datos personales. Para ejercer
              estos derechos, contactá al administrador de tu organización o escribinos a{' '}
              <span className="text-nodo-ink font-bold">privacidad@nodo.app</span>.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-nodo-line shrink-0">
          <button
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold text-sm active:scale-[0.97] transition-transform"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
