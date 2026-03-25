import React, { useState } from 'react';
import { C, MF, getItemStatus } from '../tokens';
import { Modal, Btn, Badge } from './ui';

export default function FixturePicker({ allItems, linkedIds, onToggle, onClose }) {
  const [q, setQ] = useState("");
  const filtered = allItems.filter(i => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (i.itemNumber || "").toLowerCase().includes(ql)
      || (i.description || "").toLowerCase().includes(ql)
      || (i.vendor || "").toLowerCase().includes(ql)
      || (i.fixtureBook || "").toLowerCase().includes(ql)
      || (i.section || "").toLowerCase().includes(ql);
  });

  return (
    <Modal title="Link Fixture Items" onClose={onClose} width={580}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 14 }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search item #, description, vendor, section, fixture book..."
            autoFocus
            style={{
              width: "100%", background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.text, padding: "8px 12px 8px 34px",
              fontSize: 13, outline: "none", minHeight: 44
            }}
            onFocus={e => e.target.style.borderColor = C.accent}
            onBlur={e => e.target.style.borderColor = C.border} />
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>{linkedIds.length} linked · {filtered.length} shown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 380, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No fixtures match</div>
          )}
          {filtered.map(item => {
            const linked = linkedIds.includes(item.id);
            return (
              <div key={item.id} onClick={() => onToggle(item.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
                borderRadius: 7, cursor: "pointer", minHeight: 44,
                background: linked ? C.accentDim : "transparent",
                border: `1px solid ${linked ? C.accentBorder : "transparent"}`,
                transition: "all 0.12s"
              }}
                onMouseEnter={e => { if (!linked) e.currentTarget.style.background = C.cardHover; }}
                onMouseLeave={e => { if (!linked) e.currentTarget.style.background = "transparent"; }}>
                <div style={{
                  width: 17, height: 17, borderRadius: 4,
                  border: `2px solid ${linked ? C.accent : C.faint}`,
                  background: linked ? C.accent : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                  {linked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ ...MF, fontSize: 11, color: C.accent }}>{item.itemNumber || "---"}</span>
                    <span style={{
                      fontSize: 13, color: C.text, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {item.description || "Unnamed"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 1, display: "flex", gap: 10 }}>
                    {item.vendor && <span>{item.vendor}</span>}
                    {item.fixtureBook && <span>Book: {item.fixtureBook}</span>}
                    {item.section && <span style={{ color: C.teal }}>§ {item.section}</span>}
                  </div>
                </div>
                <Badge status={getItemStatus(item)} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="primary" onClick={onClose}>Done</Btn>
        </div>
      </div>
    </Modal>
  );
}
