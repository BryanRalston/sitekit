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
      await api.submitFeedback({ type, message: message.trim(), page: currentTab || '' });
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
