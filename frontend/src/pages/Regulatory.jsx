import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RefreshCw, CheckCircle, AlertTriangle, Info, Trash2, ExternalLink, Shield } from 'lucide-react';

const SEV_STYLES = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', badge: 'bg-red-100 text-red-700' },
  warning: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' }
};
const SEV_LABELS = { critical: 'Critique', warning: 'Attention', info: 'Info' };
const CAT_ICONS = { facturation: '📄', tva: '🧾', social: '🏥', fiscal: '🏛️', juridique: '⚖️', autre: '📋' };
const CAT_LABELS = { facturation: 'Facturation', tva: 'TVA', social: 'Social', fiscal: 'Fiscal', juridique: 'Juridique', autre: 'Autre' };
const STATUS_LABELS = { new: 'Nouveau', read: 'Lu', applied: 'Applique', dismissed: 'Ignore' };

export default function Regulatory() {
  const [alerts, setAlerts] = useState([]);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState('');

  const load = () => api.getRegulatoryAlerts(filter ? { status: filter } : undefined).then(setAlerts).catch(console.error);
  useEffect(() => { load(); }, [filter]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await api.checkRegulatory();
      load();
      if (result.newCount > 0) {
        alert(`${result.newCount} nouvelle(s) alerte(s) detectee(s) !`);
      } else {
        alert('Aucune nouvelle alerte. Tout est a jour.');
      }
    } catch (err) { alert('Erreur: ' + err.message); }
    setChecking(false);
  };

  const markStatus = async (id, status) => {
    await api.updateRegulatoryAlert(id, { status }).catch(err => alert(err.message));
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette alerte ?')) return;
    await api.deleteRegulatoryAlert(id).catch(err => alert(err.message));
    load();
  };

  const newCount = alerts.filter(a => a.status === 'new').length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status !== 'applied' && a.status !== 'dismissed').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Shield size={22} className="text-primary-600" /> Veille reglementaire
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des nouvelles lois et obligations pour votre EI</p>
        </div>
        <button onClick={handleCheck} disabled={checking}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700 disabled:opacity-50">
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Analyse IA en cours...' : 'Verifier les mises a jour'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total alertes" value={alerts.length} color="text-gray-700" bg="bg-gray-50" />
        <StatCard label="Nouvelles" value={newCount} color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="Critiques" value={criticalCount} color="text-red-700" bg="bg-red-50" />
        <StatCard label="Appliquees" value={alerts.filter(a => a.status === 'applied').length} color="text-green-700" bg="bg-green-50" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['', 'new', 'read', 'applied', 'dismissed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s === '' ? 'Toutes' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      <div className="space-y-3">
        {alerts.map(alert => {
          const sev = SEV_STYLES[alert.severity] || SEV_STYLES.info;
          return (
            <div key={alert.id} className={`${sev.bg} border ${sev.border} rounded-xl p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.badge}`}>
                      {SEV_LABELS[alert.severity]}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {CAT_ICONS[alert.category]} {CAT_LABELS[alert.category] || alert.category}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${alert.status === 'new' ? 'bg-blue-100 text-blue-700' : alert.status === 'applied' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[alert.status]}
                    </span>
                  </div>
                  <h3 className="font-bold text-gray-800 mt-2">{alert.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{alert.description}</p>

                  {alert.action_required && (
                    <div className="mt-3 p-3 bg-white/60 rounded-lg border border-white">
                      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                        <CheckCircle size={12} /> Action requise:
                      </p>
                      <p className="text-sm text-gray-700 mt-0.5">{alert.action_required}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    {alert.effective_date && <span>Date d'effet: {new Date(alert.effective_date).toLocaleDateString('fr-FR')}</span>}
                    {alert.source_url && (
                      <a href={alert.source_url} target="_blank" rel="noopener" className="text-primary-600 hover:underline flex items-center gap-0.5">
                        <ExternalLink size={10} /> Source
                      </a>
                    )}
                    <span>Detecte le {new Date(alert.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  {alert.status !== 'applied' && (
                    <button onClick={() => markStatus(alert.id, 'applied')}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 flex items-center gap-1">
                      <CheckCircle size={12} /> Applique
                    </button>
                  )}
                  {alert.status === 'new' && (
                    <button onClick={() => markStatus(alert.id, 'read')}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50">
                      Marquer lu
                    </button>
                  )}
                  <button onClick={() => handleDelete(alert.id)}
                    className="px-3 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-xs flex items-center gap-1 justify-center">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Shield size={48} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">Aucune alerte reglementaire</p>
            <p className="text-sm mt-1">Cliquez sur "Verifier les mises a jour" pour scanner les nouvelles obligations</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-xl p-4 text-center`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
