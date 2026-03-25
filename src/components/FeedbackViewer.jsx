import React, { useState, useEffect, useCallback } from 'react';
import { C, TF } from '../tokens';
import Modal from './ui/Modal';
import { Btn } from './ui';
import { api } from '../api';
import { useToast } from './Toast';

const TYPE_ICONS = {
  feedback: '\uD83D\uDCAC',
  bug: '\uD83D\uDC1B',
  feature: '\uD83D\uDCA1',
};

const STATUS_CONFIG = {
  new: { label: 'New', color: C.accent, bg: C.accentDim, border: C.accentBorder },
  reviewed: { label: 'Reviewed', color: C.blue, bg: C.blueDim, border: C.blueBorder },
  resolved: { label: 'Resolved', color: C.green, bg: C.greenDim, border: C.greenBorder },
};

const STATUS_CYCLE = ['new', 'reviewed', 'resolved'];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return diffDays + 'd ago';
  return d.toLocaleDateString();
}

export default function FeedbackViewer({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast, confirm: toastConfirm } = useToast();

  const loadFeedback = useCallback(async () => {
    try {
      const data = await api.getFeedback();
      setEntries(data);
    } catch (err) {
      toast.error('Failed to load feedback: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const handleToggleStatus = async (entry) => {
    const currentIdx = STATUS_CYCLE.indexOf(entry.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    try {
      await api.updateFeedbackStatus(entry.id, nextStatus);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: nextStatus } : e));
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id) => {
    const yes = await toastConfirm('Delete this feedback entry?', { confirmLabel: 'Delete', dangerous: true });
    if (!yes) return;
    try {
      await api.deleteFeedback(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success('Feedback deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleExport = () => {
    try {
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sitekit-feedback-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Feedback exported');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const newCount = entries.filter(e => e.status === 'new').length;

  return (
    <Modal title="Feedback" onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            {newCount > 0 && (
              <span style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                background: C.accentDim, color: C.accent, fontSize: 11, fontWeight: 700,
              }}>
                {newCount} new
              </span>
            )}
          </div>
          <Btn variant="ghost" onClick={handleExport} style={{ fontSize: 11 }}>
            Export JSON
          </Btn>
        </div>

        {/* Entries list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>
            No feedback yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
            {entries.map(entry => {
              const statusCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.new;
              return (
                <div key={entry.id} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.border}`,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {/* Top row: type icon, message, delete */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                      {TYPE_ICONS[entry.type] || TYPE_ICONS.feedback}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: C.text, lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}>
                        {entry.message}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      style={{
                        background: 'none', border: 'none', color: C.muted,
                        cursor: 'pointer', fontSize: 13, opacity: 0.4, padding: '2px 4px',
                        flexShrink: 0, minWidth: 28, minHeight: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                      title="Delete"
                    >
                      &#x2715;
                    </button>
                  </div>

                  {/* Bottom row: meta info + status badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: C.faint }}>{formatDate(entry.createdAt)}</span>
                    {entry.page && (
                      <span style={{ fontSize: 11, color: C.faint }}>
                        on <span style={{ color: C.muted }}>{entry.page}</span>
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleStatus(entry)}
                      title="Click to cycle status"
                      style={{
                        marginLeft: 'auto',
                        padding: '2px 10px',
                        borderRadius: 10,
                        border: `1px solid ${statusCfg.border}`,
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        minHeight: 24,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {statusCfg.label}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
