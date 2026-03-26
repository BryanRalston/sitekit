import React, { useState } from 'react';
import { C, TF } from '../tokens';
import Modal from './ui/Modal';
import { Btn } from './ui';
import { api } from '../api';
import { useToast } from './Toast';

const TYPES = [
  { key: 'feedback', icon: '\uD83D\uDCAC', label: 'Feedback' },
  { key: 'bug', icon: '\uD83D\uDC1B', label: 'Bug' },
  { key: 'feature', icon: '\uD83D\uDCA1', label: 'Feature' },
];

// Generate a stable device ID (persisted in localStorage)
function getDeviceId() {
  let id = localStorage.getItem('sitekit_device_id');
  if (!id) {
    id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('sitekit_device_id', id);
  }
  return id;
}

// Tunnel URL discovery via GitHub Gist (public, no auth needed)
const TUNNEL_GIST_RAW = 'https://gist.githubusercontent.com/BryanRalston/27f2cca438d4b1c7c22940a609d5f965/raw/tunnel_url.txt';
const TUNNEL_CACHE_KEY = 'sitekit_tunnel_url';
const TUNNEL_CACHE_TS_KEY = 'sitekit_tunnel_url_ts';
const TUNNEL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getTunnelUrl() {
  // 1. Manual override always wins
  const manual = localStorage.getItem('sitekit_feedback_url');
  if (manual) return manual;

  // 2. Check cache (TTL-based)
  const cached = localStorage.getItem(TUNNEL_CACHE_KEY);
  const cachedTs = parseInt(localStorage.getItem(TUNNEL_CACHE_TS_KEY) || '0', 10);
  if (cached && Date.now() - cachedTs < TUNNEL_CACHE_TTL) {
    return cached + '/api/sitekit/feedback';
  }

  // 3. Fetch from Gist (lazy — only on submit)
  try {
    const res = await fetch(TUNNEL_GIST_RAW, { cache: 'no-store' });
    if (!res.ok) return null;
    const url = (await res.text()).trim();
    if (!url || !url.startsWith('https://')) return null;
    // Cache it
    localStorage.setItem(TUNNEL_CACHE_KEY, url);
    localStorage.setItem(TUNNEL_CACHE_TS_KEY, String(Date.now()));
    return url + '/api/sitekit/feedback';
  } catch {
    return null;
  }
}

// Fire-and-forget remote feedback submission
async function sendRemoteFeedback(entry) {
  try {
    const url = await getTunnelUrl();
    if (!url) return; // No tunnel URL available — skip silently
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: entry.type,
        message: entry.message,
        page: entry.page,
        deviceId: getDeviceId(),
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {}); // Silently ignore network errors — local copy is the fallback
  } catch {
    // Ignore — don't block on remote failures
  }
}

export default function FeedbackWidget({ currentTab }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const entry = await api.submitFeedback({ type, message: message.trim(), page: currentTab || '' });
      // Fire-and-forget: also send to central Cortex server if configured
      sendRemoteFeedback(entry);
      toast.success("Thanks for your feedback!");
      setMessage('');
      setType('feedback');
      setOpen(false);
    } catch (err) {
      toast.error("Failed to submit feedback: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        data-tutorial="feedback-btn"
        onClick={() => setOpen(true)}
        aria-label="Submit feedback"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 20,
          zIndex: 100,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'rgba(249,115,22,0.85)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          transition: 'transform 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = C.accent; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(249,115,22,0.85)'; }}
      >
        {'\uD83D\uDCAC'}
      </button>

      {/* Feedback modal */}
      {open && (
        <Modal title="Send Feedback" onClose={() => setOpen(false)} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Type selector */}
            <div style={{ display: 'flex', gap: 8 }}>
              {TYPES.map(t => {
                const isSelected = type === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setType(t.key)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? C.accent : C.border}`,
                      background: isSelected ? C.accentDim : 'transparent',
                      color: isSelected ? C.accent : C.muted,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      minHeight: 40,
                      transition: 'all 0.12s',
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{t.icon}</span> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Message textarea */}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.6,
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderColor = C.accent}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
            />

            {/* Context hint */}
            {currentTab && (
              <div style={{ fontSize: 11, color: C.faint }}>
                Context: <span style={{ color: C.muted }}>{currentTab}</span> tab
              </div>
            )}

            {/* Remote collection info */}
            <div style={{ fontSize: 11, color: C.faint, background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
              Feedback is saved locally and sent to the development team when connected.
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={!message.trim() || submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Sending...' : 'Submit'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
