import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, Download, CheckCircle, Eye, Trash2 } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500'
};
const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' };
const ACTIVITY_LABELS = { vtc: 'VTC', ecommerce: 'E-commerce', services_numeriques: 'Services num.' };

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20ac';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState({});
  const [form, setForm] = useState({ client_id: '', activity: 'vtc', tva_rate: 20, items: [{ description: '', quantity: 1, unit_price_ht: 0 }] });

  const load = () => api.getInvoices(filter).then(setInvoices).catch(console.error);
  useEffect(() => { load(); api.getClients().then(setClients); }, [filter]);

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
      setForm({ client_id: '', activity: 'vtc', tva_rate: 20, items: [{ description: '', quantity: 1, unit_price_ht: 0 }] });
      load();
    } catch (err) { alert(err.message); }
  };

  const markPaid = async (id) => {
    await api.markInvoicePaid(id, {}).catch(err => alert(err.message));
    load();
  };

  const totalHt = form.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price_ht || 0), 0);
  const totalTtc = totalHt * (1 + (form.tva_rate || 20) / 100);

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
          <button onClick={() => setShowForm(true)}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">N°</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Activité</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total TTC</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => {
                const clientName = inv.clients?.company_name || `${inv.clients?.first_name || ''} ${inv.clients?.last_name || ''}`.trim();
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
                          <button onClick={() => markPaid(inv.id)} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Marquer payée">
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

      {/* Modal création */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit}
            className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">Nouvelle facture</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sélectionner...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name || `${c.first_name || ''} ${c.last_name || ''}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Activité</label>
                <select value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="vtc">VTC</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="services_numeriques">Services numériques</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Lignes</label>
                <button type="button" onClick={addItem} className="text-primary-600 text-sm hover:underline">+ Ajouter</button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input placeholder="Description" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
                  <input type="number" placeholder="Qté" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
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
              <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">Créer la facture</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
