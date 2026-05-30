import { useState, useEffect } from 'react';
import { ChefHat, Check, Loader2, X, ShoppingBag } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';

const ICON_GROUPS = [
  { label: 'Pan',      icons: ['🥖','🍞','🥐','🫓','🥨','🧇','🍩','🧁','🎂','🍰','🥧','🧆','🍪','🍫','🍬','🍮'] },
  { label: 'Bebidas',  icons: ['☕','🍵','🧋','🫖','🥛','🧃','🍶','🍺','🥤','🫗'] },
  { label: 'Cocina',   icons: ['🍳','🥘','🫕','🥗','🍲','🥙','🌮','🫔','🍱','🧂','🫙','🥫'] },
  { label: 'Negocio',  icons: ['🛒','💰','🏷️','📦','🧾','💳','⭐','🎯','🏪','🎪','🎁','🎀'] },
];

export interface RecipeFormValues {
  name: string;
  base_unit: string;
  estimated_yield: number;
  sell_price: number;
  description: string;
  instructions: string;
  bake_temp: string;
  bake_time: string;
  difficulty: string;
  icon: string;
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  values: RecipeFormValues;
  onChange: (patch: Partial<RecipeFormValues>) => void;
  onSubmit: () => void;
  onClose: () => void;
  saving: boolean;
}

const inputCls =
  'w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim';

export function RecipeFormModal({ open, mode, values, onChange, onSubmit, onClose, saving }: Props) {
  const isCreate = mode === 'create';
  const [showIconPicker, setShowIconPicker] = useState(false);

  useEffect(() => { if (!open) setShowIconPicker(false); }, [open]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isCreate ? 'Nueva Receta' : 'Editar Receta'}
      footer={
        <button
          onClick={onSubmit}
          disabled={!values.name.trim() || saving}
          className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : isCreate ? (
            <ChefHat size={18} />
          ) : (
            <Check size={18} />
          )}
          {isCreate ? 'Crear y añadir ingredientes' : 'Guardar cambios'}
        </button>
      }
    >
      <div className="space-y-4">
        {isCreate && (
          <p className="text-xs text-nodo-sub">Los detalles técnicos los puedes añadir después.</p>
        )}

        {/* Icon picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Icono</label>
            {values.icon && (
              <button type="button" onClick={() => { onChange({ icon: '' }); setShowIconPicker(false); }}
                className="flex items-center gap-1 text-[10px] font-bold text-nodo-dim hover:text-nodo-danger-tx transition-colors uppercase tracking-wider">
                <X size={11} /> Quitar
              </button>
            )}
          </div>

          {/* Preview — clickeable para abrir/cerrar picker */}
          <button
            type="button"
            onClick={() => setShowIconPicker(v => !v)}
            className="flex items-center gap-3 mb-3 w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="w-14 h-14 rounded-[18px] bg-nodo-inset flex items-center justify-center text-3xl shrink-0">
              {values.icon || <ShoppingBag size={22} className="text-nodo-dim" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-nodo-ink">{values.icon ? 'Icono seleccionado' : 'Sin icono'}</p>
              <p className="text-[11px] text-nodo-dim mt-0.5">
                {showIconPicker ? 'Se verá en el botón del Mostrador' : 'Toca para seleccionar icono'}
              </p>
            </div>
            <div className={`text-nodo-dim transition-transform duration-200 ${showIconPicker ? 'rotate-180' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </button>

          {/* Picker colapsable */}
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showIconPicker ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-nodo-inset rounded-2xl p-4 space-y-4">
              {ICON_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest mb-2">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.icons.map(emoji => (
                      <button key={emoji} type="button" onClick={() => { onChange({ icon: emoji }); setShowIconPicker(false); }}
                        className={`w-10 h-10 rounded-[13px] flex items-center justify-center text-xl transition-all active:scale-90 ${
                          values.icon === emoji
                            ? 'bg-nodo-ink shadow-md scale-105'
                            : 'bg-nodo-card hover:bg-nodo-raised'
                        }`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Nombre</label>
          <input
            autoFocus={isCreate}
            type="text"
            value={values.name}
            onChange={e => onChange({ name: e.target.value })}
            onKeyDown={e => { if (isCreate && e.key === 'Enter' && values.name.trim()) onSubmit(); }}
            placeholder="Pan Francés"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Rendimiento</label>
            <input
              type="number" min="0.01" step="0.01"
              value={values.estimated_yield}
              onChange={e => onChange({ estimated_yield: parseFloat(e.target.value) || 0 })}
              placeholder="50"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Unidad</label>
            <input
              type="text"
              value={values.base_unit}
              onChange={e => onChange({ base_unit: e.target.value })}
              placeholder="unidades"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Precio de venta (Q por unidad)
          </label>
          <input
            type="number" min="0" step="0.01"
            value={values.sell_price}
            onChange={e => onChange({ sell_price: parseFloat(e.target.value) || 0 })}
            placeholder="1.50"
            className={inputCls}
          />
        </div>

        {!isCreate && (
          <>
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider pt-2">Técnico (opcional)</p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Temp °C</label>
                <input
                  type="number" value={values.bake_temp}
                  onChange={e => onChange({ bake_temp: e.target.value })}
                  placeholder="180" className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Tiempo min</label>
                <input
                  type="number" value={values.bake_time}
                  onChange={e => onChange({ bake_time: e.target.value })}
                  placeholder="25" className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Dificultad</label>
                <select
                  value={values.difficulty}
                  onChange={e => onChange({ difficulty: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  <option value="fácil">Fácil</option>
                  <option value="media">Media</option>
                  <option value="difícil">Difícil</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
                Descripción / Notas
              </label>
              <textarea
                value={values.description}
                onChange={e => onChange({ description: e.target.value })}
                placeholder="Notas generales del producto…"
                rows={2}
                className="w-full px-4 py-3 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors resize-none placeholder:text-nodo-dim"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
                Instrucciones (un paso por línea)
              </label>
              <textarea
                value={values.instructions}
                onChange={e => onChange({ instructions: e.target.value })}
                placeholder={'Mezclar harina con agua\nAmasar 10 minutos\nDejar reposar 1 hora'}
                rows={4}
                className="w-full px-4 py-3 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors resize-none placeholder:text-nodo-dim"
              />
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
