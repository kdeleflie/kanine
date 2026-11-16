import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Settings, 
  FileText, 
  Database,
  PawPrint,
  History,
  ShoppingBag
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string, e?: React.MouseEvent) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', short: 'Dash', icon: LayoutDashboard, accent: 'text-sky-300' },
    { id: 'clients', label: 'Clients', short: 'Clients', icon: Users, accent: 'text-blue-300' },
    { id: 'planning', label: 'Planning', short: 'RDV', icon: Calendar, accent: 'text-violet-300' },
    { id: 'invoices', label: 'Factures', short: 'Fact.', icon: FileText, accent: 'text-amber-300' },
    { id: 'products', label: 'Boutique', short: 'Shop', icon: ShoppingBag, accent: 'text-rose-300' },
    { id: 'config', label: 'Réglages', short: 'Config', icon: Settings, accent: 'text-cyan-300' },
  ];

  const utilityItems = [
    { id: 'audit', label: 'Historique', icon: History, accent: 'text-indigo-300' },
    { id: 'backup', label: 'Sauvegarde', icon: Database, accent: 'text-sky-300' },
  ];

  const allItems = [...menuItems, ...utilityItems];
  const currentItem = allItems.find(i => i.id === activeTab);
  const CurrentIcon = currentItem?.icon || LayoutDashboard;

  const formattedToday = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#f4f7fb]">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-52 bg-gradient-to-b from-[#0b1f3a] via-[#102a50] to-[#09182e] text-slate-300 flex-col no-print shrink-0 border-r border-blue-950/50">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-white/10">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-sky-400 rounded-xl text-white shadow-md shadow-blue-950/60">
            <PawPrint size={19} />
          </div>
          <div className="min-w-0">
            <span className="font-serif text-xl text-white italic block leading-none">Ka'nine</span>
            <span className="text-[10px] text-sky-300/80 font-medium tracking-wide">Salon de toilettage</span>
          </div>
        </div>
        
        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={(e) => setActiveTab(item.id, e)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                  isActive
                  ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-950/40'
                  : 'text-slate-300/80 hover:bg-white/8 hover:text-white'
                }`}
              >
                <item.icon
                  size={16}
                  strokeWidth={isActive ? 2.4 : 2}
                  className={isActive ? 'text-white' : item.accent}
                />
                <span className={`text-xs tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          <div className="pt-2.5 mt-2.5 border-t border-white/10 space-y-1">
            {utilityItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                    isActive
                    ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-950/40'
                    : 'text-slate-300/80 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <item.icon
                    size={16}
                    strokeWidth={isActive ? 2.4 : 2}
                    className={isActive ? 'text-white' : item.accent}
                  />
                  <span className={`text-xs tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="text-[10px] text-center text-sky-200/50 font-medium tracking-wide">
            Ka'nine & Patounes
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f4f7fb] relative pb-16 md:pb-0">
        <header className="h-12 bg-white/95 backdrop-blur-md border-b border-blue-100/80 flex items-center justify-between px-4 md:px-6 no-print shrink-0">
          <div className="flex items-center gap-2 md:hidden">
             <div className="p-1.5 bg-gradient-to-br from-blue-600 to-sky-500 rounded-lg text-white">
                <PawPrint size={14} />
             </div>
             <span className="font-serif text-base tracking-tight text-slate-900 italic">Ka'nine</span>
          </div>

          <div className="hidden md:flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <CurrentIcon size={15} />
            </div>
            <h1 className="text-lg font-serif text-slate-800 tracking-tight">
              {currentItem?.label || activeTab}
            </h1>
          </div>

          <div className="text-xs font-medium text-slate-500 capitalize">
            {formattedToday}
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-3 md:p-5">
          {children}
        </div>

        {/* Bottom Nav - Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-blue-100 flex justify-around p-1.5 no-print z-50">
           {menuItems.map((item) => {
             const isActive = activeTab === item.id;
             return (
               <button
                 key={item.id}
                 onClick={(e) => setActiveTab(item.id, e)}
                 className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all ${
                   isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-400'
                 }`}
               >
                 <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                 <span className="text-[10px] font-bold tracking-tight">{item.short}</span>
               </button>
             );
           })}
        </nav>
      </main>
    </div>
  );
};

export default Layout;
