import React, { useState, useEffect, useRef } from 'react';
import { C, MF, ROLE_COLORS } from '../tokens';
import { Btn, Inp } from './ui';
import { fmtHours, fmtBalance, getInitial } from '../utils/crew';

export default function CrewCard({
  member,
  entry,       // time entry for this day (may be null)
  activeClock, // active clock record (may be null)
  dailyTarget,
  onClockIn,
  onClockOut,
  onSaveEntry,
  onClearEntry,
  isMobile,
}) {
  const [expanded, setExpanded] = useState(false);
  const [manualHours, setManualHours] = useState('');
  const [notes, setNotes] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  const hours = entry ? parseFloat(entry.hours) || 0 : 0;
  const balance = hours - (dailyTarget || 8);
  const isClockedIn = !!activeClock;

  // Load entry values when entry changes
  useEffect(() => {
    setManualHours(entry ? String(entry.hours || '') : '');
    setNotes(entry?.notes || '');
  }, [entry?.id, entry?.hours, entry?.notes]);

  // Live elapsed timer for active clock
  useEffect(() => {
    if (!isClockedIn) { setElapsed(0); return; }
    const tick = () => {
      const start = new Date(activeClock.clockIn).getTime();
      setElapsed((Date.now() - start) / 1000 / 3600); // hours
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [isClockedIn, activeClock?.clockIn]);

  const roleStyle = ROLE_COLORS[member.role] || ROLE_COLORS.Other;

  const balanceColor = hours === 0 && !isClockedIn
    ? C.muted
    : balance > 0 ? C.green
    : balance < 0 ? C.red
    : C.accent;

  const handleSave = () => {
    const h = parseFloat(manualHours);
    if (isNaN(h) || h < 0) return;
    onSaveEntry(member.id, h, notes);
  };

  return (
    <div style={{
      background: C.card,
      borderRadius: 10,
      border: `1px solid ${isClockedIn ? C.greenBorder : C.borderLight}`,
      marginBottom: 8,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
          background: 'transparent', border: 'none', fontFamily: 'inherit',
          textAlign: 'left', minHeight: 52,
        }}
      >
        {/* Initial circle */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: member.color || C.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {getInitial(member.name)}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.name}
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '1px 7px', borderRadius: 12, fontSize: 9, fontWeight: 700,
            background: roleStyle.bg, color: roleStyle.color,
            border: `1px solid ${roleStyle.border}`, whiteSpace: 'nowrap',
            marginTop: 2,
          }}>
            {member.role || 'Other'}
          </span>
        </div>

        {/* Clock / hours display */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {isClockedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: C.green,
                boxShadow: `0 0 6px ${C.green}`,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <span style={{ ...MF, fontSize: 18, fontWeight: 700, color: C.green }}>
                {fmtHours(elapsed)}
              </span>
            </div>
          ) : (
            <div>
              <span style={{ ...MF, fontSize: 18, fontWeight: 700, color: balanceColor }}>
                {fmtHours(hours)}
              </span>
              {hours > 0 && (
                <div style={{ ...MF, fontSize: 10, color: balanceColor, marginTop: 1 }}>
                  {fmtBalance(balance)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expand chevron */}
        <span style={{
          fontSize: 11, color: C.muted, transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
          flexShrink: 0,
        }}>
          ▼
        </span>
      </button>

      {/* Expanded section */}
      {expanded && (
        <div style={{
          padding: '0 14px 14px',
          borderTop: `1px solid ${C.borderLight}`,
          display: 'flex', flexDirection: 'column', gap: 10,
          paddingTop: 12,
        }}>
          {/* Clock buttons */}
          {isClockedIn ? (
            <Btn variant="danger" size="md" full onClick={() => onClockOut(member.id)}
              style={{ minHeight: 48, justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
              Clock Out
            </Btn>
          ) : (
            <Btn variant="green" size="md" full onClick={() => onClockIn(member.id)}
              style={{ minHeight: 48, justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
              Clock In
            </Btn>
          )}

          {/* Manual hours input */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Inp
                label="Hours"
                type="number"
                value={manualHours}
                onChange={setManualHours}
                placeholder="8.0"
                mono
                style={{ textAlign: 'center', fontSize: 16, fontWeight: 700 }}
              />
            </div>
          </div>

          {/* Notes */}
          <Inp
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Optional notes..."
          />

          {/* Save / Clear */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="primary" size="sm" full onClick={handleSave}>
              Save
            </Btn>
            {entry && (
              <Btn variant="ghost" size="sm" onClick={() => onClearEntry(member.id)}>
                Clear
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* Pulse animation keyframes */}
      {isClockedIn && (
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      )}
    </div>
  );
}
