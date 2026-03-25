// ─── Client-side PDF/CSV text parser ────────────────────────────────────────
// Ported from server/lib/pdf-parser.js — pure JavaScript, no Node.js dependencies.

// ─── Known Vendors (longest first for greedy matching) ──────────────────────
const KNOWN_VENDORS = [
  'ENVISION (PLASTICS PLUS)',
  'CAROLINA INNOVATIONS',
  'DELUXE SYSTEMS INC',
  'PACIFIC NORTHERN',
  'AGILITY RETAIL',
  'ACME PLASTICS',
  'CROWN METAL',
  'MCCUE CORP',
  'VIRA MFG.',
  'VIRA MFG',
  'DILLMEIER',
  'DIGILOCK',
  'ENVISION',
  'EXCALIBUR',
  'VASWANI',
  'KASTON',
  'CAHILL',
  'C.A.P.',
  'C.A.P',
  'WESCO',
  'IDX',
];

// Map of first-word to full multi-word vendor names (for split-line detection)
const VENDOR_PREFIXES = {};
for (const v of KNOWN_VENDORS) {
  const words = v.split(/\s+/);
  if (words.length > 1) {
    const prefix = words[0].toUpperCase();
    if (!VENDOR_PREFIXES[prefix]) VENDOR_PREFIXES[prefix] = [];
    VENDOR_PREFIXES[prefix].push(v);
  }
}

// Known material classes
const KNOWN_CLASSES = new Set(['DGS', 'IMPORT']);

// ─── Header patterns to skip ────────────────────────────────────────────────
const HEADER_PATTERNS = [
  /^Spreadsheet\s*Report/i,
  /^T\d{4}Rem/i,
  /^Takeoff$/i,
  /^Quantity$/i,
  /^Fixt\.?$/i,
  /^Book$/i,
  /^Deliv$/i,
  /^Date$/i,
  /^Material\s+Class\s*Item/i,
  /^Material$/i,
  /^Class$/i,
  /^Page\s+\d+/i,
];

// Quantity at end of line: captures "34.00E" or "34.00 E" or "1,000.00E"
const QTY_AT_END_RE = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*E?\s*$/;

// Fixture book: short code like G1, P85, F22, K13, L21, T41, A3.8, C81, B47.1
const FIXTURE_BOOK_RE = /^[A-Z]\d{1,3}(?:\.\d{1,2})?$/;

// Combo fixture book + delivery date on one line: "A3.8031626" or "C81 - 030926"
const BOOK_DATE_COMBO_RE = /^([A-Z]\d{1,3}(?:\.\d{1,2})?)\s*-?\s*(\d{6})$/;

// Delivery date: exactly 6 digits (MMDDYY)
const DEL_DATE_RE = /^\d{6}$/;

// Item number: 3-6 char code, starts with letter, rest letters+digits
const ITEM_CODE_RE = /^[A-Z][A-Z0-9]{2,5}$/;

/**
 * Check if a line is a page header to skip
 */
function isHeaderLine(line) {
  return HEADER_PATTERNS.some(re => re.test(line));
}

/**
 * Check if a line matches a known vendor (exact or starts with)
 * Returns the matched vendor string or null
 */
function matchVendorExact(line) {
  const upper = line.toUpperCase().trim();
  for (const v of KNOWN_VENDORS) {
    if (upper === v.toUpperCase()) return v;
    // Handle "AGILITY RETAIL DGS" — vendor + class on one line
    if (upper.startsWith(v.toUpperCase() + ' ')) return v;
  }
  return null;
}

/**
 * Check if a line is a vendor+class combo like "AGILITY RETAIL DGS" or "AGILITY RETAIL"
 * Returns { vendor, materialClass } or null
 */
function parseVendorLine(line) {
  const vendor = matchVendorExact(line);
  if (!vendor) return null;
  const rest = line.slice(vendor.length).trim().toUpperCase();
  if (rest && KNOWN_CLASSES.has(rest)) {
    return { vendor, materialClass: rest };
  }
  return { vendor, materialClass: '' };
}

/**
 * Parse MMDDYY delivery date to ISO YYYY-MM-DD
 */
function parseDelivDate(raw) {
  if (!raw || raw.length !== 6) return '';
  const mm = raw.slice(0, 2), dd = raw.slice(2, 4), yy = raw.slice(4, 6);
  const mmNum = parseInt(mm), ddNum = parseInt(dd);
  if (mmNum < 1 || mmNum > 12 || ddNum < 1 || ddNum > 31) return '';
  return `20${yy}-${mm}-${dd}`;
}

/**
 * Parse PDF text from pdf-parse output.
 *
 * In pdf-parse output, each item follows this multi-line pattern:
 *   VENDOR_NAME                    (line 1 — sometimes with class appended)
 *   MATERIAL_CLASS                 (line 2 — or could be item code if no class)
 *   ITEM_CODE                      (line 3 — 3-6 char all-caps code)
 *   DESCRIPTION TEXT + QTY.00E     (line 4+ — description ending with quantity)
 *   A                              (standalone line — skip)
 *   FIXTURE_BOOK                   (optional — short code like G1, P85)
 *   DELIVERY_DATE                  (optional — 6 digits MMDDYY)
 *
 * Section headers start with "- " and may span multiple lines.
 */
export function parsePdfText(text) {
  const rawLines = text.split(/\r?\n/);
  const items = [];
  const sections = [];
  const skipped = [];

  let currentSection = '';
  let sectionAccumulating = false;
  let sectionBuffer = '';

  // State machine for item parsing
  let state = 'IDLE'; // IDLE | HAVE_VENDOR | HAVE_CLASS | HAVE_ITEM | COLLECTING_DESC
  let cur = { vendor: '', materialClass: '', itemNumber: '', descParts: [], qtyOrdered: '', fixtureBook: '', delDate: '' };

  /**
   * Try to match a partial vendor prefix on the current line + next line.
   * Returns { vendor, materialClass, consumeToIdx } or null.
   */
  function tryPartialVendorMatch(lineIdx) {
    const ln = rawLines[lineIdx].trim().toUpperCase();
    if (!VENDOR_PREFIXES[ln]) return null;
    let nextIdx = lineIdx + 1;
    while (nextIdx < rawLines.length && !rawLines[nextIdx].trim()) nextIdx++;
    if (nextIdx >= rawLines.length) return null;
    const nextLine = rawLines[nextIdx].trim();
    const candidateFull = ln + ' ' + nextLine.toUpperCase().trim();
    const match = VENDOR_PREFIXES[ln].find(v => {
      const vUp = v.toUpperCase();
      return candidateFull === vUp || candidateFull.startsWith(vUp + ' ');
    });
    if (!match) return null;
    const afterVendor = candidateFull.slice(match.length).trim();
    return {
      vendor: match,
      materialClass: KNOWN_CLASSES.has(afterVendor) ? afterVendor : '',
      consumeToIdx: nextIdx
    };
  }

  function resetCur() {
    cur = { vendor: '', materialClass: '', itemNumber: '', descParts: [], qtyOrdered: '', fixtureBook: '', delDate: '' };
    state = 'IDLE';
  }

  function finalizeItem() {
    if (cur.itemNumber && cur.qtyOrdered) {
      // Clean up description
      let desc = cur.descParts.join(' ').trim();
      // Remove trailing E or A that snuck in
      desc = desc.replace(/\s+[EA]$/, '').trim();

      items.push({
        vendor: cur.vendor,
        materialClass: cur.materialClass,
        itemNumber: cur.itemNumber,
        description: desc,
        qtyOrdered: cur.qtyOrdered.replace(/,/g, '').replace(/\.00$/, ''),
        fixtureBook: cur.fixtureBook,
        delDate: parseDelivDate(cur.delDate),
        section: currentSection,
      });
    }
    resetCur();
  }

  function finalizeSection() {
    if (sectionBuffer.trim()) {
      currentSection = sectionBuffer.trim();
      if (!sections.includes(currentSection)) {
        sections.push(currentSection);
      }
    }
    sectionAccumulating = false;
    sectionBuffer = '';
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // Skip page headers
    if (isHeaderLine(line)) {
      // If we were in a section header, the page break interrupted it — keep accumulating
      continue;
    }

    // Skip standalone single-letter codes (E, A, P, S, T, etc. that wrap from columns)
    if (/^[A-Z]$/.test(line)) continue;

    // Skip "Item Description" type column header fragments
    if (/^Item$|^Description$|^ClassItem/i.test(line)) continue;

    // ─── Section header detection ─────────────────────────────
    if (line.startsWith('- ') || line.startsWith('-') && line.length > 1 && line[1] !== '-') {
      // Finalize any in-progress item
      if (state !== 'IDLE') finalizeItem();

      const headerText = line.replace(/^-\s*/, '').trim();
      sectionBuffer = headerText;
      sectionAccumulating = true;
      continue;
    }

    // If accumulating a section header, check if this line continues it
    if (sectionAccumulating) {
      // A vendor line, partial vendor prefix, or data line ends the section accumulation
      const vendorCheck = parseVendorLine(line);
      const partialVendorInSection = !vendorCheck ? tryPartialVendorMatch(i) : null;
      if (vendorCheck || partialVendorInSection) {
        finalizeSection();
        // Fall through to process as vendor (or partial vendor)
      } else if (QTY_AT_END_RE.test(line)) {
        // Data line (has qty) — shouldn't happen directly after section header, but handle it
        finalizeSection();
        // Fall through
      } else {
        // Continuation of section header
        sectionBuffer += ' ' + line;
        continue;
      }
    }

    // ─── State machine for item parsing ───────────────────────

    // Check if this line is a vendor line
    const vendorInfo = parseVendorLine(line);

    if (state === 'IDLE') {
      if (vendorInfo) {
        // Start a new item
        if (cur.itemNumber) finalizeItem(); // shouldn't happen, but safety
        resetCur();
        cur.vendor = vendorInfo.vendor;
        cur.materialClass = vendorInfo.materialClass;
        state = vendorInfo.materialClass ? 'HAVE_CLASS' : 'HAVE_VENDOR';
        continue;
      }

      // Check for partial vendor prefix (e.g., "CAROLINA" alone on a line,
      // which is the first word of "CAROLINA INNOVATIONS")
      const upperLine = line.toUpperCase().trim();
      const partialMatch = tryPartialVendorMatch(i);
      if (partialMatch) {
        i = partialMatch.consumeToIdx;
        resetCur();
        cur.vendor = partialMatch.vendor;
        cur.materialClass = partialMatch.materialClass;
        state = partialMatch.materialClass ? 'HAVE_CLASS' : 'HAVE_VENDOR';
        continue;
      }

      // Standalone section header without dash (e.g., "TJ Jewelry Open Sell")
      // These don't start with a vendor and don't have quantities
      // Must NOT match a vendor prefix or item code pattern
      if (!QTY_AT_END_RE.test(line) && !ITEM_CODE_RE.test(line) && !FIXTURE_BOOK_RE.test(line) && !DEL_DATE_RE.test(line) && !VENDOR_PREFIXES[upperLine]) {
        // Could be a standalone section header — must contain lowercase or be a phrase
        if (/[a-z]/.test(line) || (line.length > 10 && line.length < 60 && line.includes(' '))) {
          sectionBuffer = line;
          sectionAccumulating = true;
          continue;
        }
      }

      // Check for fixture book or delivery date from a previous item
      // (These come AFTER the A line, while we're back in IDLE)
      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        const bookDateCombo = line.match(BOOK_DATE_COMBO_RE);
        if (bookDateCombo) {
          if (!lastItem.fixtureBook) lastItem.fixtureBook = bookDateCombo[1];
          if (!lastItem.delDate) lastItem.delDate = parseDelivDate(bookDateCombo[2]);
          continue;
        }
        if (FIXTURE_BOOK_RE.test(line) && !lastItem.fixtureBook) {
          lastItem.fixtureBook = line;
          continue;
        }
        if (DEL_DATE_RE.test(line) && !lastItem.delDate) {
          lastItem.delDate = parseDelivDate(line);
          continue;
        }
      }

      // Unrecognized line in IDLE — skip it
      if (line.length > 2) skipped.push(line);
      continue;
    }

    if (state === 'HAVE_VENDOR') {
      // Expecting: material class OR item code
      const lineUpper = line.toUpperCase().trim();

      // If it's a known class, save it
      if (KNOWN_CLASSES.has(lineUpper)) {
        cur.materialClass = lineUpper;
        state = 'HAVE_CLASS';
        continue;
      }

      // Check if this line is a vendor continuation (second word of multi-word vendor)
      // e.g., cur.vendor = "CAROLINA" (partial), this line = "INNOVATIONS"
      const candidateVendor = cur.vendor + ' ' + line.trim();
      const fullVendorMatch = matchVendorExact(candidateVendor);
      if (fullVendorMatch && fullVendorMatch.length > cur.vendor.length) {
        cur.vendor = fullVendorMatch;
        // Still HAVE_VENDOR, need class or item next
        continue;
      }

      // Otherwise, treat as item code (no material class for this vendor)
      if (ITEM_CODE_RE.test(line)) {
        cur.itemNumber = line;
        state = 'HAVE_ITEM';
        continue;
      }

      // Check if the line is a short all-caps word that could be a class we don't know about
      // followed by an item code on the NEXT line
      if (/^[A-Z]{1,10}$/.test(line) && line.length <= 10) {
        // Peek ahead — if next line is an item code, treat this as material class
        let nextIdx = i + 1;
        while (nextIdx < rawLines.length && !rawLines[nextIdx].trim()) nextIdx++;
        if (nextIdx < rawLines.length && ITEM_CODE_RE.test(rawLines[nextIdx].trim())) {
          cur.materialClass = lineUpper;
          state = 'HAVE_CLASS';
          continue;
        }
      }

      // Maybe this vendor line was a false positive — reset
      skipped.push(`[vendor: ${cur.vendor}] ${line}`);
      resetCur();
      continue;
    }

    if (state === 'HAVE_CLASS') {
      // Expecting: item code
      if (ITEM_CODE_RE.test(line)) {
        cur.itemNumber = line;
        state = 'HAVE_ITEM';
        continue;
      }
      // Not an item code — maybe we misidentified the class
      skipped.push(`[vendor: ${cur.vendor}, class: ${cur.materialClass}] ${line}`);
      resetCur();
      continue;
    }

    if (state === 'HAVE_ITEM') {
      // Expecting: description line(s), eventually ending with QTY
      // Check if this line has a qty at the end
      const qtyMatch = line.match(QTY_AT_END_RE);
      if (qtyMatch) {
        const descPart = line.slice(0, line.lastIndexOf(qtyMatch[1])).trim();
        if (descPart) cur.descParts.push(descPart);
        cur.qtyOrdered = qtyMatch[1];
        state = 'COLLECTING_DESC'; // Wait for A line, then fixture book/date
        continue;
      }
      // No qty — this is a description line (or first part of multi-line desc)
      // But check if a new vendor is starting (previous item had no qty — malformed)
      if (vendorInfo) {
        skipped.push(`[incomplete: ${cur.vendor} ${cur.itemNumber}]`);
        resetCur();
        cur.vendor = vendorInfo.vendor;
        cur.materialClass = vendorInfo.materialClass;
        state = vendorInfo.materialClass ? 'HAVE_CLASS' : 'HAVE_VENDOR';
        continue;
      }
      // Check for partial vendor prefix (split-line vendor starting a new item)
      const partialInItem = tryPartialVendorMatch(i);
      if (partialInItem) {
        skipped.push(`[incomplete: ${cur.vendor} ${cur.itemNumber}]`);
        i = partialInItem.consumeToIdx;
        resetCur();
        cur.vendor = partialInItem.vendor;
        cur.materialClass = partialInItem.materialClass;
        state = partialInItem.materialClass ? 'HAVE_CLASS' : 'HAVE_VENDOR';
        continue;
      }
      // Regular description line
      cur.descParts.push(line);
      continue;
    }

    if (state === 'COLLECTING_DESC') {
      // We have the qty. Now looking for trailing E, A, fixture book, delivery date
      // then finalize the item.

      // If it's a new vendor, finalize current and start new
      if (vendorInfo) {
        finalizeItem();
        cur.vendor = vendorInfo.vendor;
        cur.materialClass = vendorInfo.materialClass;
        state = vendorInfo.materialClass ? 'HAVE_CLASS' : 'HAVE_VENDOR';
        continue;
      }

      // Check for partial vendor prefix (split-line vendor starting a new item)
      const partialInCollect = tryPartialVendorMatch(i);
      if (partialInCollect) {
        finalizeItem();
        i = partialInCollect.consumeToIdx;
        cur.vendor = partialInCollect.vendor;
        cur.materialClass = partialInCollect.materialClass;
        state = partialInCollect.materialClass ? 'HAVE_CLASS' : 'HAVE_VENDOR';
        continue;
      }

      // Section header
      if (line.startsWith('- ')) {
        finalizeItem();
        sectionBuffer = line.replace(/^-\s*/, '').trim();
        sectionAccumulating = true;
        continue;
      }

      // Fixture book + date combo (e.g., "A3.8031626" or "C81 - 030926")
      const bookDateCombo = line.match(BOOK_DATE_COMBO_RE);
      if (bookDateCombo) {
        cur.fixtureBook = bookDateCombo[1];
        cur.delDate = bookDateCombo[2];
        finalizeItem();
        continue;
      }

      // Pure fixture book
      if (FIXTURE_BOOK_RE.test(line)) {
        cur.fixtureBook = line;
        // Don't finalize yet — delivery date might follow
        continue;
      }

      // Pure delivery date
      if (DEL_DATE_RE.test(line)) {
        cur.delDate = line;
        finalizeItem();
        continue;
      }

      // Another qty line? Could be description continuation with qty
      const qtyMatch = line.match(QTY_AT_END_RE);
      if (qtyMatch) {
        // This is unusual — maybe the first qty was wrong, or this is a new item
        // Finalize current and see
        finalizeItem();
        // Don't try to parse this as a standalone line — it'll get picked up
        skipped.push(line);
        continue;
      }

      // Something else — might be extra description or noise. Finalize.
      // But first check if it's a standalone short code (2 chars like "PK", "PR", etc.)
      if (line.length <= 3) {
        // Skip short codes (stray column fragments)
        finalizeItem();
        continue;
      }

      // Might be additional description that came after qty (rare)
      // Just finalize
      finalizeItem();
      // And this line might be something else — try to handle it
      if (line.length > 3) skipped.push(line);
      continue;
    }
  }

  // Finalize any remaining item
  if (state !== 'IDLE') finalizeItem();
  if (sectionAccumulating) finalizeSection();

  return { items, sections, skipped };
}

/**
 * Parse CSV/TSV text into items
 */
export function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const items = [];
  const sections = [];
  const skipped = [];

  if (lines.length === 0) return { items, sections, skipped };

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const firstFields = firstLine.split(delimiter).map(f => f.trim().toLowerCase());
  const headerKeywords = ['vendor', 'description', 'item', 'qty', 'quantity', 'section', 'fixture', 'book'];
  const isHeader = headerKeywords.some(kw => firstFields.some(f => f.includes(kw)));
  const startIndex = isHeader ? 1 : 0;

  let colMap = { vendor: 0, description: 1, itemNumber: 2, fixtureBook: 3, qty: 4, delDate: 5, section: 6 };

  if (isHeader) {
    for (let j = 0; j < firstFields.length; j++) {
      const f = firstFields[j];
      if (f.includes('vendor')) colMap.vendor = j;
      else if (f.includes('desc')) colMap.description = j;
      else if (f.includes('item') && !f.includes('class')) colMap.itemNumber = j;
      else if (f.includes('fixture') || f.includes('book') || f.includes('fixt')) colMap.fixtureBook = j;
      else if (f.includes('qty') || f.includes('quantity') || f.includes('ordered')) colMap.qty = j;
      else if (f.includes('date') || f.includes('deliv')) colMap.delDate = j;
      else if (f.includes('section') || f.includes('dept')) colMap.section = j;
      else if (f.includes('class') || f.includes('material')) colMap.materialClass = j;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = line.split(delimiter).map(f => f.trim());
    if (fields.length < 2) { skipped.push(line); continue; }

    const item = {
      vendor: fields[colMap.vendor] || '',
      materialClass: colMap.materialClass !== undefined ? (fields[colMap.materialClass] || '') : '',
      itemNumber: fields[colMap.itemNumber] || '',
      description: fields[colMap.description] || '',
      fixtureBook: fields[colMap.fixtureBook] || '',
      qtyOrdered: (fields[colMap.qty] || '').replace(/\.00$/, '').replace(/,/g, ''),
      delDate: fields[colMap.delDate] || '',
      section: fields[colMap.section] || '',
    };

    if (item.section && !sections.includes(item.section)) sections.push(item.section);
    items.push(item);
  }

  return { items, sections, skipped };
}
