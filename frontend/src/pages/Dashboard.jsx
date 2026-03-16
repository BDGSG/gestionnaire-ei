import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { TrendingUp, TrendingDown, Receipt, AlertTriangle, FileText, Calendar } from 'lucide-react';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const ACTIVITY_LABELS = { vtc: 'VTC', ecommerce: 'E-commerce', services_numeriques: 'Services num.', general: 'Général' };
const ACTIVITY_COLORS = { vtc: 'bg-blue-500', ecommerce: 'bg-green-500', services_numeriques: 'bg-purple-500', general: 'bg-gray-500' };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  if (!data) return <p className="text-red-500">Erreur de chargement</p>;

  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' \u20ac';
  const maxCa = Math.max(...data.year.caByMonth, 1);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={TrendingUp} label="CA du mois" value={fmt(data.month.ca)} color="text-green-600" bg="bg-green-50" />
        <KpiCard icon={TrendingDown} label="Dépenses du mois" value={fmt(data.month.depenses)} color="text-red-600" bg="bg-red-50" />
        <KpiCard icon={Receipt} label="TVA à reverser" value={fmt(data.month.tvaDue)} color="text-orange-600" bg="bg-orange-50" />
        <KpiCard icon={TrendingUp} label="CA annuel" value={fmt(data.year.ca)} color="text-blue-600" bg="bg-blue-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graphique CA mensuel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Chiffre d'affaires mensuel ({new Date().getFullYear()})</h3>
          <div className="flex items-end gap-2 h-48">
            {data.year.caByMonth.map((ca, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{ca > 0 ? Math.round(ca) + '\u20ac' : ''}</span>
                <div className="w-full bg-primary-400 rounded-t transition-all" style={{ height: `${Math.max((ca / maxCa) * 100, 2)}%` }} />
                <span className="text-xs text-gray-500">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CA par activité */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Par activité</h3>
          <div className="space-y-3">
            {Object.entries(data.year.caByActivity).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{ACTIVITY_LABELS[key] || key}</span>
                  <span className="font-medium">{fmt(val)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className={`${ACTIVITY_COLORS[key] || 'bg-gray-400'} h-2 rounded-full`} style={{ width: `${Math.round((val / data.year.ca) * 100)}%` }} />
                </div>
              </div>
            ))}
            {Object.keys(data.year.caByActivity).length === 0 && <p className="text-gray-400 text-sm">Aucune recette enregistrée</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Factures impayées */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-orange-500" /> Factures impayées ({data.unpaidInvoices.length})
          </h3>
          {data.unpaidInvoices.length === 0 ? (
            <p className="text-green-600 text-sm">Aucune facture impayée !</p>
          ) : (
            <div className="space-y-2">
              {data.unpaidInvoices.map(inv => (
                <div key={inv.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">
                      {inv.ei_clients?.company_name || `${inv.ei_clients?.first_name || ''} ${inv.ei_clients?.last_name || ''}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(inv.total_ttc)}</p>
                    <p className="text-xs text-red-500">Échéance: {new Date(inv.due_date).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prochaines échéances fiscales */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-blue-500" /> Prochaines échéances
          </h3>
          <div className="space-y-2">
            {(data.deadlines || []).map(d => {
              const days = Math.ceil((new Date(d.deadline_date) - new Date()) / 86400000);
              const urgency = days <= 7 ? 'text-red-600 bg-red-50' : days <= 14 ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50';
              return (
                <div key={d.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-gray-500">{d.description}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${urgency}`}>J-{days}</span>
                </div>
              );
            })}
            {(!data.deadlines || data.deadlines.length === 0) && <p className="text-gray-400 text-sm">Aucune échéance à venir</p>}
          </div>
        </div>
      </div>

      {/* Documents récents */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={18} className="text-gray-500" /> Documents récents
        </h3>
        {data.recentDocs.length === 0 ? (
          <p className="text-gray-400 text-sm">Envoyez un document via Telegram pour commencer</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.recentDocs.map(doc => (
              <div key={doc.id} className="p-3 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                <p className="text-xs text-gray-500 mt-1">{doc.category}</p>
                <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`${bg} p-2.5 rounded-lg`}><Icon size={20} className={color} /></div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-lg font-bold ${color}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
