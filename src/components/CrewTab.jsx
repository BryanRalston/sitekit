import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C, TF, MF, ROLE_COLORS } from '../tokens';
import { Btn, Inp } from './ui';
import { useMobile } from '../hooks/useApi';
import { api } from '../api';
import { useToast } from './Toast';
import CrewCard from './CrewCard';
import CrewMemberModal from './CrewMemberModal';
import WeekSummary from './WeekSummary';
import { fmtHours, fmtBalance, getInitial } from '../utils/crew';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatWeekRange(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 5); // Saturday
  const opts = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export default function CrewTab({ job, onCrewChange }) {
  const isMobile = useMobile();
  const { toast } = useToast();

  // Data
  const [crewMembers, setCrewMembers] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [activeClocks, setActiveClocks] = useState({}); // { crewMemberId: clockRecord }
  const [resolutions, setResolutions] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null); // 0-5 index for mobile
  const [showMemberModal, setShowMemberModal] = useState(null); // null|{}|member
  const [showSummary, setShowSummary] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { memberId, dayIdx }
  const [editingValue, setEditingValue] = useState('');

  // Compute week dates
  const weekStart = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    return api.getWeekStart(now);
  }, [weekOffset]);

  const weekDates = useMemo(() => api.getWeekDates(weekStart), [weekStart]);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Auto-select today's day index for mobile
  useEffect(() => {
    if (!isMobile) return;
    const todayIdx = weekDates.findIndex(d => d.toISOString().slice(0, 10) === todayStr);
    setSelectedDay(todayIdx >= 0 ? todayIdx : 0);
  }, [weekStart, isMobile]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadCrew = useCallback(async () => {
    try {
      const members = await api.getCrewMembers();
      setCrewMembers(members.filter(m => m.active !== false));
    } catch (err) {
      console.error('Failed to load crew:', err);
      setCrewMembers([]);
    }
  }, []);

  const loadTimeEntries = useCallback(async () => {
    try {
      const entries = await api.getTimeEntries(job.id, weekStart);
      setTimeEntries(entries);
    } catch (err) {
      console.error('Failed to load time entries:', err);
      setTimeEntries([]);
    }
  }, [job.id, weekStart]);

  const loadActiveClocks = useCallback(async () => {
    try {
      const clocks = {};
      for (const m of crewMembers) {
        const clock = await api.getActiveClock(m.id);
        if (clock) clocks[m.id] = clock;
      }
      setActiveClocks(clocks);
    } catch (err) {
      console.error('Failed to load active clocks:', err);
    }
  }, [crewMembers]);

  const loadResolutions = useCallback(async () => {
    try {
      const res = await api.getResolutions(job.id, weekStart);
      setResolutions(res);
    } catch (err) {
      setResolutions([]);
    }
  }, [job.id, weekStart]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadCrew().finally(() => setLoading(false));
  }, [loadCrew]);

  // Reload entries when week changes
  useEffect(() => {
    loadTimeEntries();
    loadResolutions();
  }, [loadTimeEntries, loadResolutions]);

  // Reload clocks when crew changes
  useEffect(() => {
    if (crewMembers.length > 0) loadActiveClocks();
  }, [crewMembers, loadActiveClocks]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCrew(), loadTimeEntries(), loadResolutions()]);
    // clocks will reload via crewMembers effect
  }, [loadCrew, loadTimeEntries, loadResolutions]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleClockIn = async (crewMemberId) => {
    // Guard: don't double clock-in
    if (activeClocks[crewMemberId]) {
      toast.info('Already clocked in');
      return;
    }
    try {
      await api.clockIn(job.id, crewMemberId);
      const clock = await api.getActiveClock(crewMemberId);
      setActiveClocks(prev => ({ ...prev, [crewMemberId]: clock }));
      toast.success('Clocked in');
    } catch (err) {
      toast.error('Clock in failed: ' + err.message);
    }
  };

  const handleClockOut = async (crewMemberId) => {
    try {
      await api.clockOut(crewMemberId, job.id);
      setActiveClocks(prev => {
        const next = { ...prev };
        delete next[crewMemberId];
        return next;
      });
      await loadTimeEntries();
      toast.success('Clocked out');
    } catch (err) {
      toast.error('Clock out failed: ' + err.message);
    }
  };

  const handleSaveEntry = async (crewMemberId, hours, notes) => {
    const dateStr = selectedDay != null
      ? weekDates[selectedDay].toISOString().slice(0, 10)
      : todayStr;

    const existing = timeEntries.find(e => e.crewMemberId === crewMemberId && e.date === dateStr);
    try {
      if (existing) {
        await api.updateTimeEntry(existing.id, { hours, notes });
      } else {
        await api.createTimeEntry({
          jobId: job.id,
          crewMemberId,
          date: dateStr,
          weekStart,
          hours,
          notes,
          status: 'manual',
        });
      }
      await loadTimeEntries();
      toast.success('Hours saved');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
  };

  const handleClearEntry = async (crewMemberId) => {
    const dateStr = selectedDay != null
      ? weekDates[selectedDay].toISOString().slice(0, 10)
      : todayStr;
    const existing = timeEntries.find(e => e.crewMemberId === crewMemberId && e.date === dateStr);
    if (!existing) return;
    try {
      await api.deleteTimeEntry(existing.id);
      await loadTimeEntries();
      toast.success('Entry cleared');
    } catch (err) {
      toast.error('Clear failed: ' + err.message);
    }
  };

  const handleSaveMember = async (data) => {
    try {
      if (showMemberModal?.id) {
        await api.updateCrewMember(showMemberModal.id, data);
      } else {
        await api.createCrewMember(data);
      }
      await loadCrew();
      onCrewChange?.();
    } catch (err) {
      toast.error('Save failed: ' + err.message);
      throw err; // re-throw so the modal knows it failed
    }
  };

  const handleDeleteMember = async (id) => {
    const deletedMember = crewMembers.find(m => m.id === id);
    if (!deletedMember) return;
    // Optimistic removal from local state
    setCrewMembers(prev => prev.filter(m => m.id !== id));
    onCrewChange?.();
    toast.undo(
      `${deletedMember.name} removed from crew`,
      // Undo: restore to local state
      () => { setCrewMembers(prev => [...prev, deletedMember]); onCrewChange?.(); },
      // Confirm delete: actually remove from DB
      async () => {
        try {
          await api.deleteCrewMember(id);
          onCrewChange?.();
        } catch (err) {
          toast.error('Delete failed: ' + err.message);
          // Restore on failure
          setCrewMembers(prev => [...prev, deletedMember]);
          onCrewChange?.();
        }
      }
    );
  };

  const handleDesktopCellClick = (memberId, dayIdx) => {
    const dateStr = weekDates[dayIdx].toISOString().slice(0, 10);
    const existing = timeEntries.find(e => e.crewMemberId === memberId && e.date === dateStr);
    setEditingCell({ memberId, dayIdx });
    setEditingValue(existing ? String(existing.hours || '') : '');
  };

  const handleDesktopCellSave = async () => {
    if (!editingCell) return;
    const { memberId, dayIdx } = editingCell;
    const dateStr = weekDates[dayIdx].toISOString().slice(0, 10);
    const existing = timeEntries.find(e => e.crewMemberId === memberId && e.date === dateStr);
    const h = parseFloat(editingValue);
    if (editingValue.trim() === '') {
      // Empty = clear / cancel
      setEditingCell(null);
      setEditingValue('');
      return;
    }
    if (isNaN(h) || h < 0) { toast.error('Invalid hours'); return; }
    try {
      if (existing) {
        await api.updateTimeEntry(existing.id, { hours: h });
      } else {
        await api.createTimeEntry({
          jobId: job.id,
          crewMemberId: memberId,
          date: dateStr,
          weekStart,
          hours: h,
          status: 'manual',
        });
      }
      await loadTimeEntries();
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
    setEditingCell(null);
    setEditingValue('');
  };

  const handleDesktopCellCancel = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const handleResolve = async (data) => {
    await api.resolveShortage(data);
    await loadResolutions();
  };

  const handleDeleteResolution = async (id) => {
    await api.deleteResolution(id);
    await loadResolutions();
  };

  // ── Summary view ──────────────────────────────────────────────────────────

  if (showSummary) {
    return (
      <WeekSummary
        crewMembers={crewMembers}
        timeEntries={timeEntries}
        weekDates={weekDates}
        weekStart={weekStart}
        jobId={job.id}
        resolutions={resolutions}
        onResolve={handleResolve}
        onDeleteResolution={handleDeleteResolution}
        onBack={() => setShowSummary(false)}
      />
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
        Loading crew...
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (crewMembers.length === 0) {
    return (
      <>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 4 }}>👷</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>No crew members yet</div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 360, lineHeight: 1.7 }}>
            Add your first crew member to start tracking hours, clock-ins, and weekly summaries for this job.
          </div>
          <Btn variant="primary" size="lg" icon="+" onClick={() => setShowMemberModal({})} style={{ marginTop: 8 }}>
            Add First Crew Member
          </Btn>
        </div>
        {showMemberModal !== null && (
          <CrewMemberModal
            member={showMemberModal?.id ? showMemberModal : null}
            onSave={handleSaveMember}
            onClose={() => setShowMemberModal(null)}
            onDelete={showMemberModal?.id ? handleDeleteMember : undefined}
          />
        )}
      </>
    );
  }

  // ── Week navigation ───────────────────────────────────────────────────────

  const WeekNav = (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: isMobile ? '10px 14px' : '10px 18px',
      borderBottom: `1px solid ${C.border}`, background: C.card,
      justifyContent: 'center',
    }}>
      <button onClick={() => setWeekOffset(w => w - 1)} style={{
        background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
        color: C.muted, cursor: 'pointer', padding: '4px 10px',
        minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontFamily: 'inherit',
      }}>
        ‹
      </button>
      <div style={{
        ...TF, fontSize: 14, fontWeight: 700, color: C.text,
        minWidth: isMobile ? 180 : 220, textAlign: 'center',
      }}>
        {formatWeekRange(weekStart)}
      </div>
      <button onClick={() => setWeekOffset(w => w + 1)} style={{
        background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
        color: C.muted, cursor: 'pointer', padding: '4px 10px',
        minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontFamily: 'inherit',
      }}>
        ›
      </button>
      {weekOffset !== 0 && (
        <button onClick={() => setWeekOffset(0)} style={{
          background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 6,
          color: C.accent, cursor: 'pointer', padding: '4px 10px',
          fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
          minHeight: 30, whiteSpace: 'nowrap',
        }}>
          This Week
        </button>
      )}
    </div>
  );

  // ── Mobile view ───────────────────────────────────────────────────────────

  if (isMobile) {
    const selectedDateStr = selectedDay != null
      ? weekDates[selectedDay].toISOString().slice(0, 10)
      : todayStr;

    return (
      <>
        {WeekNav}

        {/* Day selector strip */}
        <div style={{
          flexShrink: 0, display: 'flex', gap: 6,
          padding: '8px 14px', borderBottom: `1px solid ${C.border}`,
          background: C.card, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {weekDates.map((d, i) => {
            const dateStr = d.toISOString().slice(0, 10);
            const isToday = dateStr === todayStr;
            const isSelected = selectedDay === i;
            const isSat = i === 5;
            const dayNum = d.getDate();

            return (
              <button key={i} onClick={() => setSelectedDay(i)} style={{
                flex: 1, minWidth: 48, padding: '6px 4px',
                borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: isSelected ? C.accent : 'transparent',
                color: isSelected ? '#1a1a1a' : isToday ? C.accent : isSat ? C.blue : C.muted,
                border: isToday && !isSelected ? `1px solid ${C.accent}` : '1px solid transparent',
                textAlign: 'center', transition: 'all 0.15s',
                minHeight: 44,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
                  {DAY_LABELS[i]}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {dayNum}
                </div>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={{
          flexShrink: 0, padding: '8px 14px',
          display: 'flex', gap: 8, alignItems: 'center',
          borderBottom: `1px solid ${C.border}`, background: C.card,
        }}>
          <Btn variant="ghost" size="sm" icon="👤" onClick={() => setShowMemberModal({})} style={{ flex: 0 }}>
            Add
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="blue" size="sm" onClick={() => setShowSummary(true)}>
            Summary
          </Btn>
        </div>

        {/* Crew cards list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {crewMembers.map(m => {
            const entry = timeEntries.find(e => e.crewMemberId === m.id && e.date === selectedDateStr);
            return (
              <CrewCard
                key={m.id}
                member={m}
                entry={entry}
                activeClock={activeClocks[m.id] || null}
                dailyTarget={m.dailyHours || 8}
                onClockIn={handleClockIn}
                onClockOut={handleClockOut}
                onSaveEntry={handleSaveEntry}
                onClearEntry={handleClearEntry}
                isMobile
              />
            );
          })}
        </div>

        {/* FAB: Clock In */}
        <button
          onClick={() => {
            // Find first crew member not clocked in
            const unclockedMember = crewMembers.find(m => !activeClocks[m.id]);
            if (unclockedMember) handleClockIn(unclockedMember.id);
            else toast.info('All crew members are clocked in');
          }}
          style={{
            position: 'fixed', bottom: 20, right: 20,
            width: 56, height: 56, borderRadius: '50%',
            background: C.green, color: '#fff', border: 'none',
            boxShadow: `0 4px 20px rgba(63,185,80,0.4)`,
            cursor: 'pointer', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50, fontFamily: 'inherit',
          }}
          title="Quick Clock In"
        >
          <span style={{ fontSize: 20 }}>⏱</span>
        </button>

        {/* Modal */}
        {showMemberModal !== null && (
          <CrewMemberModal
            member={showMemberModal?.id ? showMemberModal : null}
            onSave={handleSaveMember}
            onClose={() => setShowMemberModal(null)}
            onDelete={showMemberModal?.id ? handleDeleteMember : undefined}
          />
        )}
      </>
    );
  }

  // ── Desktop view: week grid ───────────────────────────────────────────────

  return (
    <>
      {WeekNav}

      {/* Desktop toolbar */}
      <div style={{
        flexShrink: 0, padding: '8px 18px',
        display: 'flex', gap: 8, alignItems: 'center',
        borderBottom: `1px solid ${C.border}`, background: C.card,
      }}>
        <Btn variant="primary" size="sm" icon="+" onClick={() => setShowMemberModal({})}>
          Add Crew Member
        </Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="blue" size="sm" onClick={() => setShowSummary(true)}>
          Week Summary
        </Btn>
      </div>

      {/* Week grid */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 13, minWidth: 700,
        }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', padding: '10px 14px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 10, fontWeight: 700, color: C.muted,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                position: 'sticky', top: 0, background: C.card, zIndex: 5,
                minWidth: 160,
              }}>
                Crew Member
              </th>
              {weekDates.map((d, i) => {
                const dateStr = d.toISOString().slice(0, 10);
                const isToday = dateStr === todayStr;
                const isSat = i === 5;
                return (
                  <th key={i} style={{
                    textAlign: 'center', padding: '10px 8px',
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 10, fontWeight: 700,
                    color: isToday ? C.accent : isSat ? C.blue : C.muted,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    position: 'sticky', top: 0, background: C.card, zIndex: 5,
                    minWidth: 70,
                    borderLeft: isToday ? `2px solid ${C.accent}` : undefined,
                    borderRight: isToday ? `2px solid ${C.accent}` : undefined,
                  }}>
                    {DAY_LABELS[i]}
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                      {d.getDate()}
                    </div>
                  </th>
                );
              })}
              <th style={{
                textAlign: 'center', padding: '10px 14px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 10, fontWeight: 700, color: C.accent,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                position: 'sticky', top: 0, background: C.card, zIndex: 5,
                minWidth: 90,
              }}>
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {crewMembers.map(m => {
              const roleStyle = ROLE_COLORS[m.role] || ROLE_COLORS.Other;
              const dailyTarget = m.dailyHours || 8;
              const weeklyTarget = dailyTarget * 5;
              let totalHours = 0;

              const cells = weekDates.map((d, i) => {
                const dateStr = d.toISOString().slice(0, 10);
                const isToday = dateStr === todayStr;
                const isSat = i === 5;
                const entry = timeEntries.find(e => e.crewMemberId === m.id && e.date === dateStr);
                const h = entry ? parseFloat(entry.hours) || 0 : 0;
                totalHours += h;
                const cellColor = h === 0 ? C.faint : isSat ? C.blue : h >= dailyTarget ? C.green : C.red;
                const isEditing = editingCell && editingCell.memberId === m.id && editingCell.dayIdx === i;
                return (
                  <td key={i}
                    onClick={() => !isEditing && handleDesktopCellClick(m.id, i)}
                    style={{
                      textAlign: 'center', padding: isEditing ? '4px' : '8px',
                      borderBottom: `1px solid ${C.borderLight}`,
                      cursor: isEditing ? 'default' : 'pointer', transition: 'background 0.12s',
                      borderLeft: isToday ? `2px solid ${C.accent}` : undefined,
                      borderRight: isToday ? `2px solid ${C.accent}` : undefined,
                    }}
                    onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = C.cardHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        autoFocus
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleDesktopCellSave();
                          if (e.key === 'Escape') handleDesktopCellCancel();
                        }}
                        onBlur={handleDesktopCellSave}
                        style={{
                          ...MF, width: '100%', maxWidth: 60, textAlign: 'center',
                          fontSize: 14, fontWeight: 700, padding: '4px 2px',
                          background: C.bg, color: C.text,
                          border: `1px solid ${C.accent}`, borderRadius: 4,
                          outline: 'none', boxSizing: 'border-box',
                        }}
                        step="0.25"
                        min="0"
                        placeholder="0"
                      />
                    ) : (
                      <span style={{ ...MF, fontSize: 14, fontWeight: 700, color: cellColor }}>
                        {h > 0 ? fmtHours(h) : '—'}
                      </span>
                    )}
                  </td>
                );
              });

              const balance = totalHours - weeklyTarget;
              const balColor = balance > 0.25 ? C.green : balance < -0.25 ? C.red : C.accent;

              return (
                <tr key={m.id}>
                  <td style={{
                    padding: '8px 14px',
                    borderBottom: `1px solid ${C.borderLight}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: m.color || C.accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>
                        {getInitial(m.name)}
                      </div>
                      <div>
                        <button
                          onClick={() => setShowMemberModal(m)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, color: C.text, fontFamily: 'inherit',
                            padding: 0, textAlign: 'left',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.accent; }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.text; }}
                        >
                          {m.name}
                        </button>
                        <span style={{
                          display: 'inline-flex', padding: '0 5px', borderRadius: 8,
                          fontSize: 9, fontWeight: 700, marginLeft: 6,
                          background: roleStyle.bg, color: roleStyle.color,
                          border: `1px solid ${roleStyle.border}`,
                        }}>
                          {m.role}
                        </span>
                      </div>
                    </div>
                  </td>
                  {cells}
                  <td style={{
                    textAlign: 'center', padding: '8px 14px',
                    borderBottom: `1px solid ${C.borderLight}`,
                  }}>
                    <div style={{ ...MF, fontSize: 14, fontWeight: 700, color: balColor }}>
                      {fmtBalance(balance)}
                    </div>
                    <div style={{ ...MF, fontSize: 10, color: C.muted }}>
                      {fmtHours(totalHours)} / {fmtHours(weeklyTarget)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showMemberModal !== null && (
        <CrewMemberModal
          member={showMemberModal?.id ? showMemberModal : null}
          onSave={handleSaveMember}
          onClose={() => setShowMemberModal(null)}
          onDelete={showMemberModal?.id ? handleDeleteMember : undefined}
        />
      )}
    </>
  );
}
