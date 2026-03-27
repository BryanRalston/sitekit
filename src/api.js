import { generateId, getAll, getAllByIndex, getOne, put, del, transaction, openDB } from './db.js';
import { DEPT_COLORS, ROLE_COLORS } from './tokens.js';
import { compressImage, compressReceiptImage } from './lib/image-utils.js';
import { sanitize } from './lib/sanitize.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// PBKDF2 with salt — stronger than plain SHA-256 for short PINs
const PIN_SALT = 'sitekit-pin-v1'; // Fixed salt (acceptable for local-only app)
const PBKDF2_ITERATIONS = 100000;

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(PIN_SALT), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy SHA-256 hash — used before PBKDF2 migration, kept for backward compat
async function hashPinLegacy(pin) {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function today() { return new Date().toISOString().slice(0, 10); }

/**
 * Get Monday of the week for a given date. ISO week (Monday start).
 * @param {Date|string} date
 * @returns {string} 'YYYY-MM-DD' of Monday
 */
function getWeekStart(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // if Sunday, go back 6; otherwise go back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Get array of 6 Date objects (Mon–Sat) from a weekStart string.
 * @param {string} weekStart 'YYYY-MM-DD' (should be a Monday)
 * @returns {Date[]}
 */
function getWeekDates(weekStart) {
  const dates = [];
  const base = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 6; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(d);
  }
  return dates;
}

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
    const job = {
      id: generateId(),
      ...data,
      name: sanitize(data.name),
      store: sanitize(data.store),
      storeNumber: sanitize(data.storeNumber),
      location: sanitize(data.location),
      fileRef: sanitize(data.fileRef),
      createdAt: new Date().toISOString(),
    };
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
    // Gather all IDs to delete
    const items = await getAllByIndex('items', 'jobId', id);
    const depts = await getAllByIndex('departments', 'jobId', id);
    const receipts = await getAllByIndex('receipts', 'jobId', id);
    const allPhotos = await getAll('photos');
    const deptIds = depts.map(d => d.id);
    const photos = allPhotos.filter(p => deptIds.includes(p.departmentId));

    // Atomic delete across all stores in one transaction
    const stores = ['jobs', 'items', 'departments', 'photos', 'blobs', 'receipts', 'receipt_blobs'];
    await transaction(stores, 'readwrite', (s) => {
      s.jobs.delete(id);
      for (const i of items) s.items.delete(i.id);
      for (const d of depts) s.departments.delete(d.id);
      for (const p of photos) { s.photos.delete(p.id); s.blobs.delete(p.id); }
      for (const r of receipts) { s.receipts.delete(r.id); s.receipt_blobs.delete(r.id); }
    });
    return { success: true };
  },

  // ── Items ─────────────────────────────────────────────────────────────────

  async getItems(jobId) { return getAllByIndex('items', 'jobId', jobId); },

  async createItem(jobId, data) {
    const item = {
      id: generateId(), jobId,
      ...data,
      vendor: sanitize(data.vendor),
      materialClass: sanitize(data.materialClass),
      description: sanitize(data.description),
      itemNumber: sanitize(data.itemNumber),
      fixtureBook: sanitize(data.fixtureBook),
      section: sanitize(data.section),
      missingParts: sanitize(data.missingParts),
      missingPartsQty: data.missingPartsQty ?? '',
      additionalOrders: sanitize(data.additionalOrders),
      additionalOrdersQty: data.additionalOrdersQty ?? '',
      damageNotes: sanitize(data.damageNotes),
      damagedQty: data.damagedQty ?? '',
      notes: sanitize(data.notes),
      createdAt: new Date().toISOString(),
    };
    await put('items', item);
    return item;
  },

  async updateItem(id, data) {
    const existing = await getOne('items', id);
    if (!existing) throw new Error('Item not found');
    const sanitized = { ...data };
    for (const key of ['vendor', 'materialClass', 'description', 'itemNumber', 'fixtureBook', 'section', 'missingParts', 'additionalOrders', 'damageNotes', 'notes']) {
      if (sanitized[key] !== undefined) sanitized[key] = sanitize(sanitized[key]);
    }
    const updated = { ...existing, ...sanitized, id, jobId: existing.jobId };
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
    // Fetch all items first, then batch update in one transaction
    const itemsToUpdate = [];
    for (const itemId of itemIds) {
      const item = await getOne('items', itemId);
      if (item) {
        item.qtyReceived = qtyReceived || item.qtyOrdered || '0';
        item.dateReceived = dateReceived || today();
        itemsToUpdate.push(item);
      }
    }
    await transaction(['items'], 'readwrite', (s) => {
      for (const item of itemsToUpdate) s.items.put(item);
    });
    return { count: itemsToUpdate.length };
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
    const existingId = formData.get('photoId');
    const departmentId = formData.get('departmentId');
    const title = formData.get('title') || '';
    const notes = formData.get('notes') || '';
    const photoType = formData.get('type') || 'department';

    const compressed = await compressImage(file);

    // Use existing ID if provided, otherwise generate new
    const id = existingId || generateId();
    await put('blobs', { id, data: compressed });

    if (existingId) {
      // Update existing photo record
      const existing = await getOne('photos', existingId);
      if (existing) {
        const updated = { ...existing, hasPhoto: true };
        if (title) updated.title = title;
        if (notes) updated.notes = notes;
        await put('photos', updated);
        return updated;
      }
    }

    // Create new photo record
    const photo = {
      id, departmentId: departmentId || null, title, notes, photoType,
      completed: false, isReference: false, hasPhoto: true, tags: [], linkedItemIds: [],
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

  async createPhoto({ departmentId, title, notes }) {
    const id = generateId();
    const photo = {
      id, departmentId: departmentId || null,
      title: sanitize(title || ''), notes: sanitize(notes || ''),
      photoType: 'department',
      completed: false, isReference: false, hasPhoto: false,
      tags: [], linkedItemIds: [],
      createdAt: new Date().toISOString(),
    };
    await put('photos', photo);
    return photo;
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
    const allItems = await getAll('items');
    const allDepts = await getAll('departments');
    const allJobs = await getAll('jobs');

    // Build lookup maps
    const deptById = Object.fromEntries(allDepts.map(d => [d.id, d]));
    const jobById = Object.fromEntries(allJobs.map(j => [j.id, j]));

    let refPhotos = allPhotos.filter(p => p.isReference);

    if (params.excludeJobId) {
      const excludeDeptIds = allDepts.filter(d => d.jobId === params.excludeJobId).map(d => d.id);
      refPhotos = refPhotos.filter(p => !excludeDeptIds.includes(p.departmentId));
    }

    // Enrich each photo with job_name, linked_count, and linked item data for filtering
    refPhotos = refPhotos.map(p => {
      const linkedItems = (p.linkedItemIds || [])
        .map(lid => allItems.find(i => i.id === lid))
        .filter(Boolean);
      const dept = p.departmentId ? deptById[p.departmentId] : null;
      const job = dept && dept.jobId ? jobById[dept.jobId] : null;
      return {
        ...p,
        job_name: job ? job.name : null,
        linked_count: linkedItems.length,
        _linkedItems: linkedItems, // transient, used for filtering below
      };
    });

    // Filter by item_number: match against photo title or any linked item's itemNumber
    if (params.item_number) {
      const q = params.item_number.toLowerCase();
      refPhotos = refPhotos.filter(p =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        p._linkedItems.some(i => i.itemNumber && i.itemNumber.toLowerCase().includes(q))
      );
    }

    // Filter by vendor: match against any linked item's vendor
    if (params.vendor) {
      const q = params.vendor.toLowerCase();
      refPhotos = refPhotos.filter(p =>
        p._linkedItems.some(i => i.vendor && i.vendor.toLowerCase().includes(q))
      );
    }

    // Filter by section: match against any linked item's section or the department name
    if (params.section) {
      const q = params.section.toLowerCase();
      refPhotos = refPhotos.filter(p => {
        const dept = p.departmentId ? deptById[p.departmentId] : null;
        const deptMatch = dept && dept.name && dept.name.toLowerCase().includes(q);
        const itemMatch = p._linkedItems.some(i => i.section && i.section.toLowerCase().includes(q));
        return deptMatch || itemMatch;
      });
    }

    // Strip transient _linkedItems before returning
    return refPhotos.map(({ _linkedItems, ...rest }) => rest);
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
      store: sanitize(data.store) || '', amount: parseFloat(data.amount) || 0,
      date: data.date || today(), category: sanitize(data.category) || 'Materials',
      notes: sanitize(data.notes) || '', isGas: data.isGas || false,
      items: data.items || [], submitted: data.submitted || false,
      hasPhoto: false,
      createdAt: new Date().toISOString(),
    };
    await put('receipts', receipt);
    return receipt;
  },

  async getReceipt(id) { return getOne('receipts', id); },

  async updateReceipt(id, data) {
    const existing = await getOne('receipts', id);
    if (!existing) throw new Error('Receipt not found');
    const sanitized = { ...data };
    for (const key of ['store', 'category', 'notes']) {
      if (sanitized[key] !== undefined) sanitized[key] = sanitize(sanitized[key]);
    }
    const updated = { ...existing, ...sanitized, id, jobId: existing.jobId };
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
    // Update receipt to track photo existence
    const receipt = await getOne('receipts', id);
    if (receipt) {
      await put('receipts', { ...receipt, hasPhoto: true });
    }
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
        hasPhoto: !!rlReceipt.photo,
        createdAt: new Date().toISOString(),
      });
      receiptsImported++;
    }
    return { jobsCreated, jobsMatched, receiptsImported };
  },

  // ── Crew Members ─────────────────────────────────────────────────────────

  async getCrewMembers() {
    const members = await getAll('crew_members');
    return members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  async createCrewMember({ name, role, dailyHours, active, color }) {
    const member = {
      id: generateId(),
      name: sanitize(name),
      role: sanitize(role),
      dailyHours: parseFloat(dailyHours) || 8,
      active: active !== undefined ? active : true,
      color: color || (ROLE_COLORS[role] ? ROLE_COLORS[role].color : ROLE_COLORS.Other.color),
      createdAt: new Date().toISOString(),
    };
    await put('crew_members', member);
    return member;
  },

  async updateCrewMember(id, data) {
    const existing = await getOne('crew_members', id);
    if (!existing) throw new Error('Crew member not found');
    const sanitized = { ...data };
    for (const key of ['name', 'role']) {
      if (sanitized[key] !== undefined) sanitized[key] = sanitize(sanitized[key]);
    }
    if (sanitized.dailyHours !== undefined) sanitized.dailyHours = parseFloat(sanitized.dailyHours) || 8;
    const updated = { ...existing, ...sanitized, id };
    await put('crew_members', updated);
    return updated;
  },

  async deleteCrewMember(id) {
    const entries = await getAllByIndex('time_entries', 'crewMemberId', id);
    await transaction(['crew_members', 'time_entries'], 'readwrite', (s) => {
      s.crew_members.delete(id);
      for (const e of entries) s.time_entries.delete(e.id);
    });
    return { success: true };
  },

  // ── Time Entries ────────────────────────────────────────────────────────

  async getTimeEntries(jobId, weekStart) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('time_entries', 'readonly');
      const store = tx.objectStore('time_entries');
      const index = store.index('job_week');
      const req = index.getAll([jobId, weekStart]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getTimeEntriesByDate(jobId, date) {
    const all = await getAllByIndex('time_entries', 'jobId', jobId);
    return all.filter(e => e.date === date);
  },

  async createTimeEntry({ jobId, crewMemberId, date, weekStart, hours, clockIn, clockOut, notes, status }) {
    const entry = {
      id: generateId(),
      jobId,
      crewMemberId,
      date: date || today(),
      weekStart: weekStart || getWeekStart(date || today()),
      hours: parseFloat(hours) || 0,
      clockIn: clockIn || null,
      clockOut: clockOut || null,
      notes: sanitize(notes || ''),
      status: status || 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await put('time_entries', entry);
    return entry;
  },

  async updateTimeEntry(id, data) {
    const existing = await getOne('time_entries', id);
    if (!existing) throw new Error('Time entry not found');
    const sanitized = { ...data };
    if (sanitized.notes !== undefined) sanitized.notes = sanitize(sanitized.notes);
    if (sanitized.hours !== undefined) sanitized.hours = parseFloat(sanitized.hours) || 0;
    const updated = { ...existing, ...sanitized, id, updatedAt: new Date().toISOString() };
    await put('time_entries', updated);
    return updated;
  },

  async deleteTimeEntry(id) {
    await del('time_entries', id);
    return { success: true };
  },

  async clockIn(jobId, crewMemberId) {
    // Guard: prevent duplicate clock-ins
    const existing = await this.getActiveClock(crewMemberId);
    if (existing) return existing; // idempotent — return the active clock

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const entry = {
      id: generateId(),
      jobId,
      crewMemberId,
      date: dateStr,
      weekStart: getWeekStart(dateStr),
      hours: 0,
      clockIn: now.toISOString(),
      clockOut: null,
      notes: '',
      status: 'clocked',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await put('time_entries', entry);
    return entry;
  },

  async clockOut(crewMemberId, jobId) {
    const entries = await getAllByIndex('time_entries', 'crewMemberId', crewMemberId);
    const open = entries.find(e => e.clockIn && !e.clockOut && (!jobId || e.jobId === jobId));
    if (!open) throw new Error('No active clock entry found');
    const now = new Date();
    const clockInTime = new Date(open.clockIn);
    const diffMs = now - clockInTime;
    const hours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // 2 decimal places
    open.clockOut = now.toISOString();
    open.hours = hours;
    open.updatedAt = now.toISOString();
    await put('time_entries', open);
    return open;
  },

  async getActiveClock(crewMemberId) {
    const entries = await getAllByIndex('time_entries', 'crewMemberId', crewMemberId);
    return entries.find(e => e.clockIn && !e.clockOut) || null;
  },

  // ── Week Summary ────────────────────────────────────────────────────────

  async getWeekSummary(jobId, weekStart, crewMembers) {
    const entries = await this.getTimeEntries(jobId, weekStart);
    const dates = getWeekDates(weekStart);
    const dateStrings = dates.map(d => d.toISOString().slice(0, 10));

    return crewMembers.map(cm => {
      const memberEntries = entries.filter(e => e.crewMemberId === cm.id);
      const dailyBreakdown = dateStrings.map(dateStr => {
        const dayEntries = memberEntries.filter(e => e.date === dateStr);
        const totalHours = dayEntries.reduce((s, e) => s + (e.hours || 0), 0);
        const lastEntry = dayEntries[dayEntries.length - 1];
        return {
          date: dateStr,
          hours: totalHours,
          clockIn: lastEntry?.clockIn || null,
          clockOut: lastEntry?.clockOut || null,
          notes: dayEntries.map(e => e.notes).filter(Boolean).join('; '),
        };
      });
      const totalWorked = dailyBreakdown.reduce((s, d) => s + d.hours, 0);
      const totalRequired = (cm.dailyHours || 8) * 5; // Mon-Fri only; Saturday is overtime
      return {
        crewMemberId: cm.id,
        name: cm.name,
        role: cm.role,
        dailyHours: cm.dailyHours || 8,
        totalWorked,
        totalRequired,
        balance: totalWorked - totalRequired,
        dailyBreakdown,
      };
    });
  },

  // ── Shortage Resolutions ────────────────────────────────────────────────

  async getResolutions(jobId, weekStart) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shortage_resolutions', 'readonly');
      const store = tx.objectStore('shortage_resolutions');
      const index = store.index('job_week');
      const req = index.getAll([jobId, weekStart]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async resolveShortage({ jobId, crewMemberId, weekStart, shortageHours, resolution, notes }) {
    const record = {
      id: generateId(),
      jobId,
      crewMemberId,
      weekStart,
      shortageHours: parseFloat(shortageHours) || 0,
      resolution: sanitize(resolution),
      notes: sanitize(notes || ''),
      createdAt: new Date().toISOString(),
    };
    await put('shortage_resolutions', record);
    return record;
  },

  async deleteResolution(id) {
    await del('shortage_resolutions', id);
    return { success: true };
  },

  // ── Crew Utilities (exposed for components) ─────────────────────────────

  getWeekStart,
  getWeekDates,

  // ── Feedback ──────────────────────────────────────────────────────────────

  async submitFeedback(data) {
    const entry = {
      id: generateId(),
      type: data.type || 'feedback', // 'feedback' | 'bug' | 'feature'
      message: sanitize(data.message),
      page: data.page || '', // which tab/screen the user was on
      createdAt: new Date().toISOString(),
      status: 'new', // 'new' | 'reviewed' | 'resolved'
    };
    await put('feedback', entry);
    return entry;
  },

  async getFeedback() {
    const all = await getAll('feedback');
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async updateFeedbackStatus(id, status) {
    const entry = await getOne('feedback', id);
    if (!entry) throw new Error('Feedback not found');
    entry.status = status;
    await put('feedback', entry);
    return entry;
  },

  async deleteFeedback(id) {
    await del('feedback', id);
    return { success: true };
  },

  // ── Export ────────────────────────────────────────────────────────────────

  async exportData() {
    const jobs = await getAll('jobs');
    const items = await getAll('items');
    const depts = await getAll('departments');
    const photos = await getAll('photos');
    const receipts = await getAll('receipts');
    const fk = await getAll('fixture_knowledge');
    const crewMembers = await getAll('crew_members');
    const timeEntries = await getAll('time_entries');
    const shortageResolutions = await getAll('shortage_resolutions');
    const feedback = await getAll('feedback');

    // Include actual image data so backups are fully restorable
    const blobs = await getAll('blobs');
    const receiptBlobs = await getAll('receipt_blobs');
    const blobMap = Object.fromEntries(blobs.map(b => [b.id, b.data]));
    const receiptBlobMap = Object.fromEntries(receiptBlobs.map(b => [b.id, b.data]));

    return {
      exportDate: new Date().toISOString(), version: '1.1', app: 'SiteKit',
      jobs: jobs.map(j => ({
        ...j,
        items: items.filter(i => i.jobId === j.id),
        departments: depts.filter(d => d.jobId === j.id).map(d => ({
          ...d,
          photos: photos.filter(p => p.departmentId === d.id).map(p => ({
            ...p,
            blob: blobMap[p.id] || null,
          })),
        })),
        receipts: receipts.filter(r => r.jobId === j.id).map(r => ({
          ...r,
          blob: r.hasPhoto ? (receiptBlobMap[r.id] || null) : undefined,
        })),
      })),
      fixtureKnowledge: fk,
      crewMembers,
      timeEntries,
      shortageResolutions,
      feedback,
    };
  },

  // ── Import (restore SiteKit backup) ──────────────────────────────────────

  async importData(data) {
    if (data.app !== 'SiteKit') throw new Error('Not a SiteKit backup');

    let jobCount = 0, itemCount = 0, deptCount = 0, photoCount = 0;
    let receiptCount = 0, blobCount = 0;

    for (const exportedJob of (data.jobs || [])) {
      const { items: jobItems, departments: jobDepts, receipts: jobReceipts, ...jobRecord } = exportedJob;
      await put('jobs', jobRecord);
      jobCount++;

      // Items
      for (const item of (jobItems || [])) {
        await put('items', item);
        itemCount++;
      }

      // Departments + photos + photo blobs
      for (const dept of (jobDepts || [])) {
        const { photos: deptPhotos, ...deptRecord } = dept;
        await put('departments', deptRecord);
        deptCount++;

        for (const photo of (deptPhotos || [])) {
          const { blob, ...photoRecord } = photo;
          await put('photos', photoRecord);
          photoCount++;
          if (blob) {
            await put('blobs', { id: photo.id, data: blob });
            blobCount++;
          }
        }
      }

      // Receipts + receipt blobs
      for (const receipt of (jobReceipts || [])) {
        const { blob, ...receiptRecord } = receipt;
        if (blob) {
          await put('receipt_blobs', { id: receipt.id, data: blob });
          receiptRecord.hasPhoto = true;
          blobCount++;
        }
        await put('receipts', receiptRecord);
        receiptCount++;
      }
    }

    // Fixture knowledge
    for (const fk of (data.fixtureKnowledge || [])) {
      await put('fixture_knowledge', fk);
    }

    // Crew members
    for (const cm of (data.crewMembers || [])) {
      await put('crew_members', cm);
    }

    // Time entries
    for (const te of (data.timeEntries || [])) {
      await put('time_entries', te);
    }

    // Shortage resolutions
    for (const sr of (data.shortageResolutions || [])) {
      await put('shortage_resolutions', sr);
    }

    // Feedback
    for (const fb of (data.feedback || [])) {
      await put('feedback', fb);
    }

    return { jobCount, itemCount, deptCount, photoCount, receiptCount, blobCount };
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
      // Try PBKDF2 first (current method)
      const hash = await hashPin(pin);
      if (hash === config.value) return { valid: true };
      // Fallback: try legacy SHA-256 hash (pre-migration PINs)
      const legacyHash = await hashPinLegacy(pin);
      if (legacyHash === config.value) {
        // Silently migrate to PBKDF2 on successful legacy login
        await put('config', { key: 'pin_hash', value: hash });
        return { valid: true };
      }
      return { valid: false };
    },
    async change(currentPin, newPin) {
      const config = await getOne('config', 'pin_hash');
      if (!config) throw new Error('No PIN configured');
      // Try PBKDF2 first
      const currentHash = await hashPin(currentPin);
      let matched = currentHash === config.value;
      // Fallback: try legacy SHA-256 hash
      if (!matched) {
        const legacyHash = await hashPinLegacy(currentPin);
        matched = legacyHash === config.value;
      }
      if (!matched) return { valid: false };
      // Always store new PIN with PBKDF2
      const newHash = await hashPin(newPin);
      await put('config', { key: 'pin_hash', value: newHash });
      return { valid: true, success: true };
    },
  },
};
