import React, { useState, useEffect, useMemo } from 'react';
import { C, TF, MF } from '../tokens';
import { Modal, Btn, Inp } from './ui';
import { api } from '../api';
import { CATEGORIES } from './ReceiptsTab';

function formatCurrency(amount) {
  const n = parseFloat(amount) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Resolve all receipt photo URLs ahead of rendering
function useReceiptPhotos(receipts) {
  const [photoMap, setPhotoMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const map = {};
      const photosToLoad = receipts.filter(r => r.hasPhoto);
      await Promise.all(photosToLoad.map(async (r) => {
        try {
          const url = await api.getReceiptPhotoUrl(r.id);
          if (url) map[r.id] = url;
        } catch { /* ignore */ }
      }));
      if (!cancelled) setPhotoMap(map);
    };
    load();
    return () => { cancelled = true; };
  }, [receipts]);

  return photoMap;
}

export default function ReceiptReportModal({ job, receipts, onClose }) {
  const [generating, setGenerating] = useState(false);
  const photoMap = useReceiptPhotos(receipts);
  const [preparedBy, setPreparedBy] = useState(() => localStorage.getItem('sitekit_prepared_by') || '');

  const handlePreparedByChange = (val) => {
    setPreparedBy(val);
    localStorage.setItem('sitekit_prepared_by', val);
  };

  // Group receipts by category
  const grouped = useMemo(() => {
    const groups = {};
    receipts.forEach(r => {
      const cat = r.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    });
    // Sort categories alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [receipts]);

  // Summary stats
  const summary = useMemo(() => {
    const byCategory = {};
    receipts.forEach(r => {
      const cat = r.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(r.amount) || 0);
    });
    const grandTotal = receipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const gasTotal = receipts.filter(r => r.isGas || r.category === 'Gas').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const submittedCount = receipts.filter(r => r.submitted).length;
    const pendingCount = receipts.filter(r => !r.submitted).length;

    // Date range
    const dates = receipts.map(r => r.date).filter(Boolean).sort();
    const dateFrom = dates[0] || '';
    const dateTo = dates[dates.length - 1] || '';

    return { byCategory, grandTotal, gasTotal, submittedCount, pendingCount, dateFrom, dateTo };
  }, [receipts]);

  const handleGenerateReport = () => {
    setGenerating(true);

    // Build the HTML report
    const catRows = Object.entries(summary.byCategory)
      .sort(([,a], [,b]) => b - a)
      .map(([cat, total]) => {
        const style = CATEGORIES[cat] || CATEGORIES.Other;
        return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #30363d;">
            <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${style.bg};color:${style.color};border:1px solid ${style.border};">${cat}</span>
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #30363d;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;">${formatCurrency(total)}</td>
        </tr>`;
      }).join('');

    const receiptRows = grouped.map(([cat, catReceipts]) => {
      const catStyle = CATEGORIES[cat] || CATEGORIES.Other;
      const catTotal = catReceipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

      const rows = catReceipts.map(r => {
        const photoHtml = photoMap[r.id]
          ? `<td style="padding:6px;border-bottom:1px solid #e5e7eb;width:50px;"><img src="${photoMap[r.id]}" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #d1d5db;" /></td>`
          : `<td style="padding:6px;border-bottom:1px solid #e5e7eb;width:50px;"></td>`;

        return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;">${formatDate(r.date)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111827;font-weight:600;">${r.store || '—'}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;text-align:right;">${formatCurrency(r.amount)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${r.notes || ''}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.submitted ? '#16a34a' : '#ea580c'};" title="${r.submitted ? 'Submitted' : 'Pending'}"></span>
          </td>
          ${photoHtml}
        </tr>`;
      }).join('');

      return `
        <div style="margin-bottom:24px;">
          <div style="padding:8px 14px;background:${catStyle.bg};border:1px solid ${catStyle.border};border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:13px;font-weight:700;color:${catStyle.color};text-transform:uppercase;letter-spacing:0.05em;">${cat} (${catReceipts.length})</span>
            <span style="font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${catStyle.color};">${formatCurrency(catTotal)}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Date</th>
                <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Store</th>
                <th style="padding:6px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Amount</th>
                <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Notes</th>
                <th style="padding:6px 12px;text-align:center;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Status</th>
                <th style="padding:6px 12px;text-align:center;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Photo</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt Report — ${job.name || 'Job'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600;700&family=Rajdhani:wght@600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #fff; color: #111827; padding: 32px; max-width: 900px; margin: 0 auto; }
    @media print {
      body { padding: 16px; }
      .no-print { display: none !important; }
      @page { margin: 0.5in; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:24px;justify-content:flex-end;">
    <button onclick="window.print()" style="padding:8px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;background:#f97316;color:#fff;border:none;font-family:inherit;">
      Print
    </button>
    <button onclick="window.close()" style="padding:8px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;background:#e5e7eb;color:#374151;border:none;font-family:inherit;">
      Close
    </button>
  </div>

  <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #111827;">
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px;">
      <span style="font-family:'Rajdhani',sans-serif;font-size:28px;font-weight:700;color:#f97316;">SITEKIT</span>
      <span style="font-size:18px;font-weight:700;color:#111827;">Receipt Report</span>
    </div>
    <div style="font-size:13px;color:#6b7280;">
      <strong style="color:#111827;">${job.name || 'Job'}</strong>
      ${job.storeNumber ? ` — Store #${job.storeNumber}` : ''}
      ${job.location ? ` — ${job.location}` : ''}
    </div>
    <div style="font-size:12px;color:#9ca3af;margin-top:4px;">
      ${summary.dateFrom && summary.dateTo
        ? `${formatDate(summary.dateFrom)} — ${formatDate(summary.dateTo)}`
        : 'No date range'}
      &nbsp;|&nbsp; Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
    <div style="padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Total Receipts</div>
      <div style="font-size:22px;font-weight:700;color:#111827;">${receipts.length}</div>
    </div>
    <div style="padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Grand Total</div>
      <div style="font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#111827;">${formatCurrency(summary.grandTotal)}</div>
    </div>
    <div style="padding:12px 16px;background:#fffbeb;border-radius:8px;border:1px solid rgba(146,64,14,0.25);text-align:center;">
      <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Gas Total</div>
      <div style="font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#92400e;">${formatCurrency(summary.gasTotal)}</div>
    </div>
    <div style="padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Submitted / Pending</div>
      <div style="font-size:22px;font-weight:700;color:#111827;">
        <span style="color:#16a34a;">${summary.submittedCount}</span>
        <span style="color:#9ca3af;font-size:16px;"> / </span>
        <span style="color:#ea580c;">${summary.pendingCount}</span>
      </div>
    </div>
  </div>

  ${receiptRows}

  <div style="margin-top:32px;padding-top:16px;border-top:2px solid #e5e7eb;">
    <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Summary by Category</div>
    <table style="width:100%;border-collapse:collapse;max-width:400px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Category</th>
          <th style="padding:6px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${catRows}
        <tr style="background:#f9fafb;">
          <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#111827;">GRAND TOTAL</td>
          <td style="padding:8px 12px;text-align:right;font-size:15px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#111827;">${formatCurrency(summary.grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="margin-top:24px;text-align:center;font-size:10px;color:#9ca3af;">
    ${preparedBy ? `Prepared by: ${preparedBy} | ` : ''}Generated: ${new Date().toLocaleString()}
  </div>
</body>
</html>`;

    // Open in new window
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    setGenerating(false);
  };

  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Modal title={`Receipt Report — ${job.name || 'Job'}`} onClose={onClose} width={700}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Prepared By */}
        <div className="no-print" style={{ padding: "10px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <Inp
            label="Prepared By"
            value={preparedBy}
            onChange={handlePreparedByChange}
            placeholder="Your name..."
          />
        </div>

        {/* Preview info */}
        <div style={{ padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ ...TF, fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Receipt Report Preview
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            <strong style={{ color: C.text }}>{job.name}</strong>
            {job.storeNumber && <> — Store #{job.storeNumber}</>}
            {job.location && <> — {job.location}</>}
            <span style={{ marginLeft: 10 }}>{now}</span>
          </div>
        </div>

        {/* Stats preview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Receipts', value: String(receipts.length), color: C.text },
            { label: 'Grand Total', value: formatCurrency(summary.grandTotal), color: C.accent },
            { label: 'Gas Total', value: formatCurrency(summary.gasTotal), color: CATEGORIES.Gas.color },
            { label: 'Submitted / Pending', value: `${summary.submittedCount} / ${summary.pendingCount}`, color: C.green },
          ].map(s => (
            <div key={s.label} style={{
              padding: '10px 14px', background: C.bg, borderRadius: 8,
              border: `1px solid ${C.borderLight}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ ...MF, fontSize: 18, fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            By Category
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(summary.byCategory)
              .sort(([,a], [,b]) => b - a)
              .map(([cat, total]) => {
                const catStyle = CATEGORIES[cat] || CATEGORIES.Other;
                const pct = summary.grandTotal > 0 ? (total / summary.grandTotal * 100) : 0;
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', minWidth: 80,
                      padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                      background: catStyle.bg, color: catStyle.color,
                      border: `1px solid ${catStyle.border}`,
                    }}>
                      {cat}
                    </span>
                    <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: 3,
                        background: catStyle.color, opacity: 0.6, transition: 'width 0.3s',
                      }} />
                    </div>
                    <span style={{ ...MF, fontSize: 12, fontWeight: 700, color: C.text, minWidth: 80, textAlign: 'right' }}>
                      {formatCurrency(total)}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted, minWidth: 36, textAlign: 'right' }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Date range */}
        {summary.dateFrom && summary.dateTo && (
          <div style={{ fontSize: 12, color: C.muted }}>
            Date range: <strong style={{ color: C.text }}>{formatDate(summary.dateFrom)}</strong> — <strong style={{ color: C.text }}>{formatDate(summary.dateTo)}</strong>
          </div>
        )}

        {/* Photo loading status */}
        {receipts.some(r => r.hasPhoto) && (
          <div style={{ fontSize: 11, color: C.muted }}>
            {Object.keys(photoMap).length} of {receipts.filter(r => r.hasPhoto).length} receipt photos loaded for report.
          </div>
        )}

        {/* Report footer */}
        <div style={{
          padding: "10px 16px", borderTop: `1px solid ${C.borderLight}`,
          fontSize: 11, color: C.muted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          {preparedBy && <span>Prepared by: <strong style={{ color: C.text }}>{preparedBy}</strong></span>}
          <span>Generated: {now}</span>
        </div>

        {/* Actions */}
        <div className="no-print" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="📊" onClick={handleGenerateReport} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Report'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
