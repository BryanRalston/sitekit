import React, { useState, useEffect } from 'react';
import { C, TF, MF, STATUS, getItemStatus } from '../tokens';
import { Modal, Btn, Inp, Badge } from './ui';
import { api } from '../api';

// ─── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(job, items, groupBy) {
  const headers = ['Item #', 'Class', 'Fixture Book', 'Description', 'Vendor', 'Section', 'Qty Ordered', 'Qty Received', 'Del. Date', 'Status', 'Missing Parts', 'Additional Orders', 'Damaged', 'Damage Notes', 'Notes'];
  const rows = items.map(item => [
    item.itemNumber, item.materialClass, item.fixtureBook, item.description,
    item.vendor, item.section, item.qtyOrdered, item.qtyReceived,
    item.delDate, getItemStatus(item),
    item.missingParts, item.additionalOrders, item.damaged ? 'Yes' : 'No',
    item.damageNotes, item.notes
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${job.name || 'report'}-fixtures-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF Export ────────────────────────────────────────────────────────────────
async function exportPDF(job, items, groupBy, preparedBy) {
  // Dynamically load jsPDF + autoTable from CDN
  if (!window.jspdf || !window._sitekitAutoTableReady) {
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

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'letter');

  // Header
  doc.setFillColor(13, 17, 23);
  doc.rect(0, 0, doc.internal.pageSize.width, 30, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(20);
  doc.text('SITEKIT', 14, 15);
  doc.setTextColor(230, 237, 243);
  doc.setFontSize(12);
  doc.text('Fixture & Equipment Receiving Report', 50, 12);
  doc.setFontSize(10);
  doc.text(`${job.name} | Store #${job.storeNumber || ''} | ${job.location || ''} | ${new Date().toLocaleDateString()}`, 50, 20);

  // Summary stats
  const received = items.filter(i => getItemStatus(i) === 'received').length;
  const issueCount = items.filter(i => getItemStatus(i) === 'issue').length;
  const pending = items.filter(i => ['pending', 'overdue'].includes(getItemStatus(i))).length;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(`Total: ${items.length}  |  Received: ${received}  |  Pending: ${pending}  |  Issues: ${issueCount}`, 14, 40);

  // Items table grouped
  const grouped = {};
  for (const item of items) {
    const key = groupBy === 'section' ? (item.section || 'Ungrouped') : (item.vendor || 'Unknown');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  let startY = 48;
  for (const [group, gitems] of Object.entries(grouped)) {
    doc.setFontSize(10);
    doc.setTextColor(249, 115, 22);
    doc.text(`${groupBy === 'section' ? '' : ''} ${group} (${gitems.length})`, 14, startY);
    startY += 4;

    doc.autoTable({
      startY,
      head: [['Item #', 'Class', 'Book', 'Description', 'Ord', 'Rec', 'Del. Date', 'Status']],
      body: gitems.map(item => [
        item.itemNumber || '', item.materialClass || '', item.fixtureBook || '',
        (item.description || '').slice(0, 50), item.qtyOrdered || '', item.qtyReceived || '',
        item.delDate || '', getItemStatus(item)
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [28, 35, 51], textColor: [230, 237, 243], fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 18 }, 1: { cellWidth: 16 }, 2: { cellWidth: 14 },
        3: { cellWidth: 'auto' }, 4: { cellWidth: 12 }, 5: { cellWidth: 12 },
        6: { cellWidth: 22 }, 7: { cellWidth: 18 },
      },
      margin: { left: 14, right: 14 },
    });

    startY = doc.lastAutoTable.finalY + 8;

    if (startY > doc.internal.pageSize.height - 30) {
      doc.addPage();
      startY = 20;
    }
  }

  // Issues section
  const issueItems = items.filter(i => i.damaged || i.missingParts || i.additionalOrders);
  if (issueItems.length > 0) {
    if (startY > doc.internal.pageSize.height - 60) {
      doc.addPage();
      startY = 20;
    }
    doc.setFontSize(12);
    doc.setTextColor(248, 81, 73);
    doc.text(`Issues (${issueItems.length})`, 14, startY);
    startY += 6;

    // Build one row per issue type per item
    const issueRows = [];
    for (const item of issueItems) {
      if (item.damaged) {
        const qty = item.damagedQty || '';
        const status = item.damageResolved ? 'Resolved' : item.damageReported ? `Reported ${new Date(item.damageReported).toLocaleDateString()}` : 'NOT REPORTED';
        issueRows.push([item.itemNumber || '', (item.description || '').slice(0, 38), 'Damaged', qty, (item.damageNotes || '').slice(0, 50), status]);
      }
      if (item.missingParts) {
        const qty = item.missingPartsQty || '';
        const status = item.missingPartsResolved ? 'Resolved' : item.missingPartsReported ? `Reported ${new Date(item.missingPartsReported).toLocaleDateString()}` : 'NOT REPORTED';
        issueRows.push([item.itemNumber || '', (item.description || '').slice(0, 38), 'Missing Parts', qty, (item.missingParts || '').slice(0, 50), status]);
      }
      if (item.additionalOrders) {
        const qty = item.additionalOrdersQty || '';
        const status = item.additionalOrdersResolved ? 'Resolved' : item.additionalOrdersReported ? `Reported ${new Date(item.additionalOrdersReported).toLocaleDateString()}` : 'NOT REPORTED';
        issueRows.push([item.itemNumber || '', (item.description || '').slice(0, 38), 'Add. Orders', qty, (item.additionalOrders || '').slice(0, 50), status]);
      }
    }

    doc.autoTable({
      startY,
      head: [['Item #', 'Description', 'Issue Type', 'Qty', 'Details', 'Status']],
      body: issueRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [248, 81, 73], textColor: 255, fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 24 },
        3: { cellWidth: 12 },
        4: { cellWidth: 'auto' },
        5: { cellWidth: 30 },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const footerParts = [preparedBy ? `Prepared by: ${preparedBy}` : null, `Generated by SiteKit — ${new Date().toLocaleString()}`, `Page ${i} of ${pageCount}`].filter(Boolean).join(' — ');
    doc.text(footerParts,
      doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 8, { align: 'center' });
  }

  doc.save(`${job.name || 'report'}-fixtures-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function PhotoImg({ photoId, style }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    api.getPhotoUrl(photoId).then(url => { if (url) setSrc(url); });
  }, [photoId]);
  if (!src) return null;
  return <img src={src} alt="" style={style} />;
}

const CONTRACTOR_KEY = 'sitekit_contractor';

function getContractorInfo() {
  try {
    return JSON.parse(localStorage.getItem(CONTRACTOR_KEY)) || {};
  } catch { return {}; }
}

function saveContractorInfo(info) {
  localStorage.setItem(CONTRACTOR_KEY, JSON.stringify(info));
}

export default function ReportModal({ job, groupBy, onClose, selectedItemIds }) {
  const allItems = job.items || [];
  // If selectedItemIds provided, default to filtering to those; otherwise show all
  const [selectedOnly, setSelectedOnly] = useState(() => !!selectedItemIds && selectedItemIds.size > 0);
  const [issuesOnly, setIssuesOnly] = useState(false);

  const items = React.useMemo(() => {
    let base = allItems;
    if (selectedOnly && selectedItemIds && selectedItemIds.size > 0) {
      base = base.filter(i => selectedItemIds.has(i.id));
    }
    if (issuesOnly) {
      base = base.filter(i => i.damaged || i.missingParts || i.additionalOrders);
    }
    return base;
  }, [allItems, selectedOnly, issuesOnly, selectedItemIds]);

  const received = items.filter(i => getItemStatus(i) === "received").length;
  const partial = items.filter(i => getItemStatus(i) === "partial").length;
  const issues = items.filter(i => getItemStatus(i) === "issue").length;
  const overdue = items.filter(i => getItemStatus(i) === "overdue").length;
  const pending = items.filter(i => getItemStatus(i) === "pending").length;
  const damaged = items.filter(i => i.damaged);
  const missing = items.filter(i => i.missingParts);
  const additional = items.filter(i => i.additionalOrders);
  const overdueItems = items.filter(i => {
    const today = new Date().toISOString().slice(0, 10);
    return i.delDate && i.delDate < today && parseInt(i.qtyReceived || "0") === 0;
  });
  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const [contractor, setContractor] = useState(getContractorInfo);
  const [editContractor, setEditContractor] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [preparedBy, setPreparedBy] = useState(() => {
    const saved = localStorage.getItem('sitekit_prepared_by');
    if (saved) return saved;
    // Auto-fill from contractor profile
    try {
      const profile = JSON.parse(localStorage.getItem('sitekit_contractor_profile') || '{}');
      return profile.name || '';
    } catch { return ''; }
  });

  const handlePreparedByChange = (val) => {
    setPreparedBy(val);
    localStorage.setItem('sitekit_prepared_by', val);
  };

  const handleExportCSV = () => {
    exportCSV(job, items, groupBy);
  };

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      await exportPDF(job, items, groupBy, preparedBy);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const updateContractor = (key, val) => {
    const updated = { ...contractor, [key]: val };
    setContractor(updated);
    saveContractorInfo(updated);
  };

  const grouped = items.reduce((acc, i) => {
    const key = groupBy === "section" ? (i.section || "Ungrouped") : (i.vendor || "Unknown");
    if (!acc[key]) acc[key] = [];
    acc[key].push(i);
    return acc;
  }, {});

  const Row = ({ item, i }) => (
    <div style={{
      display: "grid", gridTemplateColumns: "70px 60px 1fr 50px 50px 75px 85px",
      padding: "7px 12px", borderTop: `1px solid ${C.borderLight}`,
      background: i % 2 === 0 ? C.card : "transparent", fontSize: 11, alignItems: "center"
    }}>
      <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber || "---"}</span>
      <span style={{ ...MF, color: C.muted, fontSize: 10 }}>{item.fixtureBook || "---"}</span>
      <span style={{ color: C.text }}>
        {item.description || "---"}
        {groupBy === "section" && item.vendor && <span style={{ color: C.muted, fontSize: 10, marginLeft: 6 }}>{item.vendor}</span>}
      </span>
      <span style={{ color: C.muted }}>{item.showQtyOrdered !== false ? (item.qtyOrdered || "---") : "---"}</span>
      <span>{item.qtyReceived || "---"}</span>
      <span style={{ color: C.muted }}>{item.dateReceived || "---"}</span>
      <Badge status={getItemStatus(item)} />
    </div>
  );

  return (
    <Modal title={`Report - ${job.name}`} onClose={onClose} width={800}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Contractor Info */}
        <div style={{ padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Contractor Information
            </div>
            <button onClick={() => setEditContractor(e => !e)} style={{
              background: "none", border: "none", color: C.accent,
              cursor: "pointer", fontSize: 11, fontFamily: "inherit"
            }}>
              {editContractor ? "Done" : "Edit"}
            </button>
          </div>
          {editContractor ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Inp label="Name" value={contractor.name || ""} onChange={v => updateContractor("name", v)} placeholder="John Smith" />
              <Inp label="Company" value={contractor.company || ""} onChange={v => updateContractor("company", v)} placeholder="Smith Contracting" />
              <Inp label="Phone" value={contractor.phone || ""} onChange={v => updateContractor("phone", v)} placeholder="(555) 555-1234" />
              <Inp label="Email" value={contractor.email || ""} onChange={v => updateContractor("email", v)} placeholder="john@example.com" />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              {contractor.name || contractor.company ? (
                <>
                  {contractor.name && <span style={{ fontWeight: 700 }}>{contractor.name}</span>}
                  {contractor.company && <span style={{ color: C.muted }}> - {contractor.company}</span>}
                  {(contractor.phone || contractor.email) && (
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {contractor.phone}{contractor.phone && contractor.email ? " | " : ""}{contractor.email}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: C.faint, fontStyle: "italic" }}>Click "Edit" to add contractor info</span>
              )}
            </div>
          )}
        </div>

        {/* Prepared By */}
        <div className="no-print" style={{ padding: "10px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <Inp
            label="Prepared By"
            value={preparedBy}
            onChange={handlePreparedByChange}
            placeholder="Your name..."
          />
        </div>

        {/* Filter toggles */}
        <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {selectedItemIds && selectedItemIds.size > 0 && (
            <button onClick={() => setSelectedOnly(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
              borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
              background: selectedOnly ? C.purpleDim : "transparent",
              color: selectedOnly ? C.purple : C.muted,
              border: `1px solid ${selectedOnly ? C.purpleBorder : C.border}`,
            }}>
              ☑ Selected items only ({selectedItemIds.size})
            </button>
          )}
          <button onClick={() => setIssuesOnly(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
            borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit",
            background: issuesOnly ? C.redDim : "transparent",
            color: issuesOnly ? C.red : C.muted,
            border: `1px solid ${issuesOnly ? C.redBorder : C.border}`,
          }}>
            🔴 Issues only ({allItems.filter(i => i.damaged || i.missingParts || i.additionalOrders).length})
          </button>
          <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>
            Showing {items.length} of {allItems.length} items
          </span>
        </div>

        {/* Report Header + Stats */}
        <div style={{ padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ ...TF, fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 3 }}>
            Fixture & Equipment Receiving Report
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <strong style={{ color: C.text }}>{job.store}</strong> #{job.storeNumber} - {job.location}
            {job.fileRef && <span style={{ ...MF, marginLeft: 10 }}>File: {job.fileRef}</span>}
            <span style={{ marginLeft: 10 }}>{now}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }}>
            {[
              { l: "Total", v: items.length, c: C.text },
              { l: "Received", v: received, c: C.green },
              { l: "Partial", v: partial, c: C.blue },
              { l: "Pending", v: pending, c: C.yellow },
              { l: "Issues", v: issues, c: C.red },
            ].map(s => (
              <div key={s.l} style={{ padding: "9px 13px", background: C.card, borderRadius: 7, textAlign: "center" }}>
                <div style={{ ...TF, fontSize: 26, fontWeight: 700, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Overdue section */}
        {overdueItems.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              🕐 Overdue Items ({overdueItems.length})
            </div>
            {overdueItems.map(item => (
              <div key={item.id} style={{
                padding: "8px 12px", background: C.redDim, border: `1px solid ${C.redBorder}`,
                borderRadius: 6, marginBottom: 6
              }}>
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.description}</span>
                  <span style={{ fontSize: 10, color: C.red, marginLeft: "auto" }}>Due: {item.delDate}</span>
                </div>
                {item.vendor && <div style={{ fontSize: 11, color: C.muted }}>{item.vendor}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Items grouped — hidden when issuesOnly is active */}
        {!issuesOnly && Object.entries(grouped).map(([grp, gitems]) => (
          <div key={grp} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <div style={{
              padding: "6px 12px",
              background: groupBy === "section" ? C.tealDim : C.accentDim,
              borderBottom: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
              fontSize: 10, fontWeight: 700,
              color: groupBy === "section" ? C.teal : C.accent, textTransform: "uppercase"
            }}>
              {groupBy === "section" ? "📂" : "🏭"} {grp}{" "}
              <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", marginLeft: 6 }}>
                ({gitems.length} items)
              </span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "70px 60px 1fr 50px 50px 75px 85px",
              padding: "5px 12px", background: C.bg, fontSize: 9, fontWeight: 700,
              color: C.muted, textTransform: "uppercase"
            }}>
              {["Item #", "Fixt. Bk", "Description", "Ord", "Rec'd", "Date", "Status"].map(h => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {gitems.map((item, i) => <Row key={item.id} item={item} i={i} />)}
          </div>
        ))}

        {/* Missing Parts */}
        {missing.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ⚠ Missing Parts ({missing.length})
            </div>
            {missing.map(item => (
              <div key={item.id} style={{
                padding: "8px 12px", background: C.yellowDim,
                border: `1px solid ${C.yellowBorder}`, borderRadius: 6, marginBottom: 6,
                opacity: item.missingPartsResolved ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", gap: 9, marginBottom: 3, alignItems: "center" }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textDecoration: item.missingPartsResolved ? "line-through" : "none" }}>{item.description}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                    ...(item.missingPartsResolved
                      ? { background: C.greenDim, color: C.green, border: `1px solid ${C.greenBorder}` }
                      : item.missingPartsReported
                        ? { background: C.yellowDim, color: C.yellow, border: `1px solid ${C.yellowBorder}` }
                        : { background: C.redDim, color: C.red, border: `1px solid ${C.redBorder}` })
                  }}>
                    {item.missingPartsResolved ? "Resolved" : item.missingPartsReported ? `Reported ${new Date(item.missingPartsReported).toLocaleDateString()}` : "NOT REPORTED"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{item.missingParts}</div>
              </div>
            ))}
          </div>
        )}

        {/* Additional Orders */}
        {additional.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              📦 Additional Orders ({additional.length})
            </div>
            {additional.map(item => (
              <div key={item.id} style={{
                padding: "8px 12px", background: C.blueDim,
                border: `1px solid ${C.blueBorder}`, borderRadius: 6, marginBottom: 6,
                opacity: item.additionalOrdersResolved ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", gap: 9, marginBottom: 3, alignItems: "center" }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textDecoration: item.additionalOrdersResolved ? "line-through" : "none" }}>{item.description}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                    ...(item.additionalOrdersResolved
                      ? { background: C.greenDim, color: C.green, border: `1px solid ${C.greenBorder}` }
                      : item.additionalOrdersReported
                        ? { background: C.yellowDim, color: C.yellow, border: `1px solid ${C.yellowBorder}` }
                        : { background: C.redDim, color: C.red, border: `1px solid ${C.redBorder}` })
                  }}>
                    {item.additionalOrdersResolved ? "Resolved" : item.additionalOrdersReported ? `Reported ${new Date(item.additionalOrdersReported).toLocaleDateString()}` : "NOT REPORTED"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{item.additionalOrders}</div>
              </div>
            ))}
          </div>
        )}

        {/* Damaged */}
        {damaged.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              🔴 Damaged ({damaged.length})
            </div>
            {damaged.map(item => (
              <div key={item.id} style={{
                padding: "10px 12px", background: C.redDim,
                border: `1px solid ${C.redBorder}`, borderRadius: 6, marginBottom: 6,
                opacity: item.damageResolved ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", gap: 9, marginBottom: 4, alignItems: "center" }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textDecoration: item.damageResolved ? "line-through" : "none" }}>{item.description}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                    ...(item.damageResolved
                      ? { background: C.greenDim, color: C.green, border: `1px solid ${C.greenBorder}` }
                      : item.damageReported
                        ? { background: C.yellowDim, color: C.yellow, border: `1px solid ${C.yellowBorder}` }
                        : { background: C.redDim, color: C.red, border: `1px solid ${C.redBorder}` })
                  }}>
                    {item.damageResolved ? "Resolved" : item.damageReported ? `Reported ${new Date(item.damageReported).toLocaleDateString()}` : "NOT REPORTED"}
                  </span>
                </div>
                {item.damageNotes && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{item.damageNotes}</div>}
                {item.photo_id && (
                  <PhotoImg photoId={item.photo_id} style={{
                    maxWidth: "100%", maxHeight: 150, borderRadius: 6,
                    border: `1px solid ${C.border}`
                  }} />
                )}
              </div>
            ))}
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
        <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn variant="ghost" icon="📄" onClick={handleExportCSV}>CSV</Btn>
          <Btn variant="blue" icon="📑" onClick={handleExportPDF} disabled={pdfLoading}>
            {pdfLoading ? "Generating..." : "PDF"}
          </Btn>
          <Btn variant="orange" icon="🖨" onClick={() => window.print()}>Print</Btn>
        </div>
      </div>
    </Modal>
  );
}
