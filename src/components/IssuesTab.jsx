import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { C, TF, MF } from '../tokens';
import { Btn } from './ui';
import { useMobile } from '../hooks/useApi';
import { api } from '../api';
import { useToast } from './Toast';
import { haptic } from '../utils/haptic';

// ─── Status helpers ──────────────────────────────────────────────────────────

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

// ─── Share helpers ───────────────────────────────────────────────────────────

async function shareText(title, body) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: body });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(body); } catch {}
        return true;
      }
      return false;
    }
  } else {
    try { await navigator.clipboard.writeText(body); return true; } catch { return false; }
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

// ─── Issue row component ─────────────────────────────────────────────────────

function IssueRow({ item, issueType, details, qty, status, reportedDate, resolvedDate, job, onUpdate, isMobile }) {
  const { toast } = useToast();
  const [localQty, setLocalQty] = useState(qty || '');
  const [savedIndicator, setSavedIndicator] = useState(false);

  const qtyField = issueType === 'missing' ? 'missingPartsQty'
    : issueType === 'order' ? 'additionalOrdersQty'
    : 'damagedQty';

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
      // Also mark reported on share
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
    <div style={{
      padding: isMobile ? '10px 12px' : '10px 16px',
      background: C.card,
      borderRadius: 8,
      border: `1px solid ${C.borderLight}`,
      marginBottom: 6,
      opacity: status === 'resolved' ? 0.6 : 1,
    }}>
      {/* Item info row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        flexWrap: 'wrap', marginBottom: 6,
      }}>
        <span style={{ ...MF, color: C.accent, fontSize: 11, fontWeight: 700 }}>
          {item.itemNumber || '---'}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: C.text, flex: 1, minWidth: 100,
          textDecoration: status === 'resolved' ? 'line-through' : 'none',
        }}>
          {item.description || '---'}
        </span>
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
          {savedIndicator && (
            <span style={{ fontSize: 9, color: C.green, fontWeight: 700 }}>Saved</span>
          )}
        </span>
        {item.section && (
          <span style={{ fontSize: 10, color: C.faint }}>
            {item.section}
          </span>
        )}
        <StatusBadge
          status={status}
          date={resolvedDate || reportedDate}
        />
      </div>

      {/* Issue details */}
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
        {details}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
    </div>
  );
}

// ─── Section component ───────────────────────────────────────────────────────

function IssueSection({ title, icon, color, colorDim, colorBorder, issues, job, onUpdate, isMobile, showOnlyUnreported }) {
  const filtered = showOnlyUnreported
    ? issues.filter(i => i.status === 'unreported')
    : issues;

  if (filtered.length === 0) return null;

  const unreported = issues.filter(i => i.status === 'unreported').length;
  const reported = issues.filter(i => i.status === 'reported').length;
  const resolved = issues.filter(i => i.status === 'resolved').length;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', marginBottom: 8,
        background: colorDim, borderRadius: 8,
        border: `1px solid ${colorBorder}`,
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

      {/* Issue rows */}
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
        />
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function IssuesTab({ job, onRefresh }) {
  const { toast } = useToast();
  const isMobile = useMobile();
  const [showOnlyUnreported, setShowOnlyUnreported] = useState(false);

  const items = job.items || [];

  // Build flat issue list from all items
  const allIssues = useMemo(() => {
    const issues = { missing: [], damage: [], orders: [] };

    for (const item of items) {
      if (item.missingParts) {
        issues.missing.push({
          item,
          type: 'missing',
          details: item.missingParts,
          qty: item.missingPartsQty,
          status: getIssueStatus(item.missingPartsReported, item.missingPartsResolved),
          reportedDate: item.missingPartsReported,
          resolvedDate: item.missingPartsResolved,
        });
      }
      if (item.damaged) {
        issues.damage.push({
          item,
          type: 'damage',
          details: item.damageNotes || 'Marked as damaged',
          qty: item.damagedQty,
          status: getIssueStatus(item.damageReported, item.damageResolved),
          reportedDate: item.damageReported,
          resolvedDate: item.damageResolved,
        });
      }
      if (item.additionalOrders) {
        issues.orders.push({
          item,
          type: 'order',
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

  // Unreported items for Share All
  const unreportedItems = useMemo(() => {
    return items.filter(i => {
      const hasMissing = i.missingParts && !i.missingPartsReported;
      const hasOrder = i.additionalOrders && !i.additionalOrdersReported;
      const hasDamage = i.damaged && !i.damageReported;
      return hasMissing || hasOrder || hasDamage;
    });
  }, [items]);

  // Share all unreported — same pattern as FixturesTab
  const handleShareAllUnreported = useCallback(async () => {
    if (unreportedItems.length === 0) return;
    const header = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber} | Date: ${new Date().toLocaleDateString()}\n`;
    let body = header;

    const missingItems = unreportedItems.filter(i => i.missingParts && !i.missingPartsReported);
    const damagedItems = unreportedItems.filter(i => i.damaged && !i.damageReported);
    const orderItems = unreportedItems.filter(i => i.additionalOrders && !i.additionalOrdersReported);

    if (missingItems.length > 0) {
      body += `\nMISSING PARTS (${missingItems.length} item${missingItems.length > 1 ? 's' : ''}):\n`;
      for (const i of missingItems) {
        const qtyTag = i.missingPartsQty ? ` (Qty: ${i.missingPartsQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${qtyTag} — ${i.missingParts}\n`;
      }
    }
    if (damagedItems.length > 0) {
      body += `\nDAMAGED (${damagedItems.length} item${damagedItems.length > 1 ? 's' : ''}):\n`;
      for (const i of damagedItems) {
        const qtyTag = i.damagedQty ? ` (Qty: ${i.damagedQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${qtyTag} — ${i.damageNotes || 'see photo'}\n`;
      }
    }
    if (orderItems.length > 0) {
      body += `\nADDITIONAL ORDERS NEEDED (${orderItems.length} item${orderItems.length > 1 ? 's' : ''}):\n`;
      for (const i of orderItems) {
        const qtyTag = i.additionalOrdersQty ? ` (Qty: ${i.additionalOrdersQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${qtyTag} — ${i.additionalOrders}\n`;
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar: stats + actions */}
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

        {/* Action bar */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* Filter toggle */}
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

          {/* Share All Unreported */}
          {stats.unreported > 0 && (
            <Btn variant="danger" size="sm" icon="📤" onClick={handleShareAllUnreported}
              style={{ marginLeft: isMobile ? 0 : 'auto' }}>
              Share All Unreported ({stats.unreported})
            </Btn>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 14px' : '16px 22px' }}>

        {/* Missing Parts section */}
        <IssueSection
          title="Missing Parts"
          icon="⚠"
          color={C.yellow}
          colorDim={C.yellowDim}
          colorBorder={C.yellowBorder}
          issues={allIssues.missing}
          job={job}
          onUpdate={onRefresh}
          isMobile={isMobile}
          showOnlyUnreported={showOnlyUnreported}
        />

        {/* Damage section */}
        <IssueSection
          title="Damage"
          icon="🔴"
          color={C.red}
          colorDim={C.redDim}
          colorBorder={C.redBorder}
          issues={allIssues.damage}
          job={job}
          onUpdate={onRefresh}
          isMobile={isMobile}
          showOnlyUnreported={showOnlyUnreported}
        />

        {/* Additional Orders section */}
        <IssueSection
          title="Additional Orders"
          icon="📦"
          color={C.blue}
          colorDim={C.blueDim}
          colorBorder={C.blueBorder}
          issues={allIssues.orders}
          job={job}
          onUpdate={onRefresh}
          isMobile={isMobile}
          showOnlyUnreported={showOnlyUnreported}
        />

        {/* All filtered out message */}
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
      </div>
    </div>
  );
}
