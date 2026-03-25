import React, { useState, useEffect, useRef } from 'react';
import { C, MF } from '../tokens';
import { Btn, Inp, Modal, Toggle } from './ui';
import { api } from '../api';
import { CATEGORIES } from './ReceiptsTab';

const CATEGORY_LIST = ['Materials', 'Tools', 'Gas', 'Permits', 'Meals', 'Rental', 'Other'];

export default function ReceiptModal({ receipt, jobId, onSave, onClose, onDelete }) {
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
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!f.amount || parseFloat(f.amount) <= 0) {
      alert('Amount is required');
      return;
    }
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
      alert('Save failed: ' + err.message);
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
            Store
          </label>
          <input
            type="text"
            list="store-names"
            value={f.store}
            onChange={e => set('store')(e.target.value)}
            placeholder="Home Depot, Lowe's..."
            style={{
              width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.text, padding: '8px 12px', fontSize: 13, outline: 'none', minHeight: 44,
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = C.accent; }}
            onBlur={e => { e.target.style.borderColor = C.border; }}
          />
          <datalist id="store-names">
            {storeNames.map(name => <option key={name} value={name} />)}
          </datalist>
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
                onChange={e => set('amount')(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                  color: C.text, padding: '8px 12px 8px 28px', fontSize: 18, fontWeight: 700,
                  outline: 'none', minHeight: 44, boxSizing: 'border-box',
                  ...MF,
                }}
                onFocus={e => { e.target.style.borderColor = C.accent; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
                autoFocus
              />
            </div>
          </div>
          <Inp label="Date" type="date" value={f.date} onChange={set('date')} />
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
          <Btn variant="ghost" size="sm" icon="📷" onClick={() => fileRef.current?.click()}>
            {photoPreview ? 'Replace Photo' : 'Capture Photo'}
          </Btn>
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
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : (isEditing ? 'Save' : 'Add Receipt')}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
