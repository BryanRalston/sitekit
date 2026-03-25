/**
 * Shared crew utilities — used by CrewTab, CrewCard, and WeekSummary.
 * Single source of truth for formatting helpers.
 */

/** Format decimal hours to HH:MM display (e.g. 7.5 -> "7:30") */
export function fmtHours(h) {
  if (h == null || isNaN(h)) return '0:00';
  let hrs = Math.floor(Math.abs(h));
  let mins = Math.round((Math.abs(h) - hrs) * 60);
  if (mins === 60) { mins = 0; hrs += 1; }
  const sign = h < 0 ? '-' : '';
  return `${sign}${hrs}:${mins.toString().padStart(2, '0')}`;
}

/** Format balance with sign (e.g. 1.5 -> "+1:30") */
export function fmtBalance(b) {
  if (b == null || isNaN(b)) return '';
  const sign = b > 0 ? '+' : '';
  return sign + fmtHours(b);
}

/** Pick initial from name (e.g. "Mike" -> "M") */
export function getInitial(name) {
  return name ? name.charAt(0).toUpperCase() : '?';
}
