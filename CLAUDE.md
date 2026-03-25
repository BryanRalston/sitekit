# FixtureTrack

Fixture & equipment tracking app for general contractors managing retail store remodels.

## Stack
- **Frontend**: React 18 + Vite (port 5173, proxies /api to server)
- **Backend**: Node.js + Express (port 3200)
- **Database**: SQLite via better-sqlite3
- **Photo Storage**: File system at `data/photos/`
- **Image Processing**: Sharp for compression/resizing

## Architecture
```
C:\FixtureTrack\
├── server/
│   ├── index.js            # Express entry, serves static in prod
│   ├── db.js               # SQLite setup + schema migrations
│   ├── routes/
│   │   ├── jobs.js         # Job CRUD
│   │   ├── items.js        # Item CRUD + bulk ops + quick receive
│   │   ├── photos.js       # Upload, retrieve, reference library, fixture knowledge
│   │   └── import.js       # PDF upload + parsing
│   └── lib/
│       └── pdf-parser.js   # Assembly Detail PDF parser
├── src/
│   ├── main.jsx
│   ├── App.jsx             # Root: sidebar + main area + routing
│   ├── api.js              # fetch wrapper for all API calls
│   ├── tokens.js           # Design tokens (C colors, TF/MF fonts)
│   ├── components/
│   │   ├── ui/             # Badge, Btn, Inp, Toggle, Modal
│   │   ├── Sidebar.jsx
│   │   ├── FixturesTab.jsx
│   │   ├── ItemRow.jsx
│   │   ├── ItemModal.jsx
│   │   ├── QuickReceive.jsx     # Inline tap-to-receive
│   │   ├── ImportModal.jsx
│   │   ├── ReportModal.jsx
│   │   ├── VisualRefTab.jsx
│   │   ├── DeptPanel.jsx
│   │   ├── PhotoCard.jsx
│   │   ├── Lightbox.jsx
│   │   ├── FixturePicker.jsx
│   │   ├── ReferenceBrowser.jsx
│   │   └── FixtureKnowledge.jsx # Cross-job fixture tips/notes
│   └── hooks/
│       └── useApi.js
├── data/
│   ├── fixture-track.db
│   └── photos/{items,departments}/
└── public/                 # Static assets
```

## API Routes
```
GET    /api/jobs                    List all jobs (summary)
POST   /api/jobs                    Create job
GET    /api/jobs/:id                Full job with items + departments
PUT    /api/jobs/:id                Update job metadata
DELETE /api/jobs/:id                Delete job + cascade

GET    /api/jobs/:id/items          List items for job
POST   /api/jobs/:id/items          Create item
PUT    /api/items/:id               Update item
DELETE /api/items/:id               Delete item
PATCH  /api/items/:id/receive       Quick receive (qty_received, date_received)
POST   /api/jobs/:id/items/bulk-receive   Bulk mark received

POST   /api/jobs/:id/import         Upload PDF/CSV, parse, return preview
POST   /api/jobs/:id/import/confirm Confirm import (save parsed items)

GET    /api/jobs/:id/departments         List departments
POST   /api/jobs/:id/departments         Create department
PUT    /api/departments/:id              Update department
DELETE /api/departments/:id              Delete department

POST   /api/photos/upload           Upload photo (multipart, returns photo record)
GET    /api/photos/:id/image        Serve photo file
DELETE /api/photos/:id              Delete photo
PUT    /api/photos/:id              Update photo metadata
POST   /api/photos/:id/link         Link photo to item(s)
DELETE /api/photos/:id/link/:itemId Unlink photo from item

GET    /api/reference-library       Cross-job reference photos (filter by item_number, vendor, section)
GET    /api/fixture-knowledge/:itemNumber  Get tips/notes for an item number across all jobs
POST   /api/fixture-knowledge       Add a tip/note for a fixture type
GET    /api/jobs/:id/matched-references   Items in this job that have references from other jobs
```

## Database Schema
- jobs, items, departments, photos, photo_item_links, fixture_knowledge
- See server/db.js for full schema

## Design System: "Neural Dark"
- Palette: bg #0d1117, sidebar #161c27, card #1c2333, accent #f97316 (orange)
- Teal #2dd4bf for sections, blue #58a6ff for partial, green #3fb950 for received
- Fonts: Rajdhani (display), Nunito Sans (body), JetBrains Mono (codes)
- All styles are inline React style objects (no CSS files, no Tailwind)

## Running
```bash
cd C:\FixtureTrack
npm install
npm run dev        # Starts both Vite dev server + Express API
```

## Key Concepts
- Same Item# can appear in multiple sections with different quantities (correct per source doc)
- PDF parser must handle multi-line descriptions, multi-line section headers, and wrapped vendor names
- Photos are compressed server-side via Sharp (max 1400px, 80% JPEG)
- Reference photos (⭐) are visible in cross-job library
- Fixture Knowledge persists tips/notes per item number across all jobs
