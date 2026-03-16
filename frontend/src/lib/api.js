const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Erreur serveur');
  }
  return res.json();
}

export const api = {
  // Dashboard
  dashboard: () => request('/dashboard'),

  // Company
  getCompany: () => request('/company'),
  updateCompany: (data) => request('/company', { method: 'PUT', body: JSON.stringify(data) }),

  // Clients
  getClients: () => request('/clients'),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),

  // Invoices
  getInvoices: (params) => request(`/invoices${params ? '?' + new URLSearchParams(params) : ''}`),
  getInvoice: (id) => request(`/invoices/${id}`),
  createInvoice: (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id, data) => request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  markInvoicePaid: (id, data) => request(`/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(data) }),
  getInvoicePdfUrl: (id) => `${API_BASE}/invoices/${id}/pdf`,

  // Quotes
  getQuotes: () => request('/quotes'),
  getQuote: (id) => request(`/quotes/${id}`),
  createQuote: (data) => request('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  convertQuote: (id) => request(`/quotes/${id}/convert`, { method: 'POST' }),

  // Documents
  getDocuments: (params) => request(`/documents${params ? '?' + new URLSearchParams(params) : ''}`),
  getDocument: (id) => request(`/documents/${id}`),
  uploadDocument: async (file, metadata) => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      Object.entries(metadata).forEach(([k, v]) => formData.append(k, v));
    }
    const res = await fetch(`${API_BASE}/documents/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  updateDocument: (id, data) => request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  reclassifyDocument: (id, category) => request(`/documents/${id}/reclassify`, { method: 'POST', body: JSON.stringify({ category }) }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  getDocumentDownloadUrl: (id) => `${API_BASE}/documents/${id}/download`,

  // Transactions
  getTransactions: (params) => request(`/transactions${params ? '?' + new URLSearchParams(params) : ''}`),
  createTransaction: (data) => request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  getLivreRecettes: (year) => request(`/transactions/livre-recettes?year=${year}`),

  // Fiscal
  getDeadlines: (params) => request(`/fiscal/deadlines${params ? '?' + new URLSearchParams(params) : ''}`),
  updateDeadline: (id, data) => request(`/fiscal/deadlines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createDeadline: (data) => request('/fiscal/deadlines', { method: 'POST', body: JSON.stringify(data) }),
  getTvaSummary: (year) => request(`/fiscal/tva-summary?year=${year}`),
};
