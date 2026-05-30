import { useState, useEffect } from "react";
import { Plus, Package, Pencil, PowerOff, Trash2, ShieldAlert, Check, Loader2, X, Zap } from "lucide-react";
import { MODULE_ICON_GROUPS, MODULE_ICON_MAP, resolveModuleIcon } from "@/lib/module-icons";
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
  const [showIconPicker, setShowIconPicker] = useState(false);

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
    setShowIconPicker(false);
    setFormOpen(true);
  };

  const openEdit = (mod: ModuleRead) => {
    setEditingModule(mod);
    setName(mod.name);
    setCode(mod.code);
    setRoute(mod.frontend_route ?? "");
    setIcon(mod.icon ?? "");
    setShowIconPicker(false);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingModule(null);
    setName(""); setCode(""); setRoute(""); setIcon("");
    setShowIconPicker(false);
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

        {/* KPI row */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 shrink-0">
            {[
              { label: 'Total',     value: modules.length,                                       accent: '#fb923c', pastel: '#fb923c1a', icon: Package  },
              { label: 'Activos',   value: modules.filter(m => m.is_active !== false).length,    accent: '#69E7A8', pastel: '#69E7A81a', icon: Zap      },
              { label: 'Inactivos', value: modules.filter(m => m.is_active === false).length,    accent: '#94a3b8', pastel: '#94a3b81a', icon: PowerOff },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="flex flex-col gap-3 p-4 rounded-[20px]" style={{ backgroundColor: c.pastel }}>
                  <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: `${c.accent}22` }}>
                    <Icon size={16} style={{ color: c.accent }} strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-nodo-ink tabular-nums leading-none">{c.value}</p>
                    <p className="text-[10px] font-semibold text-nodo-sub mt-1 leading-tight">{c.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
            <div className="bg-nodo-inset rounded-[22px] overflow-hidden">
              {modules.map((mod, idx) => {
                const accentColor = ['#69E7A8','#60a5fa','#a78bfa','#fb923c','#f472b6','#34d399','#facc15','#38bdf8'][idx % 8];
                return (
                  <div key={mod.id}>
                    {idx > 0 && <div className="mx-4 h-px bg-nodo-line" />}
                    <div className={`flex items-center gap-3.5 px-4 py-3.5 transition-opacity ${mod.is_active === false ? 'opacity-50' : ''}`}>

                      {/* Icon */}
                      {(() => {
                        const ModIcon = resolveModuleIcon(mod.icon);
                        return (
                          <div className="w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0"
                            style={{ background: `${accentColor}20` }}>
                            <ModIcon size={18} style={{ color: accentColor }} strokeWidth={2} />
                          </div>
                        );
                      })()}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-nodo-ink leading-tight truncate">{mod.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-nodo-card text-nodo-sub">
                            {mod.code}
                          </span>
                          {mod.frontend_route && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-nodo-card text-nodo-dim">
                              apps/{mod.frontend_route}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => openEdit(mod)}
                          className="p-2 rounded-xl hover:bg-nodo-raised text-nodo-dim hover:text-nodo-ink transition-colors active:scale-90">
                          <Pencil size={15} />
                        </button>
                        {mod.is_active !== false ? (
                          <button onClick={() => handleDeactivate(mod)}
                            className="p-2 rounded-xl hover:bg-nodo-warn-bg text-nodo-dim hover:text-nodo-warn-tx transition-colors active:scale-90">
                            <PowerOff size={15} />
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleReactivate(mod)}
                              className="p-2 rounded-xl hover:bg-nodo-success-bg text-nodo-dim hover:text-nodo-success-tx transition-colors active:scale-90">
                              <PowerOff size={15} />
                            </button>
                            <button onClick={() => openHardDelete(mod)}
                              className="p-2 rounded-xl bg-nodo-danger-bg text-nodo-danger-tx active:scale-90">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">
                Icono
              </label>
              {icon && (
                <button type="button" onClick={() => setIcon('')}
                  className="flex items-center gap-1 text-[10px] font-bold text-nodo-dim hover:text-nodo-danger-tx transition-colors uppercase tracking-wider">
                  <X size={11} /> Quitar
                </button>
              )}
            </div>

            {/* Preview — clickeable para abrir/cerrar picker */}
            {(() => {
              const PreviewIcon = resolveModuleIcon(icon);
              return (
                <button
                  type="button"
                  onClick={() => setShowIconPicker(v => !v)}
                  className="flex items-center gap-3 mb-3 w-full text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-14 h-14 rounded-[18px] bg-nodo-inset flex items-center justify-center shrink-0">
                    <PreviewIcon size={26} className={icon ? 'text-nodo-ink' : 'text-nodo-dim'} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-nodo-ink">{icon ? 'Icono seleccionado' : 'Sin icono'}</p>
                    <p className="text-[11px] text-nodo-dim mt-0.5">
                      {showIconPicker ? 'Selecciona un icono' : 'Toca para cambiar icono'}
                    </p>
                  </div>
                  <div className={`text-nodo-dim transition-transform duration-200 ${showIconPicker ? 'rotate-180' : ''}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </button>
              );
            })()}

            {/* Picker colapsable */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showIconPicker ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="bg-nodo-inset rounded-2xl p-4 flex flex-col gap-4">
                {MODULE_ICON_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest mb-2.5">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.icons.map(key => {
                        const BtnIcon = MODULE_ICON_MAP[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={saving}
                            onClick={() => { setIcon(key); setShowIconPicker(false); }}
                            className={`w-11 h-11 rounded-[14px] flex items-center justify-center transition-all active:scale-90 ${
                              icon === key
                                ? 'bg-nodo-ink shadow-md scale-105'
                                : 'bg-nodo-card hover:bg-nodo-raised'
                            }`}
                          >
                            <BtnIcon
                              size={20}
                              strokeWidth={1.8}
                              className={icon === key ? 'text-nodo-canvas' : 'text-nodo-sub'}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
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
