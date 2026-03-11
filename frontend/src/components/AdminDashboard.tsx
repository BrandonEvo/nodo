import { useState, useEffect } from "react"
import { Users, ShieldCheck, LogOut, Plus, UserPlus, X, Package } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { tenantsService, type Tenant, type TenantUser } from "@/services/tenants.service"
import { modulesService, type ModuleRead } from "@/services/modules.service"

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTenantName, setNewTenantName] = useState("")
  const [creating, setCreating] = useState(false)
  const [managingTenant, setManagingTenant] = useState<Tenant | null>(null)
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [creatingUser, setCreatingUser] = useState(false)
  const [modules, setModules] = useState<ModuleRead[]>([])
  const [loadingModules, setLoadingModules] = useState(false)
  const [newModuleName, setNewModuleName] = useState("")
  const [newModuleCode, setNewModuleCode] = useState("")
  const [creatingModule, setCreatingModule] = useState(false)
  const [modulesModalTenant, setModulesModalTenant] = useState<Tenant | null>(null)
  const [tenantAssignedIds, setTenantAssignedIds] = useState<string[]>([])
  const [savingModules, setSavingModules] = useState(false)

  const loadTenants = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await tenantsService.list()
      setTenants(list)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar empresas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTenants()
  }, [])

  const loadModules = async () => {
    setLoadingModules(true)
    try {
      const list = await modulesService.list()
      setModules(list)
    } catch {
      setModules([])
    } finally {
      setLoadingModules(false)
    }
  }

  useEffect(() => {
    loadModules()
  }, [])

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTenantName.trim()) return
    setCreating(true)
    try {
      await tenantsService.create({ name: newTenantName.trim() })
      setNewTenantName("")
      await loadTenants()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al crear empresa")
    } finally {
      setCreating(false)
    }
  }

  const openManageUsers = async (tenant: Tenant) => {
    setManagingTenant(tenant)
    setTenantUsers([])
    setLoadingUsers(true)
    try {
      const list = await tenantsService.listUsers(tenant.id)
      setTenantUsers(list)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al cargar usuarios")
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!managingTenant || !newUserEmail.trim() || !newUserPassword) return
    setCreatingUser(true)
    try {
      await tenantsService.createUser(managingTenant.id, {
        email: newUserEmail.trim(),
        password: newUserPassword,
      })
      setNewUserEmail("")
      setNewUserPassword("")
      const list = await tenantsService.listUsers(managingTenant.id)
      setTenantUsers(list)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al crear usuario")
    } finally {
      setCreatingUser(false)
    }
  }

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newModuleName.trim() || !newModuleCode.trim()) return
    setCreatingModule(true)
    try {
      await modulesService.create({ name: newModuleName.trim(), code: newModuleCode.trim().toUpperCase() })
      setNewModuleName("")
      setNewModuleCode("")
      await loadModules()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al crear módulo")
    } finally {
      setCreatingModule(false)
    }
  }

  const openModulesModal = async (tenant: Tenant) => {
    setModulesModalTenant(tenant)
    try {
      const assigned = await modulesService.listByTenant(tenant.id)
      setTenantAssignedIds(assigned.map((m) => m.id))
    } catch {
      setTenantAssignedIds([])
    }
  }

  const toggleModuleForTenant = (id: string) => {
    setTenantAssignedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const saveTenantModules = async () => {
    if (!modulesModalTenant) return
    setSavingModules(true)
    try {
      await modulesService.setForTenant(modulesModalTenant.id, tenantAssignedIds)
      setModulesModalTenant(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al guardar módulos")
    } finally {
      setSavingModules(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#2D3E35] p-8 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-16">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter">NODO <span className="text-[#69E7A8]">CORE</span></h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Super Admin System</p>
          </div>
          <button onClick={onLogout} className="text-white/40 hover:text-white transition-colors"><LogOut size={24} /></button>
        </header>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <Card className="bg-white/5 border-none rounded-[40px] p-4 text-white">
            <CardContent className="flex items-center gap-6 pt-6">
              <div className="p-4 bg-[#69E7A8]/10 text-[#69E7A8] rounded-3xl"><Users size={32} /></div>
              <div>
                <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Tenants</p>
                <p className="text-4xl font-black">{loading ? "—" : tenants.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-none rounded-[40px] p-4 text-white">
            <CardContent className="flex items-center gap-6 pt-6">
              <div className="p-4 bg-[#69E7A8]/10 text-[#69E7A8] rounded-3xl"><Package size={32} /></div>
              <div>
                <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Módulos</p>
                <p className="text-4xl font-black">{loadingModules ? "—" : modules.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Módulos (según lo que paguen) */}
        <div className="bg-white rounded-[50px] p-10 lg:p-16 shadow-2xl mb-12">
          <h2 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">MÓDULOS</h2>
          <div className="w-full h-px bg-slate-100 mb-6" />
          <form onSubmit={handleCreateModule} className="flex flex-wrap gap-2 items-center mb-6">
            <Input placeholder="Nombre" value={newModuleName} onChange={(e) => setNewModuleName(e.target.value)} className="max-w-[180px] rounded-full" disabled={creatingModule} />
            <Input placeholder="Code (ej. VENTAS)" value={newModuleCode} onChange={(e) => setNewModuleCode(e.target.value)} className="max-w-[140px] rounded-full" disabled={creatingModule} />
            <Button type="submit" disabled={creatingModule || !newModuleName.trim() || !newModuleCode.trim()} className="rounded-full bg-[#69E7A8] hover:bg-[#58C991] text-[#2D3E35] font-bold">
              <Plus size={18} className="mr-1" /> Nuevo módulo
            </Button>
          </form>
          {loadingModules ? <p className="text-slate-500 text-sm">Cargando módulos...</p> : modules.length === 0 ? <p className="text-slate-500 text-sm">No hay módulos. Crea uno para asignarlos a empresas.</p> : (
            <ul className="flex flex-wrap gap-2">
              {modules.map((m) => (
                <li key={m.id} className="px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium text-slate-700">{m.name} ({m.code})</li>
              ))}
            </ul>
          )}
        </div>

        {/* Gestión de Tenants */}
        <div className="bg-white rounded-[50px] p-10 lg:p-16 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">CONTROL DE EMPRESAS</h2>
            <form onSubmit={handleCreateTenant} className="flex gap-2 items-center">
              <Input
                placeholder="Nombre de la empresa"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                className="max-w-[220px] rounded-full"
                disabled={creating}
              />
              <Button type="submit" disabled={creating || !newTenantName.trim()} className="rounded-full bg-[#69E7A8] hover:bg-[#58C991] text-[#2D3E35] font-bold">
                <Plus size={18} className="mr-1" /> Nueva empresa
              </Button>
            </form>
          </div>
          <div className="w-full h-px bg-slate-100 mb-8" />

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {loading ? (
            <p className="text-slate-500">Cargando empresas...</p>
          ) : tenants.length === 0 ? (
            <p className="text-slate-500">No hay empresas. Crea una con el formulario de arriba.</p>
          ) : (
            <div className="space-y-4">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-6 hover:bg-slate-50 rounded-3xl transition-colors border border-transparent hover:border-slate-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#D4E9D7] rounded-2xl flex items-center justify-center text-xl font-black text-[#2D3E35]">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 uppercase tracking-tighter">{t.name}</h4>
                      <p className="text-xs font-bold text-slate-400">ID: {t.id.slice(0, 8)}…</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <span className="flex items-center gap-1.5 text-emerald-500 font-black text-[10px] tracking-widest">
                      <ShieldCheck size={14} /> {t.is_active ? "ACTIVO" : "INACTIVO"}
                    </span>
                    <Button type="button" variant="outline" className="rounded-full text-[10px] font-black" onClick={() => openModulesModal(t)}>
                      <Package size={14} className="mr-1" /> MÓDULOS
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-[10px] font-black"
                      onClick={() => openManageUsers(t)}
                    >
                      GESTIONAR ACCESOS
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Gestionar usuarios */}
      {managingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setManagingTenant(null)}>
          <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-900">Usuarios · {managingTenant.name}</h3>
              <button onClick={() => setManagingTenant(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={handleCreateUser} className="flex flex-wrap gap-2 mb-6">
                <Input
                  type="email"
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="flex-1 min-w-[160px] rounded-full"
                  required
                  disabled={creatingUser}
                />
                <Input
                  type="password"
                  placeholder="Contraseña"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="flex-1 min-w-[120px] rounded-full"
                  required
                  disabled={creatingUser}
                />
                <Button type="submit" disabled={creatingUser} className="rounded-full bg-[#69E7A8] hover:bg-[#58C991] text-[#2D3E35] font-bold">
                  <UserPlus size={16} className="mr-1" /> Añadir usuario
                </Button>
              </form>
              {loadingUsers ? (
                <p className="text-slate-500 text-sm">Cargando usuarios...</p>
              ) : tenantUsers.length === 0 ? (
                <p className="text-slate-500 text-sm">Aún no hay usuarios. Añade uno arriba.</p>
              ) : (
                <ul className="space-y-2">
                  {tenantUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50">
                      <span className="font-medium text-slate-800">{u.email}</span>
                      <span className="text-xs text-slate-500">{u.is_superuser ? "SuperAdmin" : "Usuario"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Asignar módulos a tenant */}
      {modulesModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModulesModalTenant(null)}>
          <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-900">Módulos · {modulesModalTenant.name}</h3>
              <button onClick={() => setModulesModalTenant(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <p className="text-slate-500 text-sm mb-4">Marca los módulos que tiene esta empresa (según plan).</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
              {modules.map((m) => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tenantAssignedIds.includes(m.id)} onChange={() => toggleModuleForTenant(m.id)} className="rounded" />
                  <span className="font-medium text-slate-800">{m.name}</span>
                  <span className="text-xs text-slate-400">({m.code})</span>
                </label>
              ))}
            </div>
            <Button onClick={saveTenantModules} disabled={savingModules} className="w-full rounded-full bg-[#69E7A8] hover:bg-[#58C991] text-[#2D3E35] font-bold">Guardar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
