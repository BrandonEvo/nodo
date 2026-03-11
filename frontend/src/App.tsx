import { useState, useEffect } from 'react'
import { Login } from "./components/Login"
import { OrgSelector } from "./components/OrgSelector"
import { Launcher } from "./components/Launcher"
import { AdminDashboard } from "./components/AdminDashboard"
import { TenantAdminDashboard } from "./components/TenantAdminDashboard"
import { tenantMeService } from "./services/tenantMe.service"

export default function App() {
  const [session, setSession] = useState<{
    token: string | null;
    org: { id: string; name: string } | null;
    isSuperAdmin: boolean;
    isTenantAdmin: boolean;
  }>({
    token: localStorage.getItem('token'),
    org: null,
    isSuperAdmin: false,
    isTenantAdmin: false,
  })
  const [loadingOrg, setLoadingOrg] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('token');
    setSession({ token: null, org: null, isSuperAdmin: false, isTenantAdmin: false });
  };

  // Cargar tenant del usuario cuando no es SuperAdmin
  useEffect(() => {
    if (!session.token || session.isSuperAdmin || session.org) return
    setLoadingOrg(true)
    tenantMeService.getMyTenant()
      .then((t) => setSession((s: typeof session) => ({ ...s, org: { id: t.id, name: t.name } })))
      .catch(() => {})
      .finally(() => setLoadingOrg(false))
  }, [session.token, session.isSuperAdmin])

  // Nivel 1: Login
  if (!session.token) {
    return (
      <Login onLoginSuccess={(token, isAdmin, isTenantAdmin) =>
        setSession({ ...session, token, isSuperAdmin: isAdmin, isTenantAdmin })} 
      />
    )
  }

  // Nivel 2: Super Admin
  if (session.isSuperAdmin) {
    return <AdminDashboard onLogout={handleLogout} />
  }

  // Nivel 3: Cargando tenant o selector de organización
  if (!session.org) {
    if (loadingOrg) return <div className="min-h-screen flex items-center justify-center text-white">Cargando...</div>
    return (
      <OrgSelector 
        onSelect={(org) => setSession({ ...session, org })} 
        onLogout={handleLogout}
      />
    )
  }

  // Nivel 4: Admin de empresa (roles y empleados)
  if (session.isTenantAdmin) {
    return <TenantAdminDashboard tenantName={session.org.name} onLogout={handleLogout} />
  }

  // Nivel 5: Launcher (resto de usuarios)
  return (
    <Launcher 
      org={session.org} 
      onSwitchOrg={() => setSession({ ...session, org: null })} 
      onLogout={handleLogout}
    />
  )
}