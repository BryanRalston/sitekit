// ─── Design Tokens — Light Mode ──────────────────────────────────────────────
export const C = {
  bg: "#f5f6f8",
  sidebar: "#ffffff",
  card: "#ffffff",
  cardHover: "#f0f1f3",
  border: "#d8dde4",
  borderLight: "#e8ecf0",
  faint: "#9ca3af",
  text: "#1f2937",
  muted: "#6b7280",
  accent: "#ea580c",
  accentDim: "rgba(234,88,12,0.08)",
  accentBorder: "rgba(234,88,12,0.25)",
  blue: "#2563eb",
  blueDim: "rgba(37,99,235,0.08)",
  blueBorder: "rgba(37,99,235,0.2)",
  green: "#16a34a",
  greenDim: "rgba(22,163,74,0.08)",
  greenBorder: "rgba(22,163,74,0.2)",
  red: "#dc2626",
  redDim: "rgba(220,38,38,0.08)",
  redBorder: "rgba(220,38,38,0.2)",
  yellow: "#ca8a04",
  yellowDim: "rgba(202,138,4,0.08)",
  yellowBorder: "rgba(202,138,4,0.2)",
  purple: "#7c3aed",
  purpleDim: "rgba(124,58,237,0.08)",
  purpleBorder: "rgba(124,58,237,0.2)",
  teal: "#0d9488",
  tealDim: "rgba(13,148,136,0.08)",
  tealBorder: "rgba(13,148,136,0.2)",
  sectionLabel: "#6b7280",
  subtleBg: "rgba(0,0,0,0.02)",
};

export const TF = { fontFamily: "'Rajdhani', sans-serif" };
export const MF = { fontFamily: "'JetBrains Mono', monospace" };

export const STATUS = {
  pending:  { label: "Pending",  color: C.yellow, bg: C.yellowDim, border: C.yellowBorder },
  received: { label: "Received", color: C.green,  bg: C.greenDim,  border: C.greenBorder },
  partial:  { label: "Partial",  color: C.blue,   bg: C.blueDim,   border: C.blueBorder },
  issue:    { label: "Issue",    color: C.red,    bg: C.redDim,    border: C.redBorder },
  overdue:  { label: "Overdue",  color: C.red,    bg: C.redDim,    border: C.redBorder },
};

export const DEPT_COLORS = [
  "#ea580c", "#2563eb", "#16a34a", "#7c3aed", "#db2777",
  "#0d9488", "#3b82f6", "#ca8a04", "#c026d3", "#f97316",
];

export const ROLE_COLORS = {
  Lead:       { color: C.purple,  bg: C.purpleDim,  border: C.purpleBorder },
  Journeyman: { color: C.blue,   bg: C.blueDim,    border: C.blueBorder },
  Helper:     { color: C.teal,   bg: C.tealDim,    border: C.tealBorder },
  Apprentice: { color: C.accent, bg: C.accentDim,  border: C.accentBorder },
  Other:      { color: C.muted,  bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)' },
};

export function getItemStatus(item) {
  if (item.damaged || item.missingParts) return "issue";
  const rec = parseInt(item.qtyReceived || "0");
  const ord = parseInt(item.qtyOrdered || "0");
  if (rec > 0 && ord > 0 && rec >= ord) return "received";
  if (rec > 0) return "partial";
  if (item.delDate && rec === 0) {
    const today = new Date().toISOString().slice(0, 10);
    if (item.delDate < today) return "overdue";
  }
  return "pending";
}
