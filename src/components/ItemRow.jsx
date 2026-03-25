import React from 'react';
import { C, MF, getItemStatus } from '../tokens';
import { Badge } from './ui';

export default function ItemRow({ item, onEdit, onQuickReceive, showQtyCol, groupBy, bulkMode, isSelected, onToggleSelect }) {
  const status = getItemStatus(item);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = status === "overdue";
  const isToday = item.delDate === today && parseInt(item.qtyReceived || "0") === 0;

  const cols = showQtyCol
    ? "60px 55px 90px 1fr 60px 60px 75px 85px 95px"
    : "60px 55px 90px 1fr 60px 75px 85px 95px";

  // If bulk mode, prepend a checkbox column
  const gridCols = bulkMode ? `36px ${cols}` : cols;

  return (
    <div
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

      {/* Flags */}
      <span style={{ display: "flex", gap: 3 }}>
        {item.damaged && <span style={{ fontSize: 11 }}>🔴</span>}
        {item.missingParts && <span style={{ fontSize: 11 }}>⚠️</span>}
        {item.additionalOrders && <span style={{ fontSize: 11 }}>📦</span>}
        {item.hasPhoto && <span style={{ fontSize: 11 }}>📷</span>}
      </span>

      {/* Status badge */}
      <Badge status={status} />
    </div>
  );
}
