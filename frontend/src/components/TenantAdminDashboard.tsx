import { useState, useEffect } from "react"
import { LogOut, UserPlus, Shield, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { tenantMeService, type RoleRead, type TenantUser } from "@/services/tenantMe.service"

export function TenantAdminDashboard({
  tenantName,
  onLogout,
}: {
  tenantName: string
  onLogout: () => void
}) {
  const [roles, setRoles] = useState<RoleRead[]>([])
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleCode, setNewRoleCode] = useState("")
  const [creatingRole, setCreatingRole] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [r, u] = await Promise.all([tenantMeService.listRoles(), tenantMeService.listUsers()])
      setRoles(r)
      setUsers(u)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim() || !newRoleCode.trim()) return
    setCreatingRole(true)
    try {
      await tenantMeService.createRole({ name: newRoleName.trim(), code: newRoleCode.trim().toUpperCase() })
      setNewRoleName("")
      setNewRoleCode("")
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al crear rol")
    } finally {
      setCreatingRole(false)
    }
  }

  const handleSetRole = async (userId: string, roleId: string | null) => {
    try {
      await tenantMeService.setUserRole(userId, roleId)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al asignar rol")
    }
  }

  return (
    <div className="min-h-screen bg-[#2D3E35] p-8 lg:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tighter">Admin · {tenantName}</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Roles y empleados</p>
          </div>
          <button onClick={onLogout} className="text-white/40 hover:text-white transition-colors"><LogOut size={24} /></button>
        </header>

        <div className="bg-white rounded-[40px] p-8 lg:p-12 shadow-2xl mb-8">
          <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><Shield size={20} /> Roles</h2>
          <form onSubmit={handleCreateRole} className="flex flex-wrap gap-2 items-center mb-6">
            <Input placeholder="Nombre (ej. Vendedor)" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="max-w-[180px] rounded-full" disabled={creatingRole} />
            <Input placeholder="Code (ej. VENDEDOR)" value={newRoleCode} onChange={(e) => setNewRoleCode(e.target.value)} className="max-w-[140px] rounded-full" disabled={creatingRole} />
            <Button type="submit" disabled={creatingRole || !newRoleName.trim() || !newRoleCode.trim()} className="rounded-full bg-[#69E7A8] hover:bg-[#58C991] text-[#2D3E35] font-bold">
              <UserPlus size={16} className="mr-1" /> Nuevo rol
            </Button>
          </form>
          {loading ? <p className="text-slate-500 text-sm">Cargando...</p> : roles.length === 0 ? <p className="text-slate-500 text-sm">No hay roles. Crea uno para asignar a empleados.</p> : (
            <ul className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <li key={r.id} className="px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium text-slate-700">{r.name} ({r.code})</li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-[40px] p-8 lg:p-12 shadow-2xl">
          <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><Users size={20} /> Empleados</h2>
          {loading ? <p className="text-slate-500 text-sm">Cargando...</p> : users.length === 0 ? <p className="text-slate-500 text-sm">No hay usuarios en esta empresa.</p> : (
            <ul className="space-y-4">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50">
                  <div>
                    <span className="font-medium text-slate-800">{u.email}</span>
                    {u.is_tenant_admin && <span className="ml-2 text-xs font-bold text-emerald-600">Admin</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Rol:</label>
                    <select
                      value={u.role_id ?? ""}
                      onChange={(e) => handleSetRole(u.id, e.target.value || null)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm"
                    >
                      <option value="">Sin rol</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
