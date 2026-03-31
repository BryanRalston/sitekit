// ─── Design Tokens ────────────────────────────────────────────────────────────
export const C = {
  bg: "#0d1117",
  sidebar: "#161c27",
  card: "#1c2333",
  cardHover: "#212d40",
  border: "#30363d",
  borderLight: "#21262d",
  faint: "#5a6370",
  text: "#e6edf3",
  muted: "#9da5ae",
  accent: "#f97316",
  accentDim: "rgba(249,115,22,0.13)",
  accentBorder: "rgba(249,115,22,0.35)",
  blue: "#58a6ff",
  blueDim: "rgba(88,166,255,0.12)",
  blueBorder: "rgba(88,166,255,0.3)",
  green: "#3fb950",
  greenDim: "rgba(63,185,80,0.12)",
  greenBorder: "rgba(63,185,80,0.3)",
  red: "#f85149",
  redDim: "rgba(248,81,73,0.12)",
  redBorder: "rgba(248,81,73,0.3)",
  yellow: "#d29922",
  yellowDim: "rgba(210,153,34,0.12)",
  yellowBorder: "rgba(210,153,34,0.3)",
  purple: "#a78bfa",
  purpleDim: "rgba(167,139,250,0.12)",
  purpleBorder: "rgba(167,139,250,0.3)",
  teal: "#2dd4bf",
  tealDim: "rgba(45,212,191,0.12)",
  tealBorder: "rgba(45,212,191,0.3)",
  sectionLabel: "#8b949e",
  subtleBg: "rgba(255,255,255,0.03)",
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
  "#f97316", "#58a6ff", "#3fb950", "#a78bfa", "#f472b6",
  "#34d399", "#60a5fa", "#fbbf24", "#e879f9", "#fb923c",
];

export const ROLE_COLORS = {
  Lead:       { color: C.purple,  bg: C.purpleDim,  border: C.purpleBorder },
  Journeyman: { color: C.blue,   bg: C.blueDim,    border: C.blueBorder },
  Helper:     { color: C.teal,   bg: C.tealDim,    border: C.tealBorder },
  Apprentice: { color: C.accent, bg: C.accentDim,  border: C.accentBorder },
  Other:      { color: C.muted,  bg: 'rgba(157,165,174,0.12)', border: 'rgba(157,165,174,0.3)' },
};

export function getItemStatus(item) {
  if (item.damaged || item.missingParts) return "issue";
  const rec = parseInt(item.qtyReceived || "0");
  const ord = parseInt(item.qtyOrdered || "0");
  if (rec > 0 && ord > 0 && rec >= ord) return "received";
  if (rec > 0) return "partial";
  // Check overdue: has delivery date in the past, nothing received
  if (item.delDate && rec === 0) {
    const today = new Date().toISOString().slice(0, 10);
    if (item.delDate < today) return "overdue";
  }
  return "pending";
}
