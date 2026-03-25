import React, { useState } from 'react';
import { C, MF } from '../tokens';
import { Btn } from './ui';

export default function QuickReceive({ item, onSave, onCancel }) {
  const [qty, setQty] = useState(item.qtyReceived || item.qtyOrdered || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSave = () => {
    onSave({
      qty_received: parseInt(qty) || 0,
      date_received: date,
    });
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      background: C.greenDim, borderBottom: `1px solid ${C.greenBorder}`,
      flexWrap: "wrap"
    }} className="fade-in">
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
  );
}
