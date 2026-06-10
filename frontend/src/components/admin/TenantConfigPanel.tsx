import { useState, useEffect, useRef } from 'react';
import { Save, Upload, X, Loader2, Bell, BellOff, ShieldCheck, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { PageSpinner } from '@/components/ui/Spinner';
import { tenantMeService } from '@/services/tenantMe.service';
import { usePushPermission } from '@/hooks/usePushPermission';
import { PrivacyPolicyModal } from '@/components/PrivacyPolicyModal';
import { irisFromTenant, luminance } from '@/lib/utils';

const COLOR_PRESETS = [
  '#E01B24', '#FF7E5F', '#F59E0B', '#69E7A8',
  '#1EA05E', '#3A8ADF', '#7B50DC', '#EC4899',
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function TenantConfigPanel() {
  const toast = useToast();
  const { state: pushState, subscribing, subscribe, unsubscribe } = usePushPermission();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    logo_url: '',
    theme_color: '#69E7A8'
  });
  const [initial, setInitial] = useState(form);

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const tenant = await tenantMeService.getMyTenant();
        const loaded = {
          name: tenant.name || '',
          logo_url: tenant.logo_url || '',
          theme_color: tenant.theme_color || '#69E7A8'
        };
        setForm(loaded);
        setInitial(loaded);
      } catch (err) {
        console.error('Error loading tenant config', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const validColor = HEX_RE.test(form.theme_color);
  const dirty = form.name !== initial.name
    || form.logo_url !== initial.logo_url
    || form.theme_color !== initial.theme_color;
  const canSave = dirty && validColor && form.name.trim().length > 0;

  const previewColor = validColor ? form.theme_color : initial.theme_color;
  const iris = irisFromTenant(previewColor);
  const onColor = luminance(previewColor) > 0.55 ? '#111111' : '#FFFFFF';

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen (PNG, JPG, SVG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (file.size <= 1 * 1024 * 1024) {
        setForm(prev => ({ ...prev, logo_url: src }));
        return;
      }
      // Comprimir con canvas hasta quedar bajo 1MB
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/webp', quality);
        while (dataUrl.length > 1 * 1024 * 1024 * 1.37 && quality > 0.2) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/webp', quality);
        }
        setForm(prev => ({ ...prev, logo_url: dataUrl }));
        toast.success('Imagen comprimida automáticamente');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await tenantMeService.updateConfig({
        name: form.name,
        logo_url: form.logo_url,
        theme_color: form.theme_color
      });
      toast.success('Guardado — aplicando tu nueva identidad…');
      // El color/nombre/logo viven en la sesión que carga AppShell:
      // recargar es lo que propaga la identidad a toda la app.
      setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al guardar configuración');
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSpinner />;
  }

  return (
    <>
    <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    <div className="flex flex-col gap-4 max-w-4xl">

      <div>
        <h1 className="nodo-module-title">
          Configuración<span style={{ color: 'var(--nodo-iris-start)' }}>.</span>
        </h1>
        <p className="nodo-module-subtitle">Ajusta la identidad visual de tu organización.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ── Col 1: Identidad ── */}
        <div className="nodo-card p-5 flex flex-col gap-4">

          {/* Nombre */}
          <div>
            <label className="nodo-label">Nombre de la Empresa</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="nodo-input"
              placeholder="Ej. Mi Empresa S.A."
            />
          </div>

          {/* Logo */}
          <div>
            <label className="nodo-label">Logo de la Empresa</label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {form.logo_url ? (
              <div className="flex items-center gap-3 bg-nodo-inset rounded-2xl p-3">
                <div className="w-12 h-12 shrink-0 rounded-xl border border-nodo-line overflow-hidden bg-nodo-card flex items-center justify-center p-1.5">
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="w-full h-full object-contain"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-3.5 bg-nodo-ink text-nodo-canvas text-xs font-bold rounded-full active:scale-[0.97] transition-transform flex items-center gap-1.5"
                  >
                    <Upload size={12} /> Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, logo_url: '' }))}
                    className="h-8 px-3.5 bg-nodo-danger-bg text-nodo-danger-tx text-xs font-bold rounded-full active:scale-[0.97] transition-transform flex items-center gap-1.5 border border-nodo-danger-bd"
                  >
                    <X size={12} /> Eliminar
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
                className={`border-2 border-dashed rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer transition-all ${
                  dragOver ? 'border-nodo-ink bg-nodo-inset' : 'border-nodo-line hover:border-nodo-sub hover:bg-nodo-inset'
                }`}
              >
                <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: dragOver ? iris.soft : 'var(--nodo-inset)' }}>
                  <Upload size={18} className={dragOver ? 'text-nodo-ink' : 'text-nodo-dim'} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-nodo-ink leading-tight">
                    {dragOver ? 'Suelta la imagen aquí' : 'Sube el logo de tu empresa'}
                  </p>
                  <p className="text-[11px] text-nodo-dim mt-0.5">PNG, JPG, SVG, WebP — se comprime automático</p>
                </div>
              </div>
            )}
          </div>

          {/* Color de tema */}
          <div>
            <label className="nodo-label">Color de Tema</label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((c) => {
                const active = form.theme_color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, theme_color: c })}
                    aria-label={`Color ${c}`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
                      active ? 'ring-2 ring-offset-2 ring-nodo-ink ring-offset-nodo-card' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {active && <Check size={13} style={{ color: luminance(c) > 0.55 ? '#111' : '#fff' }} strokeWidth={3} />}
                  </button>
                );
              })}
              <input
                type="color"
                value={validColor ? form.theme_color : '#69E7A8'}
                onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
                className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 bg-transparent shrink-0"
                title="Color personalizado"
              />
              <input
                type="text"
                value={form.theme_color}
                onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
                className={`nodo-input !h-9 !w-28 !px-3 uppercase font-bold text-center ${!validColor ? '!border-nodo-danger-bd' : ''}`}
                placeholder="#000000"
                maxLength={7}
              />
            </div>
            {!validColor && (
              <p className="text-[11px] font-semibold text-nodo-danger-tx mt-1.5">Hex inválido — usa #RRGGBB</p>
            )}
          </div>
        </div>

        {/* ── Col 2: Preview + Notificaciones ── */}
        <div className="flex flex-col gap-4">

          {/* Vista previa en vivo */}
          <div className="nodo-card p-4 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-[0.15] blur-2xl pointer-events-none"
              style={{ background: `radial-gradient(circle, ${previewColor}, transparent 70%)` }} />
            <p className="nodo-section-label !mb-2">Vista previa</p>
            <div className="relative flex items-center gap-3">
              {form.logo_url ? (
                <div className="w-12 h-12 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center p-1.5 shrink-0">
                  <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain"
                    onError={(e) => (e.currentTarget.style.display = 'none')} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shadow-sm shrink-0"
                  style={{ backgroundColor: previewColor, color: onColor }}>
                  {(form.name || 'N').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-base font-black text-nodo-ink leading-tight truncate lowercase">
                  {form.name || 'tu empresa'}
                  <span style={{ color: iris.start }}>.</span>
                </p>
                <div className="h-1.5 rounded-full w-40 mt-1.5" style={{ background: iris.gradient }} />
              </div>
            </div>
          </div>

          {/* Notificaciones push */}
          {pushState !== 'unsupported' && (
            <div className="nodo-card p-4">
              <p className="nodo-section-label !mb-2">Notificaciones Push</p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {pushState === 'granted'
                    ? <Bell size={16} className="text-nodo-success-tx shrink-0" />
                    : <BellOff size={16} className="text-nodo-dim shrink-0" />
                  }
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-nodo-ink leading-none">
                      {pushState === 'granted' ? 'Activas' : 'Desactivadas'}
                    </p>
                    <p className="text-[11px] text-nodo-sub font-medium mt-1 leading-snug">
                      {pushState === 'granted'
                        ? 'Alertas de stock, órdenes y pedidos.'
                        : pushState === 'denied'
                          ? 'Bloqueadas — habilitá permisos en el navegador.'
                          : 'Activá para recibir alertas.'}
                    </p>
                  </div>
                </div>
                {pushState === 'granted' ? (
                  <button
                    onClick={async () => { await unsubscribe(); toast.success('Notificaciones desactivadas'); }}
                    className="shrink-0 h-8 px-3.5 rounded-full border-2 border-nodo-danger-bd text-nodo-danger-tx text-xs font-bold active:scale-[0.97] transition-transform"
                  >
                    Desactivar
                  </button>
                ) : pushState !== 'denied' ? (
                  <button
                    onClick={async () => {
                      await subscribe();
                      toast.success('Notificaciones activadas');
                    }}
                    disabled={subscribing}
                    className="shrink-0 h-8 px-3.5 rounded-full bg-nodo-ink text-nodo-canvas text-xs font-bold active:scale-[0.97] transition-transform disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {subscribing ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                    Activar
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Privacidad — solo desktop (en mobile va al fondo) */}
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="hidden lg:flex items-center gap-2 text-xs text-nodo-dim hover:text-nodo-sub transition-colors font-medium px-1"
          >
            <ShieldCheck size={13} />
            Política de Privacidad y datos personales
          </button>
        </div>
      </div>

      {/* ── Guardar — sticky: siempre a la mano, sobre el BottomNav en mobile ── */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] lg:bottom-4 z-10">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          {saving
            ? <><Loader2 size={18} className="animate-spin" /> Guardando…</>
            : !dirty
              ? <><Check size={17} /> Sin cambios pendientes</>
              : <><Save size={17} /> Guardar cambios</>
          }
        </button>
      </div>

      {/* Privacidad — mobile */}
      <button
        type="button"
        onClick={() => setShowPrivacy(true)}
        className="lg:hidden flex items-center justify-center gap-2 text-xs text-nodo-dim hover:text-nodo-sub transition-colors font-medium pb-2"
      >
        <ShieldCheck size={13} />
        Política de Privacidad y datos personales
      </button>
    </div>
    </>
  );
}
