const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// For multipart uploads (photos, PDFs)
async function upload(path, formData) {
  const res = await fetch(BASE + path, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Auth
  auth: {
    status: () => request('/auth/status'),
    setup: (pin) => request('/auth/setup', { method: 'POST', body: JSON.stringify({ pin }) }),
    verify: (pin) => request('/auth/verify', { method: 'POST', body: JSON.stringify({ pin }) }),
    change: (currentPin, newPin) => request('/auth/change', { method: 'POST', body: JSON.stringify({ currentPin, newPin }) }),
  },


  // Jobs
  getJobs: () => request('/jobs'),
  getJob: (id) => request(`/jobs/${id}`),
  createJob: (data) => request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id, data) => request(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),

  // Items
  getItems: (jobId) => request(`/jobs/${jobId}/items`),
  createItem: (jobId, data) => request(`/jobs/${jobId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id, data) => request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  quickReceive: (id, data) => request(`/items/${id}/receive`, { method: 'PATCH', body: JSON.stringify(data) }),
  bulkReceive: (jobId, data) => request(`/jobs/${jobId}/items/bulk-receive`, { method: 'POST', body: JSON.stringify(data) }),

  // Import
  importPreview: (jobId, formDataOrText) => {
    if (formDataOrText instanceof FormData) {
      return upload(`/jobs/${jobId}/import`, formDataOrText);
    }
    return request(`/jobs/${jobId}/import`, { method: 'POST', body: JSON.stringify(formDataOrText) });
  },
  importConfirm: (jobId, items) => request(`/jobs/${jobId}/import/confirm`, { method: 'POST', body: JSON.stringify({ items }) }),

  // Departments
  getDepartments: (jobId) => request(`/jobs/${jobId}/departments`),
  createDepartment: (jobId, data) => request(`/jobs/${jobId}/departments`, { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id, data) => request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDepartment: (id) => request(`/departments/${id}`, { method: 'DELETE' }),

  // Photos
  uploadPhoto: (formData) => upload('/photos/upload', formData),
  getPhotoUrl: (id) => `${BASE}/photos/${id}/image`,
  updatePhoto: (id, data) => request(`/photos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePhoto: (id) => request(`/photos/${id}`, { method: 'DELETE' }),
  linkPhoto: (id, itemIds) => request(`/photos/${id}/link`, { method: 'POST', body: JSON.stringify({ itemIds }) }),

  // Reference Library
  getReferenceLibrary: (params) => request(`/reference-library?${new URLSearchParams(params)}`),
  getMatchedReferences: (jobId) => request(`/jobs/${jobId}/matched-references`),

  // Fixture Knowledge
  getFixtureKnowledge: (itemNumber) => request(`/fixture-knowledge/${encodeURIComponent(itemNumber)}`),
  addFixtureKnowledge: (data) => request('/fixture-knowledge', { method: 'POST', body: JSON.stringify(data) }),

  // Receipts
  getReceipts: (jobId) => request(`/jobs/${jobId}/receipts`),
  createReceipt: (jobId, data) => request(`/jobs/${jobId}/receipts`, { method: 'POST', body: JSON.stringify(data) }),
  getReceipt: (id) => request(`/receipts/${id}`),
  updateReceipt: (id, data) => request(`/receipts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReceipt: (id) => request(`/receipts/${id}`, { method: 'DELETE' }),
  toggleSubmitted: (id) => request(`/receipts/${id}/toggle-submitted`, { method: 'PATCH' }),
  markAllSubmitted: (jobId) => request(`/jobs/${jobId}/receipts/mark-all-submitted`, { method: 'POST' }),
  uploadReceiptPhoto: (id, formData) => upload(`/receipts/${id}/photo`, formData),
  getReceiptPhotoUrl: (id) => `${BASE}/receipts/${id}/photo`,
  getStoreNames: () => request('/receipts/stores'),
  getReceiptSummary: (jobId) => request(`/jobs/${jobId}/receipts/summary`),
  getGasLog: () => request('/gas-log'),
  importReceiptLog: (data) => request('/import/receiptlog', { method: 'POST', body: JSON.stringify(data) }),

  // Export / Backup
  exportData: () => request('/export'),
};
