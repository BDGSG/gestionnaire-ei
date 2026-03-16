import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Upload, Search, Download, Trash2, FolderOpen, Eye, X, AlertTriangle, CheckCircle, RefreshCw, FileText, Image } from 'lucide-react';

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
  const [uploads, setUploads] = useState([]); // { file, status: 'pending'|'uploading'|'done'|'error', result, error }
  const [dragOver, setDragOver] = useState(false);
  const [viewDoc, setViewDoc] = useState(null); // Document being viewed
  const [reclassDoc, setReclassDoc] = useState(null); // Document being reclassified
  const fileRef = useRef();
  const dropRef = useRef();

  const load = useCallback(() => {
    const params = {};
    if (search) params.search = search;
    if (category) params.category = category;
    if (year) params.year = year;
    api.getDocuments(params).then(setDocs).catch(console.error);
  }, [search, category, year]);

  useEffect(() => { load(); }, [category, year, load]);

  // Auto-reload every 15s for new Telegram docs
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const handleSearch = (e) => { e.preventDefault(); load(); };

  // Process files for upload
  const processFiles = async (files) => {
    const newUploads = Array.from(files).map(file => ({
      id: Date.now() + Math.random(),
      file,
      status: 'pending',
      result: null,
      error: null
    }));

    setUploads(prev => [...prev, ...newUploads]);

    for (const upload of newUploads) {
      setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'uploading' } : u));
      try {
        const result = await api.uploadDocument(upload.file);
        setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'done', result } : u));
        load();
      } catch (err) {
        setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'error', error: err.message } : u));
      }
    }
  };

  const handleUpload = (e) => {
    const files = e.target.files;
    if (files.length > 0) processFiles(files);
    fileRef.current.value = '';
  };

  // Drag and drop
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) processFiles(files);
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce document ?')) return;
    await api.deleteDocument(id).catch(err => alert(err.message));
    load();
  };

  const handleReclassify = async (docId, newCategory) => {
    try {
      await api.reclassifyDocument(docId, newCategory);
      setReclassDoc(null);
      load();
    } catch (err) { alert(err.message); }
  };

  const clearUpload = (id) => setUploads(prev => prev.filter(u => u.id !== id));
  const clearAllUploads = () => setUploads(prev => prev.filter(u => u.status === 'uploading'));

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const needsReviewCount = docs.filter(d => d.ai_classification_confidence < 0.7 && d.ai_classification_confidence > 0).length;

  return (
    <div className="space-y-4" ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">Documents ({docs.length})</h2>
          {needsReviewCount > 0 && (
            <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1">
              <AlertTriangle size={12} /> {needsReviewCount} a verifier
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input type="file" ref={fileRef} onChange={handleUpload} className="hidden" accept="image/*,.pdf" multiple />
          <button onClick={() => fileRef.current.click()}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-700">
            <Upload size={16} /> Uploader
          </button>
        </div>
      </div>

      {/* Drop zone */}
      {dragOver && (
        <div className="fixed inset-0 bg-primary-600/20 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl p-12 shadow-2xl border-4 border-dashed border-primary-400 text-center">
            <Upload size={64} className="mx-auto text-primary-500 mb-4" />
            <p className="text-xl font-bold text-primary-700">Deposez vos documents ici</p>
            <p className="text-sm text-gray-500 mt-1">Images et PDF acceptes - Classification IA automatique</p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 text-sm">Uploads ({uploads.length})</h3>
            {uploads.every(u => u.status !== 'uploading') && (
              <button onClick={clearAllUploads} className="text-xs text-gray-500 hover:text-gray-700">Fermer</button>
            )}
          </div>
          {uploads.map(u => (
            <div key={u.id} className={`flex items-center gap-3 p-3 rounded-lg ${
              u.status === 'uploading' ? 'bg-blue-50' :
              u.status === 'done' ? 'bg-green-50' :
              u.status === 'error' ? 'bg-red-50' : 'bg-gray-50'
            }`}>
              {u.status === 'uploading' && <RefreshCw size={16} className="text-blue-500 animate-spin shrink-0" />}
              {u.status === 'done' && <CheckCircle size={16} className="text-green-500 shrink-0" />}
              {u.status === 'error' && <AlertTriangle size={16} className="text-red-500 shrink-0" />}
              {u.status === 'pending' && <FileText size={16} className="text-gray-400 shrink-0" />}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.file.name}</p>
                {u.status === 'uploading' && <p className="text-xs text-blue-600">Analyse IA en cours...</p>}
                {u.status === 'done' && u.result?.classification && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-green-600">
                      {CATEGORY_ICONS[u.result.classification.category]} {CATEGORIES.find(c => c.value === u.result.classification.category)?.label || u.result.classification.category}
                    </span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className={`text-xs ${u.result.classification.confidence >= 0.7 ? 'text-green-600' : 'text-orange-600'}`}>
                      {Math.round((u.result.classification.confidence || 0) * 100)}% confiance
                    </span>
                    {u.result.classification.needs_review && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">A verifier - notifie sur Telegram</span>
                    )}
                  </div>
                )}
                {u.status === 'error' && <p className="text-xs text-red-600">{u.error}</p>}
              </div>

              {u.status !== 'uploading' && (
                <button onClick={() => clearUpload(u.id)} className="p-1 hover:bg-white rounded shrink-0">
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par titre, fournisseur..."
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
          <option value="">Toutes annees</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Grille documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map(doc => {
          const isLowConf = doc.ai_classification_confidence > 0 && doc.ai_classification_confidence < 0.7;
          return (
            <div key={doc.id} className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow ${isLowConf ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{CATEGORY_ICONS[doc.category] || '📎'}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{doc.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-500">{CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}</span>
                      {isLowConf && (
                        <button
                          onClick={() => setReclassDoc(doc)}
                          className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded hover:bg-orange-200 flex items-center gap-0.5"
                        >
                          <AlertTriangle size={10} /> Corriger
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setViewDoc(doc)} className="p-1.5 hover:bg-blue-50 rounded text-blue-500" title="Voir">
                    <Eye size={14} />
                  </button>
                  <a href={api.getDocumentDownloadUrl(doc.id)} className="p-1.5 hover:bg-gray-100 rounded" title="Telecharger">
                    <Download size={14} />
                  </a>
                  <button onClick={() => handleDelete(doc.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {doc.extracted_date && <p className="text-xs text-gray-500">Date: {new Date(doc.extracted_date).toLocaleDateString('fr-FR')}</p>}
                {doc.extracted_amount != null && <p className="text-xs text-gray-600 font-medium">{Number(doc.extracted_amount).toFixed(2)} EUR</p>}
                {doc.extracted_vendor && <p className="text-xs text-gray-500">De: {doc.extracted_vendor}</p>}
                {doc.description && <p className="text-xs text-gray-400 truncate">{doc.description}</p>}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>{doc.year}</span>
                {doc.ai_classification_confidence > 0 && (
                  <span className={doc.ai_classification_confidence >= 0.7 ? 'text-green-500' : 'text-orange-500'}>
                    IA: {Math.round(doc.ai_classification_confidence * 100)}%
                  </span>
                )}
                <span>{doc.source === 'telegram' ? 'Telegram' : 'Web'}</span>
              </div>
            </div>
          );
        })}
        {docs.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400">
            <FolderOpen size={48} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">Aucun document trouve</p>
            <p className="text-sm mt-1">Glissez-deposez des fichiers ici ou cliquez sur Uploader</p>
            <p className="text-sm">Vous pouvez aussi envoyer des documents via Telegram</p>
          </div>
        )}
      </div>

      {/* Modal: Reclassification */}
      {reclassDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setReclassDoc(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" /> Corriger la classification
            </h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium">{reclassDoc.title}</p>
              <p className="text-xs text-gray-500 mt-1">Classifie comme: {CATEGORIES.find(c => c.value === reclassDoc.category)?.label}</p>
              <p className="text-xs text-gray-500">Confiance IA: {Math.round((reclassDoc.ai_classification_confidence || 0) * 100)}%</p>
            </div>
            <p className="text-sm text-gray-600 font-medium">Choisir la bonne categorie :</p>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {CATEGORIES.filter(c => c.value).map(cat => (
                <button
                  key={cat.value}
                  onClick={() => handleReclassify(reclassDoc.id, cat.value)}
                  className={`text-left p-3 rounded-lg text-sm border transition-colors ${
                    reclassDoc.category === cat.value
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50'
                  }`}
                >
                  <span className="mr-1.5">{CATEGORY_ICONS[cat.value]}</span>
                  {cat.label}
                </button>
              ))}
            </div>
            <button onClick={() => setReclassDoc(null)} className="w-full py-2 border border-gray-300 rounded-lg text-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* Modal: Document viewer */}
      {viewDoc && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewDoc(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-gray-800">{viewDoc.title}</h3>
                <p className="text-xs text-gray-500">{viewDoc.original_filename}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={api.getDocumentDownloadUrl(viewDoc.id)}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm flex items-center gap-1.5 hover:bg-primary-700">
                  <Download size={14} /> Telecharger
                </a>
                <button onClick={() => setViewDoc(null)} className="p-1.5 hover:bg-gray-100 rounded"><X size={18} /></button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {/* Preview */}
              {viewDoc.file_type && ['jpeg', 'jpg', 'png', 'webp'].includes(viewDoc.file_type) && (
                <div className="mb-4 bg-gray-50 rounded-lg p-2 flex justify-center">
                  <img src={api.getDocumentDownloadUrl(viewDoc.id)} alt={viewDoc.title} className="max-h-96 rounded" />
                </div>
              )}
              {viewDoc.file_type === 'pdf' && (
                <div className="mb-4 bg-gray-50 rounded-lg p-4 text-center">
                  <FileText size={48} className="mx-auto text-red-400 mb-2" />
                  <a href={api.getDocumentDownloadUrl(viewDoc.id)} target="_blank" className="text-primary-600 hover:underline text-sm">
                    Ouvrir le PDF
                  </a>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Categorie" value={`${CATEGORY_ICONS[viewDoc.category] || ''} ${CATEGORIES.find(c => c.value === viewDoc.category)?.label || viewDoc.category}`} />
                <InfoField label="Date du document" value={viewDoc.extracted_date ? new Date(viewDoc.extracted_date).toLocaleDateString('fr-FR') : '-'} />
                <InfoField label="Montant" value={viewDoc.extracted_amount != null ? `${Number(viewDoc.extracted_amount).toFixed(2)} EUR` : '-'} />
                <InfoField label="Emetteur" value={viewDoc.extracted_vendor || '-'} />
                <InfoField label="Reference" value={viewDoc.extracted_reference || '-'} />
                <InfoField label="Source" value={viewDoc.source === 'telegram' ? 'Telegram' : 'Upload web'} />
                <InfoField label="Confiance IA" value={viewDoc.ai_classification_confidence > 0 ? `${Math.round(viewDoc.ai_classification_confidence * 100)}%` : '-'} />
                <InfoField label="Annee classement" value={viewDoc.year} />
                <InfoField label="Taille" value={viewDoc.file_size ? `${(viewDoc.file_size / 1024).toFixed(0)} Ko` : '-'} />
                <InfoField label="Upload" value={new Date(viewDoc.created_at).toLocaleString('fr-FR')} />
              </div>
              {viewDoc.description && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium mb-1">Description IA</p>
                  <p className="text-sm text-gray-700">{viewDoc.description}</p>
                </div>
              )}

              {/* Reclassify from viewer */}
              {viewDoc.ai_classification_confidence > 0 && viewDoc.ai_classification_confidence < 0.7 && (
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm font-medium text-orange-700 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Classification incertaine
                  </p>
                  <p className="text-xs text-orange-600 mt-1">L'IA n'est pas sure de la categorie. Vous pouvez la corriger.</p>
                  <button onClick={() => { setViewDoc(null); setReclassDoc(viewDoc); }}
                    className="mt-2 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700">
                    Corriger la categorie
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div className="p-2 bg-gray-50 rounded-lg">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}
