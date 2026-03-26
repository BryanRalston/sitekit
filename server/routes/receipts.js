import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { generateId, getAll, getOne, run, transaction, DB_DIR } from '../db.js';
import { upload } from '../upload.js';

const router = Router();

// Ensure receipt photos directory exists
const RECEIPT_PHOTOS_DIR = path.join(DB_DIR, 'photos', 'receipts');
fs.mkdirSync(RECEIPT_PHOTOS_DIR, { recursive: true });

// GET /api/jobs/:jobId/receipts - list receipts for job
router.get('/api/jobs/:jobId/receipts', (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const receipts = getAll(
      'SELECT * FROM receipts WHERE job_id = ? ORDER BY date DESC, created_at DESC',
      [req.params.jobId]
    );

    const enriched = receipts.map(r => ({
      ...r,
      items: JSON.parse(r.items || '[]'),
      hasPhoto: !!r.photo_path
    }));

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/jobs/:jobId/receipts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:jobId/receipts - create receipt
router.post('/api/jobs/:jobId/receipts', (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { store, amount, date, category, notes, isGas, items, submitted } = req.body;
    if (!store || amount === undefined || amount === null || !date) {
      return res.status(400).json({ error: 'store, amount, and date are required' });
    }

    const id = generateId();
    run(
      `INSERT INTO receipts (id, job_id, store, amount, date, category, notes, is_gas, items, submitted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.params.jobId,
        store,
        amount,
        date,
        category || 'Materials',
        notes || '',
        isGas ? 1 : 0,
        items ? JSON.stringify(items) : '[]',
        submitted ? 1 : 0
      ]
    );

    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [id]);
    res.status(201).json({
      ...receipt,
      items: JSON.parse(receipt.items || '[]'),
      hasPhoto: false
    });
  } catch (err) {
    console.error('POST /api/jobs/:jobId/receipts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/receipts/stores - unique store names for autocomplete
// NOTE: Must be defined before /api/receipts/:id to avoid "stores" matching as :id
router.get('/api/receipts/stores', (req, res) => {
  try {
    const stores = getAll(
      'SELECT DISTINCT store FROM receipts ORDER BY store COLLATE NOCASE'
    );
    res.json(stores.map(s => s.store));
  } catch (err) {
    console.error('GET /api/receipts/stores error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/receipts/:id - get single receipt
router.get('/api/receipts/:id', (req, res) => {
  try {
    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json({
      ...receipt,
      items: JSON.parse(receipt.items || '[]'),
      hasPhoto: !!receipt.photo_path
    });
  } catch (err) {
    console.error('GET /api/receipts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/receipts/:id - update receipt
router.put('/api/receipts/:id', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const { store, amount, date, category, notes, isGas, items, submitted } = req.body;
    run(
      `UPDATE receipts SET
        store = ?, amount = ?, date = ?, category = ?, notes = ?,
        is_gas = ?, items = ?, submitted = ?
       WHERE id = ?`,
      [
        store ?? existing.store,
        amount ?? existing.amount,
        date ?? existing.date,
        category ?? existing.category,
        notes ?? existing.notes,
        isGas !== undefined ? (isGas ? 1 : 0) : existing.is_gas,
        items !== undefined ? JSON.stringify(items) : existing.items,
        submitted !== undefined ? (submitted ? 1 : 0) : existing.submitted,
        req.params.id
      ]
    );

    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    res.json({
      ...receipt,
      items: JSON.parse(receipt.items || '[]'),
      hasPhoto: !!receipt.photo_path
    });
  } catch (err) {
    console.error('PUT /api/receipts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/receipts/:id - delete receipt (also delete photo file if exists)
router.delete('/api/receipts/:id', (req, res) => {
  try {
    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Delete photo file from disk if exists
    if (receipt.photo_path) {
      const filePath = path.join(RECEIPT_PHOTOS_DIR, receipt.photo_path);
      fs.unlink(filePath, () => {}); // fire and forget
    }

    run('DELETE FROM receipts WHERE id = ?', [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('DELETE /api/receipts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/receipts/:id/toggle-submitted - flip submitted boolean
router.patch('/api/receipts/:id/toggle-submitted', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const newValue = existing.submitted ? 0 : 1;
    run('UPDATE receipts SET submitted = ? WHERE id = ?', [newValue, req.params.id]);

    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    res.json({
      ...receipt,
      items: JSON.parse(receipt.items || '[]'),
      hasPhoto: !!receipt.photo_path
    });
  } catch (err) {
    console.error('PATCH /api/receipts/:id/toggle-submitted error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:jobId/receipts/mark-all-submitted - mark all receipts in job as submitted
router.post('/api/jobs/:jobId/receipts/mark-all-submitted', (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    run('UPDATE receipts SET submitted = 1 WHERE job_id = ?', [req.params.jobId]);

    const receipts = getAll(
      'SELECT * FROM receipts WHERE job_id = ? ORDER BY date DESC, created_at DESC',
      [req.params.jobId]
    );

    res.json(receipts.map(r => ({
      ...r,
      items: JSON.parse(r.items || '[]'),
      hasPhoto: !!r.photo_path
    })));
  } catch (err) {
    console.error('POST /api/jobs/:jobId/receipts/mark-all-submitted error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/receipts/:id/photo - multipart photo upload
router.post('/api/receipts/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    // Delete old photo if exists
    if (receipt.photo_path) {
      const oldPath = path.join(RECEIPT_PHOTOS_DIR, receipt.photo_path);
      fs.unlink(oldPath, () => {});
    }

    // Compress with Sharp: max 1200px longest side, 70% JPEG quality
    const outputFilename = `${req.params.id}.jpg`;
    const outputPath = path.join(RECEIPT_PHOTOS_DIR, outputFilename);

    await sharp(req.file.path)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toFile(outputPath);

    // Remove the original uploaded file
    if (req.file.path !== outputPath) {
      fs.unlink(req.file.path, () => {});
    }

    run('UPDATE receipts SET photo_path = ? WHERE id = ?', [outputFilename, req.params.id]);

    const updated = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    res.json({
      ...updated,
      items: JSON.parse(updated.items || '[]'),
      hasPhoto: true
    });
  } catch (err) {
    console.error('POST /api/receipts/:id/photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/receipts/:id/photo - serve receipt photo file
router.get('/api/receipts/:id/photo', (req, res) => {
  try {
    const receipt = getOne('SELECT photo_path FROM receipts WHERE id = ?', [req.params.id]);
    if (!receipt || !receipt.photo_path) {
      return res.status(404).json({ error: 'Receipt photo not found' });
    }

    // Sanitize photo_path to prevent path traversal
    const safeName = path.basename(receipt.photo_path);
    const filePath = path.join(RECEIPT_PHOTOS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Photo file not found on disk' });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('GET /api/receipts/:id/photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/receipts/:id/photo - delete receipt photo
router.delete('/api/receipts/:id/photo', (req, res) => {
  try {
    const receipt = getOne('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    if (receipt.photo_path) {
      const filePath = path.join(RECEIPT_PHOTOS_DIR, receipt.photo_path);
      fs.unlink(filePath, () => {});
    }

    run('UPDATE receipts SET photo_path = NULL WHERE id = ?', [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('DELETE /api/receipts/:id/photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:jobId/receipts/summary - receipt summary for job
router.get('/api/jobs/:jobId/receipts/summary', (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const totals = getOne(
      `SELECT
        COALESCE(SUM(amount), 0) as totalSpend,
        COUNT(*) as receiptCount,
        COALESCE(SUM(CASE WHEN is_gas = 1 THEN amount ELSE 0 END), 0) as gasTotal,
        SUM(CASE WHEN submitted = 0 THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN submitted = 1 THEN 1 ELSE 0 END) as submittedCount
       FROM receipts WHERE job_id = ?`,
      [req.params.jobId]
    );

    const byCategory = getAll(
      `SELECT category, SUM(amount) as total, COUNT(*) as count
       FROM receipts WHERE job_id = ?
       GROUP BY category ORDER BY total DESC`,
      [req.params.jobId]
    );

    res.json({
      totalSpend: totals.totalSpend,
      receiptCount: totals.receiptCount,
      gasTotal: totals.gasTotal,
      pendingCount: totals.pendingCount,
      submittedCount: totals.submittedCount,
      byCategory
    });
  } catch (err) {
    console.error('GET /api/jobs/:jobId/receipts/summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gas-log - all gas receipts across all jobs
router.get('/api/gas-log', (req, res) => {
  try {
    const gasReceipts = getAll(
      `SELECT r.*, j.name as job_name
       FROM receipts r
       JOIN jobs j ON r.job_id = j.id
       WHERE r.is_gas = 1
       ORDER BY r.date DESC, r.created_at DESC`
    );

    const enriched = gasReceipts.map(r => ({
      ...r,
      items: JSON.parse(r.items || '[]'),
      hasPhoto: !!r.photo_path
    }));

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/gas-log error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/receiptlog - import ReceiptLog backup JSON
router.post('/api/import/receiptlog', async (req, res) => {
  try {
    const data = req.body;

    if (data.app !== 'ReceiptLog') {
      return res.status(400).json({ error: 'Invalid format: expected app === "ReceiptLog"' });
    }

    if (!data.jobs || !data.receipts) {
      return res.status(400).json({ error: 'Missing jobs or receipts arrays' });
    }

    let jobsCreated = 0;
    let jobsMatched = 0;
    let receiptsImported = 0;

    // Build a map from ReceiptLog job ID -> SiteKit job ID
    const jobIdMap = {};

    transaction(() => {
      // Map or create jobs
      for (const rlJob of data.jobs) {
        // Case-insensitive match by name
        const existing = getOne(
          'SELECT id FROM jobs WHERE LOWER(name) = LOWER(?)',
          [rlJob.name]
        );

        if (existing) {
          jobIdMap[rlJob.id] = existing.id;
          jobsMatched++;
        } else {
          // Create new SiteKit job from ReceiptLog job data
          const newId = generateId();
          run(
            `INSERT INTO jobs (id, name, store, store_number, location, file_ref, date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              newId,
              rlJob.name,
              rlJob.store || rlJob.name,
              rlJob.store_number || null,
              rlJob.location || null,
              rlJob.file_ref || null,
              rlJob.date || null
            ]
          );
          jobIdMap[rlJob.id] = newId;
          jobsCreated++;
        }
      }

      // Import receipts
      for (const rlReceipt of data.receipts) {
        const mappedJobId = jobIdMap[rlReceipt.job_id || rlReceipt.jobId];
        if (!mappedJobId) {
          // Skip receipts with no matching job
          continue;
        }

        const receiptId = generateId();
        let photoPath = null;

        // Handle photo: base64 data URL -> file
        const photoData = rlReceipt.photo;
        if (photoData && typeof photoData === 'string' && photoData.startsWith('data:')) {
          // Strip data URL prefix: "data:image/jpeg;base64,..."
          const base64Data = photoData.split(',')[1];
          if (base64Data) {
            const photoFilename = `${receiptId}.jpg`;
            const photoFilePath = path.join(RECEIPT_PHOTOS_DIR, photoFilename);
            const buffer = Buffer.from(base64Data, 'base64');

            // Write synchronously inside transaction, compress later
            // For transaction atomicity, write the raw file first
            fs.writeFileSync(photoFilePath, buffer);
            photoPath = photoFilename;

            // Note: We can't await sharp inside a sync transaction.
            // We'll queue photo compression as a post-step.
          }
        }

        run(
          `INSERT INTO receipts (id, job_id, store, amount, date, category, notes, is_gas, items, photo_path, submitted, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptId,
            mappedJobId,
            rlReceipt.store || 'Unknown',
            rlReceipt.amount || 0,
            rlReceipt.date || new Date().toISOString().split('T')[0],
            rlReceipt.category || 'Materials',
            rlReceipt.notes || '',
            rlReceipt.isGas || rlReceipt.is_gas ? 1 : 0,
            typeof rlReceipt.items === 'string' ? rlReceipt.items : JSON.stringify(rlReceipt.items || []),
            photoPath,
            rlReceipt.submitted ? 1 : 0,
            rlReceipt.created || rlReceipt.created_at || new Date().toISOString()
          ]
        );
        receiptsImported++;
      }
    });

    // Post-transaction: compress any imported photos with Sharp
    const importedWithPhotos = getAll(
      'SELECT id, photo_path FROM receipts WHERE photo_path IS NOT NULL'
    );
    for (const r of importedWithPhotos) {
      const filePath = path.join(RECEIPT_PHOTOS_DIR, r.photo_path);
      if (fs.existsSync(filePath)) {
        try {
          const tempPath = filePath + '.tmp';
          await sharp(filePath)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toFile(tempPath);
          fs.renameSync(tempPath, filePath);
        } catch (compressErr) {
          // Non-fatal: photo exists but isn't compressed
          console.warn(`Photo compression failed for ${r.id}:`, compressErr.message);
        }
      }
    }

    res.json({
      jobsCreated,
      jobsMatched,
      receiptsImported
    });
  } catch (err) {
    console.error('POST /api/import/receiptlog error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
