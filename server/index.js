import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DB_PATH, DB_DIR, PROJECT_ROOT } from './db.js';
import { PHOTOS_DIR } from './upload.js';
import jobsRouter from './routes/jobs.js';
import itemsRouter from './routes/items.js';
import photosRouter from './routes/photos.js';
import importRouter from './routes/import.js';
import receiptsRouter from './routes/receipts.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = 3200;

// CORS for dev
app.use(cors());

// JSON body parser with 50mb limit (for base64 photo fallback)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve photo files
app.use('/api/photos/file', express.static(PHOTOS_DIR));

// Serve static files in production
const distPath = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Mount routes
app.use(authRouter);
app.use(jobsRouter);
app.use(itemsRouter);
app.use(photosRouter);
app.use(importRouter);
app.use(receiptsRouter);

// SPA fallback for production
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SiteKit server running on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Photo storage: ${PHOTOS_DIR}`);
});

export default app;
