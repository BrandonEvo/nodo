import { useState, useEffect, useRef } from 'react';
import { Search, X, UserPlus, User, Loader2, Phone } from 'lucide-react';
import { importClientesService, type Cliente } from '@/services/import_clientes.service';

interface ClientePickerProps {
  value: Cliente | null;
  onChange: (cliente: Cliente | null) => void;
}

export function ClientePicker({ value, onChange }: ClientePickerProps) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Cliente[]>([]);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen]         = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await importClientesService.list(query.trim() || undefined);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, value]);

  function select(cliente: Cliente) {
    onChange(cliente);
    setOpen(false);
    setQuery('');
  }

  async function createInline() {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const { data } = await importClientesService.create({ name });
      select(data);
    } catch {
      // mantener abierto para reintentar
    } finally {
      setCreating(false);
    }
  }

  // ── Cliente seleccionado ──
  if (value) {
    return (
      <div className="flex items-center gap-3 h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl">
        <span className="w-7 h-7 rounded-full bg-nodo-primary-soft flex items-center justify-center shrink-0">
          <User size={14} className="text-nodo-ink" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-nodo-ink truncate">{value.name}</p>
          {value.phone && (
            <p className="text-[11px] text-nodo-sub font-medium flex items-center gap-1">
              <Phone size={9} /> {value.phone}
            </p>
          )}
        </div>
        <button
          onClick={() => { onChange(null); setOpen(true); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const exactMatch = results.some(c => c.name.toLowerCase() === query.trim().toLowerCase());

  // ── Buscador ──
  return (
    <div className="relative">
      <div className="flex items-center gap-2 h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl focus-within:border-nodo-ink transition-colors">
        <Search size={15} className="text-nodo-dim shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar o crear cliente…"
          className="flex-1 bg-transparent text-sm font-semibold text-nodo-ink outline-none placeholder:text-nodo-dim"
        />
        {loading && <Loader2 size={14} className="animate-spin text-nodo-dim shrink-0" />}
      </div>

      {open && (
        <div className="mt-1.5 max-h-56 overflow-y-auto bg-nodo-card border border-nodo-line rounded-2xl shadow-sm divide-y divide-nodo-line">
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => select(c)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-nodo-inset active:bg-nodo-raised transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-nodo-inset flex items-center justify-center shrink-0">
                <User size={13} className="text-nodo-sub" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-nodo-ink truncate">{c.name}</p>
                {c.phone && <p className="text-[11px] text-nodo-sub truncate">{c.phone}</p>}
              </div>
              {c.cotizaciones_count > 0 && (
                <span className="text-[10px] font-bold text-nodo-dim tabular-nums shrink-0">
                  {c.cotizaciones_count} ped.
                </span>
              )}
            </button>
          ))}

          {query.trim() && !exactMatch && (
            <button
              onClick={createInline}
              disabled={creating}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-nodo-inset active:bg-nodo-raised transition-colors disabled:opacity-50"
            >
              <span className="w-7 h-7 rounded-full bg-nodo-primary-soft flex items-center justify-center shrink-0">
                {creating ? <Loader2 size={13} className="animate-spin text-nodo-ink" /> : <UserPlus size={13} className="text-nodo-ink" />}
              </span>
              <p className="text-sm font-bold text-nodo-ink">
                Crear «<span className="text-nodo-ink">{query.trim()}</span>»
              </p>
            </button>
          )}

          {!loading && results.length === 0 && !query.trim() && (
            <p className="px-4 py-3 text-xs text-nodo-dim font-medium">Escribe para buscar o crear un cliente.</p>
          )}
        </div>
      )}
    </div>
  );
}
