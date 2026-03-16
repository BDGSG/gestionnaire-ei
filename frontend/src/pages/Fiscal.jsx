import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20ac';

const CATEGORY_COLORS = {
  tva: 'bg-blue-100 text-blue-700',
  ir: 'bg-purple-100 text-purple-700',
  cfe: 'bg-orange-100 text-orange-700',
  urssaf: 'bg-green-100 text-green-700',
  das2: 'bg-pink-100 text-pink-700',
  liasse: 'bg-indigo-100 text-indigo-700',
  autre: 'bg-gray-100 text-gray-700'
};

export default function Fiscal() {
  const [deadlines, setDeadlines] = useState([]);
  const [tvaSummary, setTvaSummary] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    api.getDeadlines().then(setDeadlines).catch(console.error);
    api.getTvaSummary(year).then(setTvaSummary).catch(console.error);
  }, [year]);

  const markDone = async (id) => {
    await api.updateDeadline(id, { status: 'done' });
    api.getDeadlines().then(setDeadlines);
  };

  const pendingDeadlines = deadlines.filter(d => d.status === 'pending').sort((a, b) => new Date(a.deadline_date) - new Date(b.deadline_date));
  const doneDeadlines = deadlines.filter(d => d.status === 'done');

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Fiscal & TVA</h2>

      {/* Résumé TVA annuel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-800">Résumé TVA {year}</h3>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {tvaSummary && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-sm text-green-600">TVA collectée</p>
                <p className="text-xl font-bold text-green-700">{fmt(tvaSummary.total.collected)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-600">TVA déductible</p>
                <p className="text-xl font-bold text-blue-700">{fmt(tvaSummary.total.deductible)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <p className="text-sm text-orange-600">TVA à reverser</p>
                <p className="text-xl font-bold text-orange-700">{fmt(tvaSummary.total.due)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Mois</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Collectée</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Déductible</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">À reverser</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tvaSummary.months.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{MONTHS[i]}</td>
                      <td className="px-4 py-2 text-right text-green-600">{fmt(m.collected)}</td>
                      <td className="px-4 py-2 text-right text-blue-600">{fmt(m.deductible)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${m.due >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {fmt(m.due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Échéances fiscales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-orange-500" /> À faire ({pendingDeadlines.length})
          </h3>
          <div className="space-y-2">
            {pendingDeadlines.map(d => {
              const days = Math.ceil((new Date(d.deadline_date) - new Date()) / 86400000);
              const isUrgent = days <= 7;
              const isPast = days < 0;
              return (
                <div key={d.id} className={`flex items-center justify-between p-3 rounded-lg ${isPast ? 'bg-red-50' : isUrgent ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[d.category]}`}>{d.category.toUpperCase()}</span>
                      <p className="text-sm font-medium text-gray-800">{d.title}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(d.deadline_date).toLocaleDateString('fr-FR')} {isPast ? '(EN RETARD)' : `(J-${days})`}</p>
                  </div>
                  <button onClick={() => markDone(d.id)} className="p-2 hover:bg-green-100 rounded-lg text-green-600" title="Marquer fait">
                    <CheckCircle size={18} />
                  </button>
                </div>
              );
            })}
            {pendingDeadlines.length === 0 && <p className="text-green-600 text-sm">Tout est à jour !</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-500" /> Complétées ({doneDeadlines.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {doneDeadlines.slice(0, 20).map(d => (
              <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg bg-green-50">
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                <div>
                  <p className="text-sm text-gray-600">{d.title}</p>
                  <p className="text-xs text-gray-400">{new Date(d.deadline_date).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>
            ))}
            {doneDeadlines.length === 0 && <p className="text-gray-400 text-sm">Aucune échéance complétée</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
