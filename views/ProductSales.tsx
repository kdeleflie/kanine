import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, User, FileText, ShoppingBag, Trash2, Users as UsersIcon, History as HistoryIcon
} from 'lucide-react';
import { db } from '../services/database';
import { Client, Product, ProductInvoice, ProductInvoiceItem } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const ProductSales: React.FC<{ syncTrigger?: number, onPrintProductInvoice?: (inv: ProductInvoice) => void }> = ({ syncTrigger, onPrintProductInvoice }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<ProductInvoice[]>([]);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  // New Invoice State
  const [invoiceItems, setInvoiceItems] = useState<ProductInvoiceItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Carte' | 'Chèque' | 'Virement'>('Carte');
  const [invoiceNotes, setInvoiceNotes] = useState('');

  const availableProducts = config?.products || [];

  useEffect(() => {
    const init = async () => {
      const [cls, cfg] = await Promise.all([
        db.getClients(),
        db.getConfig()
      ]);
      setClients(cls);
      setConfig(cfg);
    };
    init();
  }, [syncTrigger]);

  useEffect(() => {
    if (selectedClient) {
      loadHistory(selectedClient.id);
    }
  }, [selectedClient]);

  const loadHistory = async (clientId: string) => {
    const allInvoices = await db.getProductInvoices();
    const filtered = allInvoices.filter(inv => inv.clientId === clientId);
    setHistory(filtered.sort((a, b) => b.date.localeCompare(a.date)));
  };

  const filteredClients = (clients || []).filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.ownerName.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddProduct = (product: Product) => {
    const existing = invoiceItems.find(i => i.productId === product.id);
    if (existing) {
      setInvoiceItems(invoiceItems.map(i => 
        i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setInvoiceItems([...invoiceItems, {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1
      }]);
    }
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setInvoiceItems(invoiceItems.map(i => {
      if (i.productId === productId) {
        const newQ = i.quantity + delta;
        return newQ > 0 ? { ...i, quantity: newQ } : i;
      }
      return i;
    }));
  };

  const handleRemoveItem = (productId: string) => {
    setInvoiceItems(invoiceItems.filter(i => i.productId !== productId));
  };

  const totalAmount = invoiceItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSaveInvoice = async () => {
    if (!selectedClient || invoiceItems.length === 0) return;

    const date = new Date().toISOString();
    const number = await db.getNextInvoiceNumber(date);

    const newInvoice: ProductInvoice = {
      id: generateId(),
      number,
      date,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      ownerName: selectedClient.ownerName,
      amount: totalAmount,
      paymentMethod,
      notes: invoiceNotes,
      items: invoiceItems
    };

    await db.saveProductInvoice(newInvoice);
    setIsCreatingInvoice(false);
    setInvoiceItems([]);
    setInvoiceNotes('');
    await loadHistory(selectedClient.id);
  };

  if (!config) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 max-w-[1600px] mx-auto overflow-hidden">
      {/* Sidebar de sélection client */}
      <div className={`w-full lg:w-[265px] bg-white rounded-2xl border border-blue-100/80 shadow-xs flex flex-col overflow-hidden ${selectedClient ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-3.5 border-b border-blue-100/70 bg-gradient-to-r from-blue-50/70 to-white space-y-2.5">
          <h2 className="font-serif text-base text-slate-900 italic flex items-center gap-2">
            <ShoppingBag size={16} className="text-rose-500" />
            Vente boutique
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={14} />
            <input 
              type="text" 
              placeholder="Rechercher un client..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white rounded-xl text-xs font-medium outline-none border border-blue-100 focus:border-blue-400 placeholder:text-slate-400 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1 custom-scrollbar">
          {filteredClients.map(client => (
            <button 
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className={`w-full flex items-center gap-2.5 p-2 rounded-xl transition-all border ${selectedClient?.id === client.id ? 'bg-gradient-to-r from-blue-50 to-sky-50/70 border-blue-300 shadow-xs' : 'bg-white border-transparent hover:bg-slate-50 hover:border-blue-100'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shrink-0 overflow-hidden text-white font-bold text-xs">
                {client.photoProfile ? (
                  <img src={client.photoProfile} alt={client.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{(client.name || '?').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <h3 className={`font-serif text-sm leading-tight truncate ${selectedClient?.id === client.id ? 'text-blue-950 font-semibold' : 'text-slate-800'}`}>{client.name}</h3>
                <p className="text-[11px] font-medium truncate text-slate-500 leading-tight">
                  {client.ownerName}
                </p>
              </div>
            </button>
          ))}
          {filteredClients.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-xs text-slate-400 font-semibold">Aucun client</p>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className={`flex-1 bg-white rounded-2xl border border-blue-100/80 shadow-xs overflow-hidden flex flex-col ${!selectedClient ? 'hidden lg:flex' : 'flex'}`}>
        {selectedClient ? (
          <>
            <div className="p-4 md:px-5 border-b border-blue-100/80 bg-gradient-to-r from-blue-50/70 via-sky-50/40 to-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
                <button onClick={() => setSelectedClient(null)} className="lg:hidden p-1.5 text-slate-400 hover:text-blue-600 transition-colors shrink-0">
                   <UsersIcon size={18} />
                </button>
                <div className="w-1.5 h-8 bg-gradient-to-b from-blue-600 to-sky-400 rounded-full shrink-0"></div>
                <div className="min-w-0">
                  <h2 className="font-serif text-xl md:text-2xl text-slate-900 italic leading-tight truncate">{selectedClient.name}</h2>
                  <p className="text-[11px] text-blue-700 font-semibold truncate">Responsable · {selectedClient.ownerName}</p>
                </div>
              </div>
              {!isCreatingInvoice && (
                <button 
                  onClick={() => setIsCreatingInvoice(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-xl font-bold text-xs hover:from-blue-700 hover:to-sky-600 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 whitespace-nowrap shrink-0"
                >
                  <Plus size={15} /> Nouvelle vente
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-5 scrollbar-thin">
              {isCreatingInvoice ? (
                <div className="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center bg-blue-50/60 px-4 py-2.5 rounded-xl border border-blue-100">
                    <h3 className="text-xs font-bold text-blue-900 flex items-center gap-2">
                      <ShoppingBag size={15} className="text-blue-600" /> 
                      Nouvelle vente boutique
                    </h3>
                    <button onClick={() => setIsCreatingInvoice(false)} className="px-3 py-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 bg-white border border-slate-200 hover:border-rose-200 rounded-lg transition-all">Annuler</button>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 flex-1 min-h-0">
                    {/* Catalogue Produits */}
                    <div className="xl:col-span-3 flex flex-col gap-3">
                      <div className="flex items-baseline justify-between border-b border-blue-100 pb-1.5">
                        <h4 className="font-serif text-base text-slate-800 italic">Articles du catalogue</h4>
                        <span className="text-[11px] font-semibold text-slate-400">{availableProducts.length} articles</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 overflow-y-auto pr-1 max-h-[460px] custom-scrollbar">
                        {availableProducts.map((p: any) => (
                          <button 
                            key={p.id}
                            onClick={() => handleAddProduct(p)}
                            className="flex flex-col justify-between p-3.5 bg-slate-50/80 rounded-xl hover:bg-blue-50/50 border border-slate-200/70 hover:border-blue-300 transition-all text-left group hover:shadow-xs"
                          >
                            <span className="font-serif text-sm text-slate-800 italic mb-2 group-hover:text-blue-950 transition-colors line-clamp-2">{p.name}</span>
                            <div className="flex justify-between items-center border-t border-slate-200/70 pt-2">
                              <span className="text-[10px] font-medium text-slate-400">Stock: {p.stock || 0}</span>
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md text-xs tabular-nums">{p.price.toFixed(2)} €</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Panier */}
                    <div className="xl:col-span-2 flex flex-col gap-3">
                      <div className="bg-white rounded-2xl border border-blue-200/80 shadow-xs overflow-hidden flex flex-col min-h-[340px]">
                        <div className="bg-gradient-to-r from-[#0f2952] via-blue-700 to-sky-600 text-white px-4 py-3 flex items-center justify-between">
                          <h4 className="font-serif text-base italic">Panier client</h4>
                          <span className="text-[11px] font-semibold text-sky-100 tabular-nums">{invoiceItems.length} article(s)</span>
                        </div>
                        <div className="p-4 flex-1 flex flex-col bg-blue-50/20">
                          {invoiceItems.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-blue-300 gap-2 py-8">
                              <ShoppingBag size={36} strokeWidth={1.25} />
                              <p className="font-serif text-sm italic text-slate-400 text-center">Le panier est vide</p>
                            </div>
                          ) : (
                            <div className="space-y-2 flex-1 overflow-y-auto max-h-[260px] mb-4 pr-1 custom-scrollbar">
                              {invoiceItems.map(item => (
                                <div key={item.productId} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-blue-100 shadow-xs">
                                  <div className="flex-1 min-w-0 pr-3">
                                    <p className="font-serif text-sm text-slate-800 italic leading-tight truncate">{item.name}</p>
                                    <p className="text-[10px] font-semibold text-slate-400 tabular-nums">{item.price.toFixed(2)} € / unité</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                                      <button onClick={() => handleUpdateQuantity(item.productId, -1)} className="px-2 py-1 text-slate-500 hover:text-rose-500 font-bold text-xs">-</button>
                                      <span className="px-2 text-xs font-bold text-slate-800 tabular-nums">{item.quantity}</span>
                                      <button onClick={() => handleUpdateQuantity(item.productId, 1)} className="px-2 py-1 text-slate-500 hover:text-blue-600 font-bold text-xs">+</button>
                                    </div>
                                    <button onClick={() => handleRemoveItem(item.productId)} className="text-slate-300 hover:text-rose-500 p-1.5 transition-colors bg-white rounded-lg border border-slate-100"><Trash2 size={14} /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <div className="mt-auto pt-3 border-t border-blue-100">
                            <div className="flex justify-between items-end mb-3">
                              <p className="text-[11px] font-bold text-slate-500">Total TTC</p>
                              <span className="font-serif text-2xl text-blue-950 tabular-nums leading-none">
                                 {totalAmount.toFixed(2)} <span className="text-base italic text-blue-600">€</span>
                              </span>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="grid grid-cols-4 gap-1.5">
                               {['Carte', 'Espèces', 'Chèque', 'Virement'].map(m => (
                                 <button 
                                   key={m} 
                                   onClick={() => setPaymentMethod(m as any)}
                                   className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${paymentMethod === m ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
                                 >
                                   {m}
                                 </button>
                               ))}
                              </div>
                              
                              <button 
                                onClick={handleSaveInvoice}
                                disabled={invoiceItems.length === 0}
                                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-200/60 hover:from-blue-700 hover:to-sky-600 transition-all active:scale-[0.99] disabled:opacity-35 disabled:cursor-not-allowed"
                              >
                                Finaliser la transaction
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-2 border-b border-blue-100 pb-2">
                    <HistoryIcon size={16} className="text-blue-600" /> 
                    <h3 className="font-serif text-base text-slate-700 italic">Historique des acquisitions</h3>
                  </div>

                  {history.length === 0 ? (
                    <div className="py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
                       <HistoryIcon size={34} className="text-blue-200 mb-2" />
                       <p className="font-serif text-base italic text-slate-400">Aucune transaction archivée pour ce client</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5">
                      {history.map(inv => (
                        <div key={inv.id} className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/70 flex flex-col gap-3 cursor-pointer hover:bg-white hover:border-blue-300 transition-all group relative overflow-hidden active:scale-[0.99] shadow-xs" onClick={() => onPrintProductInvoice && onPrintProductInvoice(inv)}>
                          <div className="flex justify-between items-start z-10 pr-7">
                            <div>
                               <div className="flex items-center gap-2 mb-1">
                                 <h4 className="font-serif text-sm text-slate-900 italic">{inv.number}</h4>
                                 <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md">{inv.paymentMethod}</span>
                               </div>
                               <p className="text-[11px] text-slate-500">{new Date(inv.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            </div>
                            <div className="font-serif text-lg text-blue-700 italic tabular-nums leading-none">
                              {(inv.amount || 0).toFixed(2)} €
                            </div>
                          </div>
                          <div className="space-y-1 z-10 border-t border-slate-200/60 pt-2">
                            {inv.items.map((item) => (
                              <div key={item.productId} className="flex justify-between items-center text-[11px] font-medium text-slate-600">
                                <span className="truncate pr-4 group-hover:text-slate-900 transition-colors">{item.name}</span>
                                <span className="shrink-0 text-slate-400 font-bold whitespace-nowrap">x {item.quantity}</span>
                              </div>
                            ))}
                          </div>
                          <div className="absolute top-3 right-3 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmState({
                                  isOpen: true,
                                  title: 'Supprimer la vente',
                                  message: `Êtes-vous sûr de vouloir supprimer la vente ${inv.number} d'un montant de ${(inv.amount || 0).toFixed(2)}€ ?`,
                                  onConfirm: async () => {
                                    await db.deleteProductInvoice(inv.id);
                                    if (selectedClient) {
                                      loadHistory(selectedClient.id);
                                    }
                                  }
                                });
                              }}
                              className="p-1.5 bg-white text-slate-400 hover:text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-xs border border-slate-200"
                              title="Supprimer la vente"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3 border border-rose-100">
              <ShoppingBag size={26} />
            </div>
            <h3 className="font-serif text-xl italic text-slate-600">Sélectionnez un client dans la liste</h3>
            <p className="text-xs text-slate-400 mt-1">Accédez à l'historique d'achats ou créez une vente boutique</p>
          </div>
        )}
      </div>
      
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

// We need to import UsersIcon and HistoryIcon as they are used but not imported correctly
// Let's fix the imports in the file.
export default ProductSales;
