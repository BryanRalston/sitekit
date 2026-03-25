import { Router } from 'express';
import { generateId, getAll, getOne, run, transaction } from '../db.js';

const router = Router();

// GET /api/jobs/:jobId/items - list items for job
router.get('/api/jobs/:jobId/items', (req, res) => {
  try {
    const items = getAll(
      'SELECT * FROM items WHERE job_id = ? ORDER BY sort_order, created_at',
      [req.params.jobId]
    );
    res.json(items);
  } catch (err) {
    console.error('GET /api/jobs/:jobId/items error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:jobId/items - create single item
router.post('/api/jobs/:jobId/items', (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const {
      vendor, material_class, item_number, description, fixture_book,
      section, qty_ordered, del_date, show_qty_ordered, sort_order
    } = req.body;

    const id = generateId();
    run(
      `INSERT INTO items (id, job_id, vendor, material_class, item_number, description,
        fixture_book, section, qty_ordered, del_date, show_qty_ordered, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.params.jobId,
        vendor || null, material_class || null, item_number || null,
        description || null, fixture_book || null, section || null,
        qty_ordered || null, del_date || null,
        show_qty_ordered !== undefined ? (show_qty_ordered ? 1 : 0) : 1,
        sort_order || 0
      ]
    );

    const item = getOne('SELECT * FROM items WHERE id = ?', [id]);
    res.status(201).json(item);
  } catch (err) {
    console.error('POST /api/jobs/:jobId/items error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/items/:id - update item (full replace of editable fields)
router.put('/api/items/:id', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const {
      vendor, material_class, item_number, description, fixture_book,
      section, qty_ordered, del_date, show_qty_ordered,
      qty_received, date_received, missing_parts, additional_orders,
      damaged, damage_notes, notes, sort_order
    } = req.body;

    run(
      `UPDATE items SET
        vendor = ?, material_class = ?, item_number = ?, description = ?,
        fixture_book = ?, section = ?, qty_ordered = ?, del_date = ?,
        show_qty_ordered = ?, qty_received = ?, date_received = ?,
        missing_parts = ?, additional_orders = ?, damaged = ?,
        damage_notes = ?, notes = ?, sort_order = ?
       WHERE id = ?`,
      [
        vendor ?? existing.vendor,
        material_class ?? existing.material_class,
        item_number ?? existing.item_number,
        description ?? existing.description,
        fixture_book ?? existing.fixture_book,
        section ?? existing.section,
        qty_ordered ?? existing.qty_ordered,
        del_date ?? existing.del_date,
        show_qty_ordered !== undefined ? (show_qty_ordered ? 1 : 0) : existing.show_qty_ordered,
        qty_received ?? existing.qty_received,
        date_received ?? existing.date_received,
        missing_parts ?? existing.missing_parts,
        additional_orders ?? existing.additional_orders,
        damaged !== undefined ? (damaged ? 1 : 0) : existing.damaged,
        damage_notes ?? existing.damage_notes,
        notes ?? existing.notes,
        sort_order ?? existing.sort_order,
        req.params.id
      ]
    );

    const item = getOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
    res.json(item);
  } catch (err) {
    console.error('PUT /api/items/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/items/:id - delete item
router.delete('/api/items/:id', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    run('DELETE FROM items WHERE id = ?', [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('DELETE /api/items/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/items/:id/receive - quick receive
router.patch('/api/items/:id/receive', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { qtyReceived, dateReceived } = req.body;
    run(
      `UPDATE items SET qty_received = ?, date_received = ? WHERE id = ?`,
      [
        qtyReceived ?? existing.qty_received,
        dateReceived ?? existing.date_received,
        req.params.id
      ]
    );

    const item = getOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
    res.json(item);
  } catch (err) {
    console.error('PATCH /api/items/:id/receive error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:jobId/items/bulk-receive - bulk mark received
router.post('/api/jobs/:jobId/items/bulk-receive', (req, res) => {
  try {
    const { itemIds, qtyReceived, dateReceived } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds array is required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const receivedDate = dateReceived || today;

    transaction(() => {
      for (const itemId of itemIds) {
        const item = getOne('SELECT * FROM items WHERE id = ? AND job_id = ?', [itemId, req.params.jobId]);
        if (item) {
          // If qtyReceived not provided, set to qtyOrdered for each item
          const qty = qtyReceived ?? item.qty_ordered ?? '';
          run(
            'UPDATE items SET qty_received = ?, date_received = ? WHERE id = ?',
            [qty, receivedDate, itemId]
          );
        }
      }
    });

    const items = getAll(
      'SELECT * FROM items WHERE job_id = ? ORDER BY sort_order, created_at',
      [req.params.jobId]
    );
    res.json(items);
  } catch (err) {
    console.error('POST /api/jobs/:jobId/items/bulk-receive error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
