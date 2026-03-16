import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, FileText, ArrowRight } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700', invoiced: 'bg-purple-100 text-purple-700'
};
const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', rejected: 'Refusé', expired: 'Expiré', invoiced: 'Facturé' };

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20ac';

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_id: '', activity: 'services_numeriques', tva_rate: 20, items: [{ description: '', quantity: 1, unit_price_ht: 0 }] });

  const load = () => api.getQuotes().then(setQuotes).catch(console.error);
  useEffect(() => { load(); api.getClients().then(setClients); }, []);

  const addItem = () => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unit_price_ht: 0 }] });
  const updateItem = (i, f, v) => { const items = [...form.items]; items[i] = { ...items[i], [f]: v }; setForm({ ...form, items }); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.createQuote(form).catch(err => alert(err.message));
    setShowForm(false);
    load();
  };

  const convertToInvoice = async (id) => {
    if (!confirm('Convertir ce devis en facture ?')) return;
    await api.convertQuote(id).catch(err => alert(err.message));
    load();
  };

  const totalHt = form.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price_ht || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">Devis ({quotes.length})</h2>
        <button onClick={() => setShowForm(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700">
          <Plus size={16} /> Nouveau devis
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">N°</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total TTC</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {quotes.map(q => {
              const name = q.ei_clients?.company_name || `${q.ei_clients?.first_name || ''} ${q.ei_clients?.last_name || ''}`.trim();
              return (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{q.quote_number}</td>
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3">{new Date(q.issue_date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(q.total_ttc)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[q.status]}`}>
                      {STATUS_LABELS[q.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {q.status === 'accepted' && (
                      <button onClick={() => convertToInvoice(q.id)} className="text-primary-600 hover:underline text-xs flex items-center gap-1 mx-auto">
                        <ArrowRight size={14} /> Facturer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {quotes.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Aucun devis</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit}
            className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">Nouveau devis</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Sélectionner...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name || `${c.first_name || ''} ${c.last_name || ''}`}</option>)}
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
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Lignes</label>
                <button type="button" onClick={addItem} className="text-primary-600 text-sm">+ Ajouter</button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input placeholder="Description" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
                  <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <input type="number" value={item.unit_price_ht} onChange={e => updateItem(i, 'unit_price_ht', parseFloat(e.target.value) || 0)}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-right">
              <p className="text-lg font-bold">Total TTC: {fmt(totalHt * (1 + form.tva_rate / 100))}</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Annuler</button>
              <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Créer le devis</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
