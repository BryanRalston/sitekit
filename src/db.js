// ─── IndexedDB Database Layer ─────────────────────────────────────────────────
const DB_NAME = 'sitekit';
const DB_VERSION = 2;

// Schema versioning guide:
// To add a new object store or index in a future version:
// 1. Increment DB_VERSION
// 2. Add migration logic in onupgradeneeded that checks e.oldVersion
// 3. Only create/modify stores that are new in that version
//
// Example for version 2:
// if (e.oldVersion < 2) {
//   // Add new store or index
//   const store = db.createObjectStore('new_store', { keyPath: 'id' });
// }

let _db = null;

/**
 * Open (or return cached) IndexedDB connection.
 * Includes error recovery for corruption and version conflicts.
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      console.error('SiteKit: Failed to open database —', err.message);
      reject(new Error('Could not open the SiteKit database. Try closing other tabs or clearing site data.'));
      return;
    }

    req.onblocked = () => {
      // Another tab has the DB open with an older version
      console.warn('SiteKit database upgrade blocked — close other tabs');
    };

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // jobs
      if (!db.objectStoreNames.contains('jobs')) {
        db.createObjectStore('jobs', { keyPath: 'id' });
      }

      // items
      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('jobId', 'jobId', { unique: false });
        items.createIndex('itemNumber', 'itemNumber', { unique: false });
      }

      // departments
      if (!db.objectStoreNames.contains('departments')) {
        const depts = db.createObjectStore('departments', { keyPath: 'id' });
        depts.createIndex('jobId', 'jobId', { unique: false });
      }

      // photos
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('departmentId', 'departmentId', { unique: false });
        photos.createIndex('isReference', 'isReference', { unique: false });
      }

      // blobs (photo binary data)
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }

      // receipts
      if (!db.objectStoreNames.contains('receipts')) {
        const receipts = db.createObjectStore('receipts', { keyPath: 'id' });
        receipts.createIndex('jobId', 'jobId', { unique: false });
        receipts.createIndex('store', 'store', { unique: false });
        receipts.createIndex('date', 'date', { unique: false });
        receipts.createIndex('isGas', 'isGas', { unique: false });
      }

      // receipt_blobs
      if (!db.objectStoreNames.contains('receipt_blobs')) {
        db.createObjectStore('receipt_blobs', { keyPath: 'id' });
      }

      // fixture_knowledge
      if (!db.objectStoreNames.contains('fixture_knowledge')) {
        const fk = db.createObjectStore('fixture_knowledge', { keyPath: 'id' });
        fk.createIndex('itemNumber', 'itemNumber', { unique: false });
      }

      // config (key-value store)
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }

      // crew_members (v2)
      if (!db.objectStoreNames.contains('crew_members')) {
        const crew = db.createObjectStore('crew_members', { keyPath: 'id' });
        crew.createIndex('active', 'active', { unique: false });
        crew.createIndex('name', 'name', { unique: false });
      }

      // time_entries (v2)
      if (!db.objectStoreNames.contains('time_entries')) {
        const te = db.createObjectStore('time_entries', { keyPath: 'id' });
        te.createIndex('jobId', 'jobId', { unique: false });
        te.createIndex('crewMemberId', 'crewMemberId', { unique: false });
        te.createIndex('weekStart', 'weekStart', { unique: false });
        te.createIndex('date', 'date', { unique: false });
        te.createIndex('job_week', ['jobId', 'weekStart'], { unique: false });
        te.createIndex('crew_date', ['crewMemberId', 'date'], { unique: false });
      }

      // shortage_resolutions (v2)
      if (!db.objectStoreNames.contains('shortage_resolutions')) {
        const sr = db.createObjectStore('shortage_resolutions', { keyPath: 'id' });
        sr.createIndex('jobId', 'jobId', { unique: false });
        sr.createIndex('weekStart', 'weekStart', { unique: false });
        sr.createIndex('job_week', ['jobId', 'weekStart'], { unique: false });
      }

      // feedback (v2)
      if (!db.objectStoreNames.contains('feedback')) {
        const fb = db.createObjectStore('feedback', { keyPath: 'id' });
        fb.createIndex('status', 'status', { unique: false });
        fb.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };

    req.onerror = () => {
      const err = req.error;
      console.error('SiteKit: Database error —', err?.message || 'unknown error');
      reject(new Error('Could not open the SiteKit database. ' + (err?.message || 'Try clearing site data and reloading.')));
    };
  });
}

/**
 * Generate a unique ID: timestamp base-36 + random chars.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Get all records from a store.
 */
export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all records matching an index value.
 */
export async function getAllByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get a single record by primary key.
 */
export async function getOne(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Put (add or update) a record.
 */
export async function put(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a record by primary key.
 */
export async function del(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear all records in a store.
 */
export async function clear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Run a read-write transaction across one or more stores.
 * The callback receives an object of { storeName: objectStore } entries.
 * Returns a promise that resolves when the transaction completes.
 */
export async function transaction(storeNames, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = {};
    for (const name of storeNames) {
      stores[name] = tx.objectStore(name);
    }
    try {
      callback(stores, tx);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}
