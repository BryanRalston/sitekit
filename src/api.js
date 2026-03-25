import { generateId, getAll, getAllByIndex, getOne, put, del } from './db.js';
import { DEPT_COLORS } from './tokens.js';
import { compressImage, compressReceiptImage } from './lib/image-utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function today() { return new Date().toISOString().slice(0, 10); }

// ─── API Object ───────────────────────────────────────────────────────────────
// Same method signatures as the old fetch-based api — components don't change.

export const api = {

  // ── Jobs ──────────────────────────────────────────────────────────────────

  async getJobs() {
    const jobs = await getAll('jobs');
    const items = await getAll('items');
    const depts = await getAll('departments');
    const photos = await getAll('photos');
    const receipts = await getAll('receipts');
    return jobs.map(j => {
      const jItems = items.filter(i => i.jobId === j.id);
      const jDepts = depts.filter(d => d.jobId === j.id);
      const deptIds = jDepts.map(d => d.id);
      const jPhotos = photos.filter(p => deptIds.includes(p.departmentId));
      const jReceipts = receipts.filter(r => r.jobId === j.id);
      return {
        ...j,
        item_count: jItems.length,
        received_count: jItems.filter(i => { const r = parseInt(i.qtyReceived || '0'), o = parseInt(i.qtyOrdered || '0'); return r > 0 && o > 0 && r >= o; }).length,
        issue_count: jItems.filter(i => i.damaged || i.missingParts).length,
        dept_count: jDepts.length,
        photo_count: jPhotos.length,
        receipt_count: jReceipts.length,
        receipt_total: jReceipts.reduce((s, r) => s + (r.amount || 0), 0),
      };
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getJob(id) {
    const job = await getOne('jobs', id);
    if (!job) throw new Error('Job not found');
    const items = await getAllByIndex('items', 'jobId', id);
    const depts = await getAllByIndex('departments', 'jobId', id);
    const allPhotos = await getAll('photos');
    const deptsWithPhotos = depts.map(d => ({
      ...d,
      photos: allPhotos.filter(p => p.departmentId === d.id),
    }));
    const receipts = await getAllByIndex('receipts', 'jobId', id);
    return { ...job, items, departments: deptsWithPhotos, receipts };
  },

  async createJob(data) {
    const job = { id: generateId(), ...data, createdAt: new Date().toISOString() };
    await put('jobs', job);
    return job;
  },

  async updateJob(id, data) {
    const existing = await getOne('jobs', id);
    if (!existing) throw new Error('Job not found');
    const updated = { ...existing, ...data, id };
    await put('jobs', updated);
    return updated;
  },

  async deleteJob(id) {
    const items = await getAllByIndex('items', 'jobId', id);
    const depts = await getAllByIndex('departments', 'jobId', id);
    const receipts = await getAllByIndex('receipts', 'jobId', id);
    const allPhotos = await getAll('photos');
    const deptIds = depts.map(d => d.id);
    const photos = allPhotos.filter(p => deptIds.includes(p.departmentId));
    for (const i of items) await del('items', i.id);
    for (const p of photos) { await del('photos', p.id); await del('blobs', p.id).catch(() => {}); }
    for (const d of depts) await del('departments', d.id);
    for (const r of receipts) { await del('receipts', r.id); await del('receipt_blobs', r.id).catch(() => {}); }
    await del('jobs', id);
    return { success: true };
  },

  // ── Items ─────────────────────────────────────────────────────────────────

  async getItems(jobId) { return getAllByIndex('items', 'jobId', jobId); },

  async createItem(jobId, data) {
    const item = { id: generateId(), jobId, ...data, createdAt: new Date().toISOString() };
    await put('items', item);
    return item;
  },

  async updateItem(id, data) {
    const existing = await getOne('items', id);
    if (!existing) throw new Error('Item not found');
    const updated = { ...existing, ...data, id, jobId: existing.jobId };
    await put('items', updated);
    return updated;
  },

  async deleteItem(id) { await del('items', id); return { success: true }; },

  async quickReceive(id, data) {
    const item = await getOne('items', id);
    if (!item) throw new Error('Item not found');
    item.qtyReceived = data.qtyReceived || item.qtyReceived;
    item.dateReceived = data.dateReceived || today();
    await put('items', item);
    return item;
  },

  async bulkReceive(jobId, data) {
    const { itemIds, qtyReceived, dateReceived } = data;
    let count = 0;
    for (const itemId of itemIds) {
      const item = await getOne('items', itemId);
      if (item) {
        item.qtyReceived = qtyReceived || item.qtyOrdered || '0';
        item.dateReceived = dateReceived || today();
        await put('items', item);
        count++;
      }
    }
    return { count };
  },

  // ── Import ────────────────────────────────────────────────────────────────

  async importPreview(jobId, input) {
    const { parsePdfText, parseCsvText } = await import('./lib/pdf-parser.js');

    if (input instanceof FormData) {
      const file = input.get('file');
      if (file && file.name && file.name.toLowerCase().endsWith('.pdf')) {
        const { extractTextFromPdf } = await import('./lib/pdf-utils.js');
        const text = await extractTextFromPdf(file);
        return parsePdfText(text);
      }
      const text = await file.text();
      return parsePdfText(text);
    }

    const { text, mode } = input;
    return mode === 'csv' ? parseCsvText(text) : parsePdfText(text);
  },

  async importConfirm(jobId, items) {
    // Auto-create departments from unique sections
    const sections = [...new Set(items.map(i => i.section).filter(Boolean))];
    const existingDepts = await getAllByIndex('departments', 'jobId', jobId);
    const existingNames = new Set(existingDepts.map(d => d.name.toLowerCase()));
    let deptIndex = existingDepts.length;

    for (const section of sections) {
      if (!existingNames.has(section.toLowerCase())) {
        await put('departments', {
          id: generateId(),
          jobId,
          name: section,
          color: DEPT_COLORS[deptIndex % DEPT_COLORS.length],
          sortOrder: deptIndex,
        });
        deptIndex++;
      }
    }

    // Import items
    let count = 0;
    for (const item of items) {
      await put('items', {
        ...item,
        id: item.id || generateId(),
        jobId,
        showQtyOrdered: item.showQtyOrdered !== undefined ? item.showQtyOrdered : true,
        qtyReceived: item.qtyReceived || '',
        dateReceived: item.dateReceived || '',
        missingParts: item.missingParts || '',
        additionalOrders: item.additionalOrders || '',
        damaged: item.damaged || false,
        damageNotes: item.damageNotes || '',
        notes: item.notes || '',
        sortOrder: count,
        createdAt: new Date().toISOString(),
      });
      count++;
    }
    return { count, departmentsCreated: sections.length - existingNames.size };
  },

  // ── Departments ───────────────────────────────────────────────────────────

  async createDepartment(jobId, data) {
    const dept = { id: generateId(), jobId, ...data, sortOrder: 0 };
    await put('departments', dept);
    return dept;
  },

  async updateDepartment(id, data) {
    const existing = await getOne('departments', id);
    if (!existing) throw new Error('Department not found');
    const updated = { ...existing, ...data, id };
    await put('departments', updated);
    return updated;
  },

  async deleteDepartment(id) {
    const allPhotos = await getAll('photos');
    const photos = allPhotos.filter(p => p.departmentId === id);
    for (const p of photos) { await del('photos', p.id); await del('blobs', p.id).catch(() => {}); }
    await del('departments', id);
    return { success: true };
  },

  // ── Photos ────────────────────────────────────────────────────────────────

  async uploadPhoto(formData) {
    const file = formData.get('photo');
    const departmentId = formData.get('departmentId');
    const title = formData.get('title') || '';
    const notes = formData.get('notes') || '';
    const photoType = formData.get('photoType') || 'department';

    const compressed = await compressImage(file);
    const id = generateId();
    await put('blobs', { id, data: compressed });
    const photo = {
      id, departmentId: departmentId || null, title, notes, photoType,
      completed: false, isReference: false, tags: [], linkedItemIds: [],
      createdAt: new Date().toISOString(),
    };
    await put('photos', photo);
    return photo;
  },

  // NOTE: This now returns a promise (base64 data URL) instead of a static URL string.
  // Components that use this as img src need to await it or handle the async.
  getPhotoUrl(id) {
    return getOne('blobs', id).then(blob => blob ? blob.data : null);
  },

  async updatePhoto(id, data) {
    const existing = await getOne('photos', id);
    if (!existing) throw new Error('Photo not found');
    const updated = { ...existing, ...data, id };
    await put('photos', updated);
    return updated;
  },

  async deletePhoto(id) {
    await del('photos', id);
    await del('blobs', id).catch(() => {});
    return { success: true };
  },

  async linkPhoto(id, itemIds) {
    const photo = await getOne('photos', id);
    if (!photo) throw new Error('Photo not found');
    photo.linkedItemIds = itemIds;
    await put('photos', photo);
    return photo;
  },

  // ── Reference Library ─────────────────────────────────────────────────────

  async getReferenceLibrary(params = {}) {
    const allPhotos = await getAll('photos');
    let refPhotos = allPhotos.filter(p => p.isReference);
    if (params.excludeJobId) {
      const depts = await getAll('departments');
      const excludeDeptIds = depts.filter(d => d.jobId === params.excludeJobId).map(d => d.id);
      refPhotos = refPhotos.filter(p => !excludeDeptIds.includes(p.departmentId));
    }
    return refPhotos;
  },

  async getMatchedReferences(jobId) {
    const items = await getAllByIndex('items', 'jobId', jobId);
    const itemNumbers = [...new Set(items.map(i => i.itemNumber).filter(Boolean))];
    const allPhotos = await getAll('photos');
    const allItems = await getAll('items');
    const depts = await getAll('departments');
    const jobDeptIds = depts.filter(d => d.jobId === jobId).map(d => d.id);
    const results = [];
    for (const num of itemNumbers) {
      const otherItems = allItems.filter(i => i.itemNumber === num && i.jobId !== jobId);
      const refPhotos = allPhotos.filter(p =>
        p.isReference && !jobDeptIds.includes(p.departmentId) &&
        (p.linkedItemIds || []).some(lid => otherItems.some(oi => oi.id === lid))
      );
      if (refPhotos.length > 0) results.push({ itemNumber: num, refCount: refPhotos.length });
    }
    return results;
  },

  // ── Fixture Knowledge ─────────────────────────────────────────────────────

  async getFixtureKnowledge(itemNumber) {
    return getAllByIndex('fixture_knowledge', 'itemNumber', itemNumber);
  },

  async addFixtureKnowledge(data) {
    const entry = { id: generateId(), ...data, createdAt: new Date().toISOString() };
    await put('fixture_knowledge', entry);
    return entry;
  },

  // ── Receipts ──────────────────────────────────────────────────────────────

  async getReceipts(jobId) {
    const receipts = await getAllByIndex('receipts', 'jobId', jobId);
    return receipts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  async createReceipt(jobId, data) {
    const receipt = {
      id: generateId(), jobId,
      store: data.store || '', amount: parseFloat(data.amount) || 0,
      date: data.date || today(), category: data.category || 'Materials',
      notes: data.notes || '', isGas: data.isGas || false,
      items: data.items || [], submitted: data.submitted || false,
      createdAt: new Date().toISOString(),
    };
    await put('receipts', receipt);
    return receipt;
  },

  async getReceipt(id) { return getOne('receipts', id); },

  async updateReceipt(id, data) {
    const existing = await getOne('receipts', id);
    if (!existing) throw new Error('Receipt not found');
    const updated = { ...existing, ...data, id, jobId: existing.jobId };
    if (updated.amount !== undefined) updated.amount = parseFloat(updated.amount) || 0;
    await put('receipts', updated);
    return updated;
  },

  async deleteReceipt(id) {
    await del('receipts', id);
    await del('receipt_blobs', id).catch(() => {});
    return { success: true };
  },

  async toggleSubmitted(id) {
    const r = await getOne('receipts', id);
    if (!r) throw new Error('Receipt not found');
    r.submitted = !r.submitted;
    await put('receipts', r);
    return r;
  },

  async markAllSubmitted(jobId) {
    const receipts = await getAllByIndex('receipts', 'jobId', jobId);
    let count = 0;
    for (const r of receipts) {
      if (!r.submitted) { r.submitted = true; await put('receipts', r); count++; }
    }
    return { count };
  },

  async uploadReceiptPhoto(id, formData) {
    const file = formData.get('photo');
    const compressed = await compressReceiptImage(file);
    await put('receipt_blobs', { id, data: compressed });
    return { success: true };
  },

  getReceiptPhotoUrl(id) {
    return getOne('receipt_blobs', id).then(blob => blob ? blob.data : null);
  },

  async getStoreNames() {
    const receipts = await getAll('receipts');
    return [...new Set(receipts.map(r => r.store).filter(Boolean))].sort();
  },

  async getReceiptSummary(jobId) {
    const receipts = await getAllByIndex('receipts', 'jobId', jobId);
    const totalSpend = receipts.reduce((s, r) => s + (r.amount || 0), 0);
    const gasTotal = receipts.filter(r => r.isGas).reduce((s, r) => s + (r.amount || 0), 0);
    const pendingCount = receipts.filter(r => !r.submitted).length;
    const submittedCount = receipts.filter(r => r.submitted).length;
    const byCategory = {};
    for (const r of receipts) {
      const cat = r.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = { category: cat, total: 0, count: 0 };
      byCategory[cat].total += r.amount || 0;
      byCategory[cat].count++;
    }
    return { totalSpend, receiptCount: receipts.length, gasTotal, pendingCount, submittedCount, byCategory: Object.values(byCategory) };
  },

  async getGasLog() {
    const receipts = await getAll('receipts');
    const jobs = await getAll('jobs');
    const jobMap = Object.fromEntries(jobs.map(j => [j.id, j.name]));
    return receipts.filter(r => r.isGas).map(r => ({ ...r, jobName: jobMap[r.jobId] || 'Unknown' })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  async importReceiptLog(data) {
    if (data.app !== 'ReceiptLog') throw new Error('Not a ReceiptLog backup');
    const existingJobs = await getAll('jobs');
    let jobsCreated = 0, jobsMatched = 0, receiptsImported = 0;
    const jobIdMap = {};

    for (const rlJob of (data.jobs || [])) {
      const match = existingJobs.find(j => j.name.toLowerCase() === (rlJob.name || '').toLowerCase());
      if (match) { jobIdMap[rlJob.id] = match.id; jobsMatched++; }
      else {
        const newJob = { id: generateId(), name: rlJob.name || 'Imported Job', store: '', storeNumber: '', location: rlJob.address || '', fileRef: '', date: today(), createdAt: new Date().toISOString() };
        await put('jobs', newJob);
        jobIdMap[rlJob.id] = newJob.id;
        jobsCreated++;
      }
    }

    for (const rlReceipt of (data.receipts || [])) {
      const skJobId = jobIdMap[rlReceipt.jobId];
      if (!skJobId) continue;
      const id = generateId();
      if (rlReceipt.photo) await put('receipt_blobs', { id, data: rlReceipt.photo });
      await put('receipts', {
        id, jobId: skJobId, store: rlReceipt.store || '', amount: parseFloat(rlReceipt.amount) || 0,
        date: rlReceipt.date || '', category: rlReceipt.category || 'Materials',
        notes: rlReceipt.notes || '', isGas: rlReceipt.isGas || false,
        items: rlReceipt.items || [], submitted: rlReceipt.submitted || false,
        createdAt: new Date().toISOString(),
      });
      receiptsImported++;
    }
    return { jobsCreated, jobsMatched, receiptsImported };
  },

  // ── Export ────────────────────────────────────────────────────────────────

  async exportData() {
    const jobs = await getAll('jobs');
    const items = await getAll('items');
    const depts = await getAll('departments');
    const photos = await getAll('photos');
    const receipts = await getAll('receipts');
    const fk = await getAll('fixture_knowledge');
    return {
      exportDate: new Date().toISOString(), version: '1.0', app: 'SiteKit',
      jobs: jobs.map(j => ({
        ...j,
        items: items.filter(i => i.jobId === j.id),
        departments: depts.filter(d => d.jobId === j.id).map(d => ({ ...d, photos: photos.filter(p => p.departmentId === d.id) })),
        receipts: receipts.filter(r => r.jobId === j.id),
      })),
      fixtureKnowledge: fk,
    };
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

  auth: {
    async status() {
      const config = await getOne('config', 'pin_hash');
      return { configured: !!config };
    },
    async setup(pin) {
      const hash = await hashPin(pin);
      await put('config', { key: 'pin_hash', value: hash });
      return { success: true };
    },
    async verify(pin) {
      const config = await getOne('config', 'pin_hash');
      if (!config) return { valid: false };
      const hash = await hashPin(pin);
      return { valid: hash === config.value };
    },
    async change(currentPin, newPin) {
      const config = await getOne('config', 'pin_hash');
      if (!config) throw new Error('No PIN configured');
      const currentHash = await hashPin(currentPin);
      if (currentHash !== config.value) return { valid: false };
      const newHash = await hashPin(newPin);
      await put('config', { key: 'pin_hash', value: newHash });
      return { valid: true, success: true };
    },
  },
};
