import React from 'react';
import { C, TF } from '../tokens';

export default function JobOverview({ jobs, onSelectJob }) {
  if (!jobs || jobs.length === 0) return null;

  // Sort by most recent activity (createdAt descending, matching api.getJobs sort)
  const sorted = [...jobs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '28px 24px',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ ...TF, fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          All Jobs
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          {jobs.length} job{jobs.length !== 1 ? 's' : ''} — tap a card to open
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {sorted.map(job => {
            const itemCount = job.item_count ?? 0;
            const receivedCount = job.received_count ?? 0;
            const issueCount = job.issue_count ?? 0;
            const pct = itemCount > 0 ? Math.round((receivedCount / itemCount) * 100) : 0;

            const createdDate = job.createdAt ? new Date(job.createdAt) : null;
            const daysActive = createdDate
              ? Math.max(1, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)))
              : null;

            const barColor = pct > 75 ? C.green : pct > 40 ? C.blue : pct > 20 ? C.yellow : C.red;
            const barBg = pct > 75 ? C.greenDim : pct > 40 ? C.blueDim : pct > 20 ? C.yellowDim : C.redDim;

            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job.id)}
                style={{
                  background: C.card, borderRadius: 12, padding: '16px 18px',
                  border: `1px solid ${C.border}`, cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.background = C.cardHover;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.background = C.card;
                }}
              >
                <div style={{ ...TF, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                  {job.name}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
                  {job.store}{job.location ? ` \u2014 ${job.location}` : ''}
                </div>

                {/* Progress bar */}
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

                {/* Stats row */}
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
                  {daysActive !== null && (
                    <span style={{ fontSize: 10, color: C.faint }}>
                      {daysActive} day{daysActive !== 1 ? 's' : ''} active
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
        </div>
      </div>
    </div>
  );
}
