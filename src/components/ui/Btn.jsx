import React from 'react';
import { C } from '../../tokens';

export default function Btn({ children, onClick, variant = "primary", size = "md", disabled, icon, full, style: sty }) {
  const V = {
    primary: { background: C.accent, color: "#1a1a1a", border: "none" },
    ghost:   { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
    danger:  { background: "transparent", color: C.red, border: `1px solid ${C.redBorder}` },
    orange:  { background: C.accentDim, color: C.accent, border: `1px solid ${C.accentBorder}` },
    green:   { background: C.greenDim, color: C.green, border: `1px solid ${C.greenBorder}` },
    blue:    { background: C.blueDim, color: C.blue, border: `1px solid ${C.blueBorder}` },
    purple:  { background: C.purpleDim, color: C.purple, border: `1px solid ${C.purpleBorder}` },
    teal:    { background: C.tealDim, color: C.teal, border: `1px solid ${C.tealBorder}` },
  };
  const S = {
    sm: { padding: "4px 10px", fontSize: 11 },
    md: { padding: "7px 15px", fontSize: 13 },
    lg: { padding: "10px 22px", fontSize: 14 },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      cursor: disabled ? "not-allowed" : "pointer",
      borderRadius: 6, fontWeight: 600, transition: "opacity 0.15s",
      opacity: disabled ? 0.45 : 1,
      width: full ? "100%" : undefined,
      justifyContent: full ? "center" : undefined,
      minHeight: 44,
      ...V[variant], ...S[size], ...sty
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = "0.8"; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = "1"; }}>
      {icon && <span style={{ fontSize: size === "sm" ? 12 : 15 }}>{icon}</span>}
      {children}
    </button>
  );
}
