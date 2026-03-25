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

function hashPin(pin) {
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

    const valid = row.value === hashPin(pin);
    res.json({ valid });
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

    if (row.value !== hashPin(currentPin)) {
      return res.json({ valid: false, error: 'Current PIN is incorrect' });
    }

    const newHash = hashPin(newPin);
    run("UPDATE app_config SET value = ? WHERE key = 'pin_hash'", [newHash]);
    res.json({ valid: true, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
