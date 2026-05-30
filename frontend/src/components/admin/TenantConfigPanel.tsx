import { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle2, Upload, X, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { PageSpinner } from '@/components/ui/Spinner';
import { tenantMeService } from '@/services/tenantMe.service';

export function TenantConfigPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    logo_url: '',
    theme_color: '#69E7A8'
  });

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const tenant = await tenantMeService.getMyTenant();
        setForm({
          name: tenant.name || '',
          logo_url: tenant.logo_url || '',
          theme_color: tenant.theme_color || '#69E7A8'
        });
      } catch (err) {
        console.error('Error loading tenant config', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen (PNG, JPG, SVG, WebP)');
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      toast.error('La imagen no debe superar 1MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, logo_url: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await tenantMeService.updateConfig({
        name: form.name,
        logo_url: form.logo_url,
        theme_color: form.theme_color
      });
      setSuccess(true);
      toast.success('Configuración guardada correctamente');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSpinner />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Configuración de Empresa</h1>
        <p className="text-nodo-sub text-sm font-medium mt-0.5">Ajusta la identidad visual de tu organización.</p>
      </div>

      <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-6 flex flex-col gap-6">

        {/* Nombre */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Nombre de la Empresa
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
            placeholder="Ej. Mi Empresa S.A."
          />
        </div>

        {/* Logo */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Logo de la Empresa
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {form.logo_url ? (
            <div className="flex items-start gap-5">
              <div className="w-24 h-24 shrink-0 rounded-2xl border-2 border-nodo-line overflow-hidden bg-nodo-inset flex items-center justify-center p-2">
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-xs font-bold text-nodo-ink">Logo actual</p>
                <p className="text-xs text-nodo-dim mb-1">Reemplaza o elimina la imagen.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-4 bg-nodo-ink text-nodo-canvas text-xs font-bold rounded-xl active:scale-[0.97] transition-transform flex items-center gap-2"
                >
                  <Upload size={14} /> Cambiar imagen
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, logo_url: '' }))}
                  className="h-9 px-4 bg-nodo-danger-bg text-nodo-danger-tx text-xs font-bold rounded-xl active:scale-[0.97] transition-transform flex items-center gap-2 border border-nodo-danger-bd"
                >
                  <X size={14} /> Eliminar logo
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                dragOver ? 'border-nodo-ink bg-nodo-inset' : 'border-nodo-line hover:border-nodo-sub hover:bg-nodo-inset'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${dragOver ? 'bg-[#69E7A8]/20' : 'bg-nodo-inset'}`}>
                <Upload size={24} className={dragOver ? 'text-nodo-ink' : 'text-nodo-dim'} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-nodo-ink">
                  {dragOver ? 'Suelta la imagen aquí' : 'Sube el logo de tu empresa'}
                </p>
                <p className="text-xs text-nodo-dim mt-1">Arrastra y suelta, o haz clic para seleccionar</p>
                <p className="text-xs text-nodo-dim/60 mt-0.5">PNG, JPG, SVG, WebP — máx. 1MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Color de tema */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Color de Tema
          </label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={form.theme_color}
              onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
              className="w-11 h-11 rounded-xl cursor-pointer border-0 p-0 bg-transparent"
            />
            <input
              type="text"
              value={form.theme_color}
              onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
              className="w-32 h-11 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold uppercase text-nodo-ink focus:border-nodo-ink outline-none transition-colors"
              placeholder="#000000"
            />
          </div>
          <p className="text-xs text-nodo-dim font-medium mt-2">
            Color de acento principal en tu espacio de trabajo.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-nodo-line flex items-center justify-end gap-4">
          {success && (
            <span className="text-sm font-bold text-nodo-success-tx flex items-center gap-1.5 animate-in fade-in zoom-in">
              <CheckCircle2 size={16} /> Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-11 px-6 bg-nodo-ink text-nodo-canvas font-bold text-sm rounded-2xl active:scale-[0.97] transition-transform disabled:opacity-50 flex items-center gap-2 shadow-lg"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
