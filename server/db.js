import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DB_DIR, 'fixture-track.db');

// Ensure data directories exist
fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(path.join(DB_DIR, 'photos'), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    store TEXT NOT NULL,
    store_number TEXT,
    location TEXT,
    file_ref TEXT,
    date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    vendor TEXT,
    material_class TEXT,
    item_number TEXT,
    description TEXT,
    fixture_book TEXT,
    section TEXT,
    qty_ordered TEXT,
    del_date TEXT,
    show_qty_ordered INTEGER DEFAULT 1,
    qty_received TEXT DEFAULT '',
    date_received TEXT DEFAULT '',
    missing_parts TEXT DEFAULT '',
    additional_orders TEXT DEFAULT '',
    damaged INTEGER DEFAULT 0,
    damage_notes TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    department_id TEXT REFERENCES departments(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    file_path TEXT,
    photo_type TEXT DEFAULT 'department',
    completed INTEGER DEFAULT 0,
    is_reference INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photo_item_links (
    photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    PRIMARY KEY (photo_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS fixture_knowledge (
    id TEXT PRIMARY KEY,
    item_number TEXT NOT NULL,
    vendor TEXT,
    description TEXT,
    note TEXT NOT NULL,
    note_type TEXT DEFAULT 'tip',
    sequence_order INTEGER,
    source_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    store TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    category TEXT DEFAULT 'Materials',
    notes TEXT DEFAULT '',
    is_gas INTEGER DEFAULT 0,
    items TEXT DEFAULT '[]',
    photo_path TEXT,
    submitted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_receipts_job ON receipts(job_id);
  CREATE INDEX IF NOT EXISTS idx_receipts_store ON receipts(store);
  CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);

  CREATE INDEX IF NOT EXISTS idx_items_job ON items(job_id);
  CREATE INDEX IF NOT EXISTS idx_items_item_number ON items(item_number);
  CREATE INDEX IF NOT EXISTS idx_departments_job ON departments(job_id);
  CREATE INDEX IF NOT EXISTS idx_photos_department ON photos(department_id);
  CREATE INDEX IF NOT EXISTS idx_fixture_knowledge_item ON fixture_knowledge(item_number);
`);

// Partial index requires a slightly different IF NOT EXISTS approach
// SQLite doesn't support IF NOT EXISTS for partial indexes, so we check manually
const existingIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_photos_reference'").get();
if (!existingIndexes) {
  db.exec(`CREATE INDEX idx_photos_reference ON photos(is_reference) WHERE is_reference = 1;`);
}

const gasIndex = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_receipts_gas'").get();
if (!gasIndex) {
  db.exec(`CREATE INDEX idx_receipts_gas ON receipts(is_gas) WHERE is_gas = 1;`);
}

// Helper functions
export function generateId() {
  return uuidv4();
}

export function getAll(sql, params = []) {
  return db.prepare(sql).all(...(Array.isArray(params) ? params : [params]));
}

export function getOne(sql, params = []) {
  return db.prepare(sql).get(...(Array.isArray(params) ? params : [params]));
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...(Array.isArray(params) ? params : [params]));
}

export function transaction(fn) {
  return db.transaction(fn)();
}

export { db, DB_PATH, DB_DIR, PROJECT_ROOT };
export default db;
