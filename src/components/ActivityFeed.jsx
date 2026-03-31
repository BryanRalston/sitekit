import React, { useState, useMemo } from 'react';
import { C } from '../tokens';

export default function ActivityFeed({ job }) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const items = job.items || [];
    const departments = job.departments || [];
    const receipts = job.receipts || [];

    // Items received today
    const receivedToday = items.filter(i => i.dateReceived === todayStr).length;

    // Issues flagged today (check timestamps on reported fields)
    let issuesFlagged = 0;
    for (const item of items) {
      if (item.missingPartsReported && item.missingPartsReported.startsWith(todayStr)) issuesFlagged++;
      if (item.damageReported && item.damageReported.startsWith(todayStr)) issuesFlagged++;
      if (item.additionalOrdersReported && item.additionalOrdersReported.startsWith(todayStr)) issuesFlagged++;
    }

    // Photos added today
    let photosToday = 0;
    for (const dept of departments) {
      for (const photo of (dept.photos || [])) {
        if (photo.createdAt && photo.createdAt.startsWith(todayStr)) photosToday++;
      }
    }

    // Receipts added today
    const receiptsToday = receipts.filter(r => r.createdAt && r.createdAt.startsWith(todayStr)).length;

    const total = receivedToday + issuesFlagged + photosToday + receiptsToday;

    return { receivedToday, issuesFlagged, photosToday, receiptsToday, total };
  }, [job]);

  // Build summary parts
  const parts = [];
  if (stats.receivedToday > 0) parts.push(`${stats.receivedToday} received`);
  if (stats.issuesFlagged > 0) parts.push(`${stats.issuesFlagged} issue${stats.issuesFlagged !== 1 ? 's' : ''} flagged`);
  if (stats.photosToday > 0) parts.push(`${stats.photosToday} photo${stats.photosToday !== 1 ? 's' : ''}`);
  if (stats.receiptsToday > 0) parts.push(`${stats.receiptsToday} receipt${stats.receiptsToday !== 1 ? 's' : ''}`);

  const summaryText = stats.total === 0
    ? 'No activity today'
    : parts.join(', ');

  return (
    <div className="no-print" style={{
      background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 18px', background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Today
        </span>
        <span style={{ fontSize: 11, color: stats.total > 0 ? C.text : C.faint }}>
          {summaryText}
        </span>
        {stats.total > 0 && (
          <span style={{
            ...{ fontFamily: "'JetBrains Mono', monospace" },
            fontSize: 9, fontWeight: 700, color: C.teal,
            background: C.tealDim, borderRadius: 8, padding: '1px 6px',
          }}>
            {stats.total}
          </span>
        )}
        <span style={{
          fontSize: 8, color: C.faint, marginLeft: 'auto',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>
          {String.fromCharCode(9660)}
        </span>
      </button>
      {expanded && stats.total > 0 && (
        <div style={{
          padding: '0 18px 10px', display: 'flex', gap: 12, flexWrap: 'wrap',
        }}>
          {stats.receivedToday > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13 }}>&#9989;</span>
              <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>{stats.receivedToday} received</span>
            </div>
          )}
          {stats.issuesFlagged > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13 }}>&#9888;&#65039;</span>
              <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>{stats.issuesFlagged} issue{stats.issuesFlagged !== 1 ? 's' : ''} flagged</span>
            </div>
          )}
          {stats.photosToday > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13 }}>&#128247;</span>
              <span style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>{stats.photosToday} photo{stats.photosToday !== 1 ? 's' : ''}</span>
            </div>
          )}
          {stats.receiptsToday > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13 }}>&#129534;</span>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>{stats.receiptsToday} receipt{stats.receiptsToday !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
