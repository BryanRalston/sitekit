import React from 'react';
import { C } from '../../tokens';

export default function Toggle({ checked, onChange, label, right, ...rest }) {
  const handleClick = (e) => {
    e.stopPropagation();
    onChange(!checked);
  };

  return (
    <label {...rest} onClick={handleClick} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minHeight: 44 }}>
      {!right && label && <span style={{ fontSize: 12, color: C.muted }}>{label}</span>}
      <div style={{
        width: 32, height: 17, borderRadius: 9, position: "relative",
        cursor: "pointer", flexShrink: 0,
        background: checked ? C.accent : C.faint, transition: "background 0.2s"
      }}>
        <div style={{
          position: "absolute", top: 2.5, left: checked ? 16.5 : 2.5,
          width: 12, height: 12, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)"
        }} />
      </div>
      {right && label && <span style={{ fontSize: 12, color: C.muted }}>{label}</span>}
    </label>
  );
}
