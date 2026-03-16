import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, Edit2, Trash2, Building2, User, Smartphone } from 'lucide-react';

const TYPE_ICONS = { entreprise: Building2, particulier: User, plateforme: Smartphone };
const ACTIVITY_OPTIONS = [
  { value: 'vtc', label: 'VTC' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'services_numeriques', label: 'Services numériques' },
  { value: 'autre', label: 'Autre' },
];

const emptyClient = {
  type: 'particulier', company_name: '', first_name: '', last_name: '',
  siret: '', tva_number: '', address_line1: '', postal_code: '', city: '',
  email: '', phone: '', activity: 'vtc', notes: ''
};

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyClient);

  const load = () => api.getClients().then(setClients).catch(console.error);
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateClient(editing, form);
      } else {
        await api.createClient(form);
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyClient);
      load();
    } catch (err) { alert(err.message); }
  };

  const handleEdit = (client) => {
    setForm(client);
    setEditing(client.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce client ?')) return;
    await api.deleteClient(id).catch(err => alert(err.message));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">Clients ({clients.length})</h2>
        <button onClick={() => { setForm(emptyClient); setEditing(null); setShowForm(true); }}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700">
          <Plus size={16} /> Nouveau client
        </button>
      </div>

      {/* Liste */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(c => {
          const Icon = TYPE_ICONS[c.type] || User;
          const name = c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sans nom';
          return (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Icon size={18} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{name}</p>
                    <p className="text-xs text-gray-500">{c.type} | {c.activity || '-'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(c)} className="p-1.5 hover:bg-gray-100 rounded"><Edit2 size={14} /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              {c.email && <p className="text-xs text-gray-500 mt-2">{c.email}</p>}
              {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
              {c.siret && <p className="text-xs text-gray-400 mt-1">SIRET: {c.siret}</p>}
            </div>
          );
        })}
      </div>

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit}
            className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">{editing ? 'Modifier' : 'Nouveau'} client</h3>

            <div className="grid grid-cols-3 gap-2">
              {['particulier', 'entreprise', 'plateforme'].map(t => (
                <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                  className={`py-2 rounded-lg text-sm font-medium ${form.type === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t}
                </button>
              ))}
            </div>

            {form.type !== 'particulier' && (
              <Input label="Raison sociale" value={form.company_name} onChange={v => setForm({ ...form, company_name: v })} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Prénom" value={form.first_name} onChange={v => setForm({ ...form, first_name: v })} />
              <Input label="Nom" value={form.last_name} onChange={v => setForm({ ...form, last_name: v })} />
            </div>
            <Input label="Adresse" value={form.address_line1} onChange={v => setForm({ ...form, address_line1: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code postal" value={form.postal_code} onChange={v => setForm({ ...form, postal_code: v })} />
              <Input label="Ville" value={form.city} onChange={v => setForm({ ...form, city: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
              <Input label="Téléphone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            </div>
            {form.type === 'entreprise' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="SIRET" value={form.siret} onChange={v => setForm({ ...form, siret: v })} />
                <Input label="N° TVA" value={form.tva_number} onChange={v => setForm({ ...form, tva_number: v })} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activité liée</label>
              <select value={form.activity || ''} onChange={e => setForm({ ...form, activity: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {ACTIVITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Input label="Notes" value={form.notes} onChange={v => setForm({ ...form, notes: v })} />

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Annuler</button>
              <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                {editing ? 'Modifier' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
    </div>
  );
}
