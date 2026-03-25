import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { generateId, getAll, getOne, run, transaction } from '../db.js';
import { upload, PHOTOS_DIR } from '../upload.js';

const router = Router();

// POST /api/photos/upload - multipart upload
router.post('/api/photos/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const { departmentId, title, notes, photoType } = req.body;

    // Compress with Sharp: max 1400px longest side, 80% JPEG quality
    const outputFilename = `${generateId()}.jpg`;
    const outputPath = path.join(PHOTOS_DIR, outputFilename);

    await sharp(req.file.path)
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    // Remove the original uploaded file if different from output
    if (req.file.path !== outputPath) {
      fs.unlink(req.file.path, () => {}); // fire and forget
    }

    const id = generateId();
    run(
      `INSERT INTO photos (id, department_id, title, notes, file_path, photo_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        departmentId || null,
        title || '',
        notes || '',
        outputFilename,
        photoType || 'department'
      ]
    );

    const photo = getOne('SELECT * FROM photos WHERE id = ?', [id]);
    res.status(201).json({
      ...photo,
      tags: JSON.parse(photo.tags || '[]')
    });
  } catch (err) {
    console.error('POST /api/photos/upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/photos/:id/image - serve the photo file
router.get('/api/photos/:id/image', (req, res) => {
  try {
    const photo = getOne('SELECT file_path FROM photos WHERE id = ?', [req.params.id]);
    if (!photo || !photo.file_path) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filePath = path.join(PHOTOS_DIR, photo.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Photo file not found on disk' });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('GET /api/photos/:id/image error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/photos/:id - update metadata
router.put('/api/photos/:id', (req, res) => {
  try {
    const existing = getOne('SELECT * FROM photos WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const { title, notes, completed, isReference, tags } = req.body;
    run(
      `UPDATE photos SET
        title = ?, notes = ?, completed = ?, is_reference = ?, tags = ?
       WHERE id = ?`,
      [
        title ?? existing.title,
        notes ?? existing.notes,
        completed !== undefined ? (completed ? 1 : 0) : existing.completed,
        isReference !== undefined ? (isReference ? 1 : 0) : existing.is_reference,
        tags !== undefined ? JSON.stringify(tags) : existing.tags,
        req.params.id
      ]
    );

    const photo = getOne('SELECT * FROM photos WHERE id = ?', [req.params.id]);
    const links = getAll('SELECT item_id FROM photo_item_links WHERE photo_id = ?', [req.params.id]);
    res.json({
      ...photo,
      tags: JSON.parse(photo.tags || '[]'),
      linkedItemIds: links.map(l => l.item_id)
    });
  } catch (err) {
    console.error('PUT /api/photos/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/photos/:id - delete photo file + DB record
router.delete('/api/photos/:id', (req, res) => {
  try {
    const photo = getOne('SELECT * FROM photos WHERE id = ?', [req.params.id]);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete file from disk
    if (photo.file_path) {
      const filePath = path.join(PHOTOS_DIR, photo.file_path);
      fs.unlink(filePath, () => {}); // fire and forget
    }

    run('DELETE FROM photos WHERE id = ?', [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('DELETE /api/photos/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/photos/:id/link - set linked items (replace all links)
router.post('/api/photos/:id/link', (req, res) => {
  try {
    const photo = getOne('SELECT id FROM photos WHERE id = ?', [req.params.id]);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const { itemIds } = req.body;
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds must be an array' });
    }

    transaction(() => {
      run('DELETE FROM photo_item_links WHERE photo_id = ?', [req.params.id]);
      for (const itemId of itemIds) {
        run(
          'INSERT INTO photo_item_links (photo_id, item_id) VALUES (?, ?)',
          [req.params.id, itemId]
        );
      }
    });

    const links = getAll('SELECT item_id FROM photo_item_links WHERE photo_id = ?', [req.params.id]);
    res.json({ photoId: req.params.id, linkedItemIds: links.map(l => l.item_id) });
  } catch (err) {
    console.error('POST /api/photos/:id/link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reference-library - cross-job reference photos
router.get('/api/reference-library', (req, res) => {
  try {
    const { itemNumber, vendor, section, jobId } = req.query;

    let sql = `
      SELECT p.*, d.job_id, d.name as department_name, j.name as job_name, j.store as job_store
      FROM photos p
      JOIN departments d ON p.department_id = d.id
      JOIN jobs j ON d.job_id = j.id
      WHERE p.is_reference = 1
    `;
    const params = [];

    // Exclude current job if specified
    if (jobId) {
      sql += ' AND d.job_id != ?';
      params.push(jobId);
    }

    // Filter by linked item attributes if specified
    if (itemNumber) {
      sql += ` AND p.id IN (
        SELECT pil.photo_id FROM photo_item_links pil
        JOIN items i ON pil.item_id = i.id
        WHERE i.item_number = ?
      )`;
      params.push(itemNumber);
    }

    if (vendor) {
      sql += ` AND p.id IN (
        SELECT pil.photo_id FROM photo_item_links pil
        JOIN items i ON pil.item_id = i.id
        WHERE i.vendor = ?
      )`;
      params.push(vendor);
    }

    if (section) {
      sql += ` AND p.id IN (
        SELECT pil.photo_id FROM photo_item_links pil
        JOIN items i ON pil.item_id = i.id
        WHERE i.section = ?
      )`;
      params.push(section);
    }

    sql += ' ORDER BY p.created_at DESC';

    const photos = getAll(sql, params);
    const enriched = photos.map(photo => {
      const links = getAll(
        `SELECT i.id, i.item_number, i.vendor, i.description, i.section
         FROM photo_item_links pil
         JOIN items i ON pil.item_id = i.id
         WHERE pil.photo_id = ?`,
        [photo.id]
      );
      return {
        ...photo,
        tags: JSON.parse(photo.tags || '[]'),
        linkedItems: links
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/reference-library error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fixture-knowledge/:itemNumber - get all tips/notes for this item number
router.get('/api/fixture-knowledge/:itemNumber', (req, res) => {
  try {
    const knowledge = getAll(
      `SELECT fk.*, j.name as job_name, j.store as job_store
       FROM fixture_knowledge fk
       LEFT JOIN jobs j ON fk.source_job_id = j.id
       WHERE fk.item_number = ?
       ORDER BY fk.sequence_order, fk.created_at`,
      [req.params.itemNumber]
    );
    res.json(knowledge);
  } catch (err) {
    console.error('GET /api/fixture-knowledge/:itemNumber error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fixture-knowledge - add a tip/note
router.post('/api/fixture-knowledge', (req, res) => {
  try {
    const { itemNumber, vendor, description, note, noteType, sequenceOrder, sourceJobId } = req.body;
    if (!itemNumber || !note) {
      return res.status(400).json({ error: 'itemNumber and note are required' });
    }

    const id = generateId();
    run(
      `INSERT INTO fixture_knowledge (id, item_number, vendor, description, note, note_type, sequence_order, source_job_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, itemNumber, vendor || null, description || null, note, noteType || 'tip', sequenceOrder || null, sourceJobId || null]
    );

    const knowledge = getOne('SELECT * FROM fixture_knowledge WHERE id = ?', [id]);
    res.status(201).json(knowledge);
  } catch (err) {
    console.error('POST /api/fixture-knowledge error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:jobId/matched-references - items in this job that have references from other jobs
router.get('/api/jobs/:jobId/matched-references', (req, res) => {
  try {
    // Get unique item numbers in this job
    const jobItems = getAll(
      'SELECT DISTINCT item_number FROM items WHERE job_id = ? AND item_number IS NOT NULL AND item_number != ?',
      [req.params.jobId, '']
    );

    const matches = [];
    for (const { item_number } of jobItems) {
      // Find reference photos from OTHER jobs linked to items with the same item_number
      const refs = getAll(
        `SELECT DISTINCT d.job_id, j.name as job_name, j.store as job_store, COUNT(p.id) as photo_count
         FROM photos p
         JOIN departments d ON p.department_id = d.id
         JOIN jobs j ON d.job_id = j.id
         JOIN photo_item_links pil ON pil.photo_id = p.id
         JOIN items i ON pil.item_id = i.id
         WHERE p.is_reference = 1
           AND d.job_id != ?
           AND i.item_number = ?
         GROUP BY d.job_id`,
        [req.params.jobId, item_number]
      );

      if (refs.length > 0) {
        const totalRefCount = refs.reduce((sum, r) => sum + r.photo_count, 0);
        matches.push({
          itemNumber: item_number,
          refCount: totalRefCount,
          jobs: refs.map(r => ({
            jobId: r.job_id,
            jobName: r.job_name,
            jobStore: r.job_store,
            photoCount: r.photo_count
          }))
        });
      }
    }

    res.json(matches);
  } catch (err) {
    console.error('GET /api/jobs/:jobId/matched-references error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
