import { Card, CardContent } from "@/components/ui/card"
import { Package, Trash2, ChefHat, ShoppingCart, Users, Settings, LogOut, Building2, CheckCircle2 } from "lucide-react"

export function Launcher({ org, onSwitchOrg, onLogout }: any) {
  // Lista maestra de módulos. Se filtrarán según los permisos del Tenant (org).
  const modules = [
    { id: 'inv', title: 'INVENTARIO', desc: 'Stock y materias primas', icon: Package, color: 'text-blue-500' },
    { id: 'mer', title: 'MERMAS', desc: 'Control de desperdicio diario', icon: Trash2, color: 'text-red-500' },
    { id: 'pro', title: 'PRODUCCIÓN', desc: 'Recetas y planes de horneado', icon: ChefHat, color: 'text-amber-500' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8 bg-cover bg-center" style={{ backgroundImage: "url('/bg-nodo-clean.png')" }}>
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12 bg-white/80 backdrop-blur-md p-6 rounded-[35px] shadow-lg">
          <div className="flex items-center gap-4">
            <button onClick={onSwitchOrg} className="p-3 bg-slate-100 hover:bg-[#69E7A8] hover:text-white rounded-2xl transition-all shadow-sm">
              <Building2 size={20} />
            </button>
            <div>
              <h1 className="text-xl font-black text-[#2D3E35] leading-none">{org.name}</h1>
              <p className="text-[10px] font-bold text-[#69E7A8] uppercase tracking-widest mt-1">Socio Activo</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 text-slate-400 hover:text-red-500 font-bold text-[10px] uppercase tracking-widest transition-colors">
            Cerrar Sesión <LogOut size={16} />
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {modules.map((module) => (
            <Card key={module.id} className="group cursor-pointer border-none rounded-[40px] bg-white/90 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300">
              <CardContent className="p-10 flex flex-col items-center text-center">
                <div className={`mb-6 p-5 rounded-3xl bg-slate-50 ${module.color} transition-transform group-hover:scale-110 shadow-inner`}>
                  <module.icon size={44} strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-black text-[#2D3E35] mb-2">{module.title}</h3>
                <p className="text-slate-400 text-xs font-medium leading-relaxed">{module.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}