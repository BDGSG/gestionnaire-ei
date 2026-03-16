import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';

const ACTIVITY_LABELS = { vtc: 'VTC', ecommerce: 'E-commerce', services_numeriques: 'Services num.', general: 'Général' };
const EXPENSE_CATEGORIES = [
  'carburant', 'entretien_vehicule', 'assurance', 'telephone', 'internet',
  'logiciel', 'achat_marchandise', 'frais_port', 'comptabilite', 'formation',
  'cotisations_sociales', 'impots_taxes', 'fournitures', 'deplacement', 'autre'
];
const PAYMENT_METHODS = ['virement', 'carte', 'especes', 'cheque', 'prelevement', 'plateforme', 'autre'];

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20ac';

export default function Transactions() {
  const [txs, setTxs] = useState([]);
  const [filter, setFilter] = useState({ year: String(new Date().getFullYear()) });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'recette', activity: 'vtc', date: new Date().toISOString().split('T')[0],
    description: '', amount_ttc: '', tva_rate: 20, payment_method: 'virement', expense_category: ''
  });

  const load = () => api.getTransactions(filter).then(setTxs).catch(console.error);
  useEffect(() => { load(); }, [filter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ttc = parseFloat(form.amount_ttc) || 0;
    const rate = parseFloat(form.tva_rate) || 20;
    const ht = ttc / (1 + rate / 100);
    const tva = ttc - ht;

    await api.createTransaction({
      ...form,
      amount_ht: ht.toFixed(2),
      amount_tva: tva.toFixed(2),
      amount_ttc: ttc.toFixed(2),
      tva_rate: rate
    }).catch(err => alert(err.message));

    setShowForm(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette transaction ?')) return;
    await api.deleteTransaction(id).catch(err => alert(err.message));
    load();
  };

  const totalRecettes = txs.filter(t => t.type === 'recette').reduce((s, t) => s + Number(t.amount_ttc), 0);
  const totalDepenses = txs.filter(t => t.type === 'depense').reduce((s, t) => s + Number(t.amount_ttc), 0);
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">Transactions</h2>
        <div className="flex gap-2">
          <select value={filter.type || ''} onChange={e => setFilter({ ...filter, type: e.target.value || undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Tout</option>
            <option value="recette">Recettes</option>
            <option value="depense">Dépenses</option>
          </select>
          <select value={filter.year || ''} onChange={e => setFilter({ ...filter, year: e.target.value || undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowForm(true)}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700">
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-sm text-gray-500">Recettes</p>
          <p className="text-lg font-bold text-green-600">{fmt(totalRecettes)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-sm text-gray-500">Dépenses</p>
          <p className="text-lg font-bold text-red-600">{fmt(totalDepenses)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-sm text-gray-500">Résultat</p>
          <p className={`text-lg font-bold ${totalRecettes - totalDepenses >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(totalRecettes - totalDepenses)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Activité</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">HT</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">TVA</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">TTC</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {txs.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{new Date(tx.date).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {tx.type === 'recette'
                      ? <ArrowUpRight size={14} className="text-green-500" />
                      : <ArrowDownRight size={14} className="text-red-500" />}
                    <span>{tx.description}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">{ACTIVITY_LABELS[tx.activity] || tx.activity}</td>
                <td className="px-4 py-3 text-right">{fmt(tx.amount_ht)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{fmt(tx.amount_tva)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${tx.type === 'recette' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'depense' ? '-' : ''}{fmt(tx.amount_ttc)}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => handleDelete(tx.id)} className="p-1 hover:bg-red-50 rounded text-red-400"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {txs.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucune transaction</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit}
            className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">Nouvelle transaction</h3>

            <div className="grid grid-cols-2 gap-2">
              {['recette', 'depense'].map(t => (
                <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                  className={`py-2 rounded-lg text-sm font-medium ${form.type === t ? (t === 'recette' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-gray-100'}`}>
                  {t === 'recette' ? 'Recette' : 'Dépense'}
                </button>
              ))}
            </div>

            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Montant TTC" value={form.amount_ttc} onChange={e => setForm({ ...form, amount_ttc: e.target.value })} required step="0.01"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <select value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="vtc">VTC</option>
                <option value="ecommerce">E-commerce</option>
                <option value="services_numeriques">Services num.</option>
                <option value="general">Général</option>
              </select>
            </div>
            <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {form.type === 'depense' && (
              <select value={form.expense_category} onChange={e => setForm({ ...form, expense_category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Catégorie de dépense...</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Annuler</button>
              <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
