import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, LogOut, CheckCircle2 } from "lucide-react"

export function OrgSelector({ onSelect, onLogout }: { onSelect: (org: any) => void, onLogout: () => void }) {
  const organizations = [
    { id: 't1', name: 'Panadería Central', type: 'Bakery', icon: '🍞' },
    { id: 't2', name: 'Sucursal Norte', type: 'Bakery', icon: '🥐' }
  ];

  return (
    <div className="min-h-screen w-full bg-[#D4E9D7] flex flex-col items-center p-6 bg-cover bg-center"
         style={{ backgroundImage: "url('/bg-nodo.png')" }}>
      
      {/* Header del Selector */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-20 bg-white/40 backdrop-blur-md p-4 rounded-3xl">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-[#69E7A8] w-6 h-6 fill-[#69E7A8] stroke-white" />
          <span className="font-black text-[#2D3E35] tracking-tighter">NODO</span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 text-slate-600 hover:text-red-600 font-bold text-[10px] uppercase tracking-widest transition-colors">
          Cerrar Sesión <LogOut size={16} />
        </button>
      </header>

      <div className="max-w-4xl w-full text-center mb-12">
        <h1 className="text-4xl font-black text-[#2D3E35] tracking-tighter mb-2 italic">BIENVENIDO</h1>
        <p className="text-slate-600 font-bold uppercase tracking-[0.2em] text-[10px]">Selecciona la empresa para gestionar</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {organizations.map((org) => (
          <Card 
            key={org.id}
            onClick={() => onSelect(org)}
            className="group cursor-pointer border-none rounded-[45px] bg-white/95 backdrop-blur-md shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
          >
            <CardContent className="p-10 flex flex-col items-center">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner group-hover:scale-110 transition-transform">
                {org.icon}
              </div>
              <h3 className="text-2xl font-black text-[#2D3E35] mb-1">{org.name}</h3>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-6">{org.type}</p>
              <div className="flex items-center gap-2 text-[#69E7A8] font-bold text-sm uppercase tracking-tighter">
                Acceder <ArrowRight size={18} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}