import React from 'react';
import { C, MF, getItemStatus } from '../tokens';
import { Badge } from './ui';
import { useMobile } from '../hooks/useApi';

function issueIcon(hasIssue, reportedDate, resolvedDate, unreportedEmoji, title) {
  if (!hasIssue) return null;
  if (resolvedDate) return <span title={`${title} — Resolved`} style={{ fontSize: 11 }}>✅</span>;
  if (reportedDate) return <span title={`${title} — Reported`} style={{ fontSize: 11 }}>🟡</span>;
  return <span title={`${title} — Unreported`} style={{ fontSize: 11 }}>{unreportedEmoji}</span>;
}

const ISSUE_BADGE_STYLES = {
  damaged: { color: C.red, bg: C.redDim, border: C.redBorder, label: 'Damaged' },
  missing: { color: C.yellow, bg: C.yellowDim, border: C.yellowBorder, label: 'Missing' },
  additional: { color: C.blue, bg: C.blueDim, border: C.blueBorder, label: 'Need' },
};

function IssueBadge({ type, qty, onClick }) {
  const s = ISSUE_BADGE_STYLES[type];
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
        lineHeight: '16px', display: 'inline-block',
      }}
    >
      {s.label}{qty ? `: ${qty}` : ''}
    </span>
  );
}

export default function ItemRow({ item, onEdit, onQuickReceive, showQtyCol, groupBy, bulkMode, isSelected, onToggleSelect, onIssueBadgeClick }) {
  const status = getItemStatus(item);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = status === "overdue";
  const isToday = item.delDate === today && parseInt(item.qtyReceived || "0") === 0;
  const isMobile = useMobile();

  /* ── Mobile card layout ── */
  if (isMobile) {
    return (
      <div data-testid={`item-row-${item.id}`} onClick={() => onEdit(item)} style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${C.borderLight}`,
        cursor: "pointer",
        background: isOverdue ? "rgba(248,81,73,0.05)" : "transparent",
      }}>
        {/* Row 1: codes + status badge */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          {bulkMode && (
            <div onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
              style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isSelected ? C.accent : C.faint}`,
                background: isSelected ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                minWidth: 20, flexShrink: 0 }}>
              {isSelected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
            </div>
          )}
          <span style={{ ...MF, color: C.accent, fontSize: 11, fontWeight: 600 }}>{item.itemNumber || "---"}</span>
          {item.materialClass && <span style={{ ...MF, fontSize: 9, color: C.faint }}>· {item.materialClass}</span>}
          {item.fixtureBook && <span style={{ ...MF, fontSize: 9, color: C.muted }}>· {item.fixtureBook}</span>}
          <div style={{ marginLeft: "auto" }}>
            <Badge status={status} />
          </div>
        </div>

        {/* Row 2: description */}
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>
          {item.description || "No description"}
        </div>

        {/* Row 3: quantities + date + flags */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: C.muted }}>
          {showQtyCol && <span>Ord: {item.qtyOrdered || "---"}</span>}
          <span>Rec: {item.qtyReceived || "---"}</span>
          {item.delDate && <span>{isToday ? <span style={{color: C.blue, fontWeight: 700}}>TODAY</span> : item.delDate}</span>}
          <div style={{ display: "flex", gap: 3, marginLeft: "auto", alignItems: "center" }}>
            {issueIcon(item.damaged, item.damageReported, item.damageResolved, '🔴', 'Damaged')}
            {issueIcon(item.missingParts, item.missingPartsReported, item.missingPartsResolved, '⚠️', 'Missing Parts')}
            {issueIcon(item.additionalOrders, item.additionalOrdersReported, item.additionalOrdersResolved, '📦', 'Additional Orders')}
            {item.hasPhoto && <span>📷</span>}
          </div>
        </div>

        {/* Issue qty badges (mobile) */}
        {(item.damaged || item.missingParts || item.additionalOrders) && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {item.damaged && (
              <IssueBadge type="damaged" qty={item.damagedQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'damaged'); } : undefined} />
            )}
            {item.missingParts && (
              <IssueBadge type="missing" qty={item.missingPartsQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'missing'); } : undefined} />
            )}
            {item.additionalOrders && (
              <IssueBadge type="additional" qty={item.additionalOrdersQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'additional'); } : undefined} />
            )}
          </div>
        )}

        {/* Section/vendor context */}
        {groupBy === "vendor" && item.section && (
          <div style={{ fontSize: 10, color: C.teal, marginTop: 3 }}>§ {item.section}</div>
        )}
        {groupBy === "section" && item.vendor && (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{item.vendor}</div>
        )}
      </div>
    );
  }

  /* ── Desktop grid layout ── */
  const cols = showQtyCol
    ? "60px 55px 90px 1fr 60px 60px 75px 85px 95px"
    : "60px 55px 90px 1fr 60px 75px 85px 95px";

  // If bulk mode, prepend a checkbox column
  const gridCols = bulkMode ? `36px ${cols}` : cols;

  return (
    <div
      data-testid={`item-row-${item.id}`}
      onClick={() => onEdit(item)}
      style={{
        display: "grid", gridTemplateColumns: gridCols,
        padding: "0 14px", minHeight: 44, alignItems: "center",
        borderBottom: `1px solid ${C.borderLight}`,
        cursor: "pointer", transition: "background 0.1s",
        background: isOverdue ? "rgba(248,81,73,0.05)" : "transparent",
      }}
      onMouseEnter={e => e.currentTarget.style.background = isOverdue ? "rgba(248,81,73,0.1)" : C.cardHover}
      onMouseLeave={e => e.currentTarget.style.background = isOverdue ? "rgba(248,81,73,0.05)" : "transparent"}
    >
      {/* Bulk checkbox */}
      {bulkMode && (
        <div onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4,
            border: `2px solid ${isSelected ? C.accent : C.faint}`,
            background: isSelected ? C.accent : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", minWidth: 18
          }}>
            {isSelected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
          </div>
        </div>
      )}

      {/* Item # */}
      <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber || "---"}</span>

      {/* Class */}
      <span style={{ ...MF, fontSize: 9, color: C.faint }}>{item.materialClass || "---"}</span>

      {/* Fixture Book */}
      <span style={{ ...MF, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.fixtureBook || "---"}
      </span>

      {/* Description */}
      <span style={{ fontSize: 12, color: C.text, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.description}
        {groupBy === "section" && item.vendor && (
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 7 }}>{item.vendor}</span>
        )}
        {groupBy === "vendor" && item.section && (
          <span style={{ fontSize: 10, color: C.teal, marginLeft: 7 }}>§ {item.section}</span>
        )}
      </span>

      {/* Ordered qty */}
      {showQtyCol && (
        <span style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
          {item.showQtyOrdered !== false ? (item.qtyOrdered || "---") : "---"}
        </span>
      )}

      {/* Received qty */}
      <span style={{ fontSize: 11, textAlign: "center" }}>{item.qtyReceived || "---"}</span>

      {/* Delivery date */}
      <span style={{ fontSize: 10, color: isOverdue ? C.red : C.muted, display: "flex", alignItems: "center", gap: 3 }}>
        {isOverdue && <span style={{ fontSize: 11 }}>🕐</span>}
        {item.delDate || "---"}
        {isToday && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px",
            borderRadius: 4, background: C.blueDim, border: `1px solid ${C.blueBorder}`,
            color: C.blue, marginLeft: 2
          }}>TODAY</span>
        )}
      </span>

      {/* Flags + issue qty badges */}
      <span style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
        {item.damaged && (
          <IssueBadge type="damaged" qty={item.damagedQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'damaged'); } : undefined} />
        )}
        {item.missingParts && (
          <IssueBadge type="missing" qty={item.missingPartsQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'missing'); } : undefined} />
        )}
        {item.additionalOrders && (
          <IssueBadge type="additional" qty={item.additionalOrdersQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'additional'); } : undefined} />
        )}
        {item.hasPhoto && <span style={{ fontSize: 11 }}>📷</span>}
      </span>

      {/* Status badge */}
      <Badge status={status} />
    </div>
  );
}
