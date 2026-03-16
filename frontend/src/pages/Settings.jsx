import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Save } from 'lucide-react';

export default function Settings() {
  const [company, setCompany] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getCompany().then(setCompany).catch(console.error);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateCompany(company);
      alert('Informations mises à jour !');
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  if (!company) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const Field = ({ label, field, type = 'text' }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={company[field] || ''} onChange={e => setCompany({ ...company, [field]: e.target.value })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500" />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Paramètres entreprise</h2>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identité */}
        <Section title="Identité de l'entreprise">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Dénomination" field="business_name" />
            <Field label="Forme juridique" field="legal_form" />
            <Field label="Nom du dirigeant" field="owner_name" />
            <Field label="SIRET" field="siret" />
            <Field label="SIREN" field="siren" />
            <Field label="Code APE" field="code_ape" />
            <Field label="N° TVA Intracommunautaire" field="tva_number" />
          </div>
        </Section>

        {/* Adresse */}
        <Section title="Adresse">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Adresse" field="address_line1" />
            <Field label="Complément" field="address_line2" />
            <Field label="Code postal" field="postal_code" />
            <Field label="Ville" field="city" />
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" field="email" type="email" />
            <Field label="Téléphone" field="phone" />
          </div>
        </Section>

        {/* RC Pro */}
        <Section title="Assurance RC Pro">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assureur" field="rc_pro_insurer" />
            <Field label="N° de police" field="rc_pro_policy_number" />
          </div>
        </Section>

        {/* Banque */}
        <Section title="Coordonnées bancaires">
          <div className="grid grid-cols-2 gap-4">
            <Field label="IBAN" field="bank_iban" />
            <Field label="BIC" field="bank_bic" />
          </div>
        </Section>

        {/* Facturation */}
        <Section title="Paramètres de facturation">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Préfixe factures" field="invoice_prefix" />
            <Field label="Préfixe devis" field="quote_prefix" />
            <Field label="Délai de paiement (jours)" field="default_payment_delay_days" type="number" />
            <Field label="Taux pénalités retard (%)" field="default_late_penalty_rate" type="number" />
          </div>
        </Section>

        <button type="submit" disabled={saving}
          className="bg-primary-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}
