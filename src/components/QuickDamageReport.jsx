import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { C, TF, MF } from '../tokens';
import { Btn } from './ui';
import { api } from '../api';
import { useToast } from './Toast';
import { haptic } from '../utils/haptic';
import { compressImage } from '../lib/image-utils';

// ─── QuickIssueReport FAB + Bottom Sheet ─────────────────────────────────────
// Handles all issue types: Damaged, Missing Parts, Need to Order
// Two entry points:
//   1. FAB (floating action button) — opens full flow from Step 1
//   2. Pre-filled from swipe — skips item selection

const STEPS = ['photo', 'issueType', 'item', 'details'];

const ISSUE_TYPES = {
  damaged: {
    emoji: '\u{1F534}', // red circle
    label: 'Damaged',
    description: 'Item arrived broken or defective',
    color: C.red,
    dimColor: C.redDim,
    borderColor: C.redBorder,
    qtyLabel: 'Qty Damaged',
    notesPlaceholder: 'Describe damage...',
    notesLabel: 'Describe Damage',
    submitLabel: 'Report Damage',
    successMessage: 'Damage reported',
    photoTitle: (item) => `Damage: ${item.itemNumber || item.description || 'Item'}`,
    photoNotes: (notes) => `Damage report \u2014 ${notes || 'see photo'}`,
    photoType: 'damage',
  },
  missing: {
    emoji: '\u26A0\uFE0F', // warning
    label: 'Missing Parts',
    description: 'Parts missing from delivery',
    color: C.yellow,
    dimColor: C.yellowDim,
    borderColor: C.yellowBorder,
    qtyLabel: 'Qty Missing',
    notesPlaceholder: 'Describe what\'s missing...',
    notesLabel: 'Describe Missing Parts',
    submitLabel: 'Report Missing Parts',
    successMessage: 'Missing parts reported',
    photoTitle: (item) => `Missing: ${item.itemNumber || item.description || 'Item'}`,
    photoNotes: (notes) => `Missing parts \u2014 ${notes || 'see photo'}`,
    photoType: 'missing',
  },
  order: {
    emoji: '\u{1F4E6}', // package
    label: 'Need to Order',
    description: 'Additional items required',
    color: C.blue,
    dimColor: C.blueDim,
    borderColor: C.blueBorder,
    qtyLabel: 'Qty Needed',
    notesPlaceholder: 'Describe what to order...',
    notesLabel: 'Describe Order',
    submitLabel: 'Report Additional Order',
    successMessage: 'Additional order reported',
    photoTitle: (item) => `Order: ${item.itemNumber || item.description || 'Item'}`,
    photoNotes: (notes) => `Additional order \u2014 ${notes || 'see photo'}`,
    photoType: 'order',
  },
};

function ItemSearchResult({ item, onSelect }) {
  return (
    <button
      onClick={() => onSelect(item)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: 'transparent', border: 'none',
        borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left', minHeight: 44,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ ...MF, fontSize: 11, color: C.accent, fontWeight: 600, minWidth: 55 }}>
        {item.itemNumber || '---'}
      </span>
      <span style={{
        fontSize: 12, color: C.text, flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.description || 'No description'}
      </span>
      {item.vendor && (
        <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
          {item.vendor}
        </span>
      )}
    </button>
  );
}

function IssueTypeCard({ type, config, selected, onSelect }) {
  const isSelected = selected === type;
  return (
    <button
      onClick={() => onSelect(type)}
      style={{
        flex: 1, minHeight: 100, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '16px 10px',
        background: isSelected ? config.dimColor : 'transparent',
        border: `2px solid ${isSelected ? config.color : C.border}`,
        borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = config.color;
          e.currentTarget.style.background = config.dimColor;
        }
      }}
      onMouseLeave={e => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = C.border;
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <span style={{ fontSize: 28 }}>{config.emoji}</span>
      <span style={{
        fontSize: 13, fontWeight: 700, color: isSelected ? config.color : C.text,
      }}>
        {config.label}
      </span>
      <span style={{
        fontSize: 10, color: C.muted, textAlign: 'center', lineHeight: 1.3,
      }}>
        {config.description}
      </span>
    </button>
  );
}

export default function QuickIssueReport({ items, onRefresh, onClose, prefilledItem }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const sheetRef = useRef(null);

  // Determine step indices based on whether item is prefilled
  // Flow: photo -> issueType -> item (skipped if prefilled) -> details
  const getStepIndex = useCallback((stepName) => {
    if (prefilledItem) {
      // Steps: photo(0), issueType(1), details(2)
      const map = { photo: 0, issueType: 1, details: 2 };
      return map[stepName] ?? 0;
    }
    // Steps: photo(0), issueType(1), item(2), details(3)
    const map = { photo: 0, issueType: 1, item: 2, details: 3 };
    return map[stepName] ?? 0;
  }, [prefilledItem]);

  const totalSteps = prefilledItem ? 3 : 4;

  // State
  const [step, setStep] = useState(0); // always start at photo
  const [issueType, setIssueType] = useState(null); // 'damaged' | 'missing' | 'order'
  const [photoData, setPhotoData] = useState(null); // base64 compressed image
  const [photoFile, setPhotoFile] = useState(null); // raw File for upload
  const [selectedItem, setSelectedItem] = useState(prefilledItem || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);

  const issueConfig = issueType ? ISSUE_TYPES[issueType] : null;

  // Animate sheet in on mount
  useEffect(() => {
    requestAnimationFrame(() => setSheetVisible(true));
  }, []);

  // Auto-trigger camera on first step (photo first)
  useEffect(() => {
    if (step === 0 && fileRef.current) {
      // Small delay so sheet animation finishes
      const t = setTimeout(() => fileRef.current?.click(), 300);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Search items
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return (items || []).slice(0, 5);
    const q = searchQuery.toLowerCase();
    return (items || []).filter(item =>
      (item.itemNumber || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.vendor || '').toLowerCase().includes(q) ||
      (item.section || '').toLowerCase().includes(q)
    ).slice(0, 5);
  }, [items, searchQuery]);

  const handlePhotoCapture = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoFile(file);
      const compressed = await compressImage(file, 1200, 0.75);
      setPhotoData(compressed);
      haptic();
      // Advance to issue type selection
      setStep(getStepIndex('issueType'));
    } catch (err) {
      toast.error('Failed to process photo');
    }
  }, [toast, getStepIndex]);

  const handleSkipPhoto = useCallback(() => {
    haptic();
    setStep(getStepIndex('issueType'));
  }, [getStepIndex]);

  const handleSelectIssueType = useCallback((type) => {
    haptic();
    setIssueType(type);
    if (prefilledItem) {
      setStep(getStepIndex('details'));
    } else {
      setStep(getStepIndex('item'));
    }
  }, [prefilledItem, getStepIndex]);

  const handleSelectItem = useCallback((item) => {
    haptic();
    setSelectedItem(item);
    setStep(getStepIndex('details'));
    setSearchQuery('');
  }, [getStepIndex]);

  const handleSubmit = useCallback(async () => {
    if (!selectedItem || !issueType) return;
    setSubmitting(true);
    haptic(100);

    try {
      const now = new Date().toISOString();
      const config = ISSUE_TYPES[issueType];
      let updates = { ...selectedItem };

      if (issueType === 'damaged') {
        updates.damaged = true;
        updates.damagedQty = qty || '1';
        updates.damageNotes = notes || '';
        updates.damageReportedAt = now;
      } else if (issueType === 'missing') {
        updates.missingParts = notes || 'Missing parts';
        updates.missingPartsQty = qty || '1';
        updates.missingPartsReported = now;
      } else if (issueType === 'order') {
        updates.additionalOrders = notes || 'Additional order';
        updates.additionalOrdersQty = qty || '1';
        updates.additionalOrdersReported = now;
      }

      await api.updateItem(selectedItem.id, updates);

      // Upload photo if taken — link to item via a department photo with item reference
      if (photoFile && selectedItem.jobId) {
        try {
          const formData = new FormData();
          formData.append('photo', photoFile);
          formData.append('title', config.photoTitle(selectedItem));
          formData.append('notes', config.photoNotes(notes));
          formData.append('type', config.photoType);
          await api.uploadPhoto(formData);
          // Mark item as having a photo
          await api.updateItem(selectedItem.id, { ...updates, hasPhoto: true });
        } catch (photoErr) {
          // Photo upload failed but issue report succeeded — still show success
          console.warn('Photo upload failed:', photoErr);
        }
      }

      toast.success(config.successMessage);
      onRefresh();
      handleClose();
    } catch (err) {
      toast.error('Failed to report issue: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedItem, issueType, qty, notes, photoFile, onRefresh, toast]);

  const handleClose = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  // Step labels for progress indicator
  const stepLabels = prefilledItem
    ? ['Photo', 'Type', 'Details']
    : ['Photo', 'Type', 'Item', 'Details'];

  // Step content
  const renderStep = () => {
    // Step 0: Photo (always first)
    if (step === getStepIndex('photo')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40 }}>📸</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, textAlign: 'center' }}>
            Take a photo of the issue
          </div>
          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>
            Photo helps vendors process claims faster
          </div>

          {photoData && (
            <div style={{
              width: '100%', maxWidth: 280, borderRadius: 10, overflow: 'hidden',
              border: `2px solid ${C.greenBorder}`, position: 'relative',
            }}>
              <img src={photoData} alt="Issue" style={{ width: '100%', display: 'block' }} />
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(22,163,74,0.9)', color: '#fff',
                borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
              }}>
                Captured
              </div>
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

          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <Btn variant="ghost" onClick={handleSkipPhoto} style={{ flex: 1, minHeight: 44 }}>
              Skip Photo
            </Btn>
            <Btn variant="primary" icon="📷" onClick={() => fileRef.current?.click()} style={{ flex: 1, minHeight: 44 }}>
              {photoData ? 'Retake' : 'Take Photo'}
            </Btn>
          </div>
          {photoData && (
            <Btn variant="green" onClick={() => setStep(getStepIndex('issueType'))} style={{ width: '100%', minHeight: 44 }}>
              Next — Select Issue Type
            </Btn>
          )}
        </div>
      );
    }

    // Step: Issue Type Selection
    if (step === getStepIndex('issueType')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            What type of issue?
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.entries(ISSUE_TYPES).map(([type, config]) => (
              <IssueTypeCard
                key={type}
                type={type}
                config={config}
                selected={issueType}
                onSelect={handleSelectIssueType}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setStep(getStepIndex('photo'))} style={{ flex: 1, minHeight: 44 }}>
              Back
            </Btn>
          </div>
        </div>
      );
    }

    // Step: Item Selection (skipped if prefilled)
    if (!prefilledItem && step === getStepIndex('item')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Which item has the issue?
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 14 }}>🔍</span>
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by item #, description, or vendor..."
              style={{
                width: '100%', padding: '10px 12px 10px 32px', fontSize: 13,
                border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg,
                color: C.text, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box', minHeight: 44,
              }}
              onFocus={e => e.currentTarget.style.borderColor = C.accent}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
            />
          </div>
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
            maxHeight: 260, overflowY: 'auto',
          }}>
            {searchResults.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 12 }}>
                No items found
              </div>
            ) : (
              searchResults.map(item => (
                <ItemSearchResult key={item.id} item={item} onSelect={handleSelectItem} />
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setStep(getStepIndex('issueType'))} style={{ flex: 1, minHeight: 44 }}>
              Back
            </Btn>
          </div>
        </div>
      );
    }

    // Step: Details
    if (step === getStepIndex('details') && issueConfig) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Selected item info */}
          {selectedItem && (
            <div style={{
              padding: '10px 14px', background: issueConfig.dimColor, border: `1px solid ${issueConfig.borderColor}`,
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ ...MF, fontSize: 11, color: C.accent, fontWeight: 600 }}>
                {selectedItem.itemNumber || '---'}
              </span>
              <span style={{ fontSize: 12, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedItem.description || 'No description'}
              </span>
              {!prefilledItem && (
                <button onClick={() => setStep(getStepIndex('item'))} style={{
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.muted, cursor: 'pointer', fontSize: 10,
                  fontWeight: 700, padding: '3px 8px', fontFamily: 'inherit',
                }}>
                  Change
                </button>
              )}
            </div>
          )}

          {/* Issue type badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', background: issueConfig.dimColor,
            border: `1px solid ${issueConfig.borderColor}`, borderRadius: 8,
          }}>
            <span style={{ fontSize: 16 }}>{issueConfig.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: issueConfig.color }}>
              {issueConfig.label}
            </span>
            <button onClick={() => setStep(getStepIndex('issueType'))} style={{
              marginLeft: 'auto', background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: 'pointer', fontSize: 10,
              fontWeight: 700, padding: '3px 8px', fontFamily: 'inherit',
            }}>
              Change
            </button>
          </div>

          {/* Photo preview if captured */}
          {photoData && (
            <div style={{
              width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
              border: `1px solid ${C.border}`, flexShrink: 0,
            }}>
              <img src={photoData} alt="Issue" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          {/* Qty */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {issueConfig.qtyLabel}
            </label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={e => setQty(e.target.value)}
              style={{
                width: 80, padding: '8px 12px', fontSize: 16, fontWeight: 700,
                border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg,
                color: C.text, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                minHeight: 44, ...MF,
              }}
              onFocus={e => { e.target.select(); e.currentTarget.style.borderColor = C.accent; }}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
            />
          </div>

          {/* Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {issueConfig.notesLabel}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={issueConfig.notesPlaceholder}
              autoFocus={!!prefilledItem}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 13,
                border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg,
                color: C.text, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box', minHeight: 44,
              }}
              onFocus={e => e.currentTarget.style.borderColor = C.accent}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => {
              if (prefilledItem) {
                setStep(getStepIndex('issueType'));
              } else {
                setStep(getStepIndex('item'));
              }
            }} style={{ flex: 1, minHeight: 48 }}>
              Back
            </Btn>
            <Btn
              variant="dangerFilled"
              disabled={submitting || !selectedItem}
              onClick={handleSubmit}
              style={{ flex: 2, minHeight: 48, fontSize: 14, fontWeight: 700 }}
            >
              {submitting ? 'Reporting...' : issueConfig.submitLabel}
            </Btn>
          </div>
        </div>
      );
    }

    return null;
  };

  // Header color follows selected issue type
  const headerColor = issueConfig?.color || C.accent;
  const headerDim = issueConfig?.dimColor || C.accentDim;
  const headerBorder = issueConfig?.borderColor || C.accentBorder;

  return (
    <>
      {/* Overlay backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)', zIndex: 250,
          opacity: sheetVisible ? 1 : 0, transition: 'opacity 0.2s ease',
        }}
      />

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 260, maxHeight: '85vh',
          background: C.card, borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
          transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 20px 12px', borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: '50%',
              background: headerDim, border: `1px solid ${headerBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {issueConfig ? issueConfig.emoji : '\u{1F4CB}'}
            </span>
            <div>
              <div style={{ ...TF, fontSize: 17, fontWeight: 700, color: C.text }}>
                Report Issue
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>
                {prefilledItem
                  ? `${prefilledItem.itemNumber || ''} \u2014 ${prefilledItem.description || 'Item'}`
                  : `Step ${step + 1} of ${totalSteps}`}
              </div>
            </div>
          </div>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none', color: C.muted,
            cursor: 'pointer', fontSize: 20, minWidth: 44, minHeight: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 20px',
        }}>
          {stepLabels.map((label, i) => {
            const barColor = issueConfig ? issueConfig.color : C.accent;
            return (
              <div key={label} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
                <div style={{
                  height: 3, width: '100%', borderRadius: 2,
                  background: i <= step ? barColor : C.borderLight,
                  transition: 'background 0.2s',
                }} />
                <span style={{
                  fontSize: 9, fontWeight: i === step ? 700 : 500,
                  color: i <= step ? barColor : C.faint,
                }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ padding: '12px 20px 24px', overflowY: 'auto', flex: 1 }}>
          {renderStep()}
        </div>
      </div>
    </>
  );
}

// ─── Floating Action Button ─────────────────────────────────────────────────

export function IssueFAB({ onClick }) {
  return (
    <button
      onClick={() => { haptic(); onClick(); }}
      aria-label="Report issue"
      style={{
        position: 'fixed',
        bottom: 84, // above feedback button at 24px + 48px height + 12px gap
        right: 20,
        zIndex: 100,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: C.accent,
        border: `2px solid ${C.accentBorder}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        color: '#fff',
        boxShadow: '0 4px 16px rgba(234,88,12,0.35)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(234,88,12,0.45)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(234,88,12,0.35)'; }}
    >
      📋
    </button>
  );
}

// Legacy exports for backward compatibility
export { IssueFAB as DamageFAB };
export { QuickIssueReport as QuickDamageReport };
