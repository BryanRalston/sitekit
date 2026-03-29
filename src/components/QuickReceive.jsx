import React, { useState } from 'react';
import { C, MF } from '../tokens';
import { Btn } from './ui';
import { haptic } from '../utils/haptic';

export default function QuickReceive({ item, onSave, onCancel, onOpenModal }) {
  const [qty, setQty] = useState(item.qtyReceived || item.qtyOrdered || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const hasIssues = !!(item.missingParts || item.damaged || item.additionalOrders);

  const handleSave = () => {
    haptic();
    onSave({
      qtyReceived: parseInt(qty) || 0,
      dateReceived: date,
    });
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 0,
      background: C.greenDim, borderBottom: `1px solid ${C.greenBorder}`,
    }} className="fade-in">
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        flexWrap: "wrap"
      }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...MF, fontSize: 10, color: C.accent }}>{item.itemNumber || "---"}</span>
          <span style={{
            fontSize: 12, color: C.text, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200
          }}>
            {item.description || "Untitled"}
          </span>
          {item.qtyOrdered && (
            <span style={{ fontSize: 10, color: C.muted }}>
              (Ord: {item.qtyOrdered})
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: "uppercase" }}>Qty:</label>
          <input
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            autoFocus
            style={{
              width: 70, background: C.bg, border: `1px solid ${C.greenBorder}`,
              borderRadius: 6, color: C.text, padding: "6px 10px",
              fontSize: 14, fontWeight: 700, outline: "none", textAlign: "center",
              minHeight: 44, ...MF
            }}
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel(); }}
          />

          <label style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: "uppercase" }}>Date:</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              background: C.bg, border: `1px solid ${C.greenBorder}`,
              borderRadius: 6, color: C.text, padding: "6px 10px",
              fontSize: 12, outline: "none", minHeight: 44
            }}
          />

          <Btn variant="green" size="sm" onClick={handleSave}>Save</Btn>
          <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
        </div>
      </div>

      {/* Issue warning */}
      {hasIssues && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 8px",
          borderTop: `1px solid ${C.yellowBorder}`, background: C.yellowDim,
        }}>
          <span style={{ fontSize: 11, color: C.yellow, fontWeight: 600 }}>
            ⚠ This item has issues
          </span>
          <span style={{ fontSize: 10, color: C.muted }}>
            {[
              item.missingParts && "missing parts",
              item.damaged && "damage",
              item.additionalOrders && "additional orders"
            ].filter(Boolean).join(", ")}
          </span>
          {onOpenModal && (
            <button onClick={onOpenModal} style={{
              background: "transparent", border: `1px solid ${C.yellowBorder}`,
              borderRadius: 6, color: C.yellow, fontSize: 10, fontWeight: 600,
              padding: "3px 10px", cursor: "pointer", fontFamily: "inherit",
              marginLeft: "auto", minHeight: 30,
            }}>
              Open Full Details
            </button>
          )}
        </div>
      )}
    </div>
  );
}
