import { Router } from 'express';
import { generateId, getAll, getOne, run, db } from '../db.js';

const router = Router();

// GET /api/jobs - list all jobs with summary stats
router.get('/api/jobs', (req, res) => {
  try {
    const jobs = getAll('SELECT * FROM jobs ORDER BY created_at DESC');

    const enriched = jobs.map(job => {
      const itemCount = getOne('SELECT COUNT(*) as count FROM items WHERE job_id = ?', [job.id]).count;
      const receivedCount = getOne(
        "SELECT COUNT(*) as count FROM items WHERE job_id = ? AND qty_received != '' AND qty_received IS NOT NULL",
        [job.id]
      ).count;
      const issueCount = getOne(
        "SELECT COUNT(*) as count FROM items WHERE job_id = ? AND (damaged = 1 OR (missing_parts != '' AND missing_parts IS NOT NULL))",
        [job.id]
      ).count;
      const departmentCount = getOne('SELECT COUNT(*) as count FROM departments WHERE job_id = ?', [job.id]).count;
      const photoCount = getOne(
        `SELECT COUNT(*) as count FROM photos p
         JOIN departments d ON p.department_id = d.id
         WHERE d.job_id = ?`,
        [job.id]
      ).count;

      const receiptStats = getOne(
        'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM receipts WHERE job_id = ?',
        [job.id]
      );

      return {
        ...job,
        itemCount,
        receivedCount,
        issueCount,
        departmentCount,
        photoCount,
        receiptCount: receiptStats.count,
        receiptTotal: receiptStats.total
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/jobs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs - create job
router.post('/api/jobs', (req, res) => {
  try {
    const { name, store, store_number, location, file_ref, date } = req.body;
    if (!name || !store) {
      return res.status(400).json({ error: 'name and store are required' });
    }

    const id = generateId();
    run(
      `INSERT INTO jobs (id, name, store, store_number, location, file_ref, date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, store, store_number || null, location || null, file_ref || null, date || null]
    );

    const job = getOne('SELECT * FROM jobs WHERE id = ?', [id]);
    res.status(201).json(job);
  } catch (err) {
    console.error('POST /api/jobs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id - full job with items and departments (departments include photos with linked item IDs)
router.get('/api/jobs/:id', (req, res) => {
  try {
    const job = getOne('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const items = getAll('SELECT * FROM items WHERE job_id = ? ORDER BY sort_order, created_at', [job.id]);

    const departments = getAll('SELECT * FROM departments WHERE job_id = ? ORDER BY sort_order, name', [job.id]);

    // Enrich departments with photos and their linked item IDs
    const enrichedDepartments = departments.map(dept => {
      const photos = getAll('SELECT * FROM photos WHERE department_id = ? ORDER BY created_at', [dept.id]);
      const enrichedPhotos = photos.map(photo => {
        const links = getAll('SELECT item_id FROM photo_item_links WHERE photo_id = ?', [photo.id]);
        return {
          ...photo,
          tags: JSON.parse(photo.tags || '[]'),
          linkedItemIds: links.map(l => l.item_id)
        };
      });
      return { ...dept, photos: enrichedPhotos };
    });

    const receipts = getAll('SELECT * FROM receipts WHERE job_id = ? ORDER BY date DESC, created_at DESC', [job.id]);
    const enrichedReceipts = receipts.map(r => ({
      ...r,
      items: JSON.parse(r.items || '[]')
    }));

    res.json({
      ...job,
      items,
      departments: enrichedDepartments,
      receipts: enrichedReceipts
    });
  } catch (err) {
    console.error('GET /api/jobs/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/jobs/:id - update job metadata
router.put('/api/jobs/:id', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { name, store, store_number, location, file_ref, date } = req.body;
    run(
      `UPDATE jobs SET
        name = ?, store = ?, store_number = ?, location = ?, file_ref = ?, date = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        name ?? existing.name,
        store ?? existing.store,
        store_number ?? existing.store_number,
        location ?? existing.location,
        file_ref ?? existing.file_ref,
        date ?? existing.date,
        req.params.id
      ]
    );

    const job = getOne('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    res.json(job);
  } catch (err) {
    console.error('PUT /api/jobs/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id - delete job (cascade handled by FK)
router.delete('/api/jobs/:id', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Job not found' });
    }

    run('DELETE FROM jobs WHERE id = ?', [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('DELETE /api/jobs/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export - full backup of all data as a single JSON object
router.get('/api/export', (req, res) => {
  try {
    const jobs = getAll('SELECT * FROM jobs ORDER BY created_at DESC');

    const fullJobs = jobs.map(job => {
      const items = getAll('SELECT * FROM items WHERE job_id = ? ORDER BY sort_order, created_at', [job.id]);
      const departments = getAll('SELECT * FROM departments WHERE job_id = ? ORDER BY sort_order, name', [job.id]);

      const enrichedDepartments = departments.map(dept => {
        const photos = getAll('SELECT * FROM photos WHERE department_id = ? ORDER BY created_at', [dept.id]);
        const enrichedPhotos = photos.map(photo => {
          const links = getAll('SELECT item_id FROM photo_item_links WHERE photo_id = ?', [photo.id]);
          return {
            ...photo,
            tags: JSON.parse(photo.tags || '[]'),
            linkedItemIds: links.map(l => l.item_id)
          };
        });
        return { ...dept, photos: enrichedPhotos };
      });

      const receipts = getAll('SELECT * FROM receipts WHERE job_id = ? ORDER BY date DESC, created_at DESC', [job.id]);
      const enrichedReceipts = receipts.map(r => ({
        ...r,
        items: JSON.parse(r.items || '[]')
      }));

      return {
        ...job,
        items,
        departments: enrichedDepartments,
        receipts: enrichedReceipts
      };
    });

    res.json({
      exportDate: new Date().toISOString(),
      version: "1.0",
      jobs: fullJobs
    });
  } catch (err) {
    console.error('GET /api/export error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
