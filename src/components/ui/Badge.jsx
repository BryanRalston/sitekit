import React from 'react';
import { STATUS } from '../../tokens';

export default function Badge({ status }) {
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px",
      borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`,
      color: s.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      whiteSpace: "nowrap"
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}
