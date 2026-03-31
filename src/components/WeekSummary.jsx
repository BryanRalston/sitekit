import React, { useState, useMemo } from 'react';
import { C, MF, TF, ROLE_COLORS } from '../tokens';
import { Btn } from './ui';
import { useMobile } from '../hooks/useApi';
import { useToast } from './Toast';
import { fmtHours, fmtBalance } from '../utils/crew';
import { SHARE_FOOTER } from '../utils/shareFooter';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const RESOLUTION_OPTIONS = [
  { id: 'saturday', label: 'Saturday', icon: '📅', desc: 'Make up on Saturday' },
  { id: 'deduct', label: 'Deduct', icon: '📉', desc: 'Deduct from pay' },
  { id: 'review', label: 'Review', icon: '🔍', desc: 'Review with crew' },
  { id: 'excused', label: 'Excused', icon: '✓', desc: 'Excused absence' },
];

export default function WeekSummary({
  crewMembers,
  timeEntries,
  weekDates,
  weekStart,
  jobId,
  resolutions,
  onResolve,
  onDeleteResolution,
  onBack,
}) {
  const isMobile = useMobile();
  const { toast } = useToast();
  const [resolutionNotes, setResolutionNotes] = useState({});

  // Compute per-crew stats
  const crewStats = useMemo(() => {
    return crewMembers.map(m => {
      const target = (m.dailyHours || 8) * 5; // Mon-Fri target
      const dailyHours = weekDates.map(d => {
        const dateStr = d.toISOString().slice(0, 10);
        const e = timeEntries.find(te => te.crewMemberId === m.id && te.date === dateStr);
        return e ? parseFloat(e.hours) || 0 : 0;
      });
      const totalHours = dailyHours.reduce((s, h) => s + h, 0);
      const balance = totalHours - target;
      const resolution = resolutions.find(r => r.crewMemberId === m.id);
      return { member: m, dailyHours, totalHours, target, balance, resolution };
    });
  }, [crewMembers, timeEntries, weekDates, resolutions]);

  const shortCount = crewStats.filter(s => s.balance < -0.25).length;
  const overCount = crewStats.filter(s => s.balance > 0.25).length;
  const onTrackCount = crewStats.filter(s => Math.abs(s.balance) <= 0.25).length;

  const handleResolve = async (memberId, resolution) => {
    const stat = crewStats.find(s => s.member.id === memberId);
    if (!stat) return;
    try {
      await onResolve({
        jobId,
        crewMemberId: memberId,
        weekStart,
        shortageHours: Math.abs(stat.balance),
        resolution,
        notes: resolutionNotes[memberId] || '',
      });
    } catch (err) {
      toast.error('Resolve failed: ' + err.message);
    }
  };

  const handleCopyWeekSummary = () => {
    const lines = [];
    lines.push(`Week of ${weekStart}`);
    lines.push('─'.repeat(30));
    for (const s of crewStats) {
      const balStr = fmtBalance(s.balance);
      const status = s.balance < -0.25 ? 'SHORT' : s.balance > 0.25 ? 'OVER' : 'OK';
      lines.push(`${s.member.name} (${s.member.role}): ${fmtHours(s.totalHours)} / ${fmtHours(s.target)}  [${balStr}] ${status}`);
      const dayLine = s.dailyHours.map((h, i) => `${DAY_LABELS[i]}: ${fmtHours(h)}`).join('  ');
      lines.push(`  ${dayLine}`);
      if (s.resolution) {
        lines.push(`  Resolution: ${s.resolution.resolution} — ${s.resolution.notes || 'no notes'}`);
      }
    }
    lines.push('');
    lines.push(`Short: ${shortCount} | Over: ${overCount} | On Track: ${onTrackCount}`);
    lines.push(SHARE_FOOTER);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success('Week summary copied');
    }).catch(() => {
      toast.error('Copy failed');
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: C.card,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>
          ‹ Back
        </Btn>
        <div style={{ ...TF, fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>
          Week Summary
        </div>
        <Btn variant="blue" size="sm" icon="📋" onClick={handleCopyWeekSummary}>
          Copy
        </Btn>
      </div>

      {/* Stats bar */}
      <div style={{
        flexShrink: 0, padding: '10px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: C.card,
        display: 'flex', gap: 10, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {[
          { label: 'Short', value: shortCount, color: C.red, bg: C.redDim, border: C.redBorder },
          { label: 'Overtime', value: overCount, color: C.green, bg: C.greenDim, border: C.greenBorder },
          { label: 'On Track', value: onTrackCount, color: C.accent, bg: C.accentDim, border: C.accentBorder },
        ].map(s => (
          <div key={s.label} style={{
            flex: isMobile ? '0 0 auto' : 1, minWidth: isMobile ? 100 : 0,
            padding: '8px 14px', background: s.bg, borderRadius: 8,
            border: `1px solid ${s.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ ...MF, fontSize: 22, fontWeight: 700, color: s.color }}>
              {s.value}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Crew member cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {crewStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>
            No crew data for this week.
          </div>
        ) : (
          crewStats.map(s => {
            const isShort = s.balance < -0.25;
            const roleStyle = ROLE_COLORS[s.member.role] || ROLE_COLORS.Other;
            const balanceColor = s.balance > 0.25 ? C.green : isShort ? C.red : C.accent;
            return (
              <div key={s.member.id} style={{
                background: C.card, borderRadius: 10,
                border: `1px solid ${isShort && !s.resolution ? C.redBorder : C.borderLight}`,
                marginBottom: 10, overflow: 'hidden',
              }}>
                {/* Member header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                }}>
                  {/* Initial */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: s.member.color || C.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {(s.member.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.member.name}</div>
                    <span style={{
                      display: 'inline-flex', padding: '1px 6px', borderRadius: 10,
                      fontSize: 9, fontWeight: 700,
                      background: roleStyle.bg, color: roleStyle.color,
                      border: `1px solid ${roleStyle.border}`,
                    }}>
                      {s.member.role}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...MF, fontSize: 16, fontWeight: 700, color: C.text }}>
                      {fmtHours(s.totalHours)} <span style={{ fontSize: 11, color: C.muted }}>/ {fmtHours(s.target)}</span>
                    </div>
                    <div style={{ ...MF, fontSize: 13, fontWeight: 700, color: balanceColor }}>
                      {fmtBalance(s.balance)}
                    </div>
                  </div>
                </div>

                {/* Mini daily breakdown */}
                <div style={{
                  display: 'flex', gap: 4, padding: '0 14px 10px',
                }}>
                  {s.dailyHours.map((h, i) => {
                    const isSat = i === 5;
                    const dayColor = h === 0 ? C.faint : isSat ? C.blue : h >= (s.member.dailyHours || 8) ? C.green : C.red;
                    return (
                      <div key={i} style={{
                        flex: 1, textAlign: 'center', padding: '4px 0',
                        background: C.bg, borderRadius: 6,
                        border: `1px solid ${C.borderLight}`,
                      }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: C.faint, textTransform: 'uppercase', marginBottom: 2 }}>
                          {DAY_LABELS[i]}
                        </div>
                        <div style={{ ...MF, fontSize: 11, fontWeight: 700, color: dayColor }}>
                          {fmtHours(h)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Shortage resolution panel */}
                {isShort && (
                  <div style={{
                    padding: '10px 14px',
                    borderTop: `1px solid ${C.borderLight}`,
                    background: s.resolution ? C.greenDim : C.redDim,
                  }}>
                    {s.resolution ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: C.green, fontWeight: 600, flex: 1 }}>
                          Resolved: <strong>{s.resolution.resolution}</strong>
                          {s.resolution.notes ? ` — ${s.resolution.notes}` : ''}
                        </span>
                        <Btn variant="ghost" size="sm" onClick={() => onDeleteResolution(s.resolution.id)}>
                          Undo
                        </Btn>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.red, textTransform: 'uppercase', marginBottom: 6 }}>
                          Short {fmtHours(Math.abs(s.balance))} — Resolve:
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {RESOLUTION_OPTIONS.map(opt => (
                            <Btn
                              key={opt.id}
                              variant="ghost"
                              size="sm"
                              icon={opt.icon}
                              onClick={() => handleResolve(s.member.id, opt.id)}
                              style={{ fontSize: 10 }}
                            >
                              {opt.label}
                            </Btn>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={resolutionNotes[s.member.id] || ''}
                          onChange={e => setResolutionNotes(prev => ({ ...prev, [s.member.id]: e.target.value }))}
                          placeholder="Notes (optional)..."
                          style={{
                            width: '100%', background: C.bg, border: `1px solid ${C.border}`,
                            borderRadius: 6, color: C.text, padding: '6px 10px', fontSize: 12,
                            outline: 'none', minHeight: 36, boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
