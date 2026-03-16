import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, Download, CheckCircle, Trash2, UserPlus, ChevronDown } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500'
};
const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyee', paid: 'Payee', overdue: 'En retard', cancelled: 'Annulee' };
const ACTIVITY_LABELS = { vtc: 'VTC', ecommerce: 'E-commerce', services_numeriques: 'Services num.' };

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20ac';

const emptyNewClient = {
  type: 'particulier', company_name: '', first_name: '', last_name: '',
  siret: '', tva_number: '', address_line1: '', postal_code: '', city: '',
  email: '', phone: '', activity: 'vtc'
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState(emptyNewClient);
  const [creatingClient, setCreatingClient] = useState(false);
  const [filter, setFilter] = useState({});
  const [form, setForm] = useState({ client_id: '', activity: 'vtc', tva_rate: 20, items: [{ description: '', quantity: 1, unit_price_ht: 0 }] });

  const loadInvoices = () => api.getInvoices(filter).then(setInvoices).catch(console.error);
  const loadClients = () => api.getClients().then(setClients).catch(console.error);
  useEffect(() => { loadInvoices(); loadClients(); }, [filter]);

  const addItem = () => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unit_price_ht: 0 }] });
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, j) => j !== i) });
  const updateItem = (i, field, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: val };
    setForm({ ...form, items });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createInvoice(form);
      setShowForm(false);
      setShowNewClient(false);
      setForm({ client_id: '', activity: 'vtc', tva_rate: 20, items: [{ description: '', quantity: 1, unit_price_ht: 0 }] });
      loadInvoices();
    } catch (err) { alert(err.message); }
  };

  const handleCreateClient = async () => {
    setCreatingClient(true);
    try {
      const created = await api.createClient(newClient);
      await loadClients();
      setForm({ ...form, client_id: created.id });
      setShowNewClient(false);
      setNewClient(emptyNewClient);
    } catch (err) { alert(err.message); }
    setCreatingClient(false);
  };

  const markPaid = async (id) => {
    await api.markInvoicePaid(id, {}).catch(err => alert(err.message));
    loadInvoices();
  };

  const totalHt = form.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price_ht || 0), 0);
  const totalTtc = totalHt * (1 + (form.tva_rate || 20) / 100);

  const selectedClientName = (() => {
    const c = clients.find(c => c.id === form.client_id);
    return c ? (c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">Factures ({invoices.length})</h2>
        <div className="flex gap-2">
          <select value={filter.status || ''} onChange={e => setFilter({ ...filter, status: e.target.value || undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={() => { setShowForm(true); setShowNewClient(false); }}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700">
            <Plus size={16} /> Nouvelle facture
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">N</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Activite</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total TTC</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => {
                const clientName = inv.ei_clients?.company_name || `${inv.ei_clients?.first_name || ''} ${inv.ei_clients?.last_name || ''}`.trim();
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{clientName}</td>
                    <td className="px-4 py-3"><span className="text-xs">{ACTIVITY_LABELS[inv.activity]}</span></td>
                    <td className="px-4 py-3">{new Date(inv.issue_date).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(inv.total_ttc)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status]}`}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <a href={api.getInvoicePdfUrl(inv.id)} target="_blank" className="p-1.5 hover:bg-gray-100 rounded" title="PDF">
                          <Download size={14} />
                        </a>
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <button onClick={() => markPaid(inv.id)} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Marquer payee">
                            <CheckCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucune facture</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal creation */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit}
            className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">Nouvelle facture</h3>

            {/* Client selector + nouveau client */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <div className="flex gap-1.5">
                  <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
                    required={!showNewClient}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Selectionner...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.company_name || `${c.first_name || ''} ${c.last_name || ''}`}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowNewClient(!showNewClient)}
                    className={`px-2.5 rounded-lg border text-sm flex items-center gap-1 transition-colors ${showNewClient ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    title="Nouveau client">
                    <UserPlus size={16} />
                  </button>
                </div>
                {form.client_id && selectedClientName && !showNewClient && (
                  <p className="text-xs text-green-600 mt-1">Client: {selectedClientName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Activite</label>
                <select value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="vtc">VTC</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="services_numeriques">Services numeriques</option>
                </select>
              </div>
            </div>

            {/* Formulaire nouveau client inline */}
            {showNewClient && (
              <div className="border border-primary-200 bg-primary-50/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-primary-700 flex items-center gap-1.5">
                    <UserPlus size={16} /> Nouveau client
                  </h4>
                  <button type="button" onClick={() => setShowNewClient(false)} className="text-xs text-gray-500 hover:text-gray-700">Fermer</button>
                </div>

                {/* Type */}
                <div className="grid grid-cols-3 gap-1.5">
                  {['particulier', 'entreprise', 'plateforme'].map(t => (
                    <button key={t} type="button" onClick={() => setNewClient({ ...newClient, type: t })}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${newClient.type === t ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                      {t === 'particulier' ? 'Particulier' : t === 'entreprise' ? 'Entreprise' : 'Plateforme'}
                    </button>
                  ))}
                </div>

                {newClient.type !== 'particulier' && (
                  <input placeholder="Raison sociale *" value={newClient.company_name} onChange={e => setNewClient({ ...newClient, company_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Prenom" value={newClient.first_name} onChange={e => setNewClient({ ...newClient, first_name: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="Nom" value={newClient.last_name} onChange={e => setNewClient({ ...newClient, last_name: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>

                <input placeholder="Adresse" value={newClient.address_line1} onChange={e => setNewClient({ ...newClient, address_line1: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />

                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Code postal" value={newClient.postal_code} onChange={e => setNewClient({ ...newClient, postal_code: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="Ville" value={newClient.city} onChange={e => setNewClient({ ...newClient, city: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Email" type="email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="Telephone" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>

                {newClient.type === 'entreprise' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="SIRET" value={newClient.siret} onChange={e => setNewClient({ ...newClient, siret: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <input placeholder="N TVA intracommunautaire" value={newClient.tva_number} onChange={e => setNewClient({ ...newClient, tva_number: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}

                <button type="button" onClick={handleCreateClient} disabled={creatingClient || (!newClient.company_name && !newClient.last_name)}
                  className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {creatingClient ? 'Creation...' : <><UserPlus size={14} /> Creer et selectionner</>}
                </button>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Lignes</label>
                <button type="button" onClick={addItem} className="text-primary-600 text-sm hover:underline">+ Ajouter</button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input placeholder="Description" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
                  <input type="number" placeholder="Qte" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="0.01" />
                  <input type="number" placeholder="PU HT" value={item.unit_price_ht} onChange={e => updateItem(i, 'unit_price_ht', parseFloat(e.target.value) || 0)}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="0.01" />
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-right">
              <p className="text-sm text-gray-600">Total HT: <strong>{fmt(totalHt)}</strong></p>
              <p className="text-sm text-gray-600">TVA ({form.tva_rate}%): <strong>{fmt(totalHt * form.tva_rate / 100)}</strong></p>
              <p className="text-lg font-bold text-gray-800">Total TTC: {fmt(totalTtc)}</p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Annuler</button>
              <button type="submit" disabled={!form.client_id}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                Creer la facture
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
