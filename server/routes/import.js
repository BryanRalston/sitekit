import { Router } from 'express';
import { generateId, getOne, run, transaction } from '../db.js';
import { upload } from '../upload.js';
import { parsePdfText, parseCsvText, extractTextFromPdf } from '../lib/pdf-parser.js';

const router = Router();

// POST /api/jobs/:jobId/import - upload PDF/CSV or raw text, parse and return preview
router.post('/api/jobs/:jobId/import', upload.single('file'), async (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let text = '';
    let mode = req.body.mode || 'pdf';

    if (req.file) {
      // Uploaded file
      if (req.file.mimetype === 'application/pdf' || req.file.originalname?.endsWith('.pdf')) {
        const fs = await import('fs');
        const buffer = fs.readFileSync(req.file.path);
        text = await extractTextFromPdf(buffer);
        mode = 'pdf';
      } else {
        // Assume CSV/text
        const fs = await import('fs');
        text = fs.readFileSync(req.file.path, 'utf-8');
        mode = 'csv';
      }

      // Clean up uploaded file
      const fs = await import('fs');
      fs.unlink(req.file.path, () => {});
    } else if (req.body.text) {
      text = req.body.text;
    } else {
      return res.status(400).json({ error: 'No file or text provided' });
    }

    let result;
    if (mode === 'csv') {
      result = parseCsvText(text);
    } else {
      result = parsePdfText(text);
    }

    res.json(result);
  } catch (err) {
    console.error('POST /api/jobs/:jobId/import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:jobId/import/confirm - save confirmed items to database
router.post('/api/jobs/:jobId/import/confirm', (req, res) => {
  try {
    const job = getOne('SELECT id FROM jobs WHERE id = ?', [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    // Get current max sort_order for this job
    const maxSort = getOne(
      'SELECT MAX(sort_order) as max_sort FROM items WHERE job_id = ?',
      [req.params.jobId]
    );
    let sortOrder = (maxSort?.max_sort || 0) + 1;

    const savedItems = [];

    transaction(() => {
      for (const item of items) {
        const id = generateId();
        run(
          `INSERT INTO items (id, job_id, vendor, material_class, item_number, description,
            fixture_book, section, qty_ordered, del_date, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            req.params.jobId,
            item.vendor || null,
            item.materialClass || item.material_class || null,
            item.itemNumber || item.item_number || null,
            item.description || null,
            item.fixtureBook || item.fixture_book || null,
            item.section || null,
            item.qtyOrdered || item.qty_ordered || null,
            item.delDate || item.del_date || null,
            sortOrder++
          ]
        );
        savedItems.push(id);
      }
    });

    res.status(201).json({
      success: true,
      count: savedItems.length,
      itemIds: savedItems
    });
  } catch (err) {
    console.error('POST /api/jobs/:jobId/import/confirm error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
