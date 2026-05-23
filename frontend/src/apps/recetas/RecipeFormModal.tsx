import { ChefHat, Check, Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';

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
