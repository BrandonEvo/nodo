import { useState, useEffect } from "react";
import { Plus, Package, Pencil, PowerOff, X, Trash2, ShieldAlert } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toaster";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminModules() {
  const toast = useToast();

  const [modules, setModules] = useState<ModuleRead[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [newModuleName, setNewModuleName] = useState("");
  const [newModuleCode, setNewModuleCode] = useState("");
  const [newModuleRoute, setNewModuleRoute] = useState("");
  const [saving, setSaving] = useState(false);

  const [hardDeletingModuleId, setHardDeletingModuleId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      setModules(await modulesService.list());
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openForm = (mod?: ModuleRead) => {
    if (mod) {
      setEditingModuleId(mod.id);
      setNewModuleName(mod.name);
      setNewModuleCode(mod.code);
      setNewModuleRoute(mod.frontend_route ?? '');
    } else {
      setEditingModuleId(null);
      setNewModuleName(""); setNewModuleCode(""); setNewModuleRoute("");
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingModuleId(null);
    setNewModuleName(""); setNewModuleCode(""); setNewModuleRoute("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleName.trim() || !newModuleCode.trim()) return;
    setSaving(true);
    try {
      if (editingModuleId) {
        await modulesService.update(editingModuleId, {
          name: newModuleName.trim(),
          code: newModuleCode.trim().toUpperCase(),
          frontend_route: newModuleRoute.trim().toLowerCase() || null,
        });
        toast.success("Módulo actualizado correctamente");
      } else {
        await modulesService.create({
          name: newModuleName.trim(),
          code: newModuleCode.trim().toUpperCase(),
          frontend_route: newModuleRoute.trim().toLowerCase() || null,
        });
        toast.success("Módulo creado correctamente");
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar módulo");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    toast.confirm(
      "¿Desactivar este módulo?",
      async () => {
        try {
          await modulesService.update(id, { is_active: false });
          toast.warning("Módulo desactivado");
          await loadData();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar módulo");
        }
      },
      { confirmLabel: "Desactivar" }
    );
  };

  const handleReactivate = async (id: string) => {
    try {
      await modulesService.update(id, { is_active: true });
      toast.success("Módulo reactivado");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al reactivar módulo");
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hardDeletingModuleId || !superAdminPassword) return;
    setDeleting(true);
    try {
      await modulesService.hardDelete(hardDeletingModuleId, superAdminPassword);
      setHardDeletingModuleId(null);
      setSuperAdminPassword("");
      toast.success("Módulo destruido permanentemente");
      await loadData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir el módulo");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-6 lg:p-10 shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Package className="text-[#69E7A8] w-7 h-7 shrink-0" /> Módulos Globales
          </h2>
          <p className="text-slate-500 text-sm mt-1">Registra las funcionalidades disponibles en tu ecosistema.</p>
        </div>
        <Button
          onClick={() => openForm()}
          className="h-11 sm:h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-5 sm:px-6 transition-all self-start sm:self-auto shrink-0"
        >
          <Plus size={16} className="mr-2" /> Crear Módulo
        </Button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner size="lg" />
          </div>
        ) : modules.length === 0 ? (
          <EmptyState icon={<Package className="w-6 h-6" />} title="No hay módulos registrados." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => (
              <div
                key={m.id}
                className={`p-5 sm:p-6 bg-white border border-slate-100 rounded-[20px] sm:rounded-[24px] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${m.is_active === false ? 'bg-slate-50 opacity-60' : ''}`}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 bg-[#69E7A8] rounded-bl-[40px] w-24 h-24 group-hover:scale-110 transition-transform" />

                <div className="absolute top-3 right-3 flex flex-col gap-1 z-20">
                  <button onClick={() => openForm(m)} className="p-1.5 text-slate-400 hover:text-[#111111] hover:bg-slate-100 rounded-full transition" title="Editar módulo">
                    <Pencil size={16} />
                  </button>
                  {m.is_active !== false ? (
                    <button onClick={() => handleDelete(m.id)} className="p-1.5 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition" title="Inactivar">
                      <PowerOff size={16} />
                    </button>
                  ) : (
                    <>
                      <button onClick={() => handleReactivate(m.id)} className="p-1.5 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50" title="Reactivar">
                        <PowerOff size={16} />
                      </button>
                      <button onClick={() => setHardDeletingModuleId(m.id)} className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50" title="Destruir">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>

                <div className="pr-10 relative z-10">
                  <h4 className={`font-black text-base sm:text-lg leading-tight ${m.is_active === false ? 'text-slate-500' : 'text-[#111111]'}`}>
                    {m.name}
                  </h4>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{m.code}</span>
                    {m.frontend_route && (
                      <span className="font-mono text-xs text-slate-300 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                        apps/{m.frontend_route}
                      </span>
                    )}
                  </div>
                  {m.is_active === false && (
                    <span className="mt-3 inline-block bg-slate-200 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                      Inactivo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form drawer */}
      {isFormOpen && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex justify-end">
          <div className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-[#111111]">{editingModuleId ? "Editar Módulo" : "Nuevo Módulo"}</h3>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Nombre Comercial</label>
                <Input placeholder="Ej. Punto de Venta" value={newModuleName} onChange={(e) => setNewModuleName(e.target.value)} className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5" required disabled={saving} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Código Interno</label>
                <Input placeholder="Ej. POS" value={newModuleCode} onChange={(e) => setNewModuleCode(e.target.value)} className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5 uppercase" disabled={saving || !!editingModuleId} />
                {editingModuleId && <p className="text-[10px] text-slate-400 pl-2 mt-1">El código es un identificador inmutable.</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Ruta de App Frontend</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono select-none">apps/</span>
                  <Input placeholder="ej: calc, pos" value={newModuleRoute} onChange={(e) => setNewModuleRoute(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))} className="h-12 rounded-2xl bg-slate-50 border-slate-200 pl-14 pr-5 focus-visible:ring-[#111111]/5 font-mono" disabled={saving} />
                </div>
                <p className="text-[10px] text-slate-400 pl-2 mt-1">
                  {newModuleRoute ? `→ src/apps/${newModuleRoute}/` : 'Vacío = mostrar "Próximamente".'}
                </p>
              </div>
              <div className="mt-auto pt-8">
                <Button type="submit" disabled={saving || !newModuleName.trim() || !newModuleCode.trim()} className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]">
                  {saving
                    ? <div className="w-5 h-5 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
                    : editingModuleId ? "Guardar Cambios" : "Añadir Módulo"
                  }
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hard delete modal */}
      {hardDeletingModuleId && (
        <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
              <ShieldAlert size={32} />
            </div>
            <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción PRO</h3>
            <p className="text-slate-500 text-sm mb-6">Borrará el módulo junto con sus planes, roles y membresías. Irreversible.</p>
            <Input type="password" placeholder="Contraseña Maestra..." value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} className="h-14 rounded-2xl text-center font-bold tracking-widest mb-4 border-slate-200 bg-slate-50 focus-visible:ring-red-500/20 focus-visible:border-red-500" autoFocus />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setHardDeletingModuleId(null)} className="flex-1 h-12 rounded-xl text-slate-500 font-bold border-slate-200">Cancelar</Button>
              <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                {deleting ? "Purgando..." : "Destruir"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
