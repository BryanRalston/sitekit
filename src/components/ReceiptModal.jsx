import React, { useState, useEffect, useRef } from 'react';
import { C, MF } from '../tokens';
import { Btn, Inp, Modal, Toggle } from './ui';
import { api } from '../api';
import { CATEGORIES } from './ReceiptsTab';
import { useToast } from './Toast';
import { scanReceipt } from '../lib/receipt-scanner';

const CATEGORY_LIST = ['Materials', 'Tools', 'Gas', 'Permits', 'Meals', 'Rental', 'Other'];

const STAGE_LABELS = {
  enhancing: 'Enhancing image...',
  scanning: 'Scanning text...',
  parsing: 'Parsing receipt...',
  done: 'Complete',
  error: 'Scan failed',
};

const CONFIDENCE_STYLES = {
  high:   { color: C.green, bg: C.greenDim, border: C.greenBorder, label: 'High confidence' },
  medium: { color: C.yellow, bg: C.yellowDim, border: C.yellowBorder, label: 'Medium confidence' },
  low:    { color: C.red, bg: C.redDim, border: C.redBorder, label: 'Low confidence' },
};

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
  const galleryRef = useRef(null);

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
  const [ocrStage, setOcrStage] = useState(null); // 'enhancing' | 'scanning' | 'parsing' | 'done' | 'error'
  const [ocrResult, setOcrResult] = useState(null); // { parsed, confidence, filled, error? }
  const [parsedItems, setParsedItems] = useState(receipt?.items || []);

  // Load store names for autocomplete
  useEffect(() => {
    api.getStoreNames().then(setStoreNames).catch(() => {});
  }, []);

  // If editing receipt with photo, show existing photo
  useEffect(() => {
    if (receipt?.hasPhoto) {
      api.getReceiptPhotoUrl(receipt.id).then(url => {
        if (url) setPhotoPreview(url);
      });
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
    setOcrStage(null);
    setParsedItems(receipt?.items || []);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleOCR = async () => {
    if (!photoPreview) return;
    setOcrLoading(true);
    setOcrResult(null);
    setOcrStage(null);
    try {
      const { parsed, confidence } = await scanReceipt(
        photoPreview,
        (stage) => setOcrStage(stage),
      );

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
      // Auto-fill category if detected and still default
      if (parsed.category && f.category === 'Materials' && parsed.category !== 'Materials') {
        set('category')(parsed.category);
        if (parsed.category === 'Gas') set('isGas')(true);
        filled.push('category');
      }

      // Auto-fill items from parsed line items
      if (parsed.items.length > 0) {
        setParsedItems(parsed.items.map(it => ({
          name: it.name,
          qty: it.qty,
          price: it.totalPrice,
        })));
        filled.push(`${parsed.items.length} items`);
      }

      setOcrResult({ parsed, confidence, filled });
    } catch (err) {
      console.error('Receipt scan failed:', err);
      setOcrStage('error');
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
        isGas: f.isGas,
        notes: f.notes.trim(),
        items: parsedItems,
        submitted: f.submitted,
        hasPhoto: !!(photoFile || photoPreview),
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

  // Subtotal/tax from OCR parse
  const ocrSubtotal = ocrResult?.parsed?.subtotal;
  const ocrTax = ocrResult?.parsed?.tax;

  return (
    <Modal title={isEditing ? 'Edit Receipt' : 'New Receipt'} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoCapture}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" icon="📷" onClick={() => fileRef.current?.click()}>
              {photoPreview ? 'Retake' : 'Take Photo'}
            </Btn>
            <Btn variant="ghost" size="sm" icon="🖼️" onClick={() => galleryRef.current?.click()}>
              Choose Photo
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
                {STAGE_LABELS[ocrStage] || 'Processing...'}
              </span>
            )}
          </div>

          {/* OCR result feedback with confidence */}
          {ocrResult && !ocrResult.error && ocrResult.filled.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{
                padding: '6px 12px', background: C.tealDim, border: `1px solid ${C.tealBorder}`,
                borderRadius: 6, fontSize: 11, color: C.teal, fontWeight: 600,
              }}>
                Filled: {ocrResult.filled.join(', ')}
              </div>
              {ocrResult.confidence && (
                <div style={{
                  padding: '4px 12px',
                  background: CONFIDENCE_STYLES[ocrResult.confidence.level].bg,
                  border: `1px solid ${CONFIDENCE_STYLES[ocrResult.confidence.level].border}`,
                  borderRadius: 6, fontSize: 10, fontWeight: 600,
                  color: CONFIDENCE_STYLES[ocrResult.confidence.level].color,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{CONFIDENCE_STYLES[ocrResult.confidence.level].label}</span>
                  <span style={{ opacity: 0.7 }}>
                    ({Math.round(ocrResult.confidence.score * 100)}%)
                  </span>
                </div>
              )}
            </div>
          )}
          {ocrResult && !ocrResult.error && ocrResult.filled.length === 0 && (
            <div style={{
              padding: '6px 12px', background: C.yellowDim, border: `1px solid ${C.yellowBorder}`,
              borderRadius: 6, fontSize: 11, color: C.yellow,
            }}>
              Scan complete — no new fields to fill (all fields already have values)
            </div>
          )}
          {ocrResult && ocrResult.error && (
            <div style={{
              padding: '6px 12px', background: C.redDim, border: `1px solid ${C.redBorder}`,
              borderRadius: 6, fontSize: 11, color: C.red,
            }}>
              Scan failed: {ocrResult.error}
            </div>
          )}
        </div>

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

        {/* Parsed Items section */}
        {parsedItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
              Parsed Items ({parsedItems.length})
            </label>
            <div style={{
              background: C.bg, borderRadius: 8, border: `1px solid ${C.borderLight}`,
              overflow: 'hidden', maxHeight: 200, overflowY: 'auto',
            }}>
              {parsedItems.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', fontSize: 12,
                  borderBottom: i < parsedItems.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                }}>
                  <span style={{ flex: 1, color: C.text }}>{item.name}</span>
                  {item.qty > 1 && <span style={{ ...MF, color: C.muted, fontSize: 11 }}>x{item.qty}</span>}
                  <span style={{ ...MF, color: C.text, fontWeight: 600, fontSize: 12 }}>
                    ${(parseFloat(item.price ?? item.totalPrice) || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            {/* Subtotal / Tax row if available */}
            {(ocrSubtotal != null || ocrTax != null) && (
              <div style={{
                display: 'flex', gap: 16, padding: '4px 12px', fontSize: 11, color: C.muted,
              }}>
                {ocrSubtotal != null && (
                  <span>Subtotal: <span style={{ ...MF, color: C.text, fontWeight: 600 }}>${ocrSubtotal.toFixed(2)}</span></span>
                )}
                {ocrTax != null && (
                  <span>Tax: <span style={{ ...MF, color: C.text, fontWeight: 600 }}>${ocrTax.toFixed(2)}</span></span>
                )}
              </div>
            )}
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
