import { lazy, Suspense } from 'react'
import LandingPage from '@/pages/landing/LandingPage'
import { ToastProvider } from '@/components/ui/Toaster'
import { UpdatePrompt } from '@/components/ui/UpdatePrompt'

// Todo lo que no es la landing se carga bajo demanda. Visitar `/` no debe
// descargar el shell autenticado (AppShell + módulos + recharts) ni las trece
// páginas públicas por token, ni disparar `/api/auth/session`.
//
// La landing sí va en el bundle principal: es la ruta por defecto, y un
// Suspense aquí borraría el hero estático de index.html antes del primer paint.
const AuthedApp = lazy(() => import('@/AuthedApp'))

const PublicTrackingPage    = lazy(() => import('@/components/PublicTrackingPage').then(m => ({ default: m.PublicTrackingPage })))
const ImportTrackingPage    = lazy(() => import('@/components/ImportTrackingPage').then(m => ({ default: m.ImportTrackingPage })))
const InvitePage            = lazy(() => import('@/components/InvitePage').then(m => ({ default: m.InvitePage })))
const StorePage             = lazy(() => import('@/components/StorePage').then(m => ({ default: m.StorePage })))
const StoreOrderPage        = lazy(() => import('@/components/StoreOrderPage').then(m => ({ default: m.StoreOrderPage })))
const BookingPage           = lazy(() => import('@/components/BookingPage').then(m => ({ default: m.BookingPage })))
const BookingStatusPage     = lazy(() => import('@/components/BookingStatusPage').then(m => ({ default: m.BookingStatusPage })))
const ShopperCatalogPage    = lazy(() => import('@/components/ShopperCatalogPage').then(m => ({ default: m.ShopperCatalogPage })))
const ShopperReservationPage = lazy(() => import('@/components/ShopperReservationPage').then(m => ({ default: m.ShopperReservationPage })))
const ShopperOrderPage       = lazy(() => import('@/components/ShopperOrderPage').then(m => ({ default: m.ShopperOrderPage })))
const ShopperOrderLookupPage = lazy(() => import('@/components/ShopperOrderLookupPage').then(m => ({ default: m.ShopperOrderLookupPage })))
const ImportCatalogPage     = lazy(() => import('@/components/ImportCatalogPage').then(m => ({ default: m.ImportCatalogPage })))
const ImportReservationPage = lazy(() => import('@/components/ImportReservationPage').then(m => ({ default: m.ImportReservationPage })))
const ImportOrderPage       = lazy(() => import('@/components/ImportOrderPage').then(m => ({ default: m.ImportOrderPage })))
const ImportOrderLookupPage = lazy(() => import('@/components/ImportOrderLookupPage').then(m => ({ default: m.ImportOrderLookupPage })))

function getTrackingToken(): string | null {
  const match = window.location.pathname.match(/^\/tracking\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

function getImportTrackingToken(): string | null {
  const match = window.location.pathname.match(/^\/import-tracking\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /invite/<token> — empleados invitados (token opaco urlsafe de 32 bytes)
function getInviteToken(): string | null {
  const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]{20,})$/);
  return match ? match[1] : null;
}

// /tienda/<token> — catálogo público del módulo Ventas
function getStoreToken(): string | null {
  const match = window.location.pathname.match(/^\/tienda\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /pedido/<token> — seguimiento público de un pedido del módulo Ventas
function getStoreOrderToken(): string | null {
  const match = window.location.pathname.match(/^\/pedido\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /agenda/<token> — agenda pública del módulo Citas
function getBookingToken(): string | null {
  const match = window.location.pathname.match(/^\/agenda\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /cita/<token> — comprobante público de una cita del módulo Citas
function getAppointmentToken(): string | null {
  const match = window.location.pathname.match(/^\/cita\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /catalogo/<token> — catálogo público del Personal Shopper
function getShopperCatalogToken(): string | null {
  const match = window.location.pathname.match(/^\/catalogo\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /mis-pedidos/<client_token> — vista de reserva del cliente (Personal Shopper)
function getShopperReservationToken(): string | null {
  const match = window.location.pathname.match(/^\/mis-pedidos\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /mi-maleta/<order_token> — pedido acumulado del cliente (Personal Shopper)
function getShopperOrderToken(): string | null {
  const match = window.location.pathname.match(/^\/mi-maleta\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /mi-maleta (sin token) — consulta por WhatsApp + PIN
function isShopperOrderLookup(): boolean {
  return /^\/mi-maleta\/?$/.test(window.location.pathname);
}

// /importa/<token> — catálogo público del módulo Importaciones
function getImportCatalogToken(): string | null {
  const match = window.location.pathname.match(/^\/importa\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /mi-reserva/<client_token> — vista de reserva individual (Importaciones, legacy)
function getImportReservationToken(): string | null {
  const match = window.location.pathname.match(/^\/mi-reserva\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /mi-pedido/<order_token> — pedido acumulado del cliente (Importaciones)
function getImportOrderToken(): string | null {
  const match = window.location.pathname.match(/^\/mi-pedido\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /mi-pedido (sin token) — consulta por WhatsApp + PIN
function isImportOrderLookup(): boolean {
  return /^\/mi-pedido\/?$/.test(window.location.pathname);
}

// /portal — login, registro y la app autenticada. Deliberadamente NO es `/`:
// los clientes finales de los catálogos públicos no deben toparse con el
// formulario de registro al perder el token de la URL.
function isPortal(): boolean {
  return /^\/portal\/?$/.test(window.location.pathname);
}

function RouteSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-nodo-canvas">
      <div className="flex flex-col items-center gap-3">
        <span className="text-3xl font-black text-nodo-ink italic tracking-tighter">N.</span>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nodo-ink" />
      </div>
    </div>
  );
}

// ── Root router ──────────────────────────────────────────────────────────────
export default function App() {
  const trackingToken         = getTrackingToken();
  const importTrackingToken   = getImportTrackingToken();
  const inviteToken           = getInviteToken();
  const storeToken            = getStoreToken();
  const storeOrderToken       = getStoreOrderToken();
  const bookingToken          = getBookingToken();
  const appointmentToken      = getAppointmentToken();
  const shopperCatalogToken      = getShopperCatalogToken();
  const shopperReservationToken  = getShopperReservationToken();
  const shopperOrderToken        = getShopperOrderToken();
  const shopperOrderLookup       = isShopperOrderLookup();
  const importCatalogToken       = getImportCatalogToken();
  const importReservationToken   = getImportReservationToken();
  const importOrderToken         = getImportOrderToken();
  const importOrderLookup        = isImportOrderLookup();
  const portal                   = isPortal();

  const handleInviteAccepted = () => {
    // Limpiar la URL y cargar la app autenticada
    window.history.replaceState({}, '', '/portal');
    window.location.reload();
  };

  return (
    <ToastProvider>
      <UpdatePrompt />
      <Suspense fallback={<RouteSpinner />}>
      {trackingToken
        ? <PublicTrackingPage token={trackingToken} />
        : importTrackingToken
        ? <ImportTrackingPage token={importTrackingToken} />
        : inviteToken
        ? <InvitePage token={inviteToken} onAccepted={handleInviteAccepted} />
        : storeToken
        ? <StorePage token={storeToken} />
        : storeOrderToken
        ? <StoreOrderPage token={storeOrderToken} />
        : bookingToken
        ? <BookingPage token={bookingToken} />
        : appointmentToken
        ? <BookingStatusPage token={appointmentToken} />
        : shopperCatalogToken
        ? <ShopperCatalogPage token={shopperCatalogToken} />
        : shopperOrderToken
        ? <ShopperOrderPage orderToken={shopperOrderToken} />
        : shopperOrderLookup
        ? <ShopperOrderLookupPage />
        : shopperReservationToken
        ? <ShopperReservationPage clientToken={shopperReservationToken} />
        : importCatalogToken
        ? <ImportCatalogPage token={importCatalogToken} />
        : importOrderToken
        ? <ImportOrderPage orderToken={importOrderToken} />
        : importOrderLookup
        ? <ImportOrderLookupPage />
        : importReservationToken
        ? <ImportReservationPage clientToken={importReservationToken} />
        : portal
        ? <AuthedApp />
        : <LandingPage />}
      </Suspense>
    </ToastProvider>
  );
}
