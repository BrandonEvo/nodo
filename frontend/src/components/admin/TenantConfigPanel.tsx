import { useState, useEffect, useRef } from 'react';
import { Building2, Palette, Image as ImageIcon, Save, CheckCircle2, Upload, X } from 'lucide-react';
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
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight flex items-center gap-3">
          <Building2 className="text-[#111111] w-7 h-7" /> Configuración de Empresa
        </h1>
        <p className="text-gray-400 mt-1 text-sm font-medium">Ajusta los detalles visuales y de identidad de tu organización.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-[#111111] flex items-center gap-2">
            <Building2 size={16} className="text-gray-400" /> Nombre de la Empresa
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-all"
            placeholder="Ej. Mi Empresa S.A."
          />
        </div>

        {/* Logo Upload */}
        <div className="space-y-3">
          <label className="text-sm font-bold text-[#111111] flex items-center gap-2">
            <ImageIcon size={16} className="text-gray-400" /> Logo de la Empresa
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
              <div className="w-28 h-28 shrink-0 rounded-2xl border-2 border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center p-2">
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-xs font-semibold text-[#111111]">Logo actual</p>
                <p className="text-xs text-gray-400 mb-1">Reemplaza o elimina la imagen.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-4 bg-[#111111] text-white text-xs font-bold rounded-xl hover:bg-black transition-all flex items-center gap-2"
                >
                  <Upload size={14} /> Cambiar imagen
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, logo_url: '' }))}
                  className="h-9 px-4 bg-red-50 text-red-500 text-xs font-bold rounded-xl hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100"
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
                dragOver
                  ? 'border-[#111111] bg-gray-50'
                  : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50/50'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${dragOver ? 'bg-[#69E7A8]/20' : 'bg-gray-100'}`}>
                <Upload size={24} className={dragOver ? 'text-[#111111]' : 'text-gray-400'} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[#111111]">
                  {dragOver ? 'Suelta la imagen aquí' : 'Sube el logo de tu empresa'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Arrastra y suelta, o haz clic para seleccionar</p>
                <p className="text-xs text-gray-300 mt-0.5">PNG, JPG, SVG, WebP — máx. 1MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Theme Color */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-[#111111] flex items-center gap-2">
            <Palette size={16} className="text-gray-400" /> Color de Tema
          </label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={form.theme_color}
              onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
              className="w-11 h-11 rounded-xl cursor-pointer border-0 p-0"
            />
            <input
              type="text"
              value={form.theme_color}
              onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
              className="w-32 h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold uppercase focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-all"
              placeholder="#000000"
            />
          </div>
          <p className="text-xs text-gray-400 font-medium mt-1">Este color se utilizará como acento principal en tu espacio de trabajo.</p>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-4">
          {success && (
            <span className="text-sm font-bold text-[#69E7A8] flex items-center gap-1.5 animate-in fade-in zoom-in">
              <CheckCircle2 size={16} /> Guardado correctamente
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-11 px-6 bg-[#111111] text-white font-bold text-sm rounded-xl hover:bg-black transition-all active:scale-[0.97] disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-black/10"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
