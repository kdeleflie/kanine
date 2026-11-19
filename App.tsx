
import React, { useState, useRef, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import ClientList from './views/ClientList';
import Planning from './views/Planning';
import ProductSales from './views/ProductSales';
import InvoicePDF from './components/InvoicePDF';
import ProductInvoicePDF from './components/ProductInvoicePDF';
import { db } from './services/database';
import { 
  Trash2, Printer, Download, Upload, FileText, 
  Database, History as HistoryIcon,
  AlertCircle, Save, Camera, ImageIcon, X,
  Terminal, CheckCircle2, ShieldCheck, Search, Clock, FolderOpen, Settings, Edit, Scissors
} from 'lucide-react';
import { Invoice, ProductInvoice, AutoBackupConfig, BackupType, BackupSchedule } from './types';
import { createRoot } from 'react-dom/client';
import { ConfirmModal } from './components/ConfirmModal';
import { AlertModal } from './components/AlertModal';
import { auth, signInWithPopup, signOut, googleProvider, User, onAuthStateChanged, firebaseConfig } from './firebase';
import { LogIn, LogOut, Cloud, CloudOff, RefreshCw, ExternalLink } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [config, setConfig] = useState(db.getConfig());
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  
  // Invoice Filters
  const [invoiceFilterYear, setInvoiceFilterYear] = useState<number>(new Date().getFullYear());
  const [invoiceFilterMonth, setInvoiceFilterMonth] = useState<number | 'all'>('all');
  const [invoiceType, setInvoiceType] = useState<'grooming' | 'products'>('grooming');
  const [searchQuery, setSearchQuery] = useState('');

  // Hidden Menu State
  const [showHiddenMenu, setShowHiddenMenu] = useState(false);
  const [hiddenRecordComment, setHiddenRecordComment] = useState('');
  const [hiddenRecordAmount, setHiddenRecordAmount] = useState('');
  const [hiddenRecordClientId, setHiddenRecordClientId] = useState('');
  const [hiddenRecordDate, setHiddenRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [hiddenRecords, setHiddenRecords] = useState(db.getInternalRecords());
  const [hiddenFilterYear, setHiddenFilterYear] = useState<number>(new Date().getFullYear());
  const [hiddenFilterPeriodType, setHiddenFilterPeriodType] = useState<'month'|'quarter'|'year'>('month');
  const [hiddenFilterPeriodValue, setHiddenFilterPeriodValue] = useState<number>(new Date().getMonth());

  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [alertState, setAlertState] = useState<{isOpen: boolean, title: string, message: React.ReactNode}>({
    isOpen: false,
    title: '',
    message: ''
  });

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMsg, setMigrationMsg] = useState('');
  const [realtimeSyncTrigger, setRealtimeSyncTrigger] = useState(0);

  useEffect(() => {
    const handleFirestoreError = (e: any) => {
      setAlertState({
        isOpen: true,
        title: "Erreur Cloud",
        message: `Une erreur de synchronisation est survenue: ${e.detail?.error || 'Erreur inconnue'}`
      });
    };
    window.addEventListener('firestore-error', handleFirestoreError);
    return () => window.removeEventListener('firestore-error', handleFirestoreError);
  }, []);

  useEffect(() => {
    setHiddenRecords(db.getInternalRecords());
  }, [realtimeSyncTrigger]);

  useEffect(() => {
    let unsubscribeSync: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        setIsMigrating(true);
        setMigrationMsg("Mise à jour des données depuis le Cloud...");
        try {
          await db.syncFromCloud((msg) => setMigrationMsg(msg));
        } catch (e) {
          console.error("Auto sync on startup failed:", e);
        } finally {
          setIsMigrating(false);
          setConfig(db.getConfig());
          setRealtimeSyncTrigger(prev => prev + 1);

          // Setup real-time listener AFTER initial sync
          unsubscribeSync = db.setupRealtimeSync(() => {
             // Force child components to re-read localStorage by changing state
             setRealtimeSyncTrigger(prev => prev + 1);
          });
        }
      }
      setIsAuthLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSync) unsubscribeSync();
    };
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error("Login failed:", e);
      if (e.code === 'auth/unauthorized-domain') {
        const hostname = window.location.hostname;
        const projectId = firebaseConfig.projectId;
        const consoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
        
        setAlertState({
          isOpen: true,
          title: "Domaine non autorisé",
          message: (
            <div className="space-y-4 text-sm">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <p className="font-semibold mb-1">Erreur de domaine :</p>
                <p>Le domaine <code className="bg-amber-100 px-1 rounded">{hostname}</code> n'est pas autorisé dans votre configuration Firebase.</p>
              </div>
              
              <div className="space-y-2">
                <p>Pour corriger cela :</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Allez dans la <strong>Console Firebase</strong> ({projectId})</li>
                  <li>Section <strong>Authentication</strong> &gt; Onglet <strong>Settings</strong></li>
                  <li>Sous-onglet <strong>Authorized domains</strong></li>
                  <li>Ajoutez <code>{hostname}</code> à la liste.</li>
                </ol>
              </div>

              <a 
                href={consoleUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
              >
                Ouvrir la Console Firebase <ExternalLink size={14} />
              </a>
            </div>
          )
        });
      } else {
        setAlertState({
          isOpen: true,
          title: "Erreur de connexion",
          message: "Une erreur est survenue lors de la connexion : " + (e.message || "Erreur inconnue")
        });
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleMigration = async () => {
    setIsMigrating(true);
    const success = await db.migrateToFirebase((msg) => setMigrationMsg(msg));
    setIsMigrating(false);
    if (success) {
      setAlertState({
        isOpen: true,
        title: "Migration Réussie",
        message: "Vos données sont maintenant synchronisées sur Firebase !"
      });
    }
  };

  const [autoBackupConfig, setAutoBackupConfig] = useState<AutoBackupConfig>(() => {
    const existing = config.autoBackup;
    
    const defaultSchedules = {
      full: { enabled: false, frequency: 168 },
      partial: { enabled: existing?.enabled || false, frequency: (existing as any)?.frequency || 4 },
      photos: { enabled: false, frequency: 24 }
    };

    if (existing && (existing as any).schedules) {
      return {
        ...existing,
        schedules: {
          ...defaultSchedules,
          ...(existing as any).schedules
        }
      };
    }
    
    // Migration or default
    return {
      enabled: existing?.enabled || false,
      schedules: defaultSchedules
    };
  });
  const [hasAutoBackupDir, setHasAutoBackupDir] = useState(false);
  const [autoBackupPermission, setAutoBackupPermission] = useState<'granted' | 'prompt' | 'denied' | null>(null);

  useEffect(() => {
    db.getAutoBackupDirectory().then(async handle => {
      setHasAutoBackupDir(!!handle);
      if (handle && typeof handle.queryPermission === 'function') {
        try {
          const perm = await handle.queryPermission({ mode: 'readwrite' });
          setAutoBackupPermission(perm);
        } catch (e) {
          console.error("Error querying permission:", e);
        }
      } else if (handle) {
        // Handle is invalid
        setHasAutoBackupDir(false);
      }
    });

    // Check for auto-backup every 5 minutes
    const interval = setInterval(() => {
      db.performAutoBackupIfDue();
    }, 5 * 60 * 1000);

    // Also check on startup
    db.performAutoBackupIfDue();

    return () => clearInterval(interval);
  }, []);

  const handleAutoBackupSetup = async (action: 'request' | 'pick') => {
    if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        if (action === 'request') {
          const handle = await db.getAutoBackupDirectory();
          if (handle && typeof handle.requestPermission === 'function') {
            const perm = await handle.requestPermission({ mode: 'readwrite' });
            setAutoBackupPermission(perm);
            if (perm === 'granted') {
              setAlertState({ isOpen: true, title: "Succès", message: "Permission accordée avec succès !" });
            } else {
              setAlertState({ isOpen: true, title: "Erreur", message: "Permission refusée." });
            }
          } else {
            setAlertState({ isOpen: true, title: "Erreur", message: "Impossible de récupérer le dossier. Veuillez le choisir à nouveau." });
            setHasAutoBackupDir(false);
          }
        } else {
          const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
          await db.setAutoBackupDirectory(handle);
          setHasAutoBackupDir(true);
          setAutoBackupPermission('granted');
          setAlertState({ isOpen: true, title: "Succès", message: "Dossier de sauvegarde automatique configuré avec succès !" });
        }
      } catch (err: any) {
        console.error("Directory picker error:", err);
        const isSecurityError = err?.name === 'SecurityError' || 
                                err?.message?.toLowerCase().includes('cross-origin') || 
                                err?.message?.toLowerCase().includes('iframe') ||
                                err?.message?.toLowerCase().includes('sub frames');

        if (isSecurityError) {
          setAlertState({ 
            isOpen: true, 
            title: "Action bloquée par le navigateur", 
            message: (
              <div className="space-y-3">
                <p>Pour des raisons de sécurité, la sélection de dossier est bloquée quand l'application est affichée dans cet aperçu.</p>
                <p className="font-black text-indigo-600">Solution : Cliquez sur le bouton "Open in new tab" (en haut à droite) pour ouvrir l'application normalement, puis réessayez.</p>
              </div>
            )
          });
        } else if (err?.name !== 'AbortError') {
          setAlertState({ isOpen: true, title: "Erreur", message: "Erreur lors de la sélection du dossier : " + (err?.message || "Erreur inconnue") });
        }
      }
    } else {
      setAlertState({ isOpen: true, title: "Non supporté", message: "Votre navigateur ne supporte pas la sélection de dossier pour la sauvegarde automatique." });
    }
  };

  const updateAutoBackup = (updates: Partial<AutoBackupConfig>) => {
    const newConfig = { ...autoBackupConfig, ...updates };
    setAutoBackupConfig(newConfig);
    const fullConfig = { ...config, autoBackup: newConfig };
    setConfig(fullConfig);
    db.saveConfig(fullConfig);
  };

  const updateSchedule = (type: BackupType, updates: Partial<BackupSchedule>) => {
    const newSchedules = {
      ...(autoBackupConfig.schedules || {}),
      [type]: { ...(autoBackupConfig.schedules?.[type] || { enabled: false, frequency: 24 }), ...updates }
    };
    updateAutoBackup({ schedules: newSchedules as any });
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handlePrint = (invoice: Invoice) => {
    const clients = db.getClients();
    const client = clients.find(c => c.id === invoice.clientId);
    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Facture ${invoice.number}</title><script src="https://cdn.tailwindcss.com"></script></head>
      <body><div id="root"></div></body></html>
    `);
    setTimeout(() => {
      const container = printWindow.document.getElementById('root');
      if (container) {
        const root = createRoot(container);
        root.render(<InvoicePDF invoice={invoice} client={client} />);
        setTimeout(() => printWindow.print(), 800);
      }
    }, 100);
  };

  const handlePrintProductInvoice = (invoice: ProductInvoice) => {
    const clients = db.getClients();
    const client = clients.find(c => c.id === invoice.clientId);
    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Facture ${invoice.number}</title><script src="https://cdn.tailwindcss.com"></script></head>
      <body><div id="root"></div></body></html>
    `);
    setTimeout(() => {
      const container = printWindow.document.getElementById('root');
      if (container) {
        const root = createRoot(container);
        root.render(<ProductInvoicePDF invoice={invoice} client={client} />);
        setTimeout(() => printWindow.print(), 800);
      }
    }, 100);
  };

  const handleFileExport = async (type: BackupType) => {
    try {
      const json = await db.exportAsJSON({ 
        excludePhotos: type === 'partial',
        photosOnly: type === 'photos'
      });
      const blob = new Blob([json], { type: 'application/json' });
      const filename = `kanine_sauvegarde_${type}_${new Date().toISOString().split('T')[0]}.json`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Fichier JSON',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.warn('showSaveFilePicker failed, falling back to traditional download', err);
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (e) {
      setAlertState({ isOpen: true, title: "Erreur", message: "Erreur lors de la génération du fichier : " + e });
    }
  };

  const handleExportAll = async () => {
    const types: BackupType[] = ['full', 'partial', 'photos'];
    for (const type of types) {
      await handleFileExport(type);
      // Small delay to avoid browser blocking multiple downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const updateBaseConfig = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    db.saveConfig(newConfig);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLButtonElement | HTMLDivElement>) => {
    e.preventDefault();
    let file: File | undefined;
    
    if ('dataTransfer' in e) {
      file = e.dataTransfer.files?.[0];
    } else {
      file = e.target.files?.[0];
      // Reset input value so the same file can be selected again
      e.target.value = '';
    }

    if (!file) return;

    setIsImporting(true);
    setImportLogs([`[INFO] Début lecture : ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} Mo)`]);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const result = await db.importFullData(content);
      setImportLogs(result.logs);
      if (result.success) {
        // Alerte de succès avant rechargement
        setTimeout(() => {
          setAlertState({ isOpen: true, title: "Succès", message: "Importation réussie. L'application va redémarrer." });
          setTimeout(() => window.location.reload(), 2000);
        }, 1500);
      }
      setIsImporting(false);
    };
    reader.onerror = () => {
      setImportLogs(prev => [...prev, "ERREUR CRITIQUE : Impossible de lire physiquement le fichier."]);
      setIsImporting(false);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement | HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const newConfig = { ...config, logo: base64 };
      db.saveConfig(newConfig);
      setConfig(newConfig);
      setAlertState({ isOpen: true, title: "Succès", message: "Logo mis à jour." });
    };
    reader.readAsDataURL(file);
  };

  const renderInvoicesList = () => {
    const groomingInvoices = db.getInvoices();
    const productInvoices = db.getProductInvoices();
    
    const invoices = invoiceType === 'grooming' ? groomingInvoices : productInvoices;
    const years = Array.from(new Set(invoices.map(inv => new Date(inv.date).getFullYear()))).sort((a, b) => b - a);
    
    const filteredInvoices = invoices.filter(inv => {
      const d = new Date(inv.date);
      if (d.getFullYear() !== invoiceFilterYear) return false;
      if (invoiceFilterMonth !== 'all' && d.getMonth() !== invoiceFilterMonth) return false;
      
      const searchLower = searchQuery.toLowerCase();
      const petName = ('petName' in inv ? inv.petName : '') || '';
      const clientName = ('clientName' in inv ? inv.clientName : '') || '';
      const ownerName = inv.ownerName || '';
      const matchesSearch = (inv.number || '').toLowerCase().includes(searchLower) || 
                            ownerName.toLowerCase().includes(searchLower) || 
                            petName.toLowerCase().includes(searchLower) ||
                            clientName.toLowerCase().includes(searchLower);
      return matchesSearch;
    }).reverse();

    return (
    <div className="max-w-5xl mx-auto space-y-3 pb-6">
      {showHiddenMenu && (
        <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800 text-white mb-4">
          <h3 className="font-bold text-xs mb-3 uppercase tracking-wider text-slate-300">Entrée Masquée</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 mb-4">
            <input
              type="date"
              value={hiddenRecordDate}
              onChange={e => setHiddenRecordDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={hiddenRecordClientId}
              onChange={e => setHiddenRecordClientId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-blue-500 col-span-2"
            >
              <option value="">Sélectionner un client/animal...</option>
              {db.getClients().map(c => <option key={c.id} value={c.id}>{c.ownerName || 'Sans nom'} - {c.name || 'Sans nom'}</option>)}
            </select>
            <input
              type="text"
              placeholder="Commentaire"
              value={hiddenRecordComment}
              onChange={e => setHiddenRecordComment(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Montant (€)"
                value={hiddenRecordAmount}
                onChange={e => setHiddenRecordAmount(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-blue-500 w-full"
              />
              <button
                onClick={() => {
                  if (!hiddenRecordClientId || !hiddenRecordAmount) return;
                  db.addInternalRecord({
                    clientId: hiddenRecordClientId,
                    comment: hiddenRecordComment,
                    amount: parseFloat(hiddenRecordAmount),
                    date: new Date(hiddenRecordDate).toISOString()
                  });
                  setHiddenRecordAmount('');
                  setHiddenRecordComment('');
                  setHiddenRecordClientId('');
                  setHiddenRecords(db.getInternalRecords());
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 rounded-lg font-bold"
              >
                +
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2.5 mb-3">
            <select
              value={hiddenFilterPeriodType}
              onChange={e => {
                const t = e.target.value as 'month'|'quarter'|'year';
                setHiddenFilterPeriodType(t);
                if (t === 'month') setHiddenFilterPeriodValue(new Date().getMonth());
                else if (t === 'quarter') setHiddenFilterPeriodValue(Math.floor(new Date().getMonth() / 3));
              }}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="month">Mois</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Année</option>
            </select>

            {hiddenFilterPeriodType === 'month' && (
              <select
                value={hiddenFilterPeriodValue}
                onChange={e => setHiddenFilterPeriodValue(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Array.from({length: 12}).map((_, i) => (
                  <option key={i} value={i}>{new Date(2000, i, 1).toLocaleString('fr-FR', {month: 'long'})}</option>
                ))}
              </select>
            )}

            {hiddenFilterPeriodType === 'quarter' && (
              <select
                value={hiddenFilterPeriodValue}
                onChange={e => setHiddenFilterPeriodValue(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={0}>T1 (Jan-Mar)</option>
                <option value={1}>T2 (Avr-Juin)</option>
                <option value={2}>T3 (Juil-Sep)</option>
                <option value={3}>T4 (Oct-Déc)</option>
              </select>
            )}

            <select
              value={hiddenFilterYear}
              onChange={e => setHiddenFilterYear(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Array.from(
                new Set([
                  new Date().getFullYear(),
                  ...hiddenRecords.map(r => new Date(r.date).getFullYear()),
                  ...groomingInvoices.map(inv => parseInt((inv.date || '').substring(0, 4), 10)),
                  ...productInvoices.map(inv => parseInt((inv.date || '').substring(0, 4), 10))
                ])
              )
                .filter(y => !isNaN(y))
                .sort((a, b) => b - a)
                .map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
            </select>
          </div>

          {(() => {
            const matchesPeriod = (dateStr?: string) => {
              if (!dateStr) return false;
              let y: number;
              let m: number;
              if (/^\d{4}-\d{2}/.test(dateStr)) {
                y = parseInt(dateStr.substring(0, 4), 10);
                m = parseInt(dateStr.substring(5, 7), 10) - 1;
              } else {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return false;
                y = d.getFullYear();
                m = d.getMonth();
              }
              if (y !== hiddenFilterYear) return false;
              if (hiddenFilterPeriodType === 'month') return m === hiddenFilterPeriodValue;
              if (hiddenFilterPeriodType === 'quarter') return Math.floor(m / 3) === hiddenFilterPeriodValue;
              return true;
            };

            const filteredHiddenRecords = hiddenRecords
              .filter(r => matchesPeriod(r.date))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const totalAmount = filteredHiddenRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const groomingCA = groomingInvoices
              .filter(inv => matchesPeriod(inv.date))
              .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
            const productCA = productInvoices
              .filter(inv => matchesPeriod(inv.date))
              .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
            const totalCA = groomingCA + productCA;
            const combinedTotal = totalAmount + totalCA;
            const clients = db.getClients();

            return (
              <>
                <div className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-700/50 text-slate-300">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Client</th>
                        <th className="p-2.5">Animal</th>
                        <th className="p-2.5">Commentaire</th>
                        <th className="p-2.5 text-right">Montant</th>
                        <th className="p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {filteredHiddenRecords.map(record => {
                        const client = clients.find(c => c.id === record.clientId);
                        return (
                          <tr key={record.id} className="hover:bg-slate-800/50">
                            <td className="p-2.5 whitespace-nowrap">{new Date(record.date).toLocaleDateString('fr-FR')}</td>
                            <td className="p-2.5 font-medium">{client?.ownerName || 'Inconnu'}</td>
                            <td className="p-2.5 text-slate-400">{client?.name || 'Inconnu'}</td>
                            <td className="p-2.5 text-slate-400">{record.comment}</td>
                            <td className="p-2.5 text-right font-bold text-sky-400 tabular-nums">{(Number(record.amount) || 0).toFixed(2)} €</td>
                            <td className="p-2.5 text-right">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmState({
                                    isOpen: true,
                                    title: "Supprimer",
                                    message: "Voulez-vous vraiment supprimer cette entrée ?",
                                    onConfirm: () => {
                                      db.deleteInternalRecord(record.id);
                                      setHiddenRecords(db.getInternalRecords());
                                      setConfirmState(prev => ({ ...prev, isOpen: false }));
                                    }
                                  });
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredHiddenRecords.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-3 text-center text-slate-500 italic">Aucune donnée</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
                  <div className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-300">Total période</span>
                    <span className="text-sm font-black text-sky-400 tabular-nums">{totalAmount.toFixed(2)} €</span>
                  </div>
                  <div className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-300 block leading-tight">Chiffre d'affaires (période)</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        Serv. {groomingCA.toFixed(2)} € · Bout. {productCA.toFixed(2)} €
                      </span>
                    </div>
                    <span className="text-sm font-black text-amber-300 tabular-nums shrink-0">{totalCA.toFixed(2)} €</span>
                  </div>
                  <div className="bg-blue-600/20 border border-blue-500/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-blue-200">Total cumulé (Période + CA)</span>
                    <span className="text-sm font-black text-white tabular-nums shrink-0">{combinedTotal.toFixed(2)} €</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
      <div className="flex flex-col md:flex-row items-center justify-between bg-white p-3.5 rounded-2xl border border-blue-100/80 shadow-xs gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-xs">
            <FileText size={15} />
          </div>
          <div>
            <h2 className="font-serif text-base text-slate-900 leading-none">Factures</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{filteredInvoices.length} document{filteredInvoices.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400" size={13} />
             <input 
               type="text" 
               placeholder="Rechercher..." 
               className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>
          <div className="flex bg-blue-50/70 p-0.5 rounded-xl border border-blue-100/70">
            <button 
              onClick={() => setInvoiceType('grooming')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all ${invoiceType === 'grooming' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-blue-700'}`}
            >
              Services
            </button>
            <button 
              onClick={() => setInvoiceType('products')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all ${invoiceType === 'products' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-blue-700'}`}
            >
              Boutique
            </button>
          </div>

          <select 
            value={invoiceFilterYear} 
            onChange={(e) => setInvoiceFilterYear(parseInt(e.target.value))}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none tabular-nums"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select 
            value={invoiceFilterMonth} 
            onChange={(e) => setInvoiceFilterMonth(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none"
          >
            <option value="all">Tous les mois</option>
            {['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'].map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs italic bg-white rounded-2xl border border-dashed border-slate-200">Aucun document pour cette période.</div>
        ) : (
          filteredInvoices.map(inv => (
          <div key={inv.id} className="bg-white px-4 py-2.5 rounded-xl border border-blue-100/70 shadow-xs hover:border-blue-300 hover:bg-blue-50/20 transition-all flex items-center justify-between gap-3 group cursor-pointer" onClick={() => invoiceType === 'grooming' ? handlePrint(inv as Invoice) : handlePrintProductInvoice(inv as any)}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${invoiceType === 'grooming' ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' : 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white'}`}>
                <FileText size={15} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                   <h3 className="font-bold text-slate-900 uppercase text-xs tracking-tight">{inv.number}</h3>
                   <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md border border-sky-200/70">
                     <CheckCircle2 size={10} className="text-sky-600" /> Payé · {inv.paymentMethod}
                   </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  {new Date(inv.date).toLocaleDateString('fr-FR')} ·{' '}
                  <span className="text-blue-700 font-semibold">{'petName' in inv ? inv.petName : inv.clientName}</span>
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 shrink-0">
               <p className="text-sm font-bold text-slate-900 tabular-nums">{(inv.amount || 0).toFixed(2)} €</p>
               <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); invoiceType === 'grooming' ? handlePrint(inv as Invoice) : handlePrintProductInvoice(inv as any); }} className="p-1.5 text-blue-600 hover:bg-blue-100/70 rounded-lg transition-all" title="Imprimer">
                    <Printer size={15} />
                  </button>
                  <button onClick={(e) => { 
                    e.stopPropagation();
                    setConfirmState({
                      isOpen: true,
                      title: "Supprimer",
                      message: "Supprimer définitivement cette facture ?",
                      onConfirm: () => {
                        if (invoiceType === 'grooming') {
                          db.deleteInvoice(inv.id);
                        } else {
                          db.deleteProductInvoice(inv.id);
                        }
                        window.location.reload();
                      }
                    });
                  }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Supprimer">
                    <Trash2 size={15} />
                  </button>
               </div>
            </div>
          </div>
        )))}
      </div>
    </div>
  );
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="font-serif text-lg italic text-slate-400">{migrationMsg || "Chargement de votre salon..."}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0b1f3a] via-[#13325f] to-[#0284c7] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 md:p-10 shadow-2xl border border-white/20 flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-sky-400 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200 rotate-3">
             <Scissors size={32} className="text-white -rotate-3" />
          </div>
          
          <h1 className="font-serif text-3xl text-slate-900 italic mb-1.5 text-center">Ka'nine Smart</h1>
          <p className="text-blue-600 font-bold text-xs tracking-wide mb-7 text-center">Gestion de salon de toilettage</p>
          
          <div className="w-full space-y-5">
            <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 italic font-serif text-slate-700 text-sm text-center leading-relaxed">
              "L'interface professionnelle dédiée aux experts du toilettage canin."
            </div>

            <button 
              onClick={handleSignIn}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-2xl font-bold text-xs tracking-wide flex items-center justify-center gap-3 hover:from-blue-700 hover:to-sky-600 transition-all shadow-lg shadow-blue-200 active:scale-95 group"
            >
              <LogIn size={18} className="group-hover:translate-x-0.5 transition-transform" />
              Se connecter avec Google
            </button>
          </div>
          
          <p className="mt-7 text-[11px] font-medium text-slate-400">Ka'nine & Patounes</p>
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={(t, e) => { 
      setSelectedClientId(null); 
      setActiveTab(t);
      if (t === 'invoices' && (e?.altKey || e?.shiftKey || e?.ctrlKey || e?.metaKey)) {
        setShowHiddenMenu(prev => !prev);
      }
    }}>
      <AlertModal 
        isOpen={alertState.isOpen} 
        title={alertState.title} 
        message={alertState.message} 
        onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} 
      />
      {activeTab === 'dashboard' && <Dashboard syncTrigger={realtimeSyncTrigger} user={user} onNavigateToClient={(id) => { setSelectedClientId(id); setActiveTab('clients'); }} onNavigateToTab={(tab) => setActiveTab(tab)} />}
      {activeTab === 'clients' && <ClientList syncTrigger={realtimeSyncTrigger} user={user} initialClientId={selectedClientId} onPrintInvoice={handlePrint} onPrintProductInvoice={handlePrintProductInvoice} />}
      {activeTab === 'planning' && <Planning syncTrigger={realtimeSyncTrigger} user={user} onPrintInvoice={handlePrint} />}
      {activeTab === 'products' && <ProductSales syncTrigger={realtimeSyncTrigger} onPrintProductInvoice={handlePrintProductInvoice} />}
      {activeTab === 'invoices' && renderInvoicesList()}
      {activeTab === 'audit' && (
        <div className="max-w-4xl mx-auto bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
           <h2 className="text-xs font-black mb-4 text-slate-800 uppercase flex items-center gap-2">
             <HistoryIcon className="text-blue-600" size={16} /> Activité
           </h2>
           <div className="space-y-1.5">
              {db.getAuditLog().map((entry: any) => (
                <div key={entry.id} className="flex gap-3 p-2.5 bg-slate-50/50 rounded-xl border border-slate-100">
                   <div className="w-18 shrink-0 border-r border-slate-200 pr-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(entry.timestamp).toLocaleDateString()}</p>
                      <p className="text-[10px] font-bold text-slate-600">{new Date(entry.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                   </div>
                   <div className="flex-1 min-w-0">
                      <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase mb-0.5 inline-block">{entry.action}</span>
                      <p className="text-xs font-semibold text-slate-800 leading-tight">{entry.details}</p>
                   </div>
                   <div className="flex gap-1 self-start">
                    {entry.undoData && (
                      <button 
                        onClick={() => {
                          setConfirmState({
                            isOpen: true,
                            title: "Annuler",
                            message: "Voulez-vous annuler cette action ?",
                            onConfirm: () => {
                              const success = db.undoAction(entry.id);
                              if (success === false) {
                                setAlertState({ isOpen: true, title: "Erreur", message: "Impossible de restaurer." });
                              } else {
                                window.location.reload();
                              }
                            }
                          });
                        }}
                        className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-tight hover:bg-amber-200 transition-all"
                      >
                        Undo
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setConfirmState({
                          isOpen: true,
                          title: "Supprimer",
                          message: "Supprimer cette entrée ?",
                          onConfirm: () => {
                            db.deleteAuditLogEntry(entry.id);
                            window.location.reload();
                          }
                        });
                      }}
                      className="p-1 text-red-400 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}
      {activeTab === 'config' && (
        <div className="space-y-4">
           <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-5">
              <div className="w-20 h-20 bg-slate-50 rounded-xl border border-slate-200 shadow-inner flex items-center justify-center overflow-hidden relative group shrink-0">
                 {config.logo ? <img src={config.logo} className="w-full h-full object-contain p-1.5" /> : <ImageIcon size={24} className="text-slate-300" />}
                 <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Camera className="text-white" size={16} />
                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
                 </label>
              </div>
              <div className="flex-1 space-y-1.5 text-center sm:text-left">
                 <h3 className="text-xs font-black text-slate-900 uppercase">Logo Entreprise</h3>
                 <p className="text-[11px] text-slate-500 font-medium">Affiché sur les factures PDF.</p>
                 <button onClick={() => logoInputRef.current?.click()} className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-all">Parcourir</button>
              </div>
           </div>

           <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
              <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-2">
                <FileText className="text-blue-600" size={16} /> Coordonnées
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <ConfigInput label="Entreprise" value={config.companyName} onChange={(v: string) => updateBaseConfig('companyName', v)} placeholder="Ex: Ka'nine" />
                <ConfigInput label="Gérant" value={config.ownerName} onChange={(v: string) => updateBaseConfig('ownerName', v)} placeholder="Ex: Karine D." />
                <ConfigInput label="SIRET" value={config.siret} onChange={(v: string) => updateBaseConfig('siret', v)} placeholder="123 456 789 00012" />
                <ConfigInput label="Adresse" value={config.address} onChange={(v: string) => updateBaseConfig('address', v)} placeholder="Ville, CP..." />
                <ConfigInput label="Tél" value={config.phone} onChange={(v: string) => updateBaseConfig('phone', v)} placeholder="06..." />
                <ConfigInput label="Email" value={config.email} onChange={(v: string) => updateBaseConfig('email', v)} placeholder="contact@..." />
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-6">
              <EditableConfigSection title="Espèces" items={config.species || []} onUpdate={(items: string[]) => { db.updateConfigItems('species', items); setConfig(db.getConfig()); }} />
              <EditableBreedsSection breeds={config.breeds || {}} species={config.species || []} onUpdate={(breeds: Record<string, string[]>) => { const newConfig = {...config, breeds}; db.saveConfig(newConfig); setConfig(newConfig); }} />
              <EditableConfigSection title="Poils" items={config.coatTypes || []} onUpdate={(items: string[]) => { db.updateConfigItems('coatTypes', items); setConfig(db.getConfig()); }} />
              <EditableConfigSection title="Particularités" items={config.particularities || []} onUpdate={(items: string[]) => { db.updateConfigItems('particularities', items); setConfig(db.getConfig()); }} />
              <EditableConfigSection title="Services" items={config.services || []} onUpdate={(items: string[]) => { db.updateConfigItems('services', items); setConfig(db.getConfig()); }} />
              <EditableProductsSection products={config.products || []} onUpdate={(items: any[]) => { db.updateConfigItems('products', items); setConfig(db.getConfig()); }} />
           </div>
        </div>
      )}
      {activeTab === 'backup' && (
        <div className="max-w-4xl mx-auto space-y-3.5 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-2.5 border border-blue-100">
                <Download size={18} />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-0.5">Export Manuel</h3>
              <p className="text-slate-500 mb-3.5 text-[10px] font-bold uppercase tracking-tight">Archive JSON locale sécurisée.</p>
              <div className="w-full space-y-1.5">
                <button onClick={handleExportAll} className="w-full py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-black transition-all flex items-center justify-center gap-2">
                  <Save size={13} /> Pack complet (3 JSON)
                </button>
                <div className="h-px bg-slate-100 w-full my-1"></div>
                <button onClick={() => handleFileExport('full')} className="w-full py-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Save size={13} /> Full DB (.json)
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => handleFileExport('partial')} className="w-full py-1.5 bg-white text-blue-600 border border-blue-100 rounded-lg text-[9px] font-black uppercase hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                    Données
                  </button>
                  <button onClick={() => handleFileExport('photos')} className="w-full py-1.5 bg-white text-blue-600 border border-blue-100 rounded-lg text-[9px] font-black uppercase hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                    Photos
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100"><Upload size={16} /></div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Importation</h3>
              </div>
              <p className="text-slate-500 text-[10px] font-bold uppercase leading-relaxed tracking-tight">Restaurez vos données depuis un fichier JSON précédemment exporté.</p>
              <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json,application/json,text/plain" className="hidden" />
              <div className="flex-1 flex flex-col justify-end">
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  onDragOver={handleDragOver}
                  onDrop={handleFileImport}
                  disabled={isImporting}
                  className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 border-2 border-dashed transition-all ${isImporting ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'}`}
                  title="Cliquez pour sélectionner un fichier ou glissez-déposez le fichier ici"
                >
                  {isImporting ? "CHARGEMENT..." : "DÉPOSER OU CLIQUER ICI POUR JSON"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100"><Clock size={16} /></div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Backup Automatique</h3>
                  <p className="text-slate-500 text-[9px] font-bold uppercase tracking-tight">Background sync vers dossier local.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateAutoBackup({ enabled: !autoBackupConfig.enabled })}
                  className={`py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${autoBackupConfig.enabled ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                >
                  {autoBackupConfig.enabled ? 'ACTIF' : 'INACTIF'}
                </button>

                <button
                  onClick={() => {
                    if (!autoBackupConfig.enabled) {
                      updateAutoBackup({ enabled: true });
                    }
                    const action = (hasAutoBackupDir && autoBackupPermission !== 'granted') ? 'request' : 'pick';
                    handleAutoBackupSetup(action);
                  }}
                  className={`py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${hasAutoBackupDir && autoBackupPermission === 'granted' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}
                >
                   {hasAutoBackupDir && autoBackupPermission === 'granted' ? "DOSSIER OK" : "SÉLEC. DOSSIER"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {[
                { id: 'partial', label: 'Données', icon: <FileText size={13} /> },
                { id: 'full', label: 'Full DB', icon: <Save size={13} /> },
                { id: 'photos', label: 'Photos', icon: <ImageIcon size={13} /> }
              ].map((type) => {
                const schedule = autoBackupConfig.schedules?.[type.id as BackupType] || { enabled: false, frequency: 24 };
                return (
                  <div key={type.id} className={`p-2.5 rounded-lg border transition-all ${schedule.enabled ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50/50 border-slate-100 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                       <span className={`p-1 rounded ${schedule.enabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
                          {type.icon}
                       </span>
                       <button
                          onClick={() => updateSchedule(type.id as BackupType, { enabled: !schedule.enabled })}
                          disabled={!autoBackupConfig.enabled}
                          className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-all ${schedule.enabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                        >
                          {schedule.enabled ? 'ON' : 'OFF'}
                       </button>
                    </div>
                    <h4 className="font-black text-slate-800 uppercase text-[9px] mb-1">{type.label}</h4>
                    <select
                      value={schedule.frequency}
                      onChange={(e) => updateSchedule(type.id as BackupType, { frequency: parseInt(e.target.value) })}
                      disabled={!autoBackupConfig.enabled || !schedule.enabled}
                      className="w-full p-1 bg-slate-50 border border-slate-100 rounded text-[9px] font-bold uppercase outline-none mb-1.5"
                    >
                      <option value={4}>4h</option>
                      <option value={12}>12h</option>
                      <option value={24}>24h</option>
                      <option value={168}>1 sem</option>
                    </select>
                    {schedule.enabled && schedule.lastBackup && (
                      <p className="text-[8px] text-slate-400 font-bold uppercase tabular-nums">
                        Sync: {new Date(schedule.lastBackup).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            
            {autoBackupConfig.enabled && (!hasAutoBackupDir || autoBackupPermission !== 'granted') && (
              <p className="text-amber-600 text-[9px] mt-1.5 font-black uppercase flex items-center gap-2 italic">
                <AlertCircle size={10} /> Configuration du dossier requise
              </p>
            )}

            {window.self !== window.top && (
              <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg flex items-start gap-2">
                <ShieldCheck className="text-blue-600 shrink-0" size={14} />
                <p className="text-blue-800 text-[9px] font-bold uppercase leading-normal tracking-tight">
                  <span className="font-black text-blue-900 border-b border-blue-200 mr-1">NOTE TECHNIQUE :</span> 
                  Activez via 'Ouvrir en nouvel onglet' pour autoriser l'accès aux dossiers locaux navigateur.
                </p>
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100"><Cloud size={16} /></div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Firebase Cloud</h3>
                  <p className="text-slate-500 text-[9px] font-bold uppercase tracking-tight">Synchronisation réseau</p>
                </div>
              </div>
              <p className="text-slate-500 text-[10px] font-bold uppercase leading-relaxed tracking-tight">Synchronisez vos données avec Firebase si vous utilisez l'application sur un nouvel appareil ou domaine.</p>
              
              {user && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                     <span>Utilisateur Connecté :</span>
                     <span className="text-slate-800 font-black italic">{user.email}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
                     <span>Base Firestore ID :</span>
                     <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-100 max-w-[200px] truncate font-bold text-slate-700" title={firebaseConfig.firestoreDatabaseId}>{firebaseConfig.firestoreDatabaseId}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
                     <span>Projet Firebase :</span>
                     <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-100 max-w-[200px] truncate font-bold text-slate-700" title={firebaseConfig.projectId}>{firebaseConfig.projectId}</span>
                  </div>
                  <button 
                    onClick={handleSignOut}
                    className="mt-1 w-full py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    <LogOut size={12} strokeWidth={2.5} /> Se Déconnecter
                  </button>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-2 w-full mt-2">
                <button 
                  onClick={handleMigration}
                  disabled={isMigrating}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${isMigrating ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  <Upload size={13} /> Envoyer vers Cloud
                </button>
                <button 
                  onClick={async () => {
                    setIsMigrating(true);
                    setImportLogs([]);
                    const success = await db.syncFromCloud((msg) => setMigrationMsg(msg));
                    setIsMigrating(false);
                    if (success) {
                      setAlertState({
                        isOpen: true,
                        title: "Synchronisation Réussie",
                        message: "Vos données ont été récupérées depuis Firebase !"
                      });
                      setTimeout(() => window.location.reload(), 2000);
                    }
                  }}
                  disabled={isMigrating}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${isMigrating ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-blue-900'}`}
                >
                  <Download size={13} /> Récupérer du Cloud
                </button>
              </div>
          </div>

          {(importLogs.length > 0 || isImporting) && (
            <div className="bg-[#0f172a] rounded-xl p-3.5 shadow-xl border border-slate-800">
               <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-2 text-blue-400">
                    <Terminal size={12} />
                    <span className="font-black text-[8px] uppercase tracking-[0.2em]">Live Monitoring</span>
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full ${isImporting ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`}></div>
               </div>
               <div className="space-y-1 font-mono text-[9px] h-28 overflow-y-auto pr-2 custom-scrollbar tabular-nums">
                  {importLogs.map((log, idx) => (
                    <div key={idx} className={`flex gap-2 ${log.includes('ERREUR') ? 'text-red-400 bg-red-400/5 p-1 rounded' : log.includes('SYNK') ? 'text-blue-400' : 'text-slate-400'}`}>
                       <span className="opacity-30">{idx + 1}</span>
                       <span>{log}</span>
                    </div>
                  ))}
               </div>
            </div>
          )}
          
          <div className="bg-red-50/50 p-4 rounded-xl border border-red-100 flex items-center justify-between gap-4">
             <div className="flex items-center gap-3">
                <AlertCircle className="text-red-400" size={24} />
                <div>
                   <p className="font-black text-red-900 uppercase text-[10px] tracking-widest italic">Hard Reset</p>
                   <p className="text-[8px] text-red-600 font-bold uppercase tracking-tight">Efface toutes les données locales.</p>
                </div>
             </div>
             <button onClick={() => {
               setConfirmState({
                 isOpen: true,
                 title: "Hard Reset",
                 message: "Toutes les données seront supprimées. Confirmer ?",
                 onConfirm: () => {
                   db.resetAll();
                   window.location.reload();
                 }
               });
             }} className="px-4 py-2 bg-white text-red-600 border border-red-100 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">
                RAZ COMPLÈTE
             </button>
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
    </Layout>
  );
};

const ConfigInput = ({ label, value, onChange, placeholder }: any) => (
  <div className="space-y-1">
    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider italic">{label}</label>
    <input 
      type="text" 
      value={value || ''} 
      onChange={e => onChange(e.target.value)} 
      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-blue-500 focus:bg-white focus:border-blue-300 outline-none transition-all placeholder:text-slate-300" 
      placeholder={placeholder} 
    />
  </div>
);

const EditableConfigSection = ({ title, items, onUpdate }: any) => {
  const [val, setVal] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const handleEditSave = (index: number) => {
    const newItems = [...items];
    newItems[index] = editVal;
    onUpdate(newItems);
    setEditingIndex(null);
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-[250px] max-h-[320px]">
      <h3 className="font-serif text-base text-slate-900 italic mb-2.5 border-b border-slate-100 pb-2">{title}</h3>
      <div className="flex-1 space-y-1 mb-3 overflow-y-auto pr-1 custom-scrollbar">
        {items.map((it: string, idx: number) => (
          <div key={`${it}-${idx}`} className="flex justify-between items-center px-2.5 py-1.5 bg-slate-50 rounded-lg group hover:bg-white border border-transparent hover:border-blue-100 transition-all">
            {editingIndex === idx ? (
              <input 
                autoFocus 
                value={editVal} 
                onChange={e => setEditVal(e.target.value)} 
                onBlur={() => handleEditSave(idx)}
                onKeyPress={e => e.key === 'Enter' && handleEditSave(idx)}
                className="flex-1 bg-white px-2 py-0.5 rounded border border-blue-200 outline-none text-[11px] font-bold text-slate-800"
              />
            ) : (
              <div className="flex-1 flex items-center justify-between min-w-0 pr-1.5">
                <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-tight truncate">{it}</span>
                <button 
                  onClick={() => { setEditingIndex(idx); setEditVal(it); }}
                  className="p-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Edit size={12} />
                </button>
              </div>
            )}
            <button onClick={() => onUpdate(items.filter((_: string, i: number) => i !== idx))} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><Trash2 size={12}/></button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 pt-2.5 border-t border-slate-100">
        <input type="text" value={val} onChange={e => setVal(e.target.value)} onKeyPress={e => e.key === 'Enter' && val && (onUpdate([...items, val]), setVal(''))} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold uppercase outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all" placeholder="Ajouter..." />
        <button onClick={() => { if(val) onUpdate([...items, val]); setVal(''); }} className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all cursor-pointer shrink-0">+</button>
      </div>
    </div>
  );
};

const EditableBreedsSection = ({ breeds, species, onUpdate }: any) => {
  const [selectedSpecies, setSelectedSpecies] = useState(species[0] || '');
  const [newBreed, setNewBreed] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const handleAdd = () => {
    if (newBreed && selectedSpecies) {
      const currentBreeds = breeds[selectedSpecies] || [];
      onUpdate({ ...breeds, [selectedSpecies]: [...currentBreeds, newBreed] });
      setNewBreed('');
    }
  };

  const handleEditSave = (index: number) => {
    const currentBreeds = [...(breeds[selectedSpecies] || [])];
    currentBreeds[index] = editVal;
    onUpdate({ ...breeds, [selectedSpecies]: currentBreeds });
    setEditingIndex(null);
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-[250px] max-h-[320px]">
      <h3 className="font-serif text-base text-slate-900 italic mb-2.5 border-b border-slate-100 pb-2">Races par espèce</h3>
      <select value={selectedSpecies} onChange={e => setSelectedSpecies(e.target.value)} className="w-full px-2.5 py-1.5 mb-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold uppercase text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 transition-all">
        {species.map((s: string) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="flex-1 space-y-1 mb-3 overflow-y-auto pr-1 custom-scrollbar">
        {(breeds[selectedSpecies] || []).map((b: string, idx: number) => (
          <div key={`${b}-${idx}`} className="flex justify-between items-center px-2.5 py-1.5 bg-slate-50 rounded-lg group hover:bg-white border border-transparent hover:border-blue-100 transition-all">
            {editingIndex === idx ? (
              <input 
                autoFocus 
                value={editVal} 
                onChange={e => setEditVal(e.target.value)} 
                onBlur={() => handleEditSave(idx)}
                onKeyPress={e => e.key === 'Enter' && handleEditSave(idx)}
                className="flex-1 bg-white px-2 py-0.5 rounded border border-blue-200 outline-none text-[11px] font-bold text-slate-800"
              />
            ) : (
              <div className="flex-1 flex items-center justify-between min-w-0 pr-1.5">
                <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-tight truncate">{b}</span>
                <button 
                  onClick={() => { setEditingIndex(idx); setEditVal(b); }}
                  className="p-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Edit size={12} />
                </button>
              </div>
            )}
            <button onClick={() => onUpdate({ ...breeds, [selectedSpecies]: (breeds[selectedSpecies] || []).filter((_: string, i: number) => i !== idx) })} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><Trash2 size={12}/></button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 pt-2.5 border-t border-slate-100">
        <input type="text" value={newBreed} onChange={e => setNewBreed(e.target.value)} onKeyPress={e => e.key === 'Enter' && newBreed && handleAdd()} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold uppercase outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all" placeholder="Race..." />
        <button onClick={handleAdd} className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all cursor-pointer shrink-0">+</button>
      </div>
    </div>
  );
};

const EditableProductsSection = ({ products, onUpdate }: any) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const handleAdd = () => {
    if (name && price) {
      const newProduct = {
        id: Math.random().toString(36).substring(2, 15),
        name,
        price: parseFloat(price)
      };
      onUpdate([...products, newProduct]);
      setName('');
      setPrice('');
    }
  };

  const handleEditSave = (id: string) => {
    const newProducts = products.map((p: any) => p.id === id ? { ...p, name: editName, price: parseFloat(editPrice) } : p);
    onUpdate(newProducts);
    setEditingId(null);
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-[260px] col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
      <h3 className="font-serif text-lg text-slate-900 italic mb-3 border-b border-slate-100 pb-2">Boutique & Articles</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-3 overflow-y-auto max-h-[260px] pr-1 custom-scrollbar">
        {products.map((p: any) => (
          <div key={p.id} className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-xl group hover:bg-white border border-transparent hover:border-blue-100 transition-all">
            {editingId === p.id ? (
              <div className="flex gap-2 flex-1">
                <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 bg-white px-2.5 py-1 rounded-lg border border-blue-200 outline-none text-xs font-bold text-slate-800" />
                <input value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-16 bg-white px-2 py-1 rounded-lg border border-blue-200 outline-none text-xs font-bold text-slate-800" />
                <button onClick={() => handleEditSave(p.id)} className="p-1.5 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"><CheckCircle2 size={15}/></button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between min-w-0 pr-2">
                <div className="min-w-0">
                  <span className="font-serif text-sm text-slate-800 italic leading-tight block truncate">{p.name}</span>
                  <span className="text-[11px] text-blue-600 font-bold tabular-nums">{p.price.toFixed(2)} €</span>
                </div>
                <button 
                  onClick={() => { setEditingId(p.id); setEditName(p.name); setEditPrice(p.price.toString()); }}
                  className="p-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Edit size={13} />
                </button>
              </div>
            )}
            <button onClick={() => onUpdate(products.filter((i: any) => i.id !== p.id))} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><Trash2 size={13}/></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap sm:flex-nowrap gap-2 pt-3 border-t border-slate-100">
        <input type="text" value={name} onChange={e => setName(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold uppercase outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all" placeholder="Désignation de l'article..." />
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all" placeholder="Prix €" />
        <button onClick={handleAdd} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold uppercase text-[11px] tracking-wider hover:bg-blue-700 transition-all active:scale-95 whitespace-nowrap">Ajouter</button>
      </div>
    </div>
  );
};

export default App;
