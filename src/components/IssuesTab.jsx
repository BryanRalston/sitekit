import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { C, TF, MF } from '../tokens';
import { Btn } from './ui';
import { useMobile } from '../hooks/useApi';
import { api } from '../api';
import { useToast } from './Toast';
import { haptic } from '../utils/haptic';
import { SHARE_FOOTER } from '../utils/shareFooter';

// ─── jsPDF loader ─────────────────────────────────────────────────────────────

async function ensureJsPDF() {
  if (window.jspdf && window._sitekitAutoTableReady) return;
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load: ' + src.split('/').slice(-1)[0]));
    document.head.appendChild(s);
  });
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.3/jspdf.plugin.autotable.min.js');
  window._sitekitAutoTableReady = true;
}

// ─── Issue report PDF (with embedded photos) ──────────────────────────────────

async function exportIssuesPDF(job, selectedIssues, includePhotos) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'letter');
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const margin = 14;

  // Dark header bar
  doc.setFillColor(13, 17, 23);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(18);
  doc.text('SITEKIT', margin, 13);
  doc.setTextColor(230, 237, 243);
  doc.setFontSize(11);
  doc.text('Issue Report', margin + 44, 10);
  doc.setFontSize(9);
  doc.text(
    `${job.name} | Store #${job.storeNumber || ''} | ${new Date().toLocaleDateString()}`,
    margin + 44, 18
  );

  // Summary line
  const dmg = selectedIssues.filter(i => i.type === 'damage').length;
  const mis = selectedIssues.filter(i => i.type === 'missing').length;
  const ord = selectedIssues.filter(i => i.type === 'order').length;
  const unr = selectedIssues.filter(i => i.status === 'unreported').length;
  doc.setFontSize(9); doc.setTextColor(80);
  doc.text(
    `${selectedIssues.length} issues — ${dmg} damaged | ${mis} missing | ${ord} orders | ${unr} unreported`,
    margin, 36
  );

  // Issues table
  const tableRows = selectedIssues.map(issue => {
    const typeLabel = issue.type === 'damage' ? 'Damaged'
      : issue.type === 'missing' ? 'Missing Parts' : 'Add. Order';
    const statusLabel = issue.resolvedDate ? 'Resolved'
      : issue.reportedDate
        ? `Rptd ${new Date(issue.reportedDate).toLocaleDateString()}`
        : 'NOT REPORTED';
    const photoId = issue.type === 'damage' ? issue.item.photo_id
      : issue.type === 'missing' ? issue.item.missingPhotoId
      : issue.item.additionalPhotoId;
    return [
      issue.item.itemNumber || '',
      (issue.item.description || '').slice(0, 32),
      typeLabel,
      String(issue.qty || ''),
      (issue.details || '').slice(0, 38),
      statusLabel,
      includePhotos && photoId ? '✓' : '',
    ];
  });

  doc.autoTable({
    startY: 40,
    head: [['Item #', 'Description', 'Type', 'Qty', 'Details', 'Status', 'Photo']],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 50, 47], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 42 }, 2: { cellWidth: 22 },
      3: { cellWidth: 10 }, 4: { cellWidth: 'auto' }, 5: { cellWidth: 32 },
      6: { cellWidth: 12 },
    },
    margin: { left: margin, right: margin },
  });

  // Photos section
  if (includePhotos) {
    const photoIssues = selectedIssues.filter(issue => {
      const pid = issue.type === 'damage' ? issue.item.photo_id
        : issue.type === 'missing' ? issue.item.missingPhotoId
        : issue.item.additionalPhotoId;
      return !!pid;
    });

    if (photoIssues.length > 0) {
      let y = doc.lastAutoTable.finalY + 14;
      if (y > pageH - 80) { doc.addPage(); y = 20; }

      doc.setFontSize(11); doc.setTextColor(220, 50, 47);
      doc.text('Photos', margin, y);
      y += 7;

      const colW = (pageW - margin * 2 - 6) / 2;
      const imgH = 58;
      let col = 0;

      for (const issue of photoIssues) {
        const photoId = issue.type === 'damage' ? issue.item.photo_id
          : issue.type === 'missing' ? issue.item.missingPhotoId
          : issue.item.additionalPhotoId;
        let dataUrl;
        try { dataUrl = await api.getPhotoUrl(photoId); } catch { continue; }
        if (!dataUrl) continue;

        if (col === 0 && y + imgH + 16 > pageH - 14) { doc.addPage(); y = 20; }

        const x = margin + col * (colW + 6);
        const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        try { doc.addImage(dataUrl, fmt, x, y, colW, imgH); } catch { continue; }

        doc.setFontSize(7); doc.setTextColor(100);
        const typeLabel = issue.type === 'damage' ? 'Damage'
          : issue.type === 'missing' ? 'Missing' : 'Order';
        doc.text(
          `${issue.item.itemNumber || ''} — ${typeLabel} — ${(issue.item.description || '').slice(0, 28)}`,
          x, y + imgH + 4
        );

        col++;
        if (col >= 2) { col = 0; y += imgH + 14; }
      }
    }
  }

  // Footer on every page
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setTextColor(160);
    doc.text(
      `SiteKit Issue Report — ${job.name} — ${new Date().toLocaleString()} — Page ${p} of ${pageCount}`,
      pageW / 2, pageH - 6, { align: 'center' }
    );
  }

  const filename = `${job.name || 'issues'}-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ title: `SiteKit Issue Report — ${job.name}`, files: [file] });
  } else {
    // Desktop fallback: trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}

// ─── Issue report text share (with optional photo files on mobile) ────────────

async function shareIssuesText(job, selectedIssues, includePhotos) {
  let body = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber} | Date: ${new Date().toLocaleDateString()}\n\n`;
  const g = { damage: [], missing: [], order: [] };
  for (const i of selectedIssues) g[i.type].push(i);

  if (g.damage.length > 0) {
    body += `DAMAGED (${g.damage.length}):\n`;
    for (const i of g.damage) {
      const q = i.qty ? ` [Qty: ${i.qty}]` : '';
      const st = i.status === 'unreported' ? ' — NOT REPORTED'
        : i.status === 'reported' ? ' — Reported' : ' — Resolved';
      body += `• ${i.item.itemNumber} — ${i.item.description}${q}\n  ${i.details || '(see photo)'}${st}\n`;
    }
    body += '\n';
  }
  if (g.missing.length > 0) {
    body += `MISSING PARTS (${g.missing.length}):\n`;
    for (const i of g.missing) {
      const q = i.qty ? ` [Qty: ${i.qty}]` : '';
      const st = i.status === 'unreported' ? ' — NOT REPORTED'
        : i.status === 'reported' ? ' — Reported' : ' — Resolved';
      body += `• ${i.item.itemNumber} — ${i.item.description}${q}\n  ${i.details}${st}\n`;
    }
    body += '\n';
  }
  if (g.order.length > 0) {
    body += `ADDITIONAL ORDERS (${g.order.length}):\n`;
    for (const i of g.order) {
      const q = i.qty ? ` [Qty: ${i.qty}]` : '';
      const st = i.status === 'unreported' ? ' — NOT REPORTED'
        : i.status === 'reported' ? ' — Reported' : ' — Resolved';
      body += `• ${i.item.itemNumber} — ${i.item.description}${q}\n  ${i.details}${st}\n`;
    }
    body += '\n';
  }
  body += SHARE_FOOTER;

  // Collect photo files for mobile file-share
  const files = [];
  if (includePhotos && typeof navigator.canShare === 'function') {
    for (const issue of selectedIssues) {
      const photoId = issue.type === 'damage' ? issue.item.photo_id
        : issue.type === 'missing' ? issue.item.missingPhotoId
        : issue.item.additionalPhotoId;
      if (!photoId) continue;
      try {
        const dataUrl = await api.getPhotoUrl(photoId);
        if (!dataUrl) continue;
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const tag = issue.type === 'damage' ? 'dmg'
          : issue.type === 'missing' ? 'missing' : 'order';
        files.push(new File([blob], `${issue.item.itemNumber || 'item'}-${tag}.jpg`, {
          type: blob.type || 'image/jpeg',
        }));
      } catch {}
    }
  }

  try {
    if (files.length > 0 && navigator.canShare({ files })) {
      await navigator.share({ title: `SiteKit Issues — ${job.name}`, text: body, files });
      return true;
    } else if (navigator.share) {
      await navigator.share({ title: `SiteKit Issues — ${job.name}`, text: body });
      return true;
    } else {
      await navigator.clipboard.writeText(body);
      return true;
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      try { await navigator.clipboard.writeText(body); return true; } catch {}
    }
    return false;
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getIssueStatus(reportedDate, resolvedDate) {
  if (resolvedDate) return 'resolved';
  if (reportedDate) return 'reported';
  return 'unreported';
}

const STATUS_STYLE = {
  unreported: { color: C.red, bg: C.redDim, border: C.redBorder, label: 'Not Reported' },
  reported:   { color: C.yellow, bg: C.yellowDim, border: C.yellowBorder, label: 'Reported' },
  resolved:   { color: C.green, bg: C.greenDim, border: C.greenBorder, label: 'Resolved' },
};

function StatusBadge({ status, date }) {
  const s = STATUS_STYLE[status];
  const fmtDate = date ? new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}{fmtDate ? ` ${fmtDate}` : ''}
    </span>
  );
}

// ─── Individual share helpers (for IssueRow) ──────────────────────────────────

async function shareText(title, body) {
  const bodyWithFooter = body + SHARE_FOOTER;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: bodyWithFooter });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(bodyWithFooter); } catch {}
        return true;
      }
      return false;
    }
  } else {
    try { await navigator.clipboard.writeText(bodyWithFooter); return true; } catch { return false; }
  }
}

function buildIssueShareText(job, item, issueType) {
  const header = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber}\nDate: ${new Date().toLocaleDateString()}\n\n`;
  if (issueType === 'missing') {
    const qtyLine = item.missingPartsQty ? `\n  Qty Missing: ${item.missingPartsQty}` : '';
    return header + `MISSING PARTS:\n• ${item.itemNumber} (${item.description})${qtyLine}\n  ${item.missingParts}\n  Qty Ordered: ${item.qtyOrdered || 'N/A'} | Section: ${item.section || 'N/A'}`;
  } else if (issueType === 'order') {
    const qtyLine = item.additionalOrdersQty ? `\n  Qty Needed: ${item.additionalOrdersQty}` : '';
    return header + `ADDITIONAL ORDER NEEDED:\n• ${item.itemNumber} (${item.description})${qtyLine}\n  ${item.additionalOrders}\n  Section: ${item.section || 'N/A'}`;
  } else {
    const qtyLine = item.damagedQty ? `\n  Qty Damaged: ${item.damagedQty}` : '';
    return header + `DAMAGE REPORT:\n• ${item.itemNumber} (${item.description})${qtyLine}\n  ${item.damageNotes}\n  Qty Ordered: ${item.qtyOrdered || 'N/A'} | Section: ${item.section || 'N/A'}`;
  }
}

// ─── Photo thumb (add/replace photo on an issue) ─────────────────────────────

function PhotoThumb({ photoId, issueType, item, job, onUpdate }) {
  const { toast } = useToast();
  const [src, setSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  const photoField = issueType === 'damage' ? 'photo_id'
    : issueType === 'missing' ? 'missingPhotoId'
    : 'additionalPhotoId';

  useEffect(() => {
    if (!photoId) { setSrc(null); return; }
    api.getPhotoUrl(photoId).then(url => { if (url) setSrc(url); }).catch(() => {});
  }, [photoId]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('type', 'item');
      if (item.id) fd.append('item_id', item.id);
      if (job?.id) fd.append('job_id', job.id);
      const result = await api.uploadPhoto(fd);
      await api.updateItem(item.id, { ...item, [photoField]: result.id });
      setSrc(URL.createObjectURL(file));
      haptic();
      toast.success('Photo saved');
      onUpdate();
    } catch (err) {
      toast.error('Photo upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const btnStyle = {
    padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
    cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit',
    background: 'transparent', color: C.muted,
    border: `1px solid ${C.border}`,
    opacity: uploading ? 0.6 : 1,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      {src && (
        <img src={src} alt="" style={{
          width: 64, height: 48, objectFit: 'cover',
          borderRadius: 4, border: `1px solid ${C.border}`, flexShrink: 0,
        }} />
      )}
      {/* Camera input — opens camera directly */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        onChange={handleFile} style={{ display: 'none' }} />
      {/* Library input — opens photo picker */}
      <input ref={libraryRef} type="file" accept="image/*"
        onChange={handleFile} style={{ display: 'none' }} />
      <button onClick={() => cameraRef.current?.click()} disabled={uploading} style={btnStyle}>
        {uploading ? 'Uploading…' : '📷 Camera'}
      </button>
      <button onClick={() => libraryRef.current?.click()} disabled={uploading} style={btnStyle}>
        {uploading ? '…' : src ? '🖼 Change' : '🖼 Library'}
      </button>
    </div>
  );
}

// ─── Issue row component ──────────────────────────────────────────────────────

function IssueRow({ item, issueType, details, qty, status, reportedDate, resolvedDate, job, onUpdate, isMobile,
  reportMode, isSelected, onToggleSelect }) {
  const { toast } = useToast();
  const [localQty, setLocalQty] = useState(qty || '');
  const [savedIndicator, setSavedIndicator] = useState(false);

  const qtyField = issueType === 'missing' ? 'missingPartsQty'
    : issueType === 'order' ? 'additionalOrdersQty'
    : 'damagedQty';

  const photoId = issueType === 'damage' ? item.photo_id
    : issueType === 'missing' ? item.missingPhotoId
    : item.additionalPhotoId;

  const handleQtyChange = async (newVal) => {
    setLocalQty(newVal);
    try {
      await api.updateItem(item.id, { ...item, [qtyField]: newVal });
      haptic();
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 1500);
      onUpdate();
    } catch (err) {
      toast.error('Qty save failed: ' + err.message);
    }
  };

  const handleMarkReported = async () => {
    const field = issueType === 'missing' ? 'missingPartsReported'
      : issueType === 'order' ? 'additionalOrdersReported'
      : 'damageReported';
    try {
      await api.updateItem(item.id, { ...item, [field]: new Date().toISOString() });
      onUpdate();
      toast.success('Marked as reported');
    } catch (err) { toast.error('Update failed: ' + err.message); }
  };

  const handleMarkResolved = async () => {
    const field = issueType === 'missing' ? 'missingPartsResolved'
      : issueType === 'order' ? 'additionalOrdersResolved'
      : 'damageResolved';
    try {
      await api.updateItem(item.id, { ...item, [field]: new Date().toISOString() });
      onUpdate();
      toast.success('Marked as resolved');
    } catch (err) { toast.error('Update failed: ' + err.message); }
  };

  const handleReopen = async () => {
    const field = issueType === 'missing' ? 'missingPartsResolved'
      : issueType === 'order' ? 'additionalOrdersResolved'
      : 'damageResolved';
    try {
      await api.updateItem(item.id, { ...item, [field]: '' });
      onUpdate();
      toast.success('Issue reopened');
    } catch (err) { toast.error('Update failed: ' + err.message); }
  };

  const handleShare = async () => {
    const subject = issueType === 'missing' ? `Missing Parts — ${item.itemNumber} — ${job.name}`
      : issueType === 'order' ? `Additional Order — ${item.itemNumber} — ${job.name}`
      : `Damage Report — ${item.itemNumber} — ${job.name}`;
    const body = buildIssueShareText(job, item, issueType);
    const ok = await shareText(subject, body);
    if (ok) {
      const field = issueType === 'missing' ? 'missingPartsReported'
        : issueType === 'order' ? 'additionalOrdersReported'
        : 'damageReported';
      if (!item[field]) {
        try {
          await api.updateItem(item.id, { ...item, [field]: new Date().toISOString() });
          onUpdate();
        } catch {}
      }
      toast.success('Issue shared');
    }
  };

  return (
    <div
      onClick={reportMode ? () => onToggleSelect(`${item.id}-${issueType}`) : undefined}
      style={{
        position: 'relative',
        padding: isMobile ? '10px 12px' : '10px 16px',
        paddingRight: reportMode ? 44 : (isMobile ? 12 : 16),
        background: reportMode && isSelected ? (C.accentDim || 'rgba(34,211,238,0.08)') : C.card,
        borderRadius: 8,
        border: reportMode && isSelected
          ? `2px solid ${C.accent}`
          : `1px solid ${C.borderLight}`,
        marginBottom: 6,
        opacity: !reportMode && status === 'resolved' ? 0.6 : 1,
        cursor: reportMode ? 'pointer' : 'default',
        userSelect: reportMode ? 'none' : 'auto',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {/* Checkbox (report mode only) */}
      {reportMode && (
        <div style={{
          position: 'absolute', top: '50%', right: 12,
          transform: 'translateY(-50%)', pointerEvents: 'none',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            border: `2px solid ${isSelected ? C.accent : C.border}`,
            background: isSelected ? C.accent : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isSelected && (
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Item info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ ...MF, color: C.accent, fontSize: 11, fontWeight: 700 }}>
          {item.itemNumber || '---'}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: C.text, flex: 1, minWidth: 100,
          textDecoration: !reportMode && status === 'resolved' ? 'line-through' : 'none',
        }}>
          {item.description || '---'}
        </span>
        {/* Photo indicator in report mode */}
        {reportMode && photoId && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: C.greenDim, color: C.green, border: `1px solid ${C.greenBorder}`,
          }}>
            📷
          </span>
        )}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, borderRadius: 4,
          background: C.accentDim || 'rgba(34,211,238,0.1)', color: C.accent,
          border: `1px solid ${C.accentBorder || 'rgba(34,211,238,0.2)'}`,
          whiteSpace: 'nowrap', fontFamily: 'inherit', padding: '2px 4px 2px 7px',
        }}>
          Qty:
          <input
            type="number" min="0" value={localQty}
            onClick={e => e.stopPropagation()}
            onChange={e => handleQtyChange(e.target.value)}
            style={{
              width: 44, padding: '1px 4px', fontSize: 11, fontWeight: 700,
              borderRadius: 3, border: `1px solid ${C.border}`,
              background: C.bg, color: C.accent, fontFamily: 'inherit',
              outline: 'none', textAlign: 'center',
            }}
          />
          {savedIndicator && <span style={{ fontSize: 9, color: C.green, fontWeight: 700 }}>Saved</span>}
        </span>
        {item.section && <span style={{ fontSize: 10, color: C.faint }}>{item.section}</span>}
        <StatusBadge status={status} date={resolvedDate || reportedDate} />
      </div>

      {/* Issue details */}
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, lineHeight: 1.5 }}>
        {details}
      </div>

      {/* Photo — hidden in report mode */}
      {!reportMode && (
        <PhotoThumb
          photoId={photoId}
          issueType={issueType}
          item={item}
          job={job}
          onUpdate={onUpdate}
        />
      )}

      {/* Actions — hidden in report mode */}
      {!reportMode && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {status === 'unreported' && (
            <>
              <Btn variant="ghost" size="sm" onClick={handleShare}>Share</Btn>
              <Btn variant="orange" size="sm" onClick={handleMarkReported}>Mark Reported</Btn>
            </>
          )}
          {status === 'reported' && (
            <>
              <Btn variant="ghost" size="sm" onClick={handleShare}>Share</Btn>
              <Btn variant="green" size="sm" onClick={handleMarkResolved}>Mark Resolved</Btn>
            </>
          )}
          {status === 'resolved' && (
            <Btn variant="ghost" size="sm" onClick={handleReopen}>Reopen</Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section component ────────────────────────────────────────────────────────

function IssueSection({ title, icon, color, colorDim, colorBorder, issues, job, onUpdate, isMobile,
  showOnlyUnreported, reportMode, selectedIssueKeys, onToggleSelect }) {
  const filtered = showOnlyUnreported
    ? issues.filter(i => i.status === 'unreported')
    : issues;

  if (filtered.length === 0) return null;

  const unreported = issues.filter(i => i.status === 'unreported').length;
  const reported = issues.filter(i => i.status === 'reported').length;
  const resolved = issues.filter(i => i.status === 'resolved').length;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', marginBottom: 8,
        background: colorDim, borderRadius: 8, border: `1px solid ${colorBorder}`,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {title} ({filtered.length})
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 10, fontWeight: 600 }}>
          {unreported > 0 && <span style={{ color: C.red }}>{unreported} unreported</span>}
          {reported > 0 && <span style={{ color: C.yellow }}>{reported} reported</span>}
          {resolved > 0 && !showOnlyUnreported && <span style={{ color: C.green }}>{resolved} resolved</span>}
        </div>
      </div>

      {filtered.map(issue => (
        <IssueRow
          key={`${issue.item.id}-${issue.type}`}
          item={issue.item}
          issueType={issue.type}
          details={issue.details}
          qty={issue.qty}
          status={issue.status}
          reportedDate={issue.reportedDate}
          resolvedDate={issue.resolvedDate}
          job={job}
          onUpdate={onUpdate}
          isMobile={isMobile}
          reportMode={reportMode}
          isSelected={selectedIssueKeys.has(`${issue.item.id}-${issue.type}`)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IssuesTab({ job, onRefresh }) {
  const { toast } = useToast();
  const isMobile = useMobile();
  const [showOnlyUnreported, setShowOnlyUnreported] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [selectedIssueKeys, setSelectedIssueKeys] = useState(new Set());
  const [includePhotos, setIncludePhotos] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  const items = job.items || [];

  // Build flat issue list
  const allIssues = useMemo(() => {
    const issues = { missing: [], damage: [], orders: [] };
    for (const item of items) {
      if (item.missingParts) {
        issues.missing.push({
          item, type: 'missing',
          details: item.missingParts,
          qty: item.missingPartsQty,
          status: getIssueStatus(item.missingPartsReported, item.missingPartsResolved),
          reportedDate: item.missingPartsReported,
          resolvedDate: item.missingPartsResolved,
        });
      }
      if (item.damaged) {
        issues.damage.push({
          item, type: 'damage',
          details: item.damageNotes || 'Marked as damaged',
          qty: item.damagedQty,
          status: getIssueStatus(item.damageReported, item.damageResolved),
          reportedDate: item.damageReported,
          resolvedDate: item.damageResolved,
        });
      }
      if (item.additionalOrders) {
        issues.orders.push({
          item, type: 'order',
          details: item.additionalOrders,
          qty: item.additionalOrdersQty,
          status: getIssueStatus(item.additionalOrdersReported, item.additionalOrdersResolved),
          reportedDate: item.additionalOrdersReported,
          resolvedDate: item.additionalOrdersResolved,
        });
      }
    }
    return issues;
  }, [items]);

  // Flat set of all issue keys
  const allIssueKeys = useMemo(() => {
    const keys = new Set();
    for (const issue of [...allIssues.missing, ...allIssues.damage, ...allIssues.orders]) {
      keys.add(`${issue.item.id}-${issue.type}`);
    }
    return keys;
  }, [allIssues]);

  // Selected issues (derived from keys)
  const selectedIssues = useMemo(() => {
    if (selectedIssueKeys.size === 0) return [];
    const all = [...allIssues.missing, ...allIssues.damage, ...allIssues.orders];
    return all.filter(i => selectedIssueKeys.has(`${i.item.id}-${i.type}`));
  }, [selectedIssueKeys, allIssues]);

  // Do any selected issues have photos?
  const selectedHavePhotos = useMemo(() => selectedIssues.some(i => {
    if (i.type === 'damage') return !!i.item.photo_id;
    if (i.type === 'missing') return !!i.item.missingPhotoId;
    return !!i.item.additionalPhotoId;
  }), [selectedIssues]);

  // Summary stats
  const stats = useMemo(() => {
    const all = [...allIssues.missing, ...allIssues.damage, ...allIssues.orders];
    return {
      total: all.length,
      missing: allIssues.missing.length,
      damaged: allIssues.damage.length,
      orders: allIssues.orders.length,
      unreported: all.filter(i => i.status === 'unreported').length,
      reported: all.filter(i => i.status === 'reported').length,
      resolved: all.filter(i => i.status === 'resolved').length,
    };
  }, [allIssues]);

  // Unreported items (for Share All)
  const unreportedItems = useMemo(() => items.filter(i => {
    return (i.missingParts && !i.missingPartsReported)
      || (i.additionalOrders && !i.additionalOrdersReported)
      || (i.damaged && !i.damageReported);
  }), [items]);

  const handleToggleSelect = useCallback((key) => {
    haptic();
    setSelectedIssueKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    haptic();
    setSelectedIssueKeys(new Set(allIssueKeys));
  }, [allIssueKeys]);

  const handleDeselectAll = useCallback(() => setSelectedIssueKeys(new Set()), []);

  const handleEnterReportMode = useCallback(() => {
    haptic();
    setReportMode(true);
    setSelectedIssueKeys(new Set());
  }, []);

  const handleExitReportMode = useCallback(() => {
    setReportMode(false);
    setSelectedIssueKeys(new Set());
  }, []);

  const handleGenerateReport = useCallback(async (format) => {
    if (selectedIssues.length === 0) { toast.error('Select at least one issue'); return; }
    haptic();
    setReportLoading(true);
    try {
      if (format === 'pdf') {
        await exportIssuesPDF(job, selectedIssues, includePhotos && selectedHavePhotos);
      } else {
        const ok = await shareIssuesText(job, selectedIssues, includePhotos && selectedHavePhotos);
        if (ok) {
          const now = new Date().toISOString();
          for (const issue of selectedIssues) {
            if (issue.status === 'unreported') {
              const field = issue.type === 'missing' ? 'missingPartsReported'
                : issue.type === 'order' ? 'additionalOrdersReported'
                : 'damageReported';
              try { await api.updateItem(issue.item.id, { ...issue.item, [field]: now }); } catch {}
            }
          }
          onRefresh();
          toast.success(`${selectedIssues.length} issue${selectedIssues.length > 1 ? 's' : ''} shared & marked reported`);
        }
      }
    } catch (err) {
      toast.error('Report failed: ' + (err?.message || String(err) || 'unknown error'));
    } finally {
      setReportLoading(false);
    }
  }, [selectedIssues, includePhotos, selectedHavePhotos, job, onRefresh, toast]);

  const handleShareAllUnreported = useCallback(async () => {
    if (unreportedItems.length === 0) return;
    let body = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber} | Date: ${new Date().toLocaleDateString()}\n`;

    const missingItems = unreportedItems.filter(i => i.missingParts && !i.missingPartsReported);
    const damagedItems = unreportedItems.filter(i => i.damaged && !i.damageReported);
    const orderItems = unreportedItems.filter(i => i.additionalOrders && !i.additionalOrdersReported);

    if (missingItems.length > 0) {
      body += `\nMISSING PARTS (${missingItems.length}):\n`;
      for (const i of missingItems) {
        const q = i.missingPartsQty ? ` (Qty: ${i.missingPartsQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${q} — ${i.missingParts}\n`;
      }
    }
    if (damagedItems.length > 0) {
      body += `\nDAMAGED (${damagedItems.length}):\n`;
      for (const i of damagedItems) {
        const q = i.damagedQty ? ` (Qty: ${i.damagedQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${q} — ${i.damageNotes || 'see photo'}\n`;
      }
    }
    if (orderItems.length > 0) {
      body += `\nADDITIONAL ORDERS (${orderItems.length}):\n`;
      for (const i of orderItems) {
        const q = i.additionalOrdersQty ? ` (Qty: ${i.additionalOrdersQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${q} — ${i.additionalOrders}\n`;
      }
    }

    const ok = await shareText(`SiteKit Issues — ${job.name}`, body);
    if (ok) {
      const now = new Date().toISOString();
      for (const i of unreportedItems) {
        const updates = {};
        if (i.missingParts && !i.missingPartsReported) updates.missingPartsReported = now;
        if (i.damaged && !i.damageReported) updates.damageReported = now;
        if (i.additionalOrders && !i.additionalOrdersReported) updates.additionalOrdersReported = now;
        if (Object.keys(updates).length > 0) {
          try { await api.updateItem(i.id, { ...i, ...updates }); } catch {}
        }
      }
      onRefresh();
      toast.success(`All ${unreportedItems.length} issues shared and marked reported`);
    }
  }, [unreportedItems, job, onRefresh, toast]);

  // Empty state
  if (stats.total === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#x2705;</div>
        <div style={{ ...TF, fontSize: 22, fontWeight: 700, color: C.green, marginBottom: 8 }}>
          No Issues
        </div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 320, lineHeight: 1.6 }}>
          No missing parts, damage, or additional orders have been logged for this job.
          Issues are flagged from the Fixtures tab when editing individual items.
        </div>
      </div>
    );
  }

  const allSelected = allIssueKeys.size > 0 && selectedIssueKeys.size === allIssueKeys.size;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div className="no-print" style={{
        flexShrink: 0, padding: isMobile ? '12px 14px' : '14px 22px',
        background: C.card, borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Summary stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)',
          gap: 8, marginBottom: 12,
        }}>
          {[
            { label: 'Total Issues', value: stats.total, color: C.text },
            { label: 'Missing Parts', value: stats.missing, color: C.yellow },
            { label: 'Damaged', value: stats.damaged, color: C.red },
            { label: 'Add. Orders', value: stats.orders, color: C.blue },
            { label: 'Unreported', value: stats.unreported, color: C.red },
            { label: 'Resolved', value: stats.resolved, color: C.green },
          ].map(s => (
            <div key={s.label} style={{
              padding: '8px 10px', background: C.bg, borderRadius: 7,
              textAlign: 'center', border: `1px solid ${C.borderLight}`,
            }}>
              <div style={{ ...TF, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{
                fontSize: 9, color: C.muted, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Action bar — normal mode */}
        {!reportMode ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setShowOnlyUnreported(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
              background: showOnlyUnreported ? C.redDim : 'transparent',
              color: showOnlyUnreported ? C.red : C.muted,
              border: `1px solid ${showOnlyUnreported ? C.redBorder : C.border}`,
            }}>
              {showOnlyUnreported ? '🔴 Showing Unreported Only' : '🔴 Show Unreported Only'}
            </button>

            <Btn variant="blue" size="sm" icon="📋" onClick={handleEnterReportMode}>
              Create Report
            </Btn>

            {stats.unreported > 0 && (
              <Btn variant="danger" size="sm" icon="📤" onClick={handleShareAllUnreported}
                style={{ marginLeft: isMobile ? 0 : 'auto' }}>
                Share All ({stats.unreported})
              </Btn>
            )}
          </div>
        ) : (
          /* Report mode header */
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleExitReportMode} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', color: C.muted,
              border: `1px solid ${C.border}`,
            }}>
              ✕ Cancel
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              {selectedIssueKeys.size} of {allIssueKeys.size} selected
            </span>
            <button
              onClick={allSelected ? handleDeselectAll : handleSelectAll}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                background: allSelected ? C.redDim : (C.accentDim || 'rgba(34,211,238,0.1)'),
                color: allSelected ? C.red : C.accent,
                border: `1px solid ${allSelected ? C.redBorder : (C.accentBorder || 'rgba(34,211,238,0.25)')}`,
              }}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {!isMobile && (
              <span style={{ fontSize: 11, color: C.faint }}>
                Tap issues below to select
              </span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable issue list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 14px' : '16px 22px' }}>
        <IssueSection
          title="Missing Parts" icon="⚠" color={C.yellow}
          colorDim={C.yellowDim} colorBorder={C.yellowBorder}
          issues={allIssues.missing} job={job} onUpdate={onRefresh}
          isMobile={isMobile} showOnlyUnreported={showOnlyUnreported}
          reportMode={reportMode} selectedIssueKeys={selectedIssueKeys}
          onToggleSelect={handleToggleSelect}
        />
        <IssueSection
          title="Damage" icon="🔴" color={C.red}
          colorDim={C.redDim} colorBorder={C.redBorder}
          issues={allIssues.damage} job={job} onUpdate={onRefresh}
          isMobile={isMobile} showOnlyUnreported={showOnlyUnreported}
          reportMode={reportMode} selectedIssueKeys={selectedIssueKeys}
          onToggleSelect={handleToggleSelect}
        />
        <IssueSection
          title="Additional Orders" icon="📦" color={C.blue}
          colorDim={C.blueDim} colorBorder={C.blueBorder}
          issues={allIssues.orders} job={job} onUpdate={onRefresh}
          isMobile={isMobile} showOnlyUnreported={showOnlyUnreported}
          reportMode={reportMode} selectedIssueKeys={selectedIssueKeys}
          onToggleSelect={handleToggleSelect}
        />

        {showOnlyUnreported && stats.unreported === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#x2705;</div>
            <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 6 }}>
              All issues have been reported
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Toggle off the filter to see reported and resolved issues.
            </div>
          </div>
        )}

        {/* Spacer so content isn't hidden behind bottom bar */}
        {reportMode && <div style={{ height: 72 }} />}
      </div>

      {/* Floating report action bar */}
      {reportMode && (
        <div style={{
          flexShrink: 0,
          padding: isMobile ? '10px 14px' : '12px 22px',
          background: C.card,
          borderTop: `2px solid ${C.accent}`,
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            {selectedIssues.length > 0
              ? `${selectedIssues.length} issue${selectedIssues.length > 1 ? 's' : ''} selected`
              : 'No issues selected'}
          </span>

          {/* Photos toggle — only if selected items have photos */}
          {selectedHavePhotos && (
            <button onClick={() => setIncludePhotos(v => !v)} style={{
              padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              background: includePhotos ? C.greenDim : 'transparent',
              color: includePhotos ? C.green : C.muted,
              border: `1px solid ${includePhotos ? C.greenBorder : C.border}`,
            }}>
              {includePhotos ? '📷 Photos ON' : '📷 Photos OFF'}
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn
              variant="ghost" size="sm" icon="📤"
              onClick={() => handleGenerateReport('text')}
              disabled={reportLoading || selectedIssues.length === 0}
            >
              Share Text
            </Btn>
            <Btn
              variant="blue" size="sm" icon="📑"
              onClick={() => handleGenerateReport('pdf')}
              disabled={reportLoading || selectedIssues.length === 0}
            >
              {reportLoading ? 'Generating...' : 'Share PDF'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
