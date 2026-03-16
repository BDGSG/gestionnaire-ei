import React, { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { Upload, Search, Download, Trash2, FolderOpen, Filter } from 'lucide-react';

const CATEGORIES = [
  { value: '', label: 'Toutes catégories' },
  { value: 'facture_emise', label: 'Factures émises' },
  { value: 'facture_recue', label: 'Factures reçues' },
  { value: 'devis', label: 'Devis' },
  { value: 'releve_bancaire', label: 'Relevés bancaires' },
  { value: 'fiscal', label: 'Documents fiscaux' },
  { value: 'social_urssaf', label: 'URSSAF / Social' },
  { value: 'assurance', label: 'Assurances' },
  { value: 'contrat', label: 'Contrats' },
  { value: 'administratif', label: 'Administratif' },
  { value: 'vehicule', label: 'Véhicule' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'autre', label: 'Autre' },
];

const CATEGORY_ICONS = {
  facture_emise: '📄', facture_recue: '📥', devis: '📋', releve_bancaire: '🏦',
  fiscal: '🏛️', social_urssaf: '🏥', assurance: '🛡️', contrat: '📝',
  administratif: '📁', vehicule: '🚗', ecommerce: '🛒', autre: '📎'
};

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => {
    const params = {};
    if (search) params.search = search;
    if (category) params.category = category;
    if (year) params.year = year;
    api.getDocuments(params).then(setDocs).catch(console.error);
  };

  useEffect(() => { load(); }, [category, year]);

  const handleSearch = (e) => {
    e.preventDefault();
    load();
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadDocument(file);
      load();
      alert(`Document classifié: ${result.classification?.category || 'autre'} - ${result.classification?.title || file.name}`);
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
    setUploading(false);
    fileRef.current.value = '';
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce document ?')) return;
    await api.deleteDocument(id).catch(err => alert(err.message));
    load();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">Documents ({docs.length})</h2>
        <div className="flex gap-2">
          <input type="file" ref={fileRef} onChange={handleUpload} className="hidden" accept="image/*,.pdf" />
          <button onClick={() => fileRef.current.click()} disabled={uploading}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700 disabled:opacity-50">
            <Upload size={16} /> {uploading ? 'Analyse IA...' : 'Uploader'}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">Chercher</button>
        </form>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Toutes années</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Grille documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map(doc => (
          <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{CATEGORY_ICONS[doc.category] || '📎'}</span>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{doc.title}</p>
                  <p className="text-xs text-gray-500">{CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}</p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <a href={api.getDocumentDownloadUrl(doc.id)} className="p-1.5 hover:bg-gray-100 rounded" title="Télécharger">
                  <Download size={14} />
                </a>
                <button onClick={() => handleDelete(doc.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {doc.extracted_date && <p className="text-xs text-gray-500">Date: {new Date(doc.extracted_date).toLocaleDateString('fr-FR')}</p>}
              {doc.extracted_amount && <p className="text-xs text-gray-600 font-medium">{Number(doc.extracted_amount).toFixed(2)} EUR</p>}
              {doc.extracted_vendor && <p className="text-xs text-gray-500">De: {doc.extracted_vendor}</p>}
              {doc.description && <p className="text-xs text-gray-400 truncate">{doc.description}</p>}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">{doc.year}</span>
              {doc.ai_classification_confidence > 0 && (
                <span className="text-xs text-gray-400">IA: {Math.round(doc.ai_classification_confidence * 100)}%</span>
              )}
              <span className="text-xs text-gray-400">{doc.source === 'telegram' ? 'Via Telegram' : 'Upload web'}</span>
            </div>
          </div>
        ))}
        {docs.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <FolderOpen size={48} className="mx-auto mb-3 opacity-50" />
            <p>Aucun document trouvé</p>
            <p className="text-sm mt-1">Envoyez des documents via Telegram ou uploadez-les ici</p>
          </div>
        )}
      </div>
    </div>
  );
}
