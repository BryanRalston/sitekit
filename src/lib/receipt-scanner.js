/**
 * Receipt Scanner — image enhancement and OCR parsing pipeline.
 * Ported from ReceiptLog's DocumentScanner (Canvas-based, no external deps).
 *
 * Pipeline: enhanceImage (lighting normalization + contrast + sharpen)
 *         -> trimToContent (remove uniform borders)
 *         -> Tesseract OCR
 *         -> parseReceipt (structured extraction)
 *         -> confidence scoring
 */

// ─── Image Enhancement ──────────────────────────────────────────────────────
// iOS Notes-style color-preserving enhancement: luminance-based lighting
// normalization, adaptive contrast stretch, paper-white push, sharpening.

export function enhanceImage(dataURL, maxWidth = 1500) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Image load failed'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { const s = maxWidth / w; w = maxWidth; h = Math.round(h * s); }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const px = imageData.data;
      const totalPx = w * h;

      // Step 1: Compute luminance (all adjustments reference this, colors stay in RGB)
      const lum = new Float32Array(totalPx);
      for (let i = 0; i < totalPx; i++) {
        lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      }

      // Step 2: Background luminance estimation via downsample -> blur -> upsample
      // Captures ambient lighting pattern (shadows, uneven exposure)
      const dsF = 16;
      const dsW = Math.max(1, Math.round(w / dsF));
      const dsH = Math.max(1, Math.round(h / dsF));
      const ds = new Float32Array(dsW * dsH);

      for (let dy = 0; dy < dsH; dy++) {
        for (let dx = 0; dx < dsW; dx++) {
          let sum = 0, count = 0;
          const sy0 = Math.round(dy * h / dsH), sy1 = Math.round((dy + 1) * h / dsH);
          const sx0 = Math.round(dx * w / dsW), sx1 = Math.round((dx + 1) * w / dsW);
          for (let sy = sy0; sy < sy1; sy++) {
            for (let sx = sx0; sx < sx1; sx++) {
              sum += lum[sy * w + sx]; count++;
            }
          }
          ds[dy * dsW + dx] = sum / (count || 1);
        }
      }

      // 3-pass box blur on downsampled (approximates Gaussian)
      boxBlur(ds, dsW, dsH, Math.max(2, Math.round(Math.min(dsW, dsH) / 4)));

      // Upsample background to full resolution (bilinear interpolation)
      const bg = new Float32Array(totalPx);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const fx = (x + 0.5) * dsW / w - 0.5;
          const fy = (y + 0.5) * dsH / h - 0.5;
          const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(dsW - 1, x0 + 1);
          const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(dsH - 1, y0 + 1);
          const bx = fx - x0, by = fy - y0;
          bg[y * w + x] =
            ds[y0 * dsW + x0] * (1 - bx) * (1 - by) +
            ds[y0 * dsW + x1] * bx * (1 - by) +
            ds[y1 * dsW + x0] * (1 - bx) * by +
            ds[y1 * dsW + x1] * bx * by;
        }
      }

      // Step 3: Color-preserving lighting normalization
      // Divide each pixel's RGB by local background luminance, scale to target white
      const targetL = 235;
      for (let i = 0; i < totalPx; i++) {
        const bgVal = Math.max(bg[i], 1);
        const ratio = Math.min(targetL / bgVal, 3.5); // cap to prevent noise amplification
        px[i * 4]     = Math.min(255, Math.round(px[i * 4] * ratio));
        px[i * 4 + 1] = Math.min(255, Math.round(px[i * 4 + 1] * ratio));
        px[i * 4 + 2] = Math.min(255, Math.round(px[i * 4 + 2] * ratio));
      }

      // Step 4: Adaptive contrast stretch (luminance-based, applied proportionally to RGB)
      const lumN = new Float32Array(totalPx);
      for (let i = 0; i < totalPx; i++) {
        lumN[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      }

      const hist = new Uint32Array(256);
      for (let i = 0; i < totalPx; i++) hist[Math.min(255, Math.round(lumN[i]))]++;
      let lo = 0, hi = 255, cum = 0;
      for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum >= totalPx * 0.005) { lo = v; break; } }
      cum = 0;
      for (let v = 255; v >= 0; v--) { cum += hist[v]; if (cum >= totalPx * 0.005) { hi = v; break; } }
      if (hi <= lo) hi = lo + 1;
      const rng = hi - lo;

      for (let i = 0; i < totalPx; i++) {
        const oldL = lumN[i];
        if (oldL < 1) continue;
        const newL = Math.max(0, Math.min(255, (oldL - lo) / rng * 255));
        const scale = newL / oldL;
        px[i * 4]     = Math.min(255, Math.round(px[i * 4] * scale));
        px[i * 4 + 1] = Math.min(255, Math.round(px[i * 4 + 1] * scale));
        px[i * 4 + 2] = Math.min(255, Math.round(px[i * 4 + 2] * scale));
      }

      // Step 5: Paper white push — near-white pixels blend toward pure white
      for (let i = 0; i < totalPx; i++) {
        const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        if (l > 215) {
          const t = Math.min(1, (l - 215) / 40);
          const blend = t * 0.6;
          px[i * 4]     = Math.round(px[i * 4] + (255 - px[i * 4]) * blend);
          px[i * 4 + 1] = Math.round(px[i * 4 + 1] + (255 - px[i * 4 + 1]) * blend);
          px[i * 4 + 2] = Math.round(px[i * 4 + 2] + (255 - px[i * 4 + 2]) * blend);
        }
      }

      // Step 6: Luminance-space sharpening (preserves colors, crisps text)
      const lumF = new Float32Array(totalPx);
      for (let i = 0; i < totalPx; i++) {
        lumF[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      }

      const sharp = new Float32Array(totalPx);
      const kern = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let s = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              s += lumF[(y + ky) * w + (x + kx)] * kern[(ky + 1) * 3 + (kx + 1)];
            }
          }
          sharp[y * w + x] = Math.max(0, Math.min(255, s));
        }
      }
      // Copy edges
      for (let x = 0; x < w; x++) { sharp[x] = lumF[x]; sharp[(h - 1) * w + x] = lumF[(h - 1) * w + x]; }
      for (let y = 0; y < h; y++) { sharp[y * w] = lumF[y * w]; sharp[y * w + w - 1] = lumF[y * w + w - 1]; }

      // Transfer sharpening to RGB proportionally
      for (let i = 0; i < totalPx; i++) {
        const oldL = lumF[i];
        if (oldL < 1) continue;
        const scale = sharp[i] / oldL;
        px[i * 4]     = Math.min(255, Math.max(0, Math.round(px[i * 4] * scale)));
        px[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(px[i * 4 + 1] * scale)));
        px[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(px[i * 4 + 2] * scale)));
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = dataURL;
  });
}

// ─── Box Blur Helper ─────────────────────────────────────────────────────────
function boxBlur(arr, bw, bh, radius) {
  const tmp = new Float32Array(bw * bh);
  for (let pass = 0; pass < 3; pass++) {
    // Horizontal pass
    for (let y = 0; y < bh; y++) {
      let sum = 0, count = 0;
      for (let x = 0; x < Math.min(radius + 1, bw); x++) { sum += arr[y * bw + x]; count++; }
      for (let x = 0; x < bw; x++) {
        tmp[y * bw + x] = sum / count;
        const addX = x + radius + 1, remX = x - radius;
        if (addX < bw) { sum += arr[y * bw + addX]; count++; }
        if (remX >= 0) { sum -= arr[y * bw + remX]; count--; }
      }
    }
    // Vertical pass
    for (let x = 0; x < bw; x++) {
      let sum = 0, count = 0;
      for (let y = 0; y < Math.min(radius + 1, bh); y++) { sum += tmp[y * bw + x]; count++; }
      for (let y = 0; y < bh; y++) {
        arr[y * bw + x] = sum / count;
        const addY = y + radius + 1, remY = y - radius;
        if (addY < bh) { sum += tmp[addY * bw + x]; count++; }
        if (remY >= 0) { sum -= tmp[remY * bw + x]; count--; }
      }
    }
  }
}

// ─── Content-Aware Trim ──────────────────────────────────────────────────────
// Removes uniform background rows/columns from edges of an enhanced receipt image.

export function trimToContent(dataURL, padding = 10) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      function lum(x, y) {
        const idx = (y * w + x) * 4;
        return 0.299 * px[idx] + 0.587 * px[idx + 1] + 0.114 * px[idx + 2];
      }

      function isRowUniform(y) {
        let minL = 255, maxL = 0;
        for (let x = 0; x < w; x += 4) {
          const l = lum(x, y);
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }
        return (maxL - minL) < 30;
      }

      function isColUniform(x) {
        let minL = 255, maxL = 0;
        for (let y = 0; y < h; y += 4) {
          const l = lum(x, y);
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }
        return (maxL - minL) < 30;
      }

      let top = 0;
      while (top < h && isRowUniform(top)) top++;
      let bottom = h - 1;
      while (bottom > top && isRowUniform(bottom)) bottom--;
      let left = 0;
      while (left < w && isColUniform(left)) left++;
      let right = w - 1;
      while (right > left && isColUniform(right)) right--;

      // Safety: if trim would remove >50% in either dimension, skip
      const contentW = right - left + 1;
      const contentH = bottom - top + 1;
      if (contentW < w * 0.5 || contentH < h * 0.5) {
        resolve(dataURL);
        return;
      }

      top = Math.max(0, top - padding);
      bottom = Math.min(h - 1, bottom + padding);
      left = Math.max(0, left - padding);
      right = Math.min(w - 1, right + padding);

      const trimW = right - left + 1;
      const trimH = bottom - top + 1;
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = trimW;
      trimCanvas.height = trimH;
      trimCanvas.getContext('2d').drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);
      resolve(trimCanvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}


// ─── Receipt Text Parsing ────────────────────────────────────────────────────
// Structured extraction: store, amount, date, category, line items, subtotal, tax.

const KNOWN_STORES = [
  { re: /HOME\s*DEPOT/i, name: 'Home Depot', cat: 'Materials' },
  { re: /LOWE'?S/i, name: "Lowe's", cat: 'Materials' },
  { re: /MENARD'?S/i, name: "Menard's", cat: 'Materials' },
  { re: /ACE\s*HARDWARE/i, name: 'Ace Hardware', cat: 'Materials' },
  { re: /HARBOR\s*FREIGHT/i, name: 'Harbor Freight', cat: 'Tools' },
  { re: /SHERWIN[\s-]*WILLIAMS/i, name: 'Sherwin-Williams', cat: 'Materials' },
  { re: /TRUE\s*VALUE/i, name: 'True Value', cat: 'Materials' },
  { re: /NORTHERN\s*TOOL/i, name: 'Northern Tool', cat: 'Tools' },
  { re: /FASTENAL/i, name: 'Fastenal', cat: 'Materials' },
  { re: /GRAINGER/i, name: 'Grainger', cat: 'Materials' },
  { re: /FERGUSON/i, name: 'Ferguson', cat: 'Materials' },
  { re: /TRACTOR\s*SUPPLY/i, name: 'Tractor Supply', cat: 'Materials' },
  { re: /RURAL\s*KING/i, name: 'Rural King', cat: 'Materials' },
  { re: /FLOOR\s*[&+]\s*DECOR/i, name: 'Floor & Decor', cat: 'Materials' },
  { re: /WALMART/i, name: 'Walmart', cat: 'Materials' },
  { re: /TARGET/i, name: 'Target', cat: 'Materials' },
  { re: /COSTCO/i, name: 'Costco', cat: 'Materials' },
  { re: /SAM'?S\s*CLUB/i, name: "Sam's Club", cat: 'Materials' },
  { re: /AUTOZONE|AUTO\s*ZONE/i, name: 'AutoZone', cat: 'Materials' },
  { re: /O'?\s*REILLY/i, name: "O'Reilly", cat: 'Materials' },
  { re: /ADVANCE\s*AUTO/i, name: 'Advance Auto', cat: 'Materials' },
  { re: /NAPA\b/i, name: 'NAPA', cat: 'Materials' },
  { re: /SHELL/i, name: 'Shell', cat: 'Gas' },
  { re: /EXXON/i, name: 'Exxon', cat: 'Gas' },
  { re: /CHEVRON/i, name: 'Chevron', cat: 'Gas' },
  { re: /SPEEDWAY/i, name: 'Speedway', cat: 'Gas' },
  { re: /MARATHON/i, name: 'Marathon', cat: 'Gas' },
  { re: /BP\b/i, name: 'BP', cat: 'Gas' },
  { re: /WAWA/i, name: 'Wawa', cat: 'Gas' },
  { re: /QT\b|QUIK\s*TRIP/i, name: 'QuikTrip', cat: 'Gas' },
  { re: /CASEY'?S/i, name: "Casey's", cat: 'Gas' },
  { re: /SUNOCO/i, name: 'Sunoco', cat: 'Gas' },
  { re: /VALERO/i, name: 'Valero', cat: 'Gas' },
  { re: /7[\s-]*ELEVEN|7[\s-]*11/i, name: '7-Eleven', cat: 'Gas' },
  { re: /MURPHY\s*USA/i, name: 'Murphy USA', cat: 'Gas' },
  { re: /KUM\s*[&+]\s*GO/i, name: 'Kum & Go', cat: 'Gas' },
  { re: /PILOT\b/i, name: 'Pilot', cat: 'Gas' },
  { re: /FLYING\s*J/i, name: 'Flying J', cat: 'Gas' },
  { re: /LOVE'?S/i, name: "Love's", cat: 'Gas' },
  { re: /CIRCLE\s*K/i, name: 'Circle K', cat: 'Gas' },
  { re: /SHEETZ/i, name: 'Sheetz', cat: 'Gas' },
  { re: /BUC[\s-]*EE'?S/i, name: "Buc-ee's", cat: 'Gas' },
  { re: /RACETRAC/i, name: 'RaceTrac', cat: 'Gas' },
  { re: /KWIK\s*TRIP/i, name: 'Kwik Trip', cat: 'Gas' },
];

export function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {
    store: null, amount: null, date: null, category: null,
    items: [], subtotal: null, tax: null, itemsValidated: false,
  };

  // --- Amount: look for TOTAL line, take last match ---
  const totalRe = /(?:TOTAL|GRAND\s*TOTAL|AMOUNT\s*DUE|BALANCE\s*DUE|AMT\s*DUE|SALE\s*TOTAL|ORDER\s*TOTAL|NET\s*TOTAL|PURCHASE\s*TOTAL|RECEIPT\s*TOTAL|YOUR\s*TOTAL|TRANS\s*TOTAL)\s*[:$]?\s*\$?\s*(\d+[.,]\d{2})/gi;
  let totalMatch, lastTotal = null;
  while ((totalMatch = totalRe.exec(text)) !== null) {
    lastTotal = totalMatch[1].replace(',', '.');
  }
  if (lastTotal) {
    result.amount = parseFloat(lastTotal).toFixed(2);
  } else {
    // Fallback: find largest dollar amount, skip payment/change lines
    const PAYMENT_LINE = /\b(CHANGE\s*DUE|CASH\s*BACK|CASH\s*TENDERED|TENDER\b|AMOUNT\s*TENDERED|CASH\b|CARD\b|VISA\b|MASTERCARD|MASTER\s*CARD|DEBIT\b|CREDIT\b|AMEX\b|DISCOVER\b|CHECK\b|EBT\b)/i;
    let largest = 0;
    for (const line of lines) {
      if (PAYMENT_LINE.test(line)) continue;
      const lineAmountRe = /\$?\s*(\d{1,6}\.\d{2})/g;
      let amtMatch;
      while ((amtMatch = lineAmountRe.exec(line)) !== null) {
        const v = parseFloat(amtMatch[1]);
        if (v > largest && v < 100000) largest = v;
      }
    }
    if (largest > 0) result.amount = largest.toFixed(2);
  }

  // --- Subtotal & Tax ---
  const subRe = /(?:SUB\s*TOTAL|SUBTOTAL)\s*[:$]?\s*\$?\s*(\d+[.,]\d{2})/gi;
  let subMatch;
  while ((subMatch = subRe.exec(text)) !== null) {
    result.subtotal = parseFloat(subMatch[1].replace(',', '.'));
  }
  const taxRe = /(?:SALES?\s*TAX|TAX)\s*[:$]?\s*\$?\s*(\d+[.,]\d{2})/gi;
  let txMatch;
  while ((txMatch = taxRe.exec(text)) !== null) {
    result.tax = parseFloat(txMatch[1].replace(',', '.'));
  }

  // --- Date ---
  const dateRe1 = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  const dateRe2 = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2}),?\s*(\d{4})/i;
  const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  let dm = text.match(dateRe1);
  if (dm) {
    let [, m, d, y] = dm;
    if (y.length === 2) y = '20' + y;
    m = m.padStart(2, '0');
    d = d.padStart(2, '0');
    result.date = `${y}-${m}-${d}`;
  } else {
    dm = text.match(dateRe2);
    if (dm) {
      const mo = months[dm[1].toLowerCase().slice(0, 3)];
      result.date = `${dm[3]}-${String(mo).padStart(2,'0')}-${dm[2].padStart(2,'0')}`;
    }
  }

  // --- Store name ---
  for (const s of KNOWN_STORES) {
    if (s.re.test(text)) {
      result.store = s.name;
      result.category = s.cat;
      break;
    }
  }

  if (!result.store) {
    const PHONE_RE = /(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}|\d{10}|\d{3}[\s.\-]\d{4})/;
    const ADDRESS_RE = /\b\d+\s+\w+\s+(ST|AVE|BLVD|DR|RD|SUITE|STE|HWY|LN|CT|PL|WAY|STREET|AVENUE|BOULEVARD|DRIVE|ROAD|HIGHWAY|LANE|COURT|PLACE)\b\.?\s*,?/i;
    const CITY_STATE_ZIP_RE = /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/;
    const URL_EMAIL_RE = /(www\.|\.com|\.net|\.org|@)/i;
    const DATE_TIME_RE = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{1,2}:\d{2}/;
    const TRANS_ID_RE = /^(TRANS|RECEIPT|TICKET|ORDER|REF|AUTH|SEQUENCE|TRACE|TERM|TERMINAL|REGISTER|STORE)\s*[#:]?\s*\d/i;
    const NO_REAL_LETTERS_RE = /^[^a-zA-Z]*$/;
    const ZIP_AT_END_RE = /\b\d{5}(-\d{4})?\s*$/;

    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.length < 3 || line.length > 40) continue;
      if (!/[a-zA-Z]{2,}/.test(line)) continue;
      if (PHONE_RE.test(line)) continue;
      if (ADDRESS_RE.test(line)) continue;
      if (CITY_STATE_ZIP_RE.test(line)) continue;
      if (URL_EMAIL_RE.test(line)) continue;
      if (DATE_TIME_RE.test(line)) continue;
      if (TRANS_ID_RE.test(line)) continue;
      if (NO_REAL_LETTERS_RE.test(line)) continue;
      if (ZIP_AT_END_RE.test(line)) continue;
      if (/^\d+\s+(N|S|E|W|North|South|East|West)\b/i.test(line)) continue;
      result.store = line;
      break;
    }
  }

  if (!result.category) result.category = 'Materials';

  // --- Line Item Extraction ---
  const SKIP_LINE = /\b(sub\s*total|subtotal|total|grand\s*total|amount\s*due|balance\s*due|sales?\s*tax|tax\b|visa|master\s*card|debit|credit|change\s*due|cash\s*tend|tender|approved|declined|thank\s*you|welcome|saved?\s*you|you\s*saved|store\s*#|trans\b|auth\s*#|ref\s*#|chip\s*read|return\s*by|rewards?|member|points?\s*earned|coupon|discount|promo|receipt\s*#)/i;
  const META_LINE = /^(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}$|^\d+\s+(N|S|E|W|North|South|East|West)\b|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|^\d{2}:\d{2}|^#{3,}|^-{3,}|^={3,}|^\*{3,})/i;
  const PRICE_AT_END = /^(.+?)\s+([-]?\$?\s*\d{1,6}\.\d{2})\s*[A-Z]?\s*$/;
  const QTY_PATTERN = /(\d+)\s*[@xX]\s*\$?\s*(\d+\.\d{2})/;

  for (const line of lines) {
    if (line.length < 4) continue;
    if (SKIP_LINE.test(line)) continue;
    if (META_LINE.test(line)) continue;
    if (/^\d{8,}$/.test(line.replace(/[\s-]/g, ''))) continue;
    if (!/[a-zA-Z]{2,}/.test(line)) continue;

    const priceMatch = line.match(PRICE_AT_END);
    if (!priceMatch) continue;

    let name = priceMatch[1].trim();
    const priceStr = priceMatch[2].replace(/[$\s]/g, '');
    const totalPrice = parseFloat(priceStr);

    if (isNaN(totalPrice) || totalPrice === 0 || Math.abs(totalPrice) > 50000) continue;

    let qty = 1;
    let unitPrice = totalPrice;
    const qtyMatch = name.match(QTY_PATTERN);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10);
      unitPrice = parseFloat(qtyMatch[2]);
      name = name.replace(QTY_PATTERN, '').trim();
    } else {
      const qtyPrefixMatch = name.match(/^(\d+)\s*(?:EA|PK|PC|CT)\s+(.+)/i);
      if (qtyPrefixMatch) {
        qty = parseInt(qtyPrefixMatch[1], 10);
        name = qtyPrefixMatch[2].trim();
        unitPrice = qty > 0 ? +(totalPrice / qty).toFixed(2) : totalPrice;
      }
    }

    // Clean item name
    name = name.replace(/\s{2,}/g, ' ').replace(/^[-\u2013\u2014\s]+|[-\u2013\u2014\s]+$/g, '');
    if (name.length < 2) continue;

    const isReturn = totalPrice < 0 || /\breturn\b/i.test(name);

    result.items.push({
      name,
      qty,
      unitPrice: isReturn ? -Math.abs(unitPrice) : unitPrice,
      totalPrice: isReturn ? -Math.abs(totalPrice) : totalPrice,
    });
  }

  // Validate items against subtotal/total
  if (result.items.length > 0) {
    const itemSum = result.items.reduce((s, i) => s + i.totalPrice, 0);
    const compareTarget = result.subtotal || (result.amount ? parseFloat(result.amount) - (result.tax || 0) : null);
    if (compareTarget && Math.abs(itemSum - compareTarget) > compareTarget * 0.3) {
      result.itemsValidated = false;
    } else {
      result.itemsValidated = true;
    }
  }

  return result;
}


// ─── Confidence Scoring ──────────────────────────────────────────────────────
// Tracks how many fields were successfully extracted.
// Returns: { level: 'high'|'medium'|'low', score: 0-1, fields: {...} }

export function scoreConfidence(parsed) {
  const fields = {
    store: !!parsed.store,
    amount: !!parsed.amount,
    date: !!parsed.date,
    items: parsed.items.length > 0,
    subtotal: parsed.subtotal != null,
    tax: parsed.tax != null,
  };

  // Weighted scoring: store/amount/date are critical, items/subtotal/tax are bonus
  const weights = { store: 0.25, amount: 0.30, date: 0.20, items: 0.15, subtotal: 0.05, tax: 0.05 };
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (fields[key]) score += weight;
  }

  // Bonus for validated items
  if (parsed.itemsValidated) score = Math.min(1, score + 0.05);

  const level = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

  return { level, score, fields };
}


// ─── Full Pipeline ───────────────────────────────────────────────────────────
// Runs the complete scan pipeline with stage callbacks for UI feedback.
// onStage('enhancing' | 'scanning' | 'parsing' | 'done' | 'error')

export async function scanReceipt(imageDataUrl, onStage) {
  try {
    // Stage 1: Enhance
    onStage?.('enhancing');
    const enhanced = await enhanceImage(imageDataUrl);
    const trimmed = await trimToContent(enhanced);

    // Stage 2: OCR
    onStage?.('scanning');
    if (!window.Tesseract) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      });
    }
    const worker = await window.Tesseract.createWorker('eng');
    const ocrResult = await worker.recognize(trimmed);
    await worker.terminate();
    const rawText = ocrResult.data.text;

    // Stage 3: Parse
    onStage?.('parsing');
    const parsed = parseReceipt(rawText);
    const confidence = scoreConfidence(parsed);

    onStage?.('done');
    return { parsed, confidence, rawText, enhancedImage: trimmed };
  } catch (err) {
    onStage?.('error');
    throw err;
  }
}
