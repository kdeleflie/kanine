import React, { useState, useMemo } from 'react';
import { db } from '../services/database';
import { 
  Users, 
  Calendar as CalendarIcon, 
  Euro, 
  TrendingUp,
  FileSpreadsheet,
  ArrowRight,
  Clock,
  AlertTriangle,
  Scissors,
  ShoppingBag,
  Sparkles,
  Receipt
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

const formatDateLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDurationLabel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};

const Dashboard: React.FC<{
  syncTrigger?: number;
  user?: any;
  onNavigateToClient: (id: string) => void;
  onNavigateToTab: (tab: string) => void;
}> = ({ syncTrigger, user, onNavigateToClient, onNavigateToTab }) => {
  const [clients, setClients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [productInvoices, setProductInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    const [c, a, i, pi] = await Promise.all([
      db.getClients(),
      db.getAppointments(),
      db.getInvoices(),
      db.getProductInvoices()
    ]);
    setClients(c || []);
    setAppointments(a || []);
    setInvoices(i || []);
    setProductInvoices(pi || []);
    setIsLoading(false);
  };

  React.useEffect(() => {
    loadData();
  }, [user, syncTrigger]);
  
  const now = new Date();
  const todayStr = formatDateLocal(now);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3) + 1;

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [periodType, setPeriodType] = useState<'year' | 'quarter' | 'month'>('year');
  const [selectedQuarter, setSelectedQuarter] = useState<number>(currentQuarter);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [activityType, setActivityType] = useState<'grooming' | 'products' | 'all'>('all');

  const groomingInvoices = invoices || [];
  const pInvoices = productInvoices || [];
  
  const allInvoices = activityType === 'all' 
    ? [...groomingInvoices, ...pInvoices] 
    : activityType === 'grooming' 
      ? groomingInvoices 
      : pInvoices;

  const invoiceYears = Array.from(
    new Set([...groomingInvoices, ...pInvoices].map(inv => parseInt((inv.date || '').substring(0, 4))))
  ).filter(y => !isNaN(y));
  const minYear = Math.min(...invoiceYears, currentYear - 5);
  const maxYear = Math.max(...invoiceYears, currentYear + 1);
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    availableYears.push(y);
  }

  const filteredInvoices = allInvoices.filter(inv => {
    if (!inv.date) return false;
    const invYear = parseInt(inv.date.substring(0, 4));
    if (invYear !== selectedYear) return false;

    if (periodType === 'year') return true;

    const invMonth = parseInt(inv.date.substring(5, 7)) - 1;
    if (periodType === 'quarter') {
      const invQuarter = Math.floor(invMonth / 3) + 1;
      return invQuarter === selectedQuarter;
    }
    if (periodType === 'month') {
      return invMonth === selectedMonth;
    }
    return true;
  });

  const periodRevenue = filteredInvoices.reduce((acc, inv) => acc + (inv.amount || 0), 0);
  const yearRevenue = allInvoices
    .filter(inv => (inv.date || '').startsWith(selectedYear.toString()))
    .reduce((acc, inv) => acc + (inv.amount || 0), 0);
  const avgTicket = filteredInvoices.length > 0 ? periodRevenue / filteredInvoices.length : 0;

  const clientsById = useMemo(() => {
    const map = new Map<string, any>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  // Today's & upcoming appointments
  const todayAppointments = useMemo(() => {
    return appointments
      .filter(a => a.date === todayStr && a.status !== 'cancelled' && !a.isBlocked && a.status !== 'blocked')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [appointments, todayStr]);

  const todayTotalMinutes = useMemo(
    () => todayAppointments.reduce((sum, a) => sum + (a.duration || 60), 0),
    [todayAppointments]
  );

  const todayAlertsCount = useMemo(() => {
    return todayAppointments.filter(a => {
      const client = clientsById.get(a.clientId);
      return (client?.particularities?.length || 0) > 0 || Boolean(a.notes?.trim()) || Boolean(client?.notes?.trim());
    }).length;
  }, [todayAppointments, clientsById]);

  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter(a => a.date >= todayStr && a.status !== 'cancelled' && !a.isBlocked && a.status !== 'blocked')
      .sort((a, b) => (a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)))
      .slice(0, 5);
  }, [appointments, todayStr]);

  const pendingTotalCount = useMemo(
    () => appointments.filter(a => a.status === 'pending' && !a.isBlocked).length,
    [appointments]
  );

  // Top services from appointments
  const topServices = useMemo(() => {
    const counts: Record<string, number> = {};
    appointments.forEach(a => {
      if (a.status === 'cancelled' || a.isBlocked || a.status === 'blocked') return;
      const list = Array.isArray(a.services) ? a.services : [];
      list.forEach((s: string) => {
        if (s) counts[s] = (counts[s] || 0) + 1;
      });
    });
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const maxCount = sorted[0]?.[1] || 1;
    return sorted.map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / maxCount) * 100)
    }));
  }, [appointments]);

  // Recent invoices sorted descending
  const recentInvoices = useMemo(() => {
    return [...allInvoices]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 4);
  }, [allInvoices]);

  const chartData = useMemo(() => {
    if (periodType === 'year' || periodType === 'quarter') {
      const monthsData: Record<number, number> = {};
      let startMonth = 0;
      let endMonth = 11;
      if (periodType === 'quarter') {
        startMonth = (selectedQuarter - 1) * 3;
        endMonth = startMonth + 2;
      }
      for (let i = startMonth; i <= endMonth; i++) {
        monthsData[i] = 0;
      }
      filteredInvoices.forEach(inv => {
        const m = parseInt(inv.date.substring(5, 7)) - 1;
        if (m >= startMonth && m <= endMonth) {
          monthsData[m] += inv.amount || 0;
        }
      });
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      return Object.entries(monthsData).map(([m, total]) => ({
        name: monthNames[parseInt(m)],
        total: Math.round(total * 100) / 100
      }));
    } else {
      const daysData: Record<number, number> = {};
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        daysData[i] = 0;
      }
      filteredInvoices.forEach(inv => {
        const d = parseInt(inv.date.substring(8, 10));
        if (daysData[d] !== undefined) {
          daysData[d] += inv.amount || 0;
        }
      });
      return Object.entries(daysData).map(([d, total]) => ({
        name: d,
        total: Math.round(total * 100) / 100
      }));
    }
  }, [filteredInvoices, periodType, selectedQuarter, selectedYear, selectedMonth]);

  const peakEntry = useMemo(() => {
    return chartData.reduce(
      (best, cur) => (cur.total > best.total ? cur : best),
      { name: '-', total: 0 }
    );
  }, [chartData]);

  const exportFinancials = () => {
    const headers = ["ID", "Facture", "Date", "Animal", "Propriétaire", "Soin/Produits", "Montant", "Règlement"];
    const rows = filteredInvoices.map(inv => [
      inv.id,
      inv.number,
      inv.date,
      'petName' in inv ? inv.petName : 'N/A',
      'ownerName' in inv ? inv.ownerName : inv.clientName,
      inv.notes || ('items' in inv ? 'Vente Produits' : 'Soin toilettage'),
      inv.amount.toString(),
      inv.paymentMethod
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(";")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    let periodLabel = selectedYear.toString();
    if (periodType === 'quarter') periodLabel += `_T${selectedQuarter}`;
    if (periodType === 'month') periodLabel += `_M${(selectedMonth + 1).toString().padStart(2, '0')}`;
    
    link.setAttribute("download", `comptabilite_kanine_${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const serviceBarColors = [
    'from-blue-600 to-sky-400',
    'from-violet-600 to-indigo-400',
    'from-amber-500 to-orange-400',
    'from-rose-500 to-pink-400'
  ];

  const paymentConfig = [
    { method: 'Carte', gradient: 'from-blue-600 to-sky-400', dot: 'bg-blue-600' },
    { method: 'Espèces', gradient: 'from-amber-500 to-orange-400', dot: 'bg-amber-500' },
    { method: 'Chèque', gradient: 'from-violet-600 to-indigo-400', dot: 'bg-violet-600' },
    { method: 'Virement', gradient: 'from-rose-500 to-pink-400', dot: 'bg-rose-500' }
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300 max-w-[1600px] mx-auto pb-4">
      {/* Hero Salon Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d2447] via-[#1d4ed8] to-[#0284c7] text-white p-4 md:p-5 shadow-md shadow-blue-900/15">
        <div className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-sky-300/15 pointer-events-none" />
        <div className="absolute right-24 -bottom-16 w-40 h-40 rounded-full bg-indigo-400/15 pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sky-200 text-xs font-medium capitalize">
              <Sparkles size={14} className="text-amber-300 shrink-0" />
              <span>
                {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <h2 className="font-serif text-xl md:text-2xl italic tracking-tight text-white">
              Bonjour, voici le point sur votre salon
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sky-100/90 pt-0.5">
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon size={13} className="text-sky-300" />
                {todayAppointments.length > 0 ? (
                  <>
                    <strong className="font-bold text-white tabular-nums">{todayAppointments.length}</strong> RDV aujourd'hui
                    <span className="opacity-70">({formatDurationLabel(todayTotalMinutes)})</span>
                  </>
                ) : (
                  'Aucun RDV prévu aujourd’hui'
                )}
              </span>
              {todayAlertsCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-amber-200 font-semibold">
                  <AlertTriangle size={13} className="text-amber-300" />
                  <span className="tabular-nums">{todayAlertsCount}</span> vigilance{todayAlertsCount > 1 ? 's' : ''} du jour
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} className="text-sky-300" />
                <strong className="font-bold text-white tabular-nums">{clients.length}</strong> compagnons suivis
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateToTab('planning')}
              className="px-4 py-2 bg-white text-blue-900 rounded-xl font-bold text-xs shadow-sm hover:bg-sky-50 transition-all flex items-center gap-1.5 whitespace-nowrap"
            >
              <CalendarIcon size={14} className="text-blue-600" />
              Ouvrir le planning
            </button>
            <button
              onClick={() => onNavigateToTab('clients')}
              className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
            >
              <Users size={14} />
              Fiches clients
            </button>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-white p-3 rounded-2xl border border-blue-100/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-blue-50/70 p-1 rounded-xl text-[11px] font-semibold border border-blue-100/70">
            <button
              onClick={() => setActivityType('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activityType === 'all' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-blue-700'}`}
            >
              Global
            </button>
            <button
              onClick={() => setActivityType('grooming')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activityType === 'grooming' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-blue-700'}`}
            >
              Services
            </button>
            <button
              onClick={() => setActivityType('products')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activityType === 'products' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-blue-700'}`}
            >
              Boutique
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/70">
            <div className="flex text-[11px] font-semibold">
              <button
                onClick={() => setPeriodType('year')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${periodType === 'year' ? 'bg-white shadow-xs text-blue-700 font-bold border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Année
              </button>
              <button
                onClick={() => setPeriodType('quarter')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${periodType === 'quarter' ? 'bg-white shadow-xs text-blue-700 font-bold border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Trimestre
              </button>
              <button
                onClick={() => setPeriodType('month')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${periodType === 'month' ? 'bg-white shadow-xs text-blue-700 font-bold border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Mois
              </button>
            </div>
            <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="text-xs font-bold text-blue-900 bg-transparent px-2 py-1 outline-none cursor-pointer tabular-nums"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {periodType === 'quarter' && (
            <select 
              value={selectedQuarter} 
              onChange={(e) => setSelectedQuarter(parseInt(e.target.value))}
              className="text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
            >
              <option value={1}>T1 · Jan - Mar</option>
              <option value={2}>T2 · Avr - Jun</option>
              <option value={3}>T3 · Jul - Sep</option>
              <option value={4}>T4 · Oct - Déc</option>
            </select>
          )}

          {periodType === 'month' && (
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
            >
              {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={exportFinancials}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold shadow-xs hover:bg-blue-700 transition-all text-xs tracking-tight w-full lg:w-auto justify-center whitespace-nowrap"
        >
          <FileSpreadsheet size={15} /> Exporter CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-2 ${activityType === 'products' ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-3.5`}>
        {activityType !== 'products' && (
          <>
            <StatCard
              icon={<Users size={18} className="text-white" />}
              label="Clients enregistrés"
              value={isLoading ? '...' : clients.length}
              subLabel={`${clients.filter(c => c.isProfessional).length} pro · ${clients.filter(c => c.species === 'Chien').length} chiens`}
              gradient="from-blue-600 to-blue-500"
              tint="hover:border-blue-300"
              onClick={() => onNavigateToTab('clients')}
            />
            <StatCard
              icon={<CalendarIcon size={18} className="text-white" />}
              label="RDV à venir"
              value={isLoading ? '...' : pendingTotalCount}
              subLabel={todayAppointments.length > 0 ? `${todayAppointments.length} prévu${todayAppointments.length > 1 ? 's' : ''} aujourd'hui` : 'Aucun RDV ce jour'}
              gradient="from-violet-600 to-indigo-500"
              tint="hover:border-violet-300"
              onClick={() => onNavigateToTab('planning')}
            />
          </>
        )}
        <StatCard
          icon={<Euro size={18} className="text-white" />}
          label="Chiffre d'affaires"
          value={isLoading ? '...' : `${periodRevenue.toFixed(2)} €`}
          subLabel={`${filteredInvoices.length} facture${filteredInvoices.length > 1 ? 's' : ''} · moy. ${avgTicket.toFixed(0)} €`}
          gradient="from-sky-500 to-cyan-500"
          tint="hover:border-sky-300"
          onClick={() => onNavigateToTab('invoices')}
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-white" />}
          label={`Total annuel ${selectedYear}`}
          value={isLoading ? '...' : `${yearRevenue.toFixed(2)} €`}
          subLabel={activityType === 'all' ? 'Services + Boutique' : activityType === 'grooming' ? 'Prestations uniquement' : 'Ventes boutique'}
          gradient="from-amber-500 to-orange-500"
          tint="hover:border-amber-300"
          onClick={() => onNavigateToTab('invoices')}
        />
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar Chart */}
        <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-blue-100/80 shadow-xs flex flex-col">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div>
              <h3 className="font-serif text-base text-slate-900">Progression de l'activité</h3>
              <p className="text-[11px] text-slate-500">
                Revenus encaissés sur la période sélectionnée
              </p>
            </div>
            {peakEntry.total > 0 && (
              <div className="text-right bg-amber-50 border border-amber-200/80 px-3 py-1 rounded-xl">
                <span className="text-[10px] font-semibold text-amber-700 block">Pic ({peakEntry.name})</span>
                <span className="text-xs font-bold text-amber-900 tabular-nums">{peakEntry.total.toFixed(2)} €</span>
              </div>
            )}
          </div>

          <div className="flex-1 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="kanineBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                  <linearGradient id="kaninePeakGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#fb923c" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#eff6ff' }}
                  formatter={(value: any) => [`${Number(value).toFixed(2)} €`, 'Montant']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #dbeafe',
                    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.1)',
                    padding: '8px 12px'
                  }}
                  labelStyle={{ fontSize: '12px', fontWeight: '700', color: '#1e3a8a', marginBottom: '2px' }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={38}>
                  {chartData.map((entry, index) => {
                    const isPeak = peakEntry.total > 0 && entry.total === peakEntry.total;
                    const fill = entry.total === 0
                      ? '#e2e8f0'
                      : isPeak
                        ? 'url(#kaninePeakGrad)'
                        : 'url(#kanineBarGrad)';
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Split */}
        <div className="bg-white p-4 rounded-2xl border border-blue-100/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-base text-slate-900">Modes de règlements</h3>
              <p className="text-[11px] text-slate-500">Répartition sur la période</p>
            </div>
          </div>

          <div className="space-y-3.5 flex-1">
            {paymentConfig.map(({ method, gradient, dot }) => {
              const amount = filteredInvoices
                .filter(inv => inv.paymentMethod === method)
                .reduce((acc, inv) => acc + (inv.amount || 0), 0);
              return (
                <PaymentSplit
                  key={method}
                  label={method}
                  value={amount}
                  total={periodRevenue}
                  gradient={gradient}
                  dot={dot}
                />
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-end">
            <div>
              <p className="text-[11px] font-semibold text-slate-400">Total période</p>
              <p className="text-xl font-serif text-slate-900 tabular-nums">{periodRevenue.toFixed(2)} €</p>
            </div>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg tabular-nums">
              {filteredInvoices.length} encaissement{filteredInvoices.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Operational & Insights Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming / Today Appointments */}
        <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-blue-100/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-serif text-base text-slate-900">Prochains passages au salon</h3>
              <p className="text-[11px] text-slate-500">Cliquez sur un compagnon pour ouvrir sa fiche</p>
            </div>
            <button
              onClick={() => onNavigateToTab('planning')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              Tout voir <ArrowRight size={13} />
            </button>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="flex-1 py-8 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
              <CalendarIcon size={26} className="text-blue-300" />
              <p className="text-xs font-medium text-slate-500">Aucun rendez-vous à venir pour le moment</p>
              <button
                onClick={() => onNavigateToTab('planning')}
                className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                Planifier un créneau
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map((appt) => {
                const client = clientsById.get(appt.clientId);
                const hasAlert = (client?.particularities?.length || 0) > 0 || Boolean(appt.notes?.trim()) || Boolean(client?.notes?.trim());
                const isToday = appt.date === todayStr;
                const servicesText = Array.isArray(appt.services) && appt.services.length > 0
                  ? appt.services.join(', ')
                  : 'Soin toilettage';

                return (
                  <div
                    key={appt.id}
                    onClick={() => appt.clientId ? onNavigateToClient(appt.clientId) : onNavigateToTab('planning')}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all cursor-pointer group ${
                      isToday
                        ? 'bg-blue-50/60 border-blue-200/80 hover:bg-blue-50'
                        : 'bg-slate-50/70 border-slate-100 hover:bg-white hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`px-2.5 py-1.5 rounded-lg text-center shrink-0 min-w-[74px] ${
                        isToday ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                      }`}>
                        <span className="block text-[10px] font-bold uppercase leading-tight">
                          {isToday ? "Aujourd'hui" : new Date(`${appt.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                        <span className="block text-xs font-extrabold tabular-nums">{appt.time}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-sm text-slate-900 font-semibold truncate group-hover:text-blue-700 transition-colors">
                            {appt.petName}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate">· {appt.clientName}</span>
                          {hasAlert && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded-md shrink-0" title="Vigilance / Note">
                              <AlertTriangle size={10} /> Vigilance
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1">
                            <Scissors size={11} className="text-blue-500" /> {servicesText}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Clock size={11} className="text-slate-400" /> {formatDurationLabel(appt.duration || 60)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        appt.status === 'invoiced'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-violet-100 text-violet-700'
                      }`}>
                        {appt.status === 'invoiced' ? 'Facturé' : 'Planifié'}
                      </span>
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Prestations & Recent Activity */}
        <div className="bg-white p-4 rounded-2xl border border-blue-100/80 shadow-xs flex flex-col justify-between gap-4">
          {activityType === 'products' ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-base text-slate-900">Dernières ventes boutique</h3>
                <ShoppingBag size={15} className="text-rose-500" />
              </div>
              <div className="space-y-2">
                {filteredInvoices.slice(0, 5).map((inv: any) => (
                  <div
                    key={inv.id}
                    onClick={() => inv.clientId && onNavigateToClient(inv.clientId)}
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-blue-50/60 border border-slate-100 hover:border-blue-200 transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold text-slate-800 truncate">{inv.clientName || 'Client inconnu'}</p>
                      <p className="text-[10px] text-slate-400 tabular-nums">{inv.date}</p>
                    </div>
                    <p className="text-xs font-bold text-blue-600 tabular-nums shrink-0">{(inv.amount || 0).toFixed(2)} €</p>
                  </div>
                ))}
                {filteredInvoices.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-6 text-center">Aucune vente sur cette période</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-serif text-base text-slate-900">Prestations populaires</h3>
                    <p className="text-[11px] text-slate-500">Sur l'ensemble des rendez-vous</p>
                  </div>
                  <Scissors size={15} className="text-blue-600" />
                </div>

                {topServices.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Aucune prestation enregistrée</p>
                ) : (
                  <div className="space-y-2.5">
                    {topServices.map((srv, idx) => (
                      <div key={srv.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700 truncate pr-2">{srv.name}</span>
                          <span className="font-bold text-slate-900 tabular-nums shrink-0">{srv.count} RDV</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${serviceBarColors[idx % serviceBarColors.length]}`}
                            style={{ width: `${srv.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Receipt size={13} className="text-amber-500" /> Dernières factures
                  </span>
                  <button
                    onClick={() => onNavigateToTab('invoices')}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    Factures
                  </button>
                </div>
                <div className="space-y-1.5">
                  {recentInvoices.slice(0, 3).map((inv: any) => (
                    <div
                      key={inv.id}
                      onClick={() => onNavigateToTab('invoices')}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <span className="text-slate-600 truncate pr-2">
                        {'petName' in inv ? inv.petName : inv.clientName}
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums shrink-0">
                        {(inv.amount || 0).toFixed(2)} €
                      </span>
                    </div>
                  ))}
                  {recentInvoices.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic">Aucune facture émise</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, subLabel, gradient, tint, onClick }: any) => (
  <div
    onClick={onClick}
    className={`bg-white p-3.5 rounded-2xl border border-blue-100/80 shadow-xs flex items-center gap-3.5 transition-all hover:shadow-md active:scale-[0.99] group ${tint} ${onClick ? 'cursor-pointer' : ''}`}
  >
    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient} shadow-sm transition-transform group-hover:scale-105 shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-500 truncate">{label}</p>
      <p className="text-xl font-serif text-slate-900 leading-tight tracking-tight tabular-nums mt-0.5">{value}</p>
      {subLabel && (
        <p className="text-[10px] font-medium text-slate-400 truncate mt-0.5">{subLabel}</p>
      )}
    </div>
  </div>
);

const PaymentSplit = ({ label, value, gradient, dot, total }: any) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-700 font-semibold flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dot}`}></span>
          {label}
        </span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="text-[11px] text-slate-400 font-medium">{pct}%</span>
          <span className="text-slate-900 font-bold">{value.toFixed(2)} €</span>
        </div>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default Dashboard;
