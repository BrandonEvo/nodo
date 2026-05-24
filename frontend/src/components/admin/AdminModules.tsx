import { useState, useEffect } from "react";
import { Plus, Package, Pencil, PowerOff, Trash2, ShieldAlert, Check, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toaster";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminModules() {
  const toast = useToast();

  const [modules, setModules] = useState<ModuleRead[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleRead | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [route, setRoute] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ModuleRead | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
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

  const openCreate = () => {
    setEditingModule(null);
    setName(""); setCode(""); setRoute(""); setIcon("");
    setFormOpen(true);
  };

  const openEdit = (mod: ModuleRead) => {
    setEditingModule(mod);
    setName(mod.name);
    setCode(mod.code);
    setRoute(mod.frontend_route ?? "");
    setIcon(mod.icon ?? "");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingModule(null);
    setName(""); setCode(""); setRoute(""); setIcon("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    try {
      if (editingModule) {
        await modulesService.update(editingModule.id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          frontend_route: route.trim().toLowerCase() || null,
          icon: icon.trim() || null,
        });
        toast.success("Módulo actualizado");
      } else {
        await modulesService.create({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          frontend_route: route.trim().toLowerCase() || null,
          icon: icon.trim() || null,
        });
        toast.success("Módulo creado");
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (mod: ModuleRead) => {
    toast.confirm(
      "¿Desactivar este módulo?",
      async () => {
        try {
          await modulesService.update(mod.id, { is_active: false });
          toast.warning("Módulo desactivado");
          await loadData();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar");
        }
      },
      { confirmLabel: "Desactivar" }
    );
  };

  const handleReactivate = async (mod: ModuleRead) => {
    try {
      await modulesService.update(mod.id, { is_active: true });
      toast.success("Módulo reactivado");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al reactivar");
    }
  };

  const openHardDelete = (mod: ModuleRead) => {
    setDeleteTarget(mod);
    setMasterPassword("");
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || !masterPassword) return;
    setDeleting(true);
    try {
      await modulesService.hardDelete(deleteTarget.id, masterPassword);
      setDeleteTarget(null);
      setMasterPassword("");
      toast.success("Módulo destruido permanentemente");
      await loadData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir el módulo");
    } finally {
      setDeleting(false);
    }
  };

  const formValid = name.trim().length > 0 && code.trim().length > 0;

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Módulos Globales</h1>
            <p className="text-nodo-sub text-sm font-medium mt-0.5">Funcionalidades disponibles en el ecosistema.</p>
          </div>
          <button
            onClick={openCreate}
            className="h-11 px-5 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm flex items-center gap-2 active:scale-[0.97] transition-transform shadow-lg shrink-0"
          >
            <Plus size={16} />
            Crear
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
            </div>
          ) : modules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Package size={32} className="text-nodo-dim mb-2" />
              <p className="text-sm font-bold text-nodo-dim">No hay módulos registrados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {modules.map((mod) => (
                <div
                  key={mod.id}
                  className={`bg-nodo-card border border-nodo-line rounded-3xl p-5 shadow-sm relative overflow-hidden group transition-opacity ${mod.is_active === false ? "opacity-50" : ""}`}
                >
                  {/* Accent corner */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-[#69E7A8]/10 rounded-bl-[40px] group-hover:scale-110 transition-transform" />

                  {/* Actions */}
                  <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
                    <button
                      onClick={() => openEdit(mod)}
                      className="p-1.5 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-full transition-colors"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    {mod.is_active !== false ? (
                      <button
                        onClick={() => handleDeactivate(mod)}
                        className="p-1.5 text-nodo-warn-tx hover:bg-nodo-warn-bg rounded-full transition-colors"
                        title="Desactivar"
                      >
                        <PowerOff size={15} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleReactivate(mod)}
                          className="p-1.5 text-nodo-success-tx hover:bg-nodo-success-bg rounded-full transition-colors"
                          title="Reactivar"
                        >
                          <PowerOff size={15} />
                        </button>
                        <button
                          onClick={() => openHardDelete(mod)}
                          className="p-1.5 text-nodo-danger-tx hover:bg-nodo-danger-bg rounded-full transition-colors"
                          title="Destruir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Content */}
                  <div className="pr-10 relative z-10">
                    {mod.icon && (
                      <span className="text-2xl mb-2 block">{mod.icon}</span>
                    )}
                    <h4 className="font-black text-base text-nodo-ink leading-tight">{mod.name}</h4>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-nodo-sub bg-nodo-inset px-2 py-1 rounded-lg">
                        {mod.code}
                      </span>
                      {mod.frontend_route && (
                        <span className="font-mono text-xs text-nodo-dim bg-nodo-inset border border-nodo-line px-2 py-1 rounded-lg">
                          apps/{mod.frontend_route}
                        </span>
                      )}
                    </div>
                    {mod.is_active === false && (
                      <span className="mt-3 inline-block bg-nodo-inset text-nodo-dim px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                        Inactivo
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form BottomSheet */}
      <BottomSheet
        open={formOpen}
        onClose={closeForm}
        title={editingModule ? "Editar Módulo" : "Nuevo Módulo"}
        footer={
          <button
            form="module-form"
            type="submit"
            disabled={saving || !formValid}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving
              ? <Loader2 size={18} className="animate-spin" />
              : <Check size={18} />
            }
            {editingModule ? "GUARDAR CAMBIOS" : "CREAR MÓDULO"}
          </button>
        }
      >
        <form id="module-form" onSubmit={handleSave} className="flex flex-col gap-5">
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Icono (emoji)
            </label>
            <div className="flex gap-3 items-center">
              <div className="w-12 h-12 rounded-2xl bg-nodo-inset border-2 border-nodo-line flex items-center justify-center text-2xl shrink-0">
                {icon || <span className="text-nodo-dim text-sm">?</span>}
              </div>
              <input
                type="text"
                placeholder="Ej. 🥖 🧁 🚗"
                value={icon}
                onChange={e => setIcon(e.target.value)}
                disabled={saving}
                className="flex-1 h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Nombre Comercial
            </label>
            <input
              type="text"
              placeholder="Ej. Punto de Venta"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={saving}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Código Interno
            </label>
            <input
              type="text"
              placeholder="Ej. POS"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              required
              disabled={saving || !!editingModule}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50 uppercase font-mono tracking-widest"
            />
            {editingModule && (
              <p className="text-[10px] text-nodo-dim mt-1.5 pl-1">El código es un identificador inmutable.</p>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Ruta de App Frontend
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-nodo-dim text-sm font-mono select-none">
                apps/
              </span>
              <input
                type="text"
                placeholder="ej: calc, pos"
                value={route}
                onChange={e => setRoute(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                disabled={saving}
                className="w-full h-12 pl-14 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50 font-mono"
              />
            </div>
            <p className="text-[10px] text-nodo-dim mt-1.5 pl-1">
              {route ? `→ src/apps/${route}/` : "Vacío = mostrar \"Próximamente\"."}
            </p>
          </div>
        </form>
      </BottomSheet>

      {/* Hard delete BottomSheet */}
      <BottomSheet
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setMasterPassword(""); }}
        title="Destrucción Permanente"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setDeleteTarget(null); setMasterPassword(""); }}
              className="flex-1 h-14 rounded-2xl border-2 border-nodo-line text-nodo-sub font-bold text-sm active:scale-[0.97] transition-transform hover:bg-nodo-inset"
            >
              Cancelar
            </button>
            <button
              form="hard-delete-form"
              type="submit"
              disabled={deleting || !masterPassword}
              className="flex-1 h-14 rounded-2xl bg-nodo-danger-tx text-white font-bold text-sm active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Destruir
            </button>
          </div>
        }
      >
        <form id="hard-delete-form" onSubmit={handleHardDelete} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-14 h-14 bg-nodo-danger-bg rounded-2xl flex items-center justify-center">
              <ShieldAlert size={28} className="text-nodo-danger-tx" />
            </div>
            <div className="text-center">
              <p className="font-black text-nodo-ink text-base">{deleteTarget?.name}</p>
              <p className="text-sm text-nodo-sub mt-1">
                Borrará el módulo junto con sus planes, roles y membresías. Irreversible.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Contraseña Maestra
            </label>
            <input
              type="password"
              placeholder="Contraseña de superadmin..."
              value={masterPassword}
              onChange={e => setMasterPassword(e.target.value)}
              autoFocus
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-danger-bd rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-danger-tx outline-none transition-colors placeholder:text-nodo-dim text-center tracking-widest"
            />
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
