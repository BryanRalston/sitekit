import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C, TF, MF } from '../tokens';
import { Btn } from './ui';
import { api } from '../api';
import { ProgressRing, PieChart } from './Charts';
import AnimatedNumber from './AnimatedNumber';
import Confetti from './Confetti';
import { CATEGORIES } from './ReceiptsTab';

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

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getLastActivityDate(jobData) {
  let latest = null;
  for (const item of (jobData.items || [])) {
    if (item.dateReceived && (!latest || item.dateReceived > latest)) latest = item.dateReceived;
    if (item.createdAt && (!latest || item.createdAt > latest)) latest = item.createdAt;
  }
  for (const r of (jobData.receipts || [])) {
    if (r.createdAt && (!latest || r.createdAt > latest)) latest = r.createdAt;
    if (r.date && (!latest || r.date > latest)) latest = r.date;
  }
  return latest;
}

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
        <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>
          <AnimatedNumber value={value} />
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Smart Notifications ──────────────────────────────────────────────────────

const NOTIF_PRIORITY = { urgent: 0, warning: 1, positive: 2, info: 3 };
const NOTIF_COLORS = {
  urgent: { bg: C.redDim, border: C.redBorder, color: C.red },
  warning: { bg: C.yellowDim, border: C.yellowBorder, color: '#d97706' },
  positive: { bg: C.greenDim, border: C.greenBorder, color: C.green },
  info: { bg: C.blueDim, border: C.blueBorder, color: C.blue },
};

function getDismissedNotifs() {
  try { return JSON.parse(sessionStorage.getItem('sitekit_dismissed_notifs') || '[]'); } catch { return []; }
}
function dismissNotif(key) {
  const dismissed = getDismissedNotifs();
  if (!dismissed.includes(key)) {
    dismissed.push(key);
    sessionStorage.setItem('sitekit_dismissed_notifs', JSON.stringify(dismissed));
  }
}

function SmartNotifications({ allJobData, jobs, onSelectJob }) {
  const td = todayStr();
  const tmr = tomorrowStr();
  const [dismissed, setDismissed] = useState(getDismissedNotifs);

  const notifications = useMemo(() => {
    const notifs = [];

    // 1. Deliveries arriving tomorrow
    for (let i = 0; i < allJobData.length; i++) {
      const jd = allJobData[i];
      const tomorrowItems = (jd.items || []).filter(item =>
        item.delDate === tmr && parseInt(item.qtyReceived || '0') === 0
      );
      if (tomorrowItems.length > 0) {
        const vendors = [...new Set(tomorrowItems.map(it => it.vendor).filter(Boolean))];
        const vendorStr = vendors.length > 0 ? ` from ${vendors.slice(0, 2).join(', ')}` : '';
        notifs.push({
          key: `delivery-tmr-${jd.id}`,
          icon: '🚚',
          text: `Delivery arriving tomorrow: ${tomorrowItems.length} item${tomorrowItems.length !== 1 ? 's' : ''}${vendorStr}`,
          priority: 'info',
          jobId: jd.id || (jobs[i] && jobs[i].id),
        });
      }
    }

    // 2. Job progress and pace — for each job
    for (let i = 0; i < allJobData.length; i++) {
      const jd = allJobData[i];
      const job = jobs[i];
      if (!job) continue;
      const itemCount = job.itemCount ?? (jd.items || []).length;
      const receivedCount = job.receivedCount ?? (jd.items || []).filter(it => {
        const r = parseInt(it.qtyReceived || '0');
        const o = parseInt(it.qtyOrdered || '0');
        return r > 0 && o > 0 && r >= o;
      }).length;

      if (itemCount > 0) {
        const pct = Math.round((receivedCount / itemCount) * 100);
        if (pct === 100) {
          notifs.push({
            key: `complete-${jd.id}`,
            icon: '🎯',
            text: `${job.name} — 100% complete! All fixtures received.`,
            priority: 'positive',
            jobId: job.id,
          });
        } else if (pct >= 75) {
          notifs.push({
            key: `ontrack-${jd.id}`,
            icon: '📈',
            text: `${job.name} is ${pct}% complete — almost there!`,
            priority: 'positive',
            jobId: job.id,
          });
        }
      }
    }

    // 3. Receipt spending this week vs last week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const thisMondayStr = thisMonday.toISOString().slice(0, 10);
    const lastMondayStr = lastMonday.toISOString().slice(0, 10);

    let thisWeekSpend = 0;
    let lastWeekSpend = 0;
    for (const jd of allJobData) {
      for (const r of (jd.receipts || [])) {
        const amt = parseFloat(r.amount) || 0;
        if (r.date >= thisMondayStr) thisWeekSpend += amt;
        else if (r.date >= lastMondayStr && r.date < thisMondayStr) lastWeekSpend += amt;
      }
    }
    if (thisWeekSpend > 0) {
      let changeStr = '';
      if (lastWeekSpend > 0) {
        const pctChange = Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100);
        changeStr = pctChange >= 0 ? ` (+${pctChange}% vs last week)` : ` (${pctChange}% vs last week)`;
      }
      notifs.push({
        key: 'receipt-spend-week',
        icon: '💰',
        text: `Receipt spending this week: $${thisWeekSpend.toFixed(2)}${changeStr}`,
        priority: 'info',
      });
    }

    // 4. Overdue deliveries (already shown in alerts, but add as notification too)
    let totalOverdue = 0;
    let overdueJobId = null;
    for (let i = 0; i < allJobData.length; i++) {
      const jd = allJobData[i];
      for (const item of (jd.items || [])) {
        if (item.delDate && item.delDate < td && parseInt(item.qtyReceived || '0') === 0) {
          totalOverdue++;
          if (!overdueJobId) overdueJobId = jd.id || (jobs[i] && jobs[i].id);
        }
      }
    }
    if (totalOverdue > 0) {
      notifs.push({
        key: 'overdue-items',
        icon: '🚨',
        text: `${totalOverdue} overdue deliver${totalOverdue === 1 ? 'y' : 'ies'} need attention`,
        priority: 'urgent',
        jobId: overdueJobId,
      });
    }

    // 5. Backup reminder
    const lastBackup = localStorage.getItem('sitekit_last_backup');
    if (lastBackup) {
      const daysSince = (Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        notifs.push({
          key: 'backup-reminder',
          icon: '💾',
          text: `Last backup was ${Math.floor(daysSince)} days ago`,
          priority: 'warning',
          action: 'backup',
        });
      }
    } else if (allJobData.length > 0) {
      notifs.push({
        key: 'backup-never',
        icon: '💾',
        text: 'No backups yet — protect your data',
        priority: 'warning',
        action: 'backup',
      });
    }

    // Sort by priority, limit to 5
    notifs.sort((a, b) => NOTIF_PRIORITY[a.priority] - NOTIF_PRIORITY[b.priority]);
    return notifs.slice(0, 5);
  }, [allJobData, jobs, td, tmr]);

  const visibleNotifs = notifications.filter(n => !dismissed.includes(n.key));

  const handleDismiss = useCallback((key) => {
    dismissNotif(key);
    setDismissed(getDismissedNotifs());
  }, []);

  if (visibleNotifs.length === 0) return null;

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ ...TF, fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Notifications
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibleNotifs.map(n => {
          const cs = NOTIF_COLORS[n.priority];
          return (
            <div
              key={n.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                background: cs.bg, border: `1px solid ${cs.border}`,
                cursor: n.jobId || n.action ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
              onClick={() => {
                if (n.action === 'backup') {
                  document.dispatchEvent(new CustomEvent('sitekit-backup'));
                } else if (n.jobId && onSelectJob) {
                  onSelectJob(n.jobId);
                }
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>{n.icon}</span>
              <span style={{ fontSize: 12, color: cs.color, fontWeight: 600, flex: 1, lineHeight: 1.4 }}>
                {n.text}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDismiss(n.key); }}
                style={{
                  background: 'none', border: 'none', color: C.faint, cursor: 'pointer',
                  fontSize: 14, padding: '2px 4px', flexShrink: 0, fontFamily: 'inherit',
                  lineHeight: 1, borderRadius: 4,
                }}
                title="Dismiss"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Spending PieChart Card ──────────────────────────────────────────────────
const CATEGORY_COLORS = {
  Materials: '#2563eb',
  Tools: '#7c3aed',
  Gas: '#ca8a04',
  Permits: '#16a34a',
  Meals: '#dc2626',
  Rental: '#3730a3',
  Other: '#6b7280',
};

function SpendingPieCard({ allJobData }) {
  const catData = useMemo(() => {
    const cats = {};
    for (const jd of allJobData) {
      for (const r of (jd.receipts || [])) {
        const cat = r.category || 'Other';
        cats[cat] = (cats[cat] || 0) + (parseFloat(r.amount) || 0);
      }
    }
    return Object.entries(cats)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value]) => ({
        label,
        value,
        color: CATEGORY_COLORS[label] || C.muted,
      }));
  }, [allJobData]);

  if (catData.length === 0) return null;

  const total = catData.reduce((s, d) => s + d.value, 0);

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ ...TF, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>
        Spending by Category
      </div>
      <div style={{ ...MF, fontSize: 11, color: C.muted, marginBottom: 14 }}>
        Total: $<AnimatedNumber value={total} decimals={2} />
      </div>
      <PieChart data={catData} size={90} />
    </div>
  );
}

// ─── Active Jobs Grid ──────────────────────────────────────────────────────────
function ActiveJobsGrid({ jobs, allJobData, onSelectJob, onNewJob }) {
  const [confettiJobId, setConfettiJobId] = useState(null);

  const sorted = useMemo(() =>
    [...jobs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [jobs]
  );

  // Check for 100% completion celebration
  useEffect(() => {
    for (let i = 0; i < sorted.length; i++) {
      const job = sorted[i];
      const itemCount = job.itemCount ?? 0;
      const receivedCount = job.receivedCount ?? 0;
      if (itemCount > 0 && receivedCount >= itemCount) {
        const celebKey = `sitekit_celebrated_${job.id}`;
        if (!localStorage.getItem(celebKey)) {
          localStorage.setItem(celebKey, Date.now().toString());
          setConfettiJobId(job.id);
          setTimeout(() => setConfettiJobId(null), 3000);
          break;
        }
      }
    }
  }, [sorted]);

  // Build a map from job id to jobData for last-active timestamps
  const jobDataMap = useMemo(() => {
    const map = {};
    for (const jd of allJobData) {
      if (jd.id) map[jd.id] = jd;
    }
    return map;
  }, [allJobData]);

  return (
    <div>
      <Confetti trigger={confettiJobId} />
      <div style={{ ...TF, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>
        Active Jobs
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 12,
      }}>
        {sorted.map(job => {
          const itemCount = job.itemCount ?? 0;
          const receivedCount = job.receivedCount ?? 0;
          const issueCount = job.issueCount ?? 0;
          const pct = itemCount > 0 ? Math.round((receivedCount / itemCount) * 100) : 0;
          const ringColor = pct > 75 ? C.green : pct > 40 ? C.blue : pct > 20 ? C.yellow : C.red;

          // Last active
          const jd = jobDataMap[job.id];
          const lastActive = jd ? getLastActivityDate(jd) : null;
          const lastActiveStr = timeAgo(lastActive);

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
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Progress Ring */}
                {itemCount > 0 && (
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    <ProgressRing percent={pct} size={44} color={ringColor} />
                    <div style={{
                      position: 'absolute', top: 0, left: 0, width: 44, height: 44,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ ...MF, fontSize: 10, fontWeight: 700, color: ringColor }}>
                        <AnimatedNumber value={pct} suffix="%" />
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TF, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                    {job.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                    {job.store}{job.location ? ` \u2014 ${job.location}` : ''}
                  </div>

                  {itemCount > 0 && (
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>
                      <AnimatedNumber value={receivedCount} />/{itemCount} received
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {issueCount > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: C.red,
                        padding: '2px 7px', borderRadius: 4,
                        background: C.redDim, border: `1px solid ${C.redBorder}`,
                      }}>
                        {issueCount} issue{issueCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {(job.receiptCount || 0) > 0 && (
                      <span style={{ fontSize: 10, color: C.faint }}>
                        {job.receiptCount} receipt{job.receiptCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Last updated */}
                  {lastActiveStr && (
                    <div style={{ fontSize: 9, color: C.faint, marginTop: 6 }}>
                      Last updated: {lastActiveStr}
                    </div>
                  )}
                </div>
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

        {/* Smart Notifications */}
        {!loading && jobs.length > 0 && (
          <SmartNotifications allJobData={allJobData} jobs={jobs} onSelectJob={onSelectJob} />
        )}

        {/* Spending PieChart */}
        {!loading && allJobData.some(jd => (jd.receipts || []).length > 0) && (
          <SpendingPieCard allJobData={allJobData} />
        )}

        {/* Active Jobs Grid */}
        {jobs.length > 0 ? (
          <ActiveJobsGrid jobs={jobs} allJobData={allJobData} onSelectJob={onSelectJob} onNewJob={onNewJob} />
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
