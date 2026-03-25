import React, { useState, useEffect, useRef } from 'react';
import { C, MF } from '../tokens';
import { Btn, Inp, Modal, Toggle } from './ui';
import { api } from '../api';
import { CATEGORIES } from './ReceiptsTab';
import { useToast } from './Toast';

const CATEGORY_LIST = ['Materials', 'Tools', 'Gas', 'Permits', 'Meals', 'Rental', 'Other'];

function validateReceipt(f) {
  const errors = {};
  if (!f.store.trim()) errors.store = "Store is required";
  if (!f.amount || f.amount.trim() === '') errors.amount = "Amount is required";
  else if (isNaN(parseFloat(f.amount))) errors.amount = "Amount must be a valid number";
  else if (parseFloat(f.amount) <= 0) errors.amount = "Amount must be greater than zero";
  if (!f.date) errors.date = "Date is required";
  else if (isNaN(Date.parse(f.date))) errors.date = "Please enter a valid date";
  return errors;
}

export default function ReceiptModal({ receipt, jobId, onSave, onClose, onDelete }) {
  const { toast } = useToast();
  const isEditing = !!receipt;
  const fileRef = useRef(null);

  const [f, setF] = useState({
    store: receipt?.store || '',
    amount: receipt?.amount != null ? String(receipt.amount) : '',
    date: receipt?.date || new Date().toISOString().slice(0, 10),
    category: receipt?.category || 'Materials',
    isGas: receipt?.category === 'Gas',
    notes: receipt?.notes || '',
    submitted: receipt?.submitted || false,
  });
  const [storeNames, setStoreNames] = useState([]);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null); // null | { store, amount, date, filled: [] }

  // Load store names for autocomplete
  useEffect(() => {
    api.getStoreNames().then(setStoreNames).catch(() => {});
  }, []);

  // If editing receipt with photo, show existing photo
  useEffect(() => {
    if (receipt?.hasPhoto) {
      setPhotoPreview(api.getReceiptPhotoUrl(receipt.id));
    }
  }, [receipt]);

  const set = (key) => (value) => {
    setF(prev => {
      const next = { ...prev, [key]: value };
      // Bidirectional sync: gas toggle <-> category
      if (key === 'isGas') {
        if (value) next.category = 'Gas';
        else if (prev.category === 'Gas') next.category = 'Materials';
      }
      if (key === 'category') {
        next.isGas = value === 'Gas';
      }
      return next;
    });
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setOcrResult(null);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const runOCR = async (imageDataUrl) => {
    // Dynamically load Tesseract.js from CDN
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
    const result = await worker.recognize(imageDataUrl);
    await worker.terminate();
    return result.data.text;
  };

  const parseReceiptText = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract amount: look for TOTAL, AMOUNT DUE, etc. followed by dollar amount
    let amount = '';
    const totalRe = /(?:total|amount\s*due|balance|grand\s*total)[:\s]*\$?([\d,]+\.\d{2})/i;
    const reversed = [...lines].reverse();
    for (const line of reversed) {
      const m = line.match(totalRe);
      if (m) { amount = m[1].replace(/,/g, ''); break; }
    }
    // Fallback: largest dollar amount
    if (!amount) {
      const amounts = text.match(/\$?([\d,]+\.\d{2})/g) || [];
      const parsed = amounts.map(a => parseFloat(a.replace(/[$,]/g, ''))).filter(n => n > 0 && n < 10000);
      if (parsed.length) amount = Math.max(...parsed).toFixed(2);
    }

    // Extract date: MM/DD/YYYY or MM-DD-YYYY
    let date = '';
    const dateRe = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/;
    const dateMatch = text.match(dateRe);
    if (dateMatch) {
      const [, mm, dd, yy] = dateMatch;
      const year = yy.length === 2 ? '20' + yy : yy;
      date = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    // Extract store: first substantial line
    let store = '';
    for (const line of lines) {
      if (line.length > 3 && line.length < 40 && /[a-zA-Z]{2,}/.test(line) && !/^\d+$/.test(line) && !/phone|tel|fax|www|http/i.test(line)) {
        store = line;
        break;
      }
    }

    return { store, amount, date };
  };

  const handleOCR = async () => {
    if (!photoPreview) return;
    setOcrLoading(true);
    setOcrResult(null);
    try {
      const ocrText = await runOCR(photoPreview);
      const parsed = parseReceiptText(ocrText);
      const filled = [];

      // Auto-fill only empty fields
      if (parsed.store && !f.store.trim()) {
        set('store')(parsed.store);
        filled.push('store');
      }
      if (parsed.amount && !f.amount.trim()) {
        set('amount')(parsed.amount);
        filled.push('amount');
      }
      if (parsed.date && f.date === new Date().toISOString().slice(0, 10)) {
        set('date')(parsed.date);
        filled.push('date');
      }

      setOcrResult({ ...parsed, filled });
    } catch (err) {
      setOcrResult({ error: err.message, filled: [] });
    } finally {
      setOcrLoading(false);
    }
  };

  const receiptErrors = validateReceipt(f);
  const hasReceiptErrors = Object.keys(receiptErrors).length > 0;
  const receiptErrBorder = (field) => touched[field] && receiptErrors[field] ? `1px solid ${C.red}` : `1px solid ${C.border}`;
  const receiptFieldError = (field) => touched[field] && receiptErrors[field] ? (
    <div style={{ color: C.red, fontSize: 11, marginTop: 3 }}>{receiptErrors[field]}</div>
  ) : null;

  const handleSave = async () => {
    setTouched({ store: true, amount: true, date: true });
    if (hasReceiptErrors) return;
    setSaving(true);
    try {
      const payload = {
        store: f.store.trim(),
        amount: parseFloat(f.amount),
        date: f.date,
        category: f.category,
        notes: f.notes.trim(),
        submitted: f.submitted,
      };

      let savedReceipt;
      if (isEditing) {
        savedReceipt = await api.updateReceipt(receipt.id, payload);
      } else {
        savedReceipt = await api.createReceipt(jobId, payload);
      }

      // Upload photo if new file was selected
      if (photoFile && savedReceipt?.id) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        await api.uploadReceiptPhoto(savedReceipt.id, formData);
      }

      await onSave();
      onClose();
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const items = receipt?.items || [];

  return (
    <Modal title={isEditing ? 'Edit Receipt' : 'New Receipt'} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Store with autocomplete */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Store *
          </label>
          <input
            type="text"
            list="store-names"
            value={f.store}
            onChange={e => { set('store')(e.target.value); setTouched(p => ({ ...p, store: true })); }}
            placeholder="Home Depot, Lowe's..."
            style={{
              width: '100%', background: C.bg, border: receiptErrBorder('store'), borderRadius: 6,
              color: C.text, padding: '8px 12px', fontSize: 13, outline: 'none', minHeight: 44,
              boxSizing: 'border-box',
            }}
            onFocus={e => { if (!receiptErrors.store) e.target.style.borderColor = C.accent; }}
            onBlur={e => { setTouched(p => ({ ...p, store: true })); if (!receiptErrors.store) e.target.style.borderColor = C.border; }}
          />
          <datalist id="store-names">
            {storeNames.map(name => <option key={name} value={name} />)}
          </datalist>
          {receiptFieldError('store')}
        </div>

        {/* Amount + Date row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
              Amount *
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                ...MF, fontSize: 18, fontWeight: 700, color: C.muted, pointerEvents: 'none',
              }}>$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={f.amount}
                onChange={e => { set('amount')(e.target.value); setTouched(p => ({ ...p, amount: true })); }}
                placeholder="0.00"
                style={{
                  width: '100%', background: C.bg, border: receiptErrBorder('amount'), borderRadius: 6,
                  color: C.text, padding: '8px 12px 8px 28px', fontSize: 18, fontWeight: 700,
                  outline: 'none', minHeight: 44, boxSizing: 'border-box',
                  ...MF,
                }}
                onFocus={e => { if (!receiptErrors.amount) e.target.style.borderColor = C.accent; }}
                onBlur={e => { setTouched(p => ({ ...p, amount: true })); if (!receiptErrors.amount) e.target.style.borderColor = C.border; }}
                autoFocus
              />
            </div>
            {receiptFieldError('amount')}
          </div>
          <div>
            <Inp label="Date *" type="date" value={f.date} onChange={v => { set('date')(v); setTouched(p => ({ ...p, date: true })); }} />
            {receiptFieldError('date')}
          </div>
        </div>

        {/* Category buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Category
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORY_LIST.map(cat => {
              const isActive = f.category === cat;
              const catStyle = CATEGORIES[cat];
              return (
                <button
                  key={cat}
                  onClick={() => set('category')(cat)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
                    background: isActive ? catStyle.bg : 'transparent',
                    color: isActive ? catStyle.color : C.muted,
                    border: `1px solid ${isActive ? catStyle.border : C.border}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Gas toggle */}
        <Toggle checked={f.isGas} onChange={set('isGas')} label="Gas purchase" right />

        {/* Notes */}
        <Inp label="Notes" value={f.notes} onChange={set('notes')} multiline rows={2} placeholder="Optional notes..." />

        {/* Photo section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Photo
          </label>
          {photoPreview && (
            <div style={{
              width: '100%', maxHeight: 200, borderRadius: 8, overflow: 'hidden',
              border: `1px solid ${C.borderLight}`, background: C.bg,
            }}>
              <img src={photoPreview} alt="Receipt" style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoCapture}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" icon="📷" onClick={() => fileRef.current?.click()}>
              {photoPreview ? 'Replace Photo' : 'Capture Photo'}
            </Btn>
            {photoPreview && !ocrLoading && (
              <Btn variant="teal" size="sm" icon="🔍" onClick={handleOCR}>
                Scan Receipt
              </Btn>
            )}
            {ocrLoading && (
              <span style={{ fontSize: 12, color: C.teal, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block', width: 14, height: 14, border: `2px solid ${C.tealBorder}`,
                  borderTopColor: C.teal, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Scanning...
              </span>
            )}
          </div>
          {/* OCR result feedback */}
          {ocrResult && !ocrResult.error && ocrResult.filled.length > 0 && (
            <div style={{
              padding: '6px 12px', background: C.tealDim, border: `1px solid ${C.tealBorder}`,
              borderRadius: 6, fontSize: 11, color: C.teal, fontWeight: 600,
            }}>
              OCR filled: {ocrResult.filled.join(', ')}
            </div>
          )}
          {ocrResult && !ocrResult.error && ocrResult.filled.length === 0 && (
            <div style={{
              padding: '6px 12px', background: C.yellowDim, border: `1px solid ${C.yellowBorder}`,
              borderRadius: 6, fontSize: 11, color: C.yellow,
            }}>
              OCR complete — no new fields to fill (all fields already have values)
            </div>
          )}
          {ocrResult && ocrResult.error && (
            <div style={{
              padding: '6px 12px', background: C.redDim, border: `1px solid ${C.redBorder}`,
              borderRadius: 6, fontSize: 11, color: C.red,
            }}>
              OCR failed: {ocrResult.error}
            </div>
          )}
        </div>

        {/* Items section (OCR parsed, read-only) */}
        {items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
              Parsed Items
            </label>
            <div style={{
              background: C.bg, borderRadius: 8, border: `1px solid ${C.borderLight}`,
              overflow: 'hidden',
            }}>
              {items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', fontSize: 12,
                  borderBottom: i < items.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                }}>
                  <span style={{ flex: 1, color: C.text }}>{item.name}</span>
                  {item.qty && <span style={{ ...MF, color: C.muted, fontSize: 11 }}>x{item.qty}</span>}
                  <span style={{ ...MF, color: C.text, fontWeight: 600, fontSize: 12 }}>
                    ${(parseFloat(item.price) || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
          borderTop: `1px solid ${C.borderLight}`,
        }}>
          <Toggle checked={f.submitted} onChange={set('submitted')} />
          <span style={{ fontSize: 12, fontWeight: 600, color: f.submitted ? '#3fb950' : '#f97316' }}>
            {f.submitted ? 'Submitted' : 'Pending'}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          {onDelete && (
            <Btn variant="danger" size="sm" onClick={onDelete} style={{ marginRight: 'auto' }}>
              Delete
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving || hasReceiptErrors}>
            {saving ? 'Saving...' : (isEditing ? 'Save' : 'Add Receipt')}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
