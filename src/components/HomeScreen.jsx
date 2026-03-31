import React, { useState, useEffect, useMemo } from 'react';
import { C, TF } from '../tokens';
import { Btn } from './ui';
import { api } from '../api';

const PROFILE_KEY = 'sitekit_contractor_profile';

function getContractorProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ─── Today's Summary Card ──────────────────────────────────────────────────────
function TodaySummary({ allJobData }) {
  const td = todayStr();

  const stats = useMemo(() => {
    let itemsReceived = 0;
    let issuesFlagged = 0;
    let receiptsAdded = 0;

    for (const jd of allJobData) {
      for (const item of (jd.items || [])) {
        if (item.dateReceived === td) itemsReceived++;
        // Issues created today — check if damage/missing flagged but not yet reported
        if ((item.damaged || item.missingParts) && item.createdAt && item.createdAt.startsWith(td)) {
          issuesFlagged++;
        }
      }
      for (const r of (jd.receipts || [])) {
        if (r.date === td) receiptsAdded++;
      }
    }

    return { itemsReceived, issuesFlagged, receiptsAdded };
  }, [allJobData, td]);

  const hasActivity = stats.itemsReceived > 0 || stats.issuesFlagged > 0 || stats.receiptsAdded > 0;

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ ...TF, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
        Today
      </div>
      {hasActivity ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {stats.itemsReceived > 0 && (
            <StatChip icon="📦" value={stats.itemsReceived} label="items received" color={C.green} bg={C.greenDim} />
          )}
          {stats.issuesFlagged > 0 && (
            <StatChip icon="⚠️" value={stats.issuesFlagged} label="issues flagged" color={C.red} bg={C.redDim} />
          )}
          {stats.receiptsAdded > 0 && (
            <StatChip icon="🧾" value={stats.receiptsAdded} label="receipts added" color={C.blue} bg={C.blueDim} />
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          No activity yet today
        </div>
      )}
    </div>
  );
}

function StatChip({ icon, value, label, color, bg }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 10,
      background: bg, minWidth: 120,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Alerts Section ────────────────────────────────────────────────────────────
function AlertsSection({ allJobData, jobs, onSelectJob }) {
  const td = todayStr();

  const alerts = useMemo(() => {
    const result = [];

    let overdueCount = 0;
    let unreportedCount = 0;
    let overdueJobId = null;
    let unreportedJobId = null;

    for (let i = 0; i < allJobData.length; i++) {
      const jd = allJobData[i];
      for (const item of (jd.items || [])) {
        // Overdue: has delivery date in the past, not received
        if (item.delDate && item.delDate < td && parseInt(item.qtyReceived || '0') === 0) {
          overdueCount++;
          if (!overdueJobId) overdueJobId = jd.id || (jobs[i] && jobs[i].id);
        }
        // Unreported issues
        if ((item.missingParts && !item.missingPartsReported) ||
            (item.damaged && !item.damageReported) ||
            (item.additionalOrders && !item.additionalOrdersReported)) {
          unreportedCount++;
          if (!unreportedJobId) unreportedJobId = jd.id || (jobs[i] && jobs[i].id);
        }
      }
    }

    if (overdueCount > 0) {
      result.push({
        key: 'overdue', color: C.red, bg: C.redDim, border: C.redBorder,
        icon: '🚨', text: `${overdueCount} overdue deliver${overdueCount === 1 ? 'y' : 'ies'}`,
        jobId: overdueJobId,
      });
    }
    if (unreportedCount > 0) {
      result.push({
        key: 'unreported', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)',
        icon: '📋', text: `${unreportedCount} unreported issue${unreportedCount === 1 ? '' : 's'}`,
        jobId: unreportedJobId,
      });
    }

    // Backup reminder
    const lastBackup = localStorage.getItem('sitekit_last_backup');
    if (lastBackup) {
      const daysSince = (Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        result.push({
          key: 'backup', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)',
          icon: '💾', text: `Last backup ${Math.floor(daysSince)} days ago`,
          action: 'backup',
        });
      }
    } else if (allJobData.length > 0) {
      result.push({
        key: 'backup', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)',
        icon: '💾', text: 'No backups yet',
        action: 'backup',
      });
    }

    return result;
  }, [allJobData, jobs, td]);

  if (alerts.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {alerts.map(a => (
        <button
          key={a.key}
          onClick={() => {
            if (a.action === 'backup' && typeof onSelectJob === 'function') {
              // Trigger backup from parent
              document.dispatchEvent(new CustomEvent('sitekit-backup'));
            } else if (a.jobId && onSelectJob) {
              onSelectJob(a.jobId);
            }
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: a.bg, border: `1px solid ${a.border}`,
            color: a.color, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <span>{a.icon}</span> {a.text}
        </button>
      ))}
    </div>
  );
}

// ─── Active Jobs Grid ──────────────────────────────────────────────────────────
function ActiveJobsGrid({ jobs, onSelectJob, onNewJob }) {
  const sorted = useMemo(() =>
    [...jobs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [jobs]
  );

  return (
    <div>
      <div style={{ ...TF, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>
        Active Jobs
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 12,
      }}>
        {sorted.map(job => {
          const itemCount = job.item_count ?? 0;
          const receivedCount = job.received_count ?? 0;
          const issueCount = job.issue_count ?? 0;
          const pct = itemCount > 0 ? Math.round((receivedCount / itemCount) * 100) : 0;
          const barColor = pct > 75 ? C.green : pct > 40 ? C.blue : pct > 20 ? C.yellow : C.red;
          const barBg = pct > 75 ? C.greenDim : pct > 40 ? C.blueDim : pct > 20 ? C.yellowDim : C.redDim;

          return (
            <div
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              style={{
                background: '#fff', borderRadius: 12, padding: '16px 18px',
                border: `1px solid ${C.border}`, cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = C.accent;
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
              }}
            >
              <div style={{ ...TF, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                {job.name}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
                {job.store}{job.location ? ` \u2014 ${job.location}` : ''}
              </div>

              {itemCount > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      {receivedCount}/{itemCount} received
                    </span>
                    <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{
                    height: 5, borderRadius: 3, background: barBg, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: barColor,
                      width: `${pct}%`, transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {issueCount > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: C.red,
                    padding: '2px 7px', borderRadius: 4,
                    background: C.redDim, border: `1px solid ${C.redBorder}`,
                  }}>
                    {issueCount} issue{issueCount !== 1 ? 's' : ''}
                  </span>
                )}
                {(job.receipt_count || 0) > 0 && (
                  <span style={{ fontSize: 10, color: C.faint }}>
                    {job.receipt_count} receipt{job.receipt_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* New Job card */}
        <div
          onClick={onNewJob}
          style={{
            background: '#fff', borderRadius: 12, padding: '16px 18px',
            border: `2px dashed ${C.border}`, cursor: 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 100, gap: 6,
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = C.accent;
            e.currentTarget.style.background = C.accentDim;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.background = '#fff';
          }}
        >
          <span style={{ fontSize: 24, color: C.accent, fontWeight: 300 }}>+</span>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>New Job</span>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Actions ─────────────────────────────────────────────────────────────
function QuickActions({ onBackup }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Btn variant="ghost" icon="💾" onClick={onBackup} style={{ fontSize: 12 }}>
        Backup
      </Btn>
    </div>
  );
}

// ─── Main HomeScreen ───────────────────────────────────────────────────────────
export default function HomeScreen({ jobs, onSelectJob, onNewJob, onBackup }) {
  const [allJobData, setAllJobData] = useState([]);
  const [loading, setLoading] = useState(true);
  const profile = getContractorProfile();
  const greeting = getGreeting();
  const displayName = profile.name || null;
  const companyName = profile.company || null;

  // Load full data for all jobs to compute cross-job totals
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        const results = await Promise.all(
          jobs.map(j => api.getJob(j.id).catch(() => ({ id: j.id, items: [], receipts: [], departments: [] })))
        );
        if (!cancelled) setAllJobData(results);
      } catch (_) {
        if (!cancelled) setAllJobData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (jobs.length > 0) {
      loadAll();
    } else {
      setAllJobData([]);
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [jobs]);

  // Wire up backup event from alert chips
  useEffect(() => {
    const handler = () => { if (onBackup) onBackup(); };
    document.addEventListener('sitekit-backup', handler);
    return () => document.removeEventListener('sitekit-backup', handler);
  }, [onBackup]);

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '28px 24px',
      background: C.bg,
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Greeting */}
        <div>
          <div style={{ ...TF, fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
            {greeting}{displayName ? `, ${displayName}` : ''}
          </div>
          {companyName && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
              {companyName}
            </div>
          )}
        </div>

        {/* Today's Summary */}
        {!loading && jobs.length > 0 && (
          <TodaySummary allJobData={allJobData} />
        )}

        {/* Alerts */}
        {!loading && (
          <AlertsSection allJobData={allJobData} jobs={jobs} onSelectJob={onSelectJob} />
        )}

        {/* Active Jobs Grid */}
        {jobs.length > 0 ? (
          <ActiveJobsGrid jobs={jobs} onSelectJob={onSelectJob} onNewJob={onNewJob} />
        ) : (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '32px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            border: `1px solid ${C.border}`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏗️</div>
            <div style={{ ...TF, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>
              No jobs yet
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Create your first job to start tracking fixtures, receipts, and crew hours.
            </div>
            <Btn variant="primary" size="lg" icon="+" onClick={onNewJob}>
              New Job
            </Btn>
          </div>
        )}

        {/* Quick Actions */}
        {jobs.length > 0 && (
          <QuickActions onBackup={onBackup} />
        )}
      </div>
    </div>
  );
}
