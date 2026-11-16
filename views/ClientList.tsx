
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, User, Camera, Trash2, Edit3, X, Maximize2, Download, Image as ImageIcon, Euro, 
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { db } from '../services/database';
import { Client, Invoice, Appointment, ProductInvoice, Configuration } from '../types';
import { INITIAL_CONFIG } from '../constants';
import { compressImage } from '../utils/imageCompression';

import { ConfirmModal } from '../components/ConfirmModal';
import { WarningModal } from '../components/WarningModal';
import { PhotoThumbnail } from '../components/PhotoThumbnail';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const ClientList: React.FC<{ syncTrigger?: number, user?: any, initialClientId?: string | null, onPrintInvoice: (inv: Invoice) => void, onPrintProductInvoice: (inv: ProductInvoice) => void }> = ({ syncTrigger, user, initialClientId, onPrintInvoice, onPrintProductInvoice }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [productInvoices, setProductInvoices] = useState<ProductInvoice[]>([]);
  const [config, setConfig] = useState<Configuration>(INITIAL_CONFIG);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [history, setHistory] = useState<(Appointment & { invoice?: Invoice })[]>([]);
  const [formSpecies, setFormSpecies] = useState<string>('Chien');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [formPhotoProfile, setFormPhotoProfile] = useState<string | undefined>(undefined);
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: React.ReactNode, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [warningState, setWarningState] = useState<{isOpen: boolean, title: string, message: string}>({
    isOpen: false,
    title: '',
    message: ''
  });

  const loadClients = async () => {
    const loaded = await db.getClients();
    setClients(loaded);
    return loaded;
  };

  const loadAllData = async () => {
    const [c, inv, pinv, cfg] = await Promise.all([
      db.getClients(),
      db.getInvoices(),
      db.getProductInvoices(),
      db.getConfig()
    ]);
    setClients(c || []);
    setInvoices(inv || []);
    setProductInvoices(pinv || []);
    if (cfg) setConfig(cfg);
    return { clients: c, invoices: inv, productInvoices: pinv, config: cfg };
  };

  useEffect(() => {
    loadAllData();
  }, [user, syncTrigger]);

  useEffect(() => {
    if (selectedClient) {
      setFormPhotoProfile(selectedClient.photoProfile);
    } else {
      setFormPhotoProfile(undefined);
    }
  }, [selectedClient, isEditing]);

  useEffect(() => {
    const init = async () => {
      const { clients: loaded } = await loadAllData();
      if (initialClientId) {
        const found = loaded.find(c => c.id === initialClientId);
        if (found) { 
          setSelectedClient(found); 
          setFormSpecies(found.species); 
          setFormPhotoProfile(found.photoProfile);
          loadHistory(found.id); 
        }
      }
    };
    init();
  }, [initialClientId]);

  const loadHistory = async (clientId: string) => {
    const allAppts = (await db.getAppointments()).filter(a => a.clientId === clientId);
    const allInvoices = await db.getInvoices();
    const combined = allAppts.map(appt => ({
      ...appt,
      invoice: allInvoices.find(inv => inv.appointmentId === appt.id)
    })).sort((a, b) => b.date.localeCompare(a.date));
    setHistory(combined);
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.ownerName.toLowerCase().includes(search.toLowerCase())
  );

  const handleFormPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedBase64 = await compressImage(file);
      setFormPhotoProfile(compressedBase64);
    } catch (error) {
      console.error("Erreur lors de la compression de l'image:", error);
      setWarningState({
        isOpen: true,
        title: "Erreur Photo",
        message: "Impossible de traiter cette photo. Veuillez essayer avec une autre image."
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const newClient: Client = {
      id: selectedClient && isEditing ? selectedClient.id : generateId(),
      name: formData.get('name') as string,
      species: formData.get('species') as string,
      breed: formData.get('breed') as string,
      coatType: formData.get('coatType') as string,
      birthDate: formData.get('birthDate') as string,
      sex: formData.get('sex') as 'M' | 'F',
      weight: parseFloat(formData.get('weight') as string) || 0,
      ownerName: formData.get('ownerName') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
      particularities: Array.from(formData.getAll('particularities')) as string[],
      notes: formData.get('notes') as string,
      photoProfile: formPhotoProfile,
      createdAt: selectedClient?.createdAt || new Date().toISOString(),
      isProfessional: formData.get('isProfessional') === 'on'
    };

    try {
      const success = await db.saveClient(newClient);
      if (success) {
        loadClients(); // Rafraîchit l'état local des clients
        setSelectedClient(newClient);
        setIsEditing(false);
      } else {
        setWarningState({
          isOpen: true,
          title: "Erreur d'enregistrement",
          message: "Impossible d'enregistrer le client. Une erreur est survenue sur le serveur."
        });
      }
    } catch (error) {
      setWarningState({
        isOpen: true,
        title: "Erreur de connexion",
        message: "Impossible de contacter le serveur. Vérifiez votre connexion."
      });
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;
    
    const appts = (await db.getAppointments()).filter(a => a.clientId === selectedClient.id);
    const invs = (await db.getInvoices()).filter(i => i.clientId === selectedClient.id);
    
    setConfirmState({
      isOpen: true,
      title: "Supprimer le client",
      message: `Voulez-vous supprimer ${selectedClient.name} ? ${appts.length > 0 || invs.length > 0 ? `Cela supprimera également ${appts.length} rendez-vous et ${invs.length} factures.` : ''}`,
      onConfirm: async () => {
        await db.deleteClient(selectedClient.id);
        
        // MISE À JOUR FORCÉE DE L'INTERFACE
        await loadAllData();
        setSelectedClient(null);
        setHistory([]);
        setIsEditing(false);
      }
    });
  };

  const handlePetPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;
    
    try {
      const compressedBase64 = await compressImage(file);
      const updatedClient = { ...selectedClient, photoProfile: compressedBase64 };
      if (await db.saveClient(updatedClient)) {
        setSelectedClient(updatedClient);
        loadClients();
      } else {
        setWarningState({
          isOpen: true,
          title: "Mémoire Saturée",
          message: "Impossible de sauvegarder la photo. L'espace de stockage est plein."
        });
      }
    } catch (error) {
      console.error("Erreur lors de la compression de l'image:", error);
      setWarningState({
        isOpen: true,
        title: "Erreur Photo",
        message: "Impossible de traiter cette photo."
      });
    } finally {
      e.target.value = '';
    }
  };

  const downloadImage = (base64: string, name: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `kanine_${name}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAvatarPalette = (species: string) => {
    const s = (species || '').toLowerCase();
    if (s.includes('chat')) return 'from-violet-500 to-indigo-500';
    if (s.includes('nac') || s.includes('lapin')) return 'from-amber-500 to-orange-500';
    return 'from-blue-600 to-sky-500';
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 max-w-[1600px] mx-auto">
      {/* Sidebar - responsive width and height */}
      <div className={`w-full lg:w-[275px] flex flex-col gap-3 bg-white p-3.5 rounded-2xl shadow-xs border border-blue-100/80 overflow-hidden ${selectedClient && !isEditing ? 'hidden lg:flex' : 'flex'}`}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={14} />
            <input type="text" placeholder="Rechercher un client..." className="w-full pl-8 pr-3 py-2 bg-slate-50 rounded-xl text-xs font-medium outline-none border border-slate-200/70 focus:border-blue-400 focus:bg-white placeholder:text-slate-400 transition-all" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => { setSelectedClient(null); setIsEditing(true); setFormSpecies('Chien'); setHistory([]); setFormPhotoProfile(undefined); }} title="Nouveau client" className="p-2 bg-gradient-to-br from-blue-600 to-sky-500 text-white rounded-xl shadow-sm hover:from-blue-700 hover:to-sky-600 active:scale-95 transition-all shrink-0"><Plus size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
          {filteredClients.map(client => {
            const isSelected = selectedClient?.id === client.id;
            const hasAlert = (client.particularities?.length || 0) > 0;
            return (
              <button key={client.id} onClick={() => { setSelectedClient(client); setIsEditing(false); setFormSpecies(client.species); setFormPhotoProfile(client.photoProfile); loadHistory(client.id); }} className={`w-full text-left px-2.5 py-2 rounded-xl transition-all border flex items-center gap-2.5 ${isSelected ? 'bg-gradient-to-r from-blue-50 to-sky-50/70 border-blue-300 shadow-xs' : 'bg-white border-slate-100 hover:bg-slate-50/80 hover:border-blue-100 text-slate-600'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-xs shadow-xs bg-gradient-to-br ${getAvatarPalette(client.species)} overflow-hidden`}>
                  {client.photoProfile ? (
                    <PhotoThumbnail imageRef={client.photoProfile} alt={client.name} />
                  ) : (
                    <span>{(client.name || '?').slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className={`font-serif text-sm leading-tight truncate ${isSelected ? 'text-blue-950 font-semibold' : 'text-slate-800'}`}>{client.name}</h4>
                    {hasAlert && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Vigilance santé/comportement" />}
                  </div>
                  <p className="text-[11px] font-medium truncate text-slate-500 flex items-center gap-1 mt-0.5">
                    <span className={isSelected ? 'text-blue-700 font-semibold' : ''}>{client.ownerName}</span>
                    <span className="text-slate-300">·</span>
                    <span>{client.species}</span>
                  </p>
                </div>
              </button>
            );
          })}
          {filteredClients.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-xs text-slate-400 font-semibold">Aucun résultat</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 bg-white rounded-2xl shadow-xs border border-blue-100/80 overflow-y-auto relative pb-8 ${!selectedClient && !isEditing ? 'hidden lg:block' : 'block'}`}>
        {isEditing ? (
          <div className="p-4 md:p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-blue-100">
              <h2 className="font-serif text-xl text-slate-900 italic flex items-center gap-3">
                <div className="w-1.5 h-6 bg-gradient-to-b from-blue-600 to-sky-400 rounded-full"></div>
                {selectedClient ? 'Modifier la fiche client' : 'Accueillir un nouveau client'}
              </h2>
              <button type="button" onClick={() => setIsEditing(false)} className="px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 hover:bg-rose-50/50 rounded-xl transition-all">Annuler</button>
            </div>
            
            <form onSubmit={handleSaveClient} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-[11px] font-bold text-blue-700 border-b border-blue-100 pb-1.5">Identité du compagnon</h3>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 bg-blue-50/60 rounded-2xl flex items-center justify-center overflow-hidden border border-blue-200 group shrink-0">
                    {formPhotoProfile ? (
                      <PhotoThumbnail imageRef={formPhotoProfile} alt="Profile" />
                    ) : (
                      <Camera className="text-blue-300" size={22} />
                    )}
                    <div className="absolute inset-0 bg-blue-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                       <Plus size={18} className="text-white" />
                    </div>
                    <input type="file" name="photoProfile" onChange={handleFormPhotoUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 leading-snug">
                    Photo de profil du compagnon (cliquer pour modifier).
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 px-0.5">Nom</label>
                    <input name="name" defaultValue={selectedClient?.name} placeholder="Nom de l'animal..." required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Espèce</label>
                      <select name="species" value={formSpecies} onChange={e => setFormSpecies(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none cursor-pointer">
                        {config.species.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Race</label>
                      <select name="breed" defaultValue={selectedClient?.breed} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none cursor-pointer">
                        {(config.breeds[formSpecies] || ["Autre"]).map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Sexe</label>
                      <select name="sex" defaultValue={selectedClient?.sex || 'M'} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none cursor-pointer">
                        <option value="M">Mâle</option>
                        <option value="F">Femelle</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Poids (kg)</label>
                      <input type="number" name="weight" defaultValue={selectedClient?.weight} placeholder="0.0" step="0.1" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none tabular-nums" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Type de poil</label>
                      <select name="coatType" defaultValue={selectedClient?.coatType} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none cursor-pointer">
                        {config.coatTypes.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Date de naissance</label>
                      <input type="date" name="birthDate" defaultValue={selectedClient?.birthDate} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[11px] font-bold text-violet-700 border-b border-violet-100 pb-1.5">Informations propriétaire</h3>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 px-0.5">Nom complet</label>
                    <input name="ownerName" defaultValue={selectedClient?.ownerName} placeholder="Nom & Prénom..." required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Téléphone</label>
                      <input name="phone" defaultValue={selectedClient?.phone} placeholder="Ex: 06..." required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 px-0.5">Email</label>
                      <input type="email" name="email" defaultValue={selectedClient?.email} placeholder="contact@..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none transition-all" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 px-0.5">Adresse postale</label>
                    <input name="address" defaultValue={selectedClient?.address} placeholder="Domicile..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl font-semibold text-xs sm:text-sm text-slate-800 outline-none transition-all" />
                  </div>
                  <label className="flex items-center gap-3 px-3.5 py-2.5 bg-blue-50/50 rounded-xl cursor-pointer hover:bg-blue-50 border border-blue-100 transition-all group">
                    <input type="checkbox" name="isProfessional" defaultChecked={selectedClient?.isProfessional} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200" />
                    <span className="text-xs font-bold text-blue-900">Client professionnel</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-[11px] font-bold text-amber-700">Santé & Comportement</h3>
              <div className="flex flex-wrap gap-1.5">
                {config.particularities.map(p => (
                  <label key={p} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50/40 rounded-lg cursor-pointer hover:bg-amber-50 border border-amber-200/70 transition-all group">
                    <input type="checkbox" name="particularities" value={p} defaultChecked={selectedClient?.particularities.includes(p)} className="w-3.5 h-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-200" />
                    <span className="text-[11px] font-semibold text-slate-700 group-hover:text-amber-900 transition-colors">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 px-0.5">Notes confidentielles</label>
              <textarea name="notes" defaultValue={selectedClient?.notes} placeholder="Informations importantes..." rows={2} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white rounded-xl text-xs sm:text-sm font-medium outline-none h-20 resize-none transition-all"></textarea>
            </div>

            <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-200/60 hover:from-blue-700 hover:to-sky-600 transition-all active:scale-[0.99]">
              Finaliser l'enregistrement
            </button>
          </form>
          </div>
        ) : selectedClient ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Soft Blue-Sky Header Banner */}
            <div className="p-4 md:p-5 bg-gradient-to-r from-blue-50/90 via-sky-50/60 to-white border-b border-blue-100/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
               <div className="flex items-center gap-4 w-full sm:w-auto min-w-0">
                  <button 
                    onClick={() => setSelectedClient(null)} 
                    className="lg:hidden flex items-center gap-1 text-blue-600 font-bold text-xs shrink-0"
                  >
                    <ChevronLeft size={16} /> Retour
                  </button>
                  <div className={`relative group w-16 h-16 md:w-18 md:h-18 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-white shrink-0 shadow-md bg-gradient-to-br ${getAvatarPalette(selectedClient.species)}`}>
                    {selectedClient.photoProfile ? (
                       <div onClick={() => setSelectedPhoto(selectedClient.photoProfile!)} className="w-full h-full cursor-pointer">
                         <PhotoThumbnail imageRef={selectedClient.photoProfile} alt="Profile" />
                       </div>
                    ) : (
                       <span className="text-white font-serif text-xl italic font-semibold">
                         {(selectedClient.name || '?').slice(0, 2).toUpperCase()}
                       </span>
                    )}
                    <label className="absolute inset-0 bg-blue-950/45 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                       <Camera className="text-white" size={18} />
                       <input type="file" onChange={handlePetPhotoUpload} className="hidden" accept="image/*" />
                    </label>
                    {selectedClient.photoProfile && (
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        const updatedClient = { ...selectedClient, photoProfile: undefined };
                        await db.saveClient(updatedClient);
                        setSelectedClient(updatedClient);
                        loadClients();
                      }} className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600 shadow">
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl md:text-3xl text-slate-900 italic truncate">{selectedClient.name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                       <span className="font-bold text-blue-700">{selectedClient.breed} · {selectedClient.species}</span>
                       <span className="text-slate-300">·</span>
                       <span className={`font-semibold ${selectedClient.sex === 'M' ? 'text-sky-700' : 'text-rose-600'}`}>
                          {selectedClient.sex === 'M' ? 'Mâle' : 'Femelle'}
                       </span>
                       {selectedClient.isProfessional && (
                         <>
                           <span className="text-slate-300">·</span>
                           <span className="font-bold text-violet-700">Professionnel</span>
                         </>
                       )}
                    </div>
                  </div>
               </div>
               <div className="flex gap-2 w-full sm:w-auto shrink-0">
                 <button onClick={async () => {
                   const duplicatedClient = { ...selectedClient, id: generateId(), name: `${selectedClient.name} (Copie)`, createdAt: new Date().toISOString() };
                   await db.saveClient(duplicatedClient);
                   loadClients();
                   setSelectedClient(duplicatedClient);
                   setIsEditing(true);
                 }} className="flex-1 sm:flex-none p-2.5 bg-white text-sky-600 rounded-xl hover:bg-sky-50 border border-sky-200/80 transition-all shadow-xs" title="Dupliquer"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
                 <button onClick={() => setIsEditing(true)} className="flex-1 sm:flex-none p-2.5 bg-white text-blue-600 rounded-xl hover:bg-blue-50 border border-blue-200/80 transition-all shadow-xs" title="Modifier"><Edit3 size={16} className="mx-auto"/></button>
                 <button onClick={handleDeleteClient} className="flex-1 sm:flex-none p-2.5 bg-white text-rose-500 rounded-xl hover:bg-rose-50 border border-rose-200/80 transition-all shadow-xs" title="Supprimer"><Trash2 size={16} className="mx-auto"/></button>
               </div>
            </div>

            <div className="p-4 md:p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
               <div className="space-y-5">
                  <section className="space-y-2.5">
                    <h3 className="text-[11px] font-bold text-blue-700 border-b border-blue-100 pb-1.5">Informations de contact</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100/80">
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Détenteur</p>
                        <p className="font-serif text-base text-slate-900 italic truncate">{selectedClient.ownerName}</p>
                      </div>
                      <div className="p-3 bg-sky-50/40 rounded-xl border border-sky-100/80">
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Téléphone</p>
                        <p className="font-bold text-blue-700 text-sm tabular-nums">{selectedClient.phone}</p>
                      </div>
                      {selectedClient.email && (
                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 sm:col-span-2">
                          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Email</p>
                          <p className="font-semibold text-slate-800 text-xs truncate lowercase">{selectedClient.email}</p>
                        </div>
                      )}
                      {selectedClient.address && (
                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 sm:col-span-2">
                          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Adresse de résidence</p>
                          <p className="font-medium text-slate-600 text-xs leading-snug">{selectedClient.address}</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-2.5">
                    <h3 className="text-[11px] font-bold text-amber-700 border-b border-amber-100 pb-1.5">Particularités & Santé</h3>
                    <div className="flex flex-wrap gap-1.5">
                        {selectedClient.particularities.map(p => (
                          <span key={p} className="px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200">{p}</span>
                        ))}
                        {selectedClient.particularities.length === 0 && <p className="text-xs text-slate-400 italic">Aucune particularité enregistrée</p>}
                    </div>
                    {selectedClient.notes && (
                      <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80">
                         <p className="text-xs font-medium text-amber-950 italic leading-relaxed">"{selectedClient.notes}"</p>
                      </div>
                    )}
                  </section>
                  
                  <section className="space-y-2.5">
                    <h3 className="text-[11px] font-bold text-violet-700 border-b border-violet-100 pb-1.5">Caractéristiques physiques</h3>
                    <div className="grid grid-cols-2 gap-2.5">
                       <div className="bg-violet-50/40 p-3 rounded-xl border border-violet-100/80">
                          <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">Pelage</span>
                          <span className="text-xs font-bold text-slate-800">{selectedClient.coatType}</span>
                       </div>
                       <div className="bg-violet-50/40 p-3 rounded-xl border border-violet-100/80">
                          <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">Poids actuel</span>
                          <span className="text-xs font-bold text-slate-800 tabular-nums">{selectedClient.weight} kg</span>
                       </div>
                    </div>
                  </section>
               </div>

               <div className="space-y-5">
                  <div className="space-y-2.5">
                    <h3 className="text-[11px] font-bold text-sky-700 border-b border-sky-100 pb-1.5 flex items-center gap-2"><ImageIcon size={14} className="text-sky-600"/> Album de soins</h3>
                    <div className="space-y-2.5">
                      {history.length > 0 ? history.map(item => (
                        <div key={item.id} className="p-3 bg-sky-50/35 rounded-xl space-y-2 border border-sky-100/80 hover:bg-white hover:border-blue-200 transition-all group">
                          <div className="flex justify-between items-center gap-2">
                            <p className="font-serif text-sm text-slate-800 italic">{new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            <span className="text-[11px] font-semibold text-blue-700 truncate max-w-[60%]">
                              {item.services?.length ? item.services.join(', ') : (item as any).service || 'Soin'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                             <div className="relative h-24 bg-white rounded-lg overflow-hidden border border-slate-200/70 flex items-center justify-center transition-all cursor-pointer group/photo" onClick={() => item.photoBefore && setSelectedPhoto(item.photoBefore)}>
                                {item.photoBefore ? <PhotoThumbnail imageRef={item.photoBefore} alt="Avant" /> : <div className="text-[10px] text-slate-300 font-semibold italic">Avant</div>}
                                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/65 text-white text-[9px] font-bold rounded uppercase opacity-0 group-hover/photo:opacity-100 transition-opacity">Avant</div>
                             </div>
                             <div className="relative h-24 bg-white rounded-lg overflow-hidden border border-blue-200/70 flex items-center justify-center transition-all cursor-pointer group/photo" onClick={() => item.photoAfter && setSelectedPhoto(item.photoAfter)}>
                                {item.photoAfter ? <PhotoThumbnail imageRef={item.photoAfter} alt="Après" /> : <div className="text-[10px] text-slate-300 font-semibold italic">Après</div>}
                                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded uppercase opacity-0 group-hover/photo:opacity-100 transition-opacity">Après</div>
                             </div>
                          </div>
                        </div>
                      )) : (
                        <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/40">
                          <p className="text-xs text-slate-400 italic">Aucun historique disponible</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <h3 className="text-[11px] font-bold text-blue-700 border-b border-blue-100 pb-1.5 flex items-center gap-2">
                      <Euro size={14} className="text-blue-600"/> Historique factures
                    </h3>
                    <div className="space-y-2">
                      {[...invoices.filter(i => i.clientId === selectedClient.id), ...productInvoices.filter(i => i.clientId === selectedClient.id)]
                         .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                         .slice(0, 5)
                         .map(inv => {
                           const isProductInvoice = 'items' in inv && !('appointmentId' in inv);
                           return (
                             <div key={inv.id} className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:bg-blue-50/40 hover:border-blue-200 transition-all group" onClick={() => isProductInvoice ? onPrintProductInvoice(inv as ProductInvoice) : onPrintInvoice(inv as Invoice)}>
                               <div className="flex items-center gap-3 min-w-0">
                                 <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${isProductInvoice ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                                   {isProductInvoice ? <Download size={14} /> : <Euro size={14} />}
                                 </div>
                                 <div className="min-w-0">
                                   <p className="font-bold text-slate-800 text-xs tracking-tight truncate">{inv.number}</p>
                                   <p className="text-[11px] text-slate-500">{new Date(inv.date).toLocaleDateString('fr-FR')} · {isProductInvoice ? 'Boutique' : 'Prestation'}</p>
                                 </div>
                               </div>
                               <div className="flex items-center gap-2 shrink-0">
                                  <p className="font-bold text-blue-700 text-sm tabular-nums">{inv.amount.toFixed(2)} €</p>
                                  <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-all" />
                               </div>
                             </div>
                           );
                         })}
                      {([...invoices.filter(i => i.clientId === selectedClient.id), ...productInvoices.filter(i => i.clientId === selectedClient.id)]).length === 0 && (
                        <p className="text-xs text-slate-400 italic text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/40">Aucune facture émise</p>
                      )}
                    </div>
                  </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mb-3 border border-blue-100">
              <User size={28} />
            </div>
            <p className="font-serif text-lg italic text-slate-600">Choisissez un compagnon dans la liste</p>
            <p className="text-xs text-slate-400 mt-1">Consultez ses coordonnées, son historique de soins et ses photos</p>
          </div>
        )}
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-[999] bg-slate-950/90 flex flex-col items-center justify-center p-4 backdrop-blur-md">
           <button onClick={() => setSelectedPhoto(null)} className="absolute top-6 right-6 p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all shadow-lg"><X size={22}/></button>
           <div className="max-w-4xl max-h-[78vh] flex items-center justify-center">
              <img src={selectedPhoto} alt="Agrandissement" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
           </div>
           <div className="mt-6 flex gap-3">
              <button onClick={() => downloadImage(selectedPhoto, selectedClient?.name || 'animal')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2.5 shadow-xl transition-all active:scale-95 text-sm">
                 <Download size={18} /> Télécharger
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

export default ClientList;
