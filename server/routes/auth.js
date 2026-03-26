import { Router } from 'express';
import crypto from 'crypto';
import { db, getOne, run } from '../db.js';

const router = Router();

// Ensure app_config table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// PBKDF2 — stronger hash for short PINs (matches client-side implementation)
const PIN_SALT = 'sitekit-pin-v1';
const PBKDF2_ITERATIONS = 100000;

function hashPin(pin) {
  return crypto.pbkdf2Sync(pin, PIN_SALT, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
}

// Legacy SHA-256 hash — kept for backward compat with pre-migration PINs
function hashPinLegacy(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// GET /api/auth/status — check whether a PIN has been set
router.get('/api/auth/status', (req, res) => {
  try {
    const row = getOne("SELECT value FROM app_config WHERE key = 'pin_hash'");
    res.json({ configured: !!row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/setup — set initial PIN
router.post('/api/auth/setup', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    // Don't allow setup if PIN already exists
    const existing = getOne("SELECT value FROM app_config WHERE key = 'pin_hash'");
    if (existing) {
      return res.status(400).json({ error: 'PIN already configured. Use /api/auth/change to update.' });
    }

    const hash = hashPin(pin);
    run("INSERT INTO app_config (key, value) VALUES ('pin_hash', ?)", [hash]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify — check PIN against stored hash
router.post('/api/auth/verify', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    const row = getOne("SELECT value FROM app_config WHERE key = 'pin_hash'");
    if (!row) {
      return res.status(400).json({ error: 'No PIN configured' });
    }

    // Try PBKDF2 first (current method)
    const pbkdf2Hash = hashPin(pin);
    if (row.value === pbkdf2Hash) {
      return res.json({ valid: true });
    }
    // Fallback: try legacy SHA-256 hash (pre-migration PINs)
    const legacyHash = hashPinLegacy(pin);
    if (row.value === legacyHash) {
      // Silently migrate to PBKDF2 on successful legacy login
      run("UPDATE app_config SET value = ? WHERE key = 'pin_hash'", [pbkdf2Hash]);
      return res.json({ valid: true });
    }
    res.json({ valid: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change — verify current PIN and update to new one
router.post('/api/auth/change', (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !/^\d{4}$/.test(currentPin)) {
      return res.status(400).json({ error: 'Current PIN must be exactly 4 digits' });
    }
    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ error: 'New PIN must be exactly 4 digits' });
    }

    const row = getOne("SELECT value FROM app_config WHERE key = 'pin_hash'");
    if (!row) {
      return res.status(400).json({ error: 'No PIN configured' });
    }

    // Try PBKDF2 first, then legacy SHA-256
    const currentPbkdf2 = hashPin(currentPin);
    const currentLegacy = hashPinLegacy(currentPin);
    if (row.value !== currentPbkdf2 && row.value !== currentLegacy) {
      return res.json({ valid: false, error: 'Current PIN is incorrect' });
    }

    // Always store new PIN with PBKDF2
    const newHash = hashPin(newPin);
    run("UPDATE app_config SET value = ? WHERE key = 'pin_hash'", [newHash]);
    res.json({ valid: true, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
