import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/database';
import { Appointment, Client, Invoice } from '../types';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  Euro,
  X,
  Edit,
  Printer,
  Lock,
  CheckCircle2,
  CalendarDays,
  AlertTriangle
} from 'lucide-react';

import { ConfirmModal } from '../components/ConfirmModal';
import { WarningModal } from '../components/WarningModal';
import { PhotoThumbnail } from '../components/PhotoThumbnail';
import { compressImage } from '../utils/imageCompression';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const formatDateLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseLocalDate = (dateStr: string): Date => new Date(`${dateStr}T12:00:00`);

const timeToMinutes = (time: string): number => {
  const [h, m] = (time || '09:00').split(':').map(Number);
  return (isNaN(h) ? 9 : h) * 60 + (isNaN(m) ? 0 : m);
};

const minutesToTime = (totalMinutes: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatDurationLabel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};

const isBlockedEntry = (appt: Appointment): boolean =>
  Boolean(appt.isBlocked || appt.status === 'blocked');

const HATCHED_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(-45deg, #f8fafc, #f8fafc 6px, #e2e8f0 6px, #e2e8f0 7px)'
};

const HOUR_HEIGHT = 50; // px per hour for Week and Day timelines

interface PlanningProps {
  onPrintInvoice?: (invoice: Invoice) => void;
  user?: any;
  syncTrigger?: number;
}

const Planning: React.FC<PlanningProps> = ({ onPrintInvoice, user, syncTrigger }) => {
  const [view, setView] = useState<'day' | 'week' | 'month' | 'upcoming' | 'past'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Creation / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'appointment' | 'blocked'>('appointment');
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [prefillDate, setPrefillDate] = useState<string>(() => formatDateLocal(new Date()));
  const [prefillTime, setPrefillTime] = useState<string>('09:00');
  const [blockTitle, setBlockTitle] = useState<string>('RDV perso');
  const [blockAllDay, setBlockAllDay] = useState<boolean>(false);
  const [modalDuration, setModalDuration] = useState<number>(60);
  const [modalTime, setModalTime] = useState<string>('09:00');

  // Quick Invoice modal state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState('50');
  const [invoiceDate, setInvoiceDate] = useState(() => formatDateLocal(new Date()));
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceService, setInvoiceService] = useState('');
  const [isCustomService, setIsCustomService] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Invoice['paymentMethod']>('Carte');

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [warningState, setWarningState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const config = db.getConfig();
  const todayStr = formatDateLocal(new Date());

  const refreshData = async () => {
    setAppointments(await db.getAppointments());
    setClients(await db.getClients());
  };

  useEffect(() => {
    refreshData();
  }, [user, syncTrigger]);

  const dateStr = formatDateLocal(currentDate);

  const clientsById = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [clients]
  );

  const getApptAlerts = (appt: Appointment) => {
    if (isBlockedEntry(appt)) {
      return {
        hasAlert: false,
        particularities: [] as string[],
        clientNote: '',
        apptNote: '',
        summary: ''
      };
    }
    const client = clientsById.get(appt.clientId);
    const particularities = client?.particularities?.filter(Boolean) || [];
    const clientNote = client?.notes?.trim() || '';
    const apptNote = appt.notes?.trim() || '';
    const hasAlert = particularities.length > 0 || Boolean(clientNote) || Boolean(apptNote);

    const parts: string[] = [];
    if (particularities.length > 0) parts.push(particularities.join(', '));
    if (apptNote) parts.push(apptNote);
    else if (clientNote) parts.push(clientNote);

    return {
      hasAlert,
      particularities,
      clientNote,
      apptNote,
      summary: parts.join(' · ')
    };
  };

  // Daily summary metrics (for viewed day in Day view, or Today in other views)
  const summaryDateStr = view === 'day' ? dateStr : todayStr;
  const dailySummary = useMemo(() => {
    const dayItems = appointments.filter(
      a => a.date === summaryDateStr && a.status !== 'cancelled'
    );
    const clientAppts = dayItems.filter(a => !isBlockedEntry(a));
    const blockedSlots = dayItems.filter(a => isBlockedEntry(a));
    const totalMinutes = clientAppts.reduce((sum, a) => sum + (a.duration || 60), 0);
    const invoicedCount = clientAppts.filter(a => a.status === 'invoiced').length;
    const pendingCount = clientAppts.length - invoicedCount;
    const alertCount = clientAppts.filter(a => getApptAlerts(a).hasAlert).length;

    return {
      totalAppts: clientAppts.length,
      totalMinutes,
      invoicedCount,
      pendingCount,
      blockedCount: blockedSlots.length,
      alertCount
    };
  }, [appointments, summaryDateStr, clientsById]);

  // Week days (Monday -> Sunday) for currentDate
  const weekDays = useMemo(() => {
    const base = new Date(currentDate);
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diffToMonday);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return {
        date: d,
        dateStr: formatDateLocal(d)
      };
    });
  }, [currentDate]);

  // Month calendar cells (Monday-first, full weeks covering the month)
  const monthCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstDayIdx = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const leadingDays = firstDayIdx === 0 ? 6 : firstDayIdx - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

    const cells: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, month, 1 - leadingDays + i);
      cells.push({
        date: d,
        dateStr: formatDateLocal(d),
        isCurrentMonth: d.getMonth() === month
      });
    }
    return cells;
  }, [currentDate]);

  // Dynamic timeline hour bounds (default 08:00 -> 20:00, expands if needed)
  const { startHour, endHour } = useMemo(() => {
    let minH = 8;
    let maxH = 20;
    const visibleDates =
      view === 'week' ? new Set(weekDays.map(w => w.dateStr)) : new Set([dateStr]);

    appointments.forEach(a => {
      if (a.status === 'cancelled' || !visibleDates.has(a.date)) return;
      const startMin = timeToMinutes(a.time);
      const endMin = startMin + (a.duration || 60);
      minH = Math.min(minH, Math.floor(startMin / 60));
      maxH = Math.max(maxH, Math.ceil(endMin / 60));
    });
    return { startHour: Math.max(6, minH), endHour: Math.min(23, maxH) };
  }, [appointments, view, weekDays, dateStr]);

  const timelineHours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h < endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const checkOverlap = (date: string, time: string, duration: number, excludeId?: string) => {
    const newStart = new Date(`${date}T${time}`).getTime();
    const newEnd = newStart + duration * 60000;

    return appointments.find(appt => {
      if (appt.id === excludeId) return false;
      if (appt.date !== date || appt.status === 'cancelled') return false;
      const existStart = new Date(`${appt.date}T${appt.time}`).getTime();
      const existEnd = existStart + (appt.duration || 60) * 60000;
      return newStart < existEnd && newEnd > existStart;
    });
  };

  const openCreateModal = (
    mode: 'appointment' | 'blocked' = 'appointment',
    targetDate?: string,
    targetTime?: string
  ) => {
    const chosenDate = targetDate || dateStr;
    const chosenTime = targetTime || '09:00';
    setEditingAppt(null);
    setModalMode(mode);
    setPrefillDate(chosenDate);
    setPrefillTime(chosenTime);
    setModalTime(chosenTime);
    setModalDuration(60);
    setBlockTitle('RDV perso');
    setBlockAllDay(false);
    setIsModalOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    const blocked = isBlockedEntry(appt);
    setEditingAppt(appt);
    setModalMode(blocked ? 'blocked' : 'appointment');
    setPrefillDate(appt.date);
    setPrefillTime(appt.time);
    setModalTime(appt.time);
    setModalDuration(appt.duration || 60);
    setBlockTitle(blocked ? appt.petName || 'Indisponible' : 'RDV perso');
    setBlockAllDay(blocked && appt.time === '08:00' && (appt.duration || 0) >= 660);
    setIsModalOpen(true);
  };

  const openInvoiceModalForAppt = (appt: Appointment) => {
    setSelectedAppt(appt);
    setInvoiceAmount('50');
    setInvoiceDate(formatDateLocal(new Date()));
    setInvoiceService(
      appt.services && Array.isArray(appt.services)
        ? appt.services.join(', ')
        : (appt as any).service || ''
    );
    setInvoiceNotes('');
    setIsCustomService(false);
    setIsInvoiceModalOpen(true);
  };

  const handleDeleteRequest = (appt: Appointment, closeEditModalAfter = false) => {
    const blocked = isBlockedEntry(appt);
    setConfirmState({
      isOpen: true,
      title: blocked ? 'Libérer le créneau' : 'Supprimer le rendez-vous',
      message: blocked
        ? `Voulez-vous supprimer le créneau bloqué "${appt.petName || 'Indisponible'}" du ${parseLocalDate(appt.date).toLocaleDateString('fr-FR')} à ${appt.time} ?`
        : `Voulez-vous supprimer le rendez-vous de ${appt.petName} du ${parseLocalDate(appt.date).toLocaleDateString('fr-FR')} à ${appt.time} ?`,
      onConfirm: async () => {
        await db.deleteAppointment(appt.id);
        await refreshData();
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        if (closeEditModalAfter) {
          setIsModalOpen(false);
          setEditingAppt(null);
        }
      }
    });
  };

  const handleSaveAppt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const date = formData.get('date') as string;
    const time =
      blockAllDay && modalMode === 'blocked' ? '08:00' : (formData.get('time') as string);
    const parsedDuration = parseInt(formData.get('duration') as string, 10);
    const duration =
      blockAllDay && modalMode === 'blocked'
        ? 720
        : isNaN(parsedDuration) || parsedDuration < 15
          ? 60
          : parsedDuration;
    const notes = (formData.get('notes') as string) || '';
    const id = editingAppt ? editingAppt.id : generateId();

    const conflict = checkOverlap(date, time, duration, id);
    if (conflict) {
      const conflictIsBlocked = isBlockedEntry(conflict);
      setWarningState({
        isOpen: true,
        title: 'Conflit détecté',
        message: conflictIsBlocked
          ? `Ce créneau chevauche un blocage "${conflict.petName || 'Indisponible'}" à ${conflict.time} (durée ${conflict.duration}min). Veuillez choisir un autre créneau.`
          : `Déjà un rendez-vous sur ce créneau horaire pour ${conflict.petName} à ${conflict.time} (durée ${conflict.duration}min). Veuillez choisir un autre créneau.`
      });
      return;
    }

    let newAppt: Appointment;

    if (modalMode === 'blocked') {
      const cleanMotif = blockTitle.trim() || 'Indisponible';
      newAppt = {
        id,
        date,
        time,
        clientId: '',
        clientName: 'Créneau bloqué',
        petName: cleanMotif,
        services: [],
        notes,
        duration,
        status: 'blocked',
        isBlocked: true
      };
    } else {
      const clientId = formData.get('client') as string;
      if (!clientId) return;
      const client = clients.find(c => c.id === clientId);
      if (!client) return;

      const previousStatus =
        editingAppt && !isBlockedEntry(editingAppt) ? editingAppt.status : 'pending';

      newAppt = {
        id,
        date,
        time,
        clientId: client.id,
        clientName: client.ownerName,
        petName: client.name,
        services: Array.from(formData.getAll('services')) as string[],
        notes,
        duration,
        status: previousStatus,
        isBlocked: false,
        photoBefore: editingAppt?.photoBefore,
        photoAfter: editingAppt?.photoAfter
      };
    }

    if (await db.saveAppointment(newAppt)) {
      await refreshData();
      setIsModalOpen(false);
      setEditingAppt(null);
    } else {
      setWarningState({
        isOpen: true,
        title: 'Mémoire Saturée',
        message: "Impossible d'enregistrer le créneau. L'espace de stockage est plein."
      });
    }
  };

  const handleConfirmInvoice = async () => {
    if (!selectedAppt) return;
    const finalServices = invoiceService
      ? invoiceService
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : selectedAppt.services && Array.isArray(selectedAppt.services)
        ? selectedAppt.services
        : (selectedAppt as any).service
          ? [(selectedAppt as any).service]
          : [];

    const amountVal = parseFloat(invoiceAmount) || 0;
    const newInvoice: Invoice = {
      id: generateId(),
      number: db.getNextInvoiceNumber(invoiceDate),
      date: invoiceDate,
      clientId: selectedAppt.clientId,
      petName: selectedAppt.petName,
      ownerName: selectedAppt.clientName,
      amount: amountVal,
      paymentMethod,
      appointmentId: selectedAppt.id,
      notes: invoiceNotes || selectedAppt.notes,
      items:
        finalServices.length > 0
          ? finalServices.map(s => ({ description: s, amount: amountVal / finalServices.length }))
          : [{ description: 'Toilettage', amount: amountVal }],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isProfessional: clients.find(c => c.id === selectedAppt.clientId)?.isProfessional
    };

    await db.saveInvoice(newInvoice);
    await db.saveAppointment({ ...selectedAppt, status: 'invoiced' });
    await refreshData();
    setIsInvoiceModalOpen(false);
    setConfirmState({
      isOpen: true,
      title: 'Facture émise',
      message: "La facture a bien été générée. Voulez-vous l'imprimer maintenant ?",
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        onPrintInvoice?.(newInvoice);
      }
    });
  };

  const navigatePeriod = (direction: -1 | 1) => {
    const d = new Date(currentDate);
    if (view === 'day') {
      d.setDate(d.getDate() + direction);
    } else if (view === 'week') {
      d.setDate(d.getDate() + direction * 7);
    } else if (view === 'month') {
      d.setMonth(d.getMonth() + direction);
    }
    setCurrentDate(d);
  };

  const renderPeriodTitle = () => {
    if (view === 'day') {
      return parseLocalDate(dateStr).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    if (view === 'week') {
      const start = weekDays[0].date;
      const end = weekDays[6].date;
      const sameMonth = start.getMonth() === end.getMonth();
      if (sameMonth) {
        return `${start.getDate()} – ${end.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })}`;
      }
      return `${start.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short'
      })} – ${end.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })}`;
    }
    return currentDate.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>, targetDateStr: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = Math.max(0, e.clientY - rect.top);
    const totalMinutesFromStart = (offsetY / HOUR_HEIGHT) * 60;
    const snappedHalfHour = Math.floor(totalMinutesFromStart / 30) * 30;
    const clickedTime = minutesToTime(startHour * 60 + snappedHalfHour);
    openCreateModal('appointment', targetDateStr, clickedTime);
  };

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPx = ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
  const showNowLine = nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  return (
    <div className="space-y-3 animate-in fade-in duration-300 max-w-[1600px] mx-auto pb-6">
      {/* Header & Navigation */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-50 p-1 rounded-xl font-bold border border-slate-100 shadow-inner overflow-x-auto max-w-full">
            {(
              [
                { id: 'day', label: 'Jour' },
                { id: 'week', label: 'Semaine' },
                { id: 'month', label: 'Mois' },
                { id: 'upcoming', label: 'À venir' },
                { id: 'past', label: 'Historique' }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap shrink-0 ${
                  view === tab.id
                    ? 'bg-white shadow-sm text-blue-600 border border-blue-50'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(view === 'day' || view === 'week' || view === 'month') && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigatePeriod(-1)}
                aria-label="Période précédente"
                className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg transition-colors border border-slate-100 shrink-0"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 bg-slate-50 rounded-lg transition-colors border border-slate-100 whitespace-nowrap shrink-0"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => navigatePeriod(1)}
                aria-label="Période suivante"
                className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg transition-colors border border-slate-100 shrink-0"
              >
                <ChevronRight size={15} />
              </button>
              <h2 className="font-serif text-base sm:text-lg text-slate-800 italic px-1.5 capitalize whitespace-nowrap">
                {renderPeriodTitle()}
              </h2>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 w-full xl:w-auto justify-end">
          <button
            onClick={() => openCreateModal('blocked')}
            className="px-3 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs tracking-tight hover:bg-slate-200 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Lock size={13} /> Bloquer créneau
          </button>
          <button
            onClick={() => openCreateModal('appointment')}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs tracking-tight hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
          >
            <Plus size={15} /> Nouveau RDV
          </button>
        </div>
      </div>

      {/* Résumé du jour en haut */}
      <div className="bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="font-serif text-sm text-slate-900 italic capitalize">
            {view === 'day'
              ? `Résumé du ${parseLocalDate(summaryDateStr).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}`
              : `Aujourd'hui · ${parseLocalDate(summaryDateStr).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}`}
          </span>
          <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
            |
          </span>
          <span className="font-bold text-blue-700 tabular-nums">
            {dailySummary.totalAppts} rendez-vous
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-slate-600 font-medium tabular-nums">
            {dailySummary.totalMinutes > 0
              ? `${formatDurationLabel(dailySummary.totalMinutes)} de toilettage`
              : 'Aucun soin prévu'}
          </span>
          {dailySummary.totalAppts > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600 font-medium inline-flex items-center gap-1.5 tabular-nums">
                <CheckCircle2 size={13} className="text-blue-600 shrink-0" />
                {dailySummary.invoicedCount} facturé{dailySummary.invoicedCount > 1 ? 's' : ''}
                {dailySummary.pendingCount > 0 && ` · ${dailySummary.pendingCount} à facturer`}
              </span>
            </>
          )}
          {dailySummary.alertCount > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-amber-700 font-semibold inline-flex items-center gap-1 tabular-nums">
                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                {dailySummary.alertCount} alerte{dailySummary.alertCount > 1 ? 's' : ''} vigilance
              </span>
            </>
          )}
          {dailySummary.blockedCount > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-500 font-medium inline-flex items-center gap-1 tabular-nums">
                <Lock size={12} className="shrink-0" />
                {dailySummary.blockedCount} créneau{dailySummary.blockedCount > 1 ? 'x' : ''} bloqué
                {dailySummary.blockedCount > 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>

        {view !== 'day' && (
          <button
            type="button"
            onClick={() => {
              setCurrentDate(new Date());
              setView('day');
            }}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Voir la journée →
          </button>
        )}
      </div>

      {/* VUE SEMAINE (Grille horaire proportionnelle) */}
      {view === 'week' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              {/* En-tête des 7 jours */}
              <div className="grid grid-cols-[68px_repeat(7,1fr)] border-b border-slate-100 bg-slate-50/70">
                <div className="p-3 border-r border-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Heure
                </div>
                {weekDays.map(({ date, dateStr: colDateStr }) => {
                  const isToday = colDateStr === todayStr;
                  const dayItems = appointments.filter(
                    a => a.date === colDateStr && a.status !== 'cancelled'
                  );
                  const clientCount = dayItems.filter(a => !isBlockedEntry(a)).length;
                  const blockedCount = dayItems.filter(a => isBlockedEntry(a)).length;

                  return (
                    <button
                      key={colDateStr}
                      type="button"
                      onClick={() => {
                        setCurrentDate(date);
                        setView('day');
                      }}
                      className={`p-3 border-r last:border-r-0 border-slate-100 text-left transition-colors hover:bg-white ${
                        isToday ? 'bg-blue-50/70' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider ${
                            isToday ? 'text-blue-700' : 'text-slate-400'
                          }`}
                        >
                          {date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                        </span>
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold tabular-nums ${
                            isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-800'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 truncate tabular-nums">
                        {clientCount > 0 ? `${clientCount} RDV` : 'Libre'}
                        {blockedCount > 0 ? ` · ${blockedCount} bloq.` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Corps de la timeline */}
              <div
                className="grid grid-cols-[68px_repeat(7,1fr)] relative"
                style={{ height: `${timelineHours.length * HOUR_HEIGHT}px` }}
              >
                {/* Colonne des heures */}
                <div className="border-r border-slate-100 bg-slate-50/30 relative select-none">
                  {timelineHours.map(h => (
                    <div
                      key={h}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="border-b border-slate-100 px-2 pt-1 text-right"
                    >
                      <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                        {`${String(h).padStart(2, '0')}:00`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Colonnes des 7 jours */}
                {weekDays.map(({ dateStr: colDateStr }) => {
                  const isToday = colDateStr === todayStr;
                  const dayItems = appointments
                    .filter(a => a.date === colDateStr && a.status !== 'cancelled')
                    .sort((a, b) => a.time.localeCompare(b.time));

                  return (
                    <div
                      key={colDateStr}
                      onClick={e => handleTimelineClick(e, colDateStr)}
                      className={`relative border-r last:border-r-0 border-slate-100 cursor-pointer group ${
                        isToday ? 'bg-blue-50/15' : 'hover:bg-slate-50/40'
                      }`}
                    >
                      {/* Lignes horaires et demi-heures */}
                      {timelineHours.map(h => (
                        <div
                          key={h}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                          className="border-b border-slate-100 relative pointer-events-none"
                        >
                          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100/80" />
                        </div>
                      ))}

                      {/* Ligne de l'heure actuelle */}
                      {isToday && showNowLine && (
                        <div
                          style={{ top: `${nowTopPx}px` }}
                          className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                        >
                          <span className="w-2 h-2 rounded-full bg-rose-500 -ml-1 shrink-0" />
                          <div className="h-[2px] flex-1 bg-rose-500/80" />
                        </div>
                      )}

                      {/* Blocs proportionnels RDV & Créneaux bloqués */}
                      {dayItems.map(appt => {
                        const startMin = timeToMinutes(appt.time);
                        const duration = appt.duration || 60;
                        const topPx = Math.max(
                          0,
                          ((startMin - startHour * 60) / 60) * HOUR_HEIGHT
                        );
                        const heightPx = Math.max((duration / 60) * HOUR_HEIGHT - 2, 26);
                        const blocked = isBlockedEntry(appt);
                        const invoiced = appt.status === 'invoiced';
                        const endTime = minutesToTime(startMin + duration);
                        const alertInfo = getApptAlerts(appt);
                        const servicesText =
                          appt.services && Array.isArray(appt.services) && appt.services.length > 0
                            ? appt.services.join(', ')
                            : (appt as any).service || '';

                        return (
                          <div
                            key={appt.id}
                            onClick={e => {
                              e.stopPropagation();
                              openEditModal(appt);
                            }}
                            style={{
                              top: `${topPx + 1}px`,
                              height: `${heightPx}px`,
                              ...(blocked ? HATCHED_BG_STYLE : {})
                            }}
                            title={
                              blocked
                                ? `${appt.time} - ${endTime} · Créneau bloqué : ${appt.petName}`
                                : `${appt.time} - ${endTime} · ${appt.petName} (${appt.clientName})${
                                    alertInfo.hasAlert ? ` · Vigilance : ${alertInfo.summary}` : ''
                                  }`
                            }
                            className={`absolute inset-x-1 z-10 rounded-xl px-2.5 py-1.5 border overflow-hidden cursor-pointer transition-all shadow-xs hover:shadow-md flex flex-col justify-start ${
                              blocked
                                ? 'border-slate-300 text-slate-700 hover:border-slate-400'
                                : invoiced
                                  ? 'bg-sky-50/90 border-sky-200 text-slate-800 hover:border-sky-400'
                                  : 'bg-blue-50/95 border-blue-200 text-blue-950 hover:border-blue-400'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-bold tabular-nums leading-tight">
                              <span className="flex items-center gap-1 truncate">
                                {blocked && <Lock size={10} className="shrink-0 text-slate-500" />}
                                {appt.time}
                                {heightPx >= 44 ? ` – ${endTime}` : ''}
                              </span>
                              <span className="flex items-center gap-1 shrink-0">
                                {alertInfo.hasAlert && (
                                  <AlertTriangle
                                    size={11}
                                    className="text-amber-600 shrink-0"
                                  />
                                )}
                                {invoiced && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-700 bg-white/85 border border-blue-200/80 px-1 py-0.2 rounded">
                                    <CheckCircle2 size={9} className="text-blue-600" />
                                    {heightPx >= 44 && <span>Payé</span>}
                                  </span>
                                )}
                              </span>
                            </div>
                            <p className="text-xs font-bold leading-snug truncate mt-0.5">
                              {appt.petName}
                            </p>
                            {heightPx >= 52 && (
                              <p
                                className={`text-[10px] truncate leading-tight mt-0.5 ${
                                  alertInfo.hasAlert ? 'text-amber-700 font-semibold' : 'opacity-75'
                                }`}
                              >
                                {blocked
                                  ? appt.notes || 'Indisponible'
                                  : alertInfo.hasAlert
                                    ? alertInfo.summary
                                    : `${appt.clientName}${servicesText ? ` · ${servicesText}` : ''}`}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VUE MOIS (Vraie grille calendaire) */}
      {view === 'month' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="calendar-grid border-b border-slate-100 bg-slate-50/70">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(dayLabel => (
              <div
                key={dayLabel}
                className="py-3 px-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider border-r last:border-r-0 border-slate-100"
              >
                {dayLabel}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {monthCells.map(({ date, dateStr: cellDateStr, isCurrentMonth }) => {
              const isToday = cellDateStr === todayStr;
              const dayItems = appointments
                .filter(a => a.date === cellDateStr && a.status !== 'cancelled')
                .sort((a, b) => a.time.localeCompare(b.time));
              const visibleItems = dayItems.slice(0, 3);
              const overflowCount = dayItems.length - visibleItems.length;
              const clientApptCount = dayItems.filter(a => !isBlockedEntry(a)).length;

              return (
                <div
                  key={cellDateStr}
                  onClick={() => openCreateModal('appointment', cellDateStr, '09:00')}
                  className={`min-h-[104px] p-1.5 border-r border-b border-slate-100 flex flex-col gap-1 cursor-pointer transition-colors group ${
                    isCurrentMonth
                      ? isToday
                        ? 'bg-blue-50/25 hover:bg-blue-50/40'
                        : 'bg-white hover:bg-slate-50/60'
                      : 'bg-slate-50/50 text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setCurrentDate(date);
                        setView('day');
                      }}
                      title="Ouvrir la vue Jour"
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums transition-colors ${
                        isToday
                          ? 'bg-blue-600 text-white shadow-sm'
                          : isCurrentMonth
                            ? 'text-slate-700 hover:bg-slate-100'
                            : 'text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {date.getDate()}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {clientApptCount > 0 && (
                        <span className="text-[10px] font-medium text-slate-400 tabular-nums">
                          {clientApptCount} RDV
                        </span>
                      )}
                      <span className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-blue-600 transition-opacity">
                        <Plus size={12} />
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 flex-1">
                    {visibleItems.map(appt => {
                      const blocked = isBlockedEntry(appt);
                      const invoiced = appt.status === 'invoiced';
                      const alertInfo = getApptAlerts(appt);
                      return (
                        <button
                          key={appt.id}
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            openEditModal(appt);
                          }}
                          style={blocked ? HATCHED_BG_STYLE : undefined}
                          title={
                            alertInfo.hasAlert
                              ? `${appt.time} ${appt.petName} · Vigilance : ${alertInfo.summary}`
                              : `${appt.time} ${appt.petName}`
                          }
                          className={`w-full text-left px-2 py-1 rounded-lg border text-[11px] flex items-center justify-between gap-1.5 transition-all truncate ${
                            blocked
                              ? 'border-slate-300 text-slate-700 hover:border-slate-400'
                              : invoiced
                                ? 'bg-sky-50 border-sky-200 text-slate-800 hover:border-sky-400'
                                : 'bg-blue-50 border-blue-200 text-blue-950 hover:border-blue-400'
                          }`}
                        >
                          <span className="flex items-center gap-1 truncate">
                            {blocked && <Lock size={10} className="shrink-0 text-slate-500" />}
                            <span className="font-bold tabular-nums shrink-0">{appt.time}</span>
                            <span className="truncate font-medium">{appt.petName}</span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {alertInfo.hasAlert && (
                              <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                            )}
                            {invoiced && (
                              <CheckCircle2 size={10} className="shrink-0 text-blue-600" />
                            )}
                          </span>
                        </button>
                      );
                    })}

                    {overflowCount > 0 && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setCurrentDate(date);
                          setView('day');
                        }}
                        className="w-full text-left px-2 py-0.5 text-[10px] font-bold text-blue-600 hover:text-blue-700"
                      >
                        +{overflowCount} autre{overflowCount > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VUE JOUR (Timeline proportionnelle + fiches détaillées) */}
      {view === 'day' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 h-fit lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-base text-slate-700">Agenda du jour</h3>
              <span className="text-[10px] text-slate-400 font-medium">Cliquer pour réserver</span>
            </div>

            <div
              className="grid grid-cols-[52px_1fr] relative border border-slate-100 rounded-xl overflow-hidden"
              style={{ height: `${timelineHours.length * HOUR_HEIGHT}px` }}
            >
              <div className="border-r border-slate-100 bg-slate-50/40 select-none">
                {timelineHours.map(h => (
                  <div
                    key={h}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    className="border-b border-slate-100 px-2 pt-1 text-right"
                  >
                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                      {`${String(h).padStart(2, '0')}:00`}
                    </span>
                  </div>
                ))}
              </div>

              <div
                onClick={e => handleTimelineClick(e, dateStr)}
                className="relative cursor-pointer hover:bg-slate-50/30"
              >
                {timelineHours.map(h => (
                  <div
                    key={h}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    className="border-b border-slate-100 relative pointer-events-none"
                  >
                    <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100/80" />
                  </div>
                ))}

                {dateStr === todayStr && showNowLine && (
                  <div
                    style={{ top: `${nowTopPx}px` }}
                    className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 -ml-1 shrink-0" />
                    <div className="h-[2px] flex-1 bg-rose-500/80" />
                  </div>
                )}

                {appointments
                  .filter(a => a.date === dateStr && a.status !== 'cancelled')
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map(appt => {
                    const startMin = timeToMinutes(appt.time);
                    const duration = appt.duration || 60;
                    const topPx = Math.max(
                      0,
                      ((startMin - startHour * 60) / 60) * HOUR_HEIGHT
                    );
                    const heightPx = Math.max((duration / 60) * HOUR_HEIGHT - 2, 28);
                    const blocked = isBlockedEntry(appt);
                    const invoiced = appt.status === 'invoiced';
                    const endTime = minutesToTime(startMin + duration);
                    const alertInfo = getApptAlerts(appt);

                    return (
                      <div
                        key={appt.id}
                        onClick={e => {
                          e.stopPropagation();
                          openEditModal(appt);
                        }}
                        style={{
                          top: `${topPx + 1}px`,
                          height: `${heightPx}px`,
                          ...(blocked ? HATCHED_BG_STYLE : {})
                        }}
                        className={`absolute inset-x-1.5 z-10 rounded-xl px-3 py-1.5 border overflow-hidden cursor-pointer transition-all shadow-xs hover:shadow-md ${
                          blocked
                            ? 'border-slate-300 text-slate-700'
                            : invoiced
                              ? 'bg-sky-50 border-sky-200 text-slate-800'
                              : 'bg-blue-50 border-blue-200 text-blue-950'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold tabular-nums">
                          <span className="flex items-center gap-1">
                            {blocked && <Lock size={10} className="text-slate-500" />}
                            {appt.time} – {endTime}
                          </span>
                          <span className="flex items-center gap-1">
                            {alertInfo.hasAlert && (
                              <AlertTriangle size={11} className="text-amber-600" />
                            )}
                            {invoiced && <CheckCircle2 size={11} className="text-blue-600" />}
                          </span>
                        </div>
                        <p className="text-xs font-bold truncate mt-0.5">{appt.petName}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-serif text-lg text-slate-700 px-2 italic">Détails de la journée</h3>

            {appointments.filter(a => a.date === dateStr && a.status !== 'cancelled').length ===
            0 ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-100 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-100">
                  <CalendarDays size={22} />
                </div>
                <div>
                  <p className="font-serif text-lg text-slate-700">Aucun créneau planifié ce jour</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Cliquez sur un créneau dans l'agenda ou utilisez les boutons ci-dessous.
                  </p>
                </div>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => openCreateModal('appointment', dateStr, '09:00')}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    Ajouter un RDV
                  </button>
                  <button
                    onClick={() => openCreateModal('blocked', dateStr, '09:00')}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                  >
                    Bloquer un créneau
                  </button>
                </div>
              </div>
            ) : (
              appointments
                .filter(a => a.date === dateStr && a.status !== 'cancelled')
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(appt => {
                  const blocked = isBlockedEntry(appt);
                  const endTime = minutesToTime(timeToMinutes(appt.time) + (appt.duration || 60));
                  const alertInfo = getApptAlerts(appt);

                  if (blocked) {
                    return (
                      <div
                        key={appt.id}
                        style={HATCHED_BG_STYLE}
                        className="p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2.5"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-700 text-white rounded-xl flex items-center justify-center">
                              <Lock size={16} />
                            </div>
                            <div>
                              <h4 className="font-serif text-base text-slate-900 leading-tight">
                                {appt.petName || 'Créneau bloqué'}
                              </h4>
                              <p className="text-xs font-medium text-slate-500 tabular-nums mt-0.5">
                                Créneau bloqué · {appt.time} – {endTime} ·{' '}
                                {formatDurationLabel(appt.duration || 60)}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => openEditModal(appt)}
                              className="p-2 bg-white text-slate-500 hover:text-slate-900 rounded-xl border border-slate-200 transition-all"
                            >
                              <Edit size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteRequest(appt)}
                              className="p-2 bg-white text-slate-500 hover:text-red-500 rounded-xl border border-slate-200 transition-all"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        {appt.notes && (
                          <p className="text-xs text-slate-600 bg-white/80 px-3 py-2 rounded-xl border border-slate-200/70">
                            {appt.notes}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={appt.id}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0b1f3a] text-white rounded-xl flex items-center justify-center font-bold text-xs tabular-nums">
                            {appt.time}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-serif text-lg text-slate-900 leading-tight">
                                {appt.petName}
                              </h4>
                              {appt.status === 'invoiced' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                  <CheckCircle2 size={11} className="text-blue-600" /> Facture payée
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-slate-400">
                              {appt.clientName} · {appt.time} – {endTime} ·{' '}
                              {formatDurationLabel(appt.duration || 60)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(appt)}
                            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteRequest(appt)}
                            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 font-medium flex items-center gap-2 flex-wrap">
                        <span className="text-blue-700 font-semibold">
                          {appt.services && Array.isArray(appt.services) && appt.services.length > 0
                            ? appt.services.join(', ')
                            : (appt as any).service || 'Prestation'}
                        </span>
                      </div>

                      {/* Alerte visuelle : Particularités & Notes */}
                      {alertInfo.hasAlert && (
                        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-950 space-y-1 min-w-0">
                            {alertInfo.particularities.length > 0 && (
                              <p className="font-bold">
                                Particularités : {alertInfo.particularities.join(' · ')}
                              </p>
                            )}
                            {alertInfo.apptNote && (
                              <p className="text-amber-900">
                                <span className="font-semibold">Note RDV :</span> {alertInfo.apptNote}
                              </p>
                            )}
                            {alertInfo.clientNote && (
                              <p className="text-amber-800 italic">
                                <span className="font-semibold not-italic">Fiche client :</span>{' '}
                                {alertInfo.clientNote}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-xl p-2 flex flex-col items-center border border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                            Avant le soin
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const compressed = await compressImage(file);
                                await db.saveAppointment({ ...appt, photoBefore: compressed });
                                refreshData();
                              }}
                            />
                          </label>
                          <div className="w-full h-28 bg-white rounded-lg border border-slate-100 overflow-hidden">
                            <PhotoThumbnail imageRef={appt.photoBefore} />
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-2 flex flex-col items-center border border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                            Après le soin
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const compressed = await compressImage(file);
                                await db.saveAppointment({ ...appt, photoAfter: compressed });
                                refreshData();
                              }}
                            />
                          </label>
                          <div className="w-full h-28 bg-white rounded-lg border border-slate-100 overflow-hidden">
                            <PhotoThumbnail imageRef={appt.photoAfter} />
                          </div>
                        </div>
                      </div>

                      <div className="pt-1">
                        {appt.status !== 'invoiced' ? (
                          <button
                            onClick={() => openInvoiceModalForAppt(appt)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                          >
                            <Euro size={15} /> Facturer la prestation
                          </button>
                        ) : (
                          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 transition-all">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700">
                              <CheckCircle2 size={14} className="text-blue-600" /> Règlement complété
                            </span>
                            <button
                              onClick={() => {
                                const inv = db.getInvoices().find(i => i.appointmentId === appt.id);
                                if (inv) onPrintInvoice?.(inv);
                              }}
                              className="p-2 bg-white text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                            >
                              <Printer size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* VUES LISTE (À venir / Historique) */}
      {(view === 'upcoming' || view === 'past') && (
        <div className="max-w-4xl mx-auto space-y-2 pb-6">
          {appointments
            .filter(a => {
              if (view === 'upcoming') return a.date >= todayStr;
              if (view === 'past') return a.date < todayStr;
              return true;
            })
            .sort((a, b) =>
              view === 'past'
                ? b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
                : a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
            )
            .map(appt => {
              const blocked = isBlockedEntry(appt);
              const alertInfo = getApptAlerts(appt);
              return (
                <div
                  key={appt.id}
                  style={blocked ? HATCHED_BG_STYLE : undefined}
                  className={`flex flex-col md:flex-row md:items-center gap-4 p-3.5 rounded-2xl border transition-all shadow-xs group relative overflow-hidden cursor-pointer ${
                    blocked
                      ? 'border-slate-200 hover:border-slate-300'
                      : 'border-slate-100 bg-white hover:border-blue-200'
                  }`}
                  onClick={() => openEditModal(appt)}
                >
                  <div className="w-24 text-center border-r border-slate-100 pr-5 shrink-0">
                    <p
                      className={`font-serif text-[11px] italic mb-0.5 ${
                        blocked ? 'text-slate-500' : 'text-blue-600'
                      }`}
                    >
                      {parseLocalDate(appt.date).toLocaleDateString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                      })}
                    </p>
                    <p className="text-lg font-bold text-slate-800 tabular-nums">{appt.time}</p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      {blocked && <Lock size={15} className="text-slate-500 shrink-0" />}
                      <h4 className="font-serif text-lg text-slate-900 leading-none truncate">
                        {appt.petName}
                      </h4>
                      {alertInfo.hasAlert && (
                        <span
                          title={alertInfo.summary}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md shrink-0"
                        >
                          <AlertTriangle size={11} className="text-amber-600" /> Vigilance
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-2 tracking-tight flex-wrap">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock size={11} /> {formatDurationLabel(appt.duration || 60)}
                      </span>
                      <span aria-hidden="true">·</span>
                      {blocked ? (
                        <span>Créneau bloqué{appt.notes ? ` · ${appt.notes}` : ''}</span>
                      ) : (
                        <>
                          <span>{appt.clientName}</span>
                          {(() => {
                            const client = clients.find(c => c.id === appt.clientId);
                            return client ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {client.species} ({client.breed})
                                </span>
                              </>
                            ) : null;
                          })()}
                          {appt.services && appt.services.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-blue-700 font-semibold">
                                {appt.services.join(', ')}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </p>
                    {alertInfo.hasAlert && (
                      <p className="text-[11px] text-amber-800 font-medium mt-1 truncate">
                        {alertInfo.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0" onClick={e => e.stopPropagation()}>
                    {!blocked &&
                      (appt.status !== 'invoiced' ? (
                        <button
                          onClick={() => openInvoiceModalForAppt(appt)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold hover:bg-blue-700 shadow-lg shadow-blue-50 transition-all"
                        >
                          <Euro size={12} /> Facturer
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={12} className="text-blue-600" /> Payé
                          </span>
                          <button
                            onClick={() => {
                              const inv = db.getInvoices().find(i => i.appointmentId === appt.id);
                              if (inv) onPrintInvoice?.(inv);
                            }}
                            className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      ))}
                    <button
                      onClick={() => openEditModal(appt)}
                      className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-blue-600 hover:bg-blue-50 transition-all"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteRequest(appt)}
                      className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Modal Nouveau/Modifier RDV ou Créneau Bloqué */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-100 max-h-[92vh] overflow-y-auto">
            <form
              key={`${editingAppt?.id || 'new'}-${prefillDate}-${prefillTime}`}
              onSubmit={handleSaveAppt}
              className="p-5 space-y-3.5"
            >
              {/* En-tête compact + Sélecteur de type */}
              <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
                <h2 className="font-serif text-xl text-slate-800 italic truncate">
                  {editingAppt
                    ? modalMode === 'blocked'
                      ? 'Modifier le créneau bloqué'
                      : 'Modifier le rendez-vous'
                    : modalMode === 'blocked'
                      ? 'Bloquer un créneau'
                      : 'Nouveau rendez-vous'}
                </h2>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingAppt(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/70">
                <button
                  type="button"
                  onClick={() => setModalMode('appointment')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    modalMode === 'appointment'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Rendez-vous client
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('blocked')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    modalMode === 'blocked'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Lock size={12} /> Bloquer un créneau
                </button>
              </div>

              <div className="space-y-3">
                {modalMode === 'blocked' ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                        Motif / Libellé
                      </label>
                      <input
                        type="text"
                        name="blockTitle"
                        value={blockTitle}
                        onChange={e => setBlockTitle(e.target.value)}
                        placeholder="Ex : RDV médecin, Pause déjeuner, Congés..."
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none focus:ring-2 ring-slate-200 transition-all"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {['RDV perso', 'Pause déjeuner', 'Formation', 'Congés'].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setBlockTitle(preset);
                              if (preset === 'Congés') {
                                setBlockAllDay(true);
                                setModalTime('08:00');
                                setModalDuration(720);
                              }
                            }}
                            className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors whitespace-nowrap"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <label className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={blockAllDay}
                          onChange={e => {
                            const checked = e.target.checked;
                            setBlockAllDay(checked);
                            if (checked) {
                              setModalTime('08:00');
                              setModalDuration(720);
                            } else {
                              setModalDuration(60);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-slate-800"
                        />
                        <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                          Journée (08h–20h)
                        </span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                      Client & Animal
                    </label>
                    <select
                      name="client"
                      required
                      defaultValue={editingAppt?.clientId || ''}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none focus:ring-2 ring-blue-100 transition-all"
                    >
                      <option value="">Sélectionner un client...</option>
                      {sortedClients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} • {c.ownerName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date, Heure & Durée alignés sur une seule ligne */}
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-start">
                  <div className="col-span-1 sm:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5 mb-1 leading-none">
                      Date
                    </label>
                    <input
                      type="date"
                      name="date"
                      defaultValue={editingAppt?.date || prefillDate}
                      required
                      className="w-full h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none focus:ring-2 ring-blue-100"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5 mb-1 leading-none">
                      Heure
                    </label>
                    <input
                      type="time"
                      name="time"
                      value={modalTime}
                      onChange={e => setModalTime(e.target.value)}
                      disabled={modalMode === 'blocked' && blockAllDay}
                      required
                      className="w-full h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none focus:ring-2 ring-blue-100 disabled:opacity-50 tabular-nums"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5 mb-1 leading-none">
                      Durée (min)
                    </label>
                    <div className="flex items-center gap-1.5 h-10">
                      <input
                        type="number"
                        name="duration"
                        min={15}
                        step={15}
                        value={modalDuration}
                        disabled={modalMode === 'blocked' && blockAllDay}
                        onChange={e => setModalDuration(parseInt(e.target.value, 10) || 60)}
                        className="w-16 h-10 px-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none tabular-nums disabled:opacity-50 shrink-0"
                      />
                      {!(modalMode === 'blocked' && blockAllDay) && (
                        <div className="flex items-center gap-1 flex-nowrap">
                          {(modalMode === 'blocked' ? [30, 60, 120, 240] : [30, 60, 90, 120]).map(
                            d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setModalDuration(d)}
                                className={`h-8 px-2 rounded-lg text-[11px] font-bold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                                  modalDuration === d
                                    ? modalMode === 'blocked'
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {d === 30 ? '30m' : formatDurationLabel(d)}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Services en pastilles cliquables compactes */}
                {modalMode === 'appointment' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                      Prestations
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-50/70 border border-slate-200/80 rounded-xl custom-scrollbar">
                      {config.services.map(s => (
                        <label key={s} className="cursor-pointer select-none">
                          <input
                            type="checkbox"
                            name="services"
                            value={s}
                            defaultChecked={editingAppt?.services?.includes(s)}
                            className="sr-only peer"
                          />
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:border-blue-300 peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-600 transition-colors">
                            {s}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                    {modalMode === 'blocked' ? 'Précisions (optionnel)' : 'Notes ou particularités'}
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    defaultValue={editingAppt?.notes || ''}
                    placeholder="Observations..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium h-12 resize-none outline-none focus:ring-2 ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className={`flex-1 py-2.5 px-4 text-white rounded-xl font-bold text-xs sm:text-sm tracking-wide shadow-md transition-all active:scale-[0.99] whitespace-nowrap ${
                    modalMode === 'blocked'
                      ? 'bg-slate-800 hover:bg-slate-900 shadow-slate-200'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                  }`}
                >
                  {editingAppt
                    ? 'Sauvegarder'
                    : modalMode === 'blocked'
                      ? 'Bloquer ce créneau'
                      : 'Enregistrer le RDV'}
                </button>

                {editingAppt && !isBlockedEntry(editingAppt) && editingAppt.status !== 'invoiced' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingAppt;
                      setIsModalOpen(false);
                      openInvoiceModalForAppt(target);
                    }}
                    className="py-2.5 px-3.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Euro size={14} /> Facturer
                  </button>
                )}

                {editingAppt && (
                  <button
                    type="button"
                    aria-label="Supprimer"
                    onClick={() => handleDeleteRequest(editingAppt, true)}
                    className="py-2.5 px-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Trash2 size={14} /> Supprimer
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Facturation Rapide */}
      {isInvoiceModalOpen && selectedAppt && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-5 space-y-3.5">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h2 className="font-serif text-xl text-slate-800 italic">Facturation</h2>
                <button
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-3.5 py-2 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                  Prestation pour
                </span>
                <span className="font-serif text-base text-blue-900 italic">{selectedAppt.petName}</span>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                      Date
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={e => setInvoiceDate(e.target.value)}
                      className="w-full h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                      Montant TTC
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={invoiceAmount}
                        onChange={e => setInvoiceAmount(e.target.value)}
                        className="w-full h-10 pl-3 pr-7 bg-blue-50 border border-blue-200 rounded-xl font-serif text-xl text-blue-700 text-right outline-none tabular-nums"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-serif text-base text-blue-400">
                        €
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                    Libellé du service
                  </label>
                  {isCustomService ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={invoiceService}
                        onChange={e => setInvoiceService(e.target.value)}
                        placeholder="..."
                        className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          setIsCustomService(false);
                          setInvoiceService(
                            selectedAppt.services && Array.isArray(selectedAppt.services)
                              ? selectedAppt.services.join(', ')
                              : (selectedAppt as any).service || ''
                          );
                        }}
                        className="px-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-[10px]"
                      >
                        RETOUR
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <select
                        value={invoiceService}
                        onChange={e => setInvoiceService(e.target.value)}
                        className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs sm:text-sm text-slate-800 outline-none"
                      >
                        {!config.services.includes(invoiceService) && invoiceService && (
                          <option value={invoiceService}>{invoiceService}</option>
                        )}
                        {config.services.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          setIsCustomService(true);
                          setInvoiceService('');
                        }}
                        className="px-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-[10px]"
                      >
                        AUTRE
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                    Mode de règlement
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {['Carte', 'Espèces', 'Chèque', 'Virement'].map(m => (
                      <button
                        key={m}
                        onClick={() => setPaymentMethod(m as any)}
                        className={`py-2 rounded-lg text-[10px] font-bold uppercase border transition-all ${
                          paymentMethod === m
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-blue-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirmInvoice}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs sm:text-sm tracking-wide shadow-md shadow-blue-100 hover:bg-blue-700 transition-all active:scale-[0.99]"
              >
                Générer la facture
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Warning Modal */}
      <WarningModal
        isOpen={warningState.isOpen}
        title={warningState.title}
        message={warningState.message}
        onClose={() => setWarningState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default Planning;
