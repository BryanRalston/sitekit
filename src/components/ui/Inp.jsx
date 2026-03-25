import React from 'react';
import { C, MF } from '../../tokens';

export default function Inp({ label, value, onChange, type = "text", placeholder, mono, multiline, rows = 3, lc, style: sty, autoFocus }) {
  const base = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, padding: "8px 12px", fontSize: 13, outline: "none",
    transition: "border 0.15s", minHeight: 44,
    ...(mono ? MF : {}), ...sty
  };
  const fo = e => e.target.style.borderColor = C.accent;
  const bl = e => e.target.style.borderColor = C.border;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{
          fontSize: 10, fontWeight: 700, color: lc || C.muted,
          letterSpacing: "0.09em", textTransform: "uppercase"
        }}>
          {label}
        </label>
      )}
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            rows={rows} style={{ ...base, resize: "vertical" }} onFocus={fo} onBlur={bl} autoFocus={autoFocus} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={base} onFocus={fo} onBlur={bl} autoFocus={autoFocus} />}
    </div>
  );
}
