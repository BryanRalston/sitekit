import React from 'react';
import { C, TF } from '../../tokens';

export default function Modal({ title, onClose, children, width = 600, noPad }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      backdropFilter: "blur(5px)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 200, padding: 16
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth: width, maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 30px 70px rgba(0,0,0,0.65)"
      }} className="fade-in">
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "15px 22px", borderBottom: `1px solid ${C.border}`, flexShrink: 0
        }}>
          <h2 style={{ ...TF, fontSize: 20, fontWeight: 700, color: C.text }}>{title}</h2>
          <button data-testid="modal-close" onClick={onClose} style={{
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: 20, minWidth: 44, minHeight: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", zIndex: 10
          }}>
            ✕
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, ...(noPad ? {} : { padding: 22 }) }}>
          {children}
        </div>
      </div>
    </div>
  );
}
