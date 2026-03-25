import React, { useState, useEffect, useRef, useCallback } from 'react';
import { C, TF } from '../tokens';
import { getOne, put } from '../db';

// ─── Tutorial Steps ─────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to SiteKit!',
    text: "Let's walk through how to manage your jobsite. This quick tour covers everything you need to know — from creating jobs to generating reports.",
    fullScreen: true,
  },
  {
    id: 'new-job',
    target: 'new-job',
    title: 'Create a Job',
    text: 'Start by creating a job for your store remodel. Enter the store name, number, and location. Each job tracks its own fixtures, photos, and receipts.',
  },
  {
    id: 'import',
    target: 'import',
    title: 'Import Fixtures',
    text: 'Upload your Assembly Detail PDF. SiteKit automatically parses vendors, sections, quantities, and delivery dates — no manual entry needed.',
  },
  {
    id: 'fixture-list',
    target: 'fixture-list',
    title: 'Browse Fixtures',
    text: 'Your fixtures are organized by vendor or section. Search, filter by status, and see delivery dates at a glance.',
  },
  {
    id: 'item-row',
    target: 'item-row',
    title: 'Quick Receive',
    text: 'Tap any fixture to update received quantities, flag missing parts, or document damage with photos.',
  },
  {
    id: 'status-filters',
    target: 'status-filters',
    title: 'Status Tracking',
    text: 'Filter by Pending, Partial, Received, or Issue to focus on what needs attention right now.',
  },
  {
    id: 'tab-visual',
    target: 'tab-visual',
    title: 'Visual Reference',
    text: 'Document installations by department. Photos you mark as Reference become a visual playbook for future jobs.',
  },
  {
    id: 'tab-receipts',
    target: 'tab-receipts',
    title: 'Receipts',
    text: 'Track purchase receipts by category. Snap photos of receipts and toggle submitted status for reimbursement.',
  },
  {
    id: 'report',
    target: 'report',
    title: 'Reports',
    text: 'Generate receiving reports for your project manager — grouped by vendor or section with issue summaries.',
  },
  {
    id: 'backup',
    target: 'backup',
    title: 'Backup',
    text: 'Download a JSON backup of all your data. Your data lives on this device — back it up regularly.',
  },
  {
    id: 'lock',
    target: 'lock',
    title: 'PIN Lock',
    text: 'Lock the app when you\'re done. Your 4-digit PIN protects your data from prying eyes on a shared device.',
  },
  {
    id: 'done',
    target: null,
    title: "You're ready to go!",
    text: 'SiteKit gets smarter with every job — your photo references and fixture knowledge carry forward. Create your first job and start tracking.',
    fullScreen: true,
    isFinal: true,
  },
];

// ─── Tooltip position helper ────────────────────────────────────────────────
function computeTooltipPos(rect, tooltipW, tooltipH) {
  const pad = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer below the target
  let top = rect.bottom + pad;
  let left = rect.left + rect.width / 2 - tooltipW / 2;

  // If tooltip would overflow the bottom, put it above
  if (top + tooltipH > vh - 16) {
    top = rect.top - tooltipH - pad;
  }

  // If still off the top, center vertically
  if (top < 16) {
    top = Math.max(16, rect.top + rect.height / 2 - tooltipH / 2);
  }

  // Horizontal bounds
  if (left < 12) left = 12;
  if (left + tooltipW > vw - 12) left = vw - tooltipW - 12;

  // Arrow direction: point toward the target
  let arrow = 'top'; // arrow on top of tooltip, pointing up (target is above)
  if (rect.bottom + pad + tooltipH <= vh - 16) {
    arrow = 'top'; // tooltip is below target
  } else {
    arrow = 'bottom'; // tooltip is above target
  }

  return { top, left, arrow };
}

// ─── Tutorial Component ─────────────────────────────────────────────────────
export default function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 320, h: 200 });
  const [fadeIn, setFadeIn] = useState(false);
  const tooltipRef = useRef(null);
  const current = STEPS[step];

  // Measure tooltip after render
  useEffect(() => {
    if (tooltipRef.current) {
      const r = tooltipRef.current.getBoundingClientRect();
      setTooltipSize({ w: r.width, h: r.height });
    }
  }, [step, targetRect]);

  // Find and measure target element
  const measureTarget = useCallback(() => {
    if (!current.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tutorial="${current.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Scroll into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
    }
  }, [current.target]);

  useEffect(() => {
    // Small delay to let navigation/rendering settle
    const t = setTimeout(measureTarget, 120);
    return () => clearTimeout(t);
  }, [step, measureTarget]);

  // Remeasure on resize/scroll
  useEffect(() => {
    const handler = () => measureTarget();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [measureTarget]);

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true));
  }, []);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finish();
    }
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const finish = async () => {
    try {
      await put('config', { key: 'tutorial_completed', value: true });
    } catch (_) { /* ignore */ }
    onClose();
  };

  const skip = () => finish();

  // Spotlight cutout via box-shadow
  const spotPad = 8;
  const spotRadius = 10;
  const hasSpot = targetRect && !current.fullScreen;

  // Tooltip position
  let tipPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  let arrowDir = null;
  if (hasSpot) {
    const pos = computeTooltipPos(targetRect, tooltipSize.w, tooltipSize.h);
    tipPos = { top: pos.top, left: pos.left, transform: 'none' };
    arrowDir = pos.arrow;
  }

  // ─── Full-screen steps (welcome + done) ─────────────────────────────────
  if (current.fullScreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }} onClick={skip}>
        <div onClick={e => e.stopPropagation()} style={{
          background: C.card,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: 16,
          padding: '36px 32px 28px',
          maxWidth: 380, width: '90vw',
          textAlign: 'center',
          animation: 'tutorialSlideIn 0.35s ease',
        }}>
          {/* Logo */}
          <div style={{ ...TF, fontSize: 32, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
            SITE<span style={{ color: C.text }}>KIT</span>
          </div>

          {current.isFinal && (
            <div style={{ fontSize: 26, marginBottom: 8 }}>&#127881;</div>
          )}

          <div style={{ ...TF, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>
            {current.title}
          </div>

          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
            {current.text}
          </div>

          {/* Progress dots */}
          <ProgressDots total={STEPS.length} current={step} />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            {step > 0 && (
              <button onClick={goBack} style={ghostBtnStyle}>
                &#8592; Back
              </button>
            )}
            <button onClick={current.isFinal ? finish : goNext} style={primaryBtnStyle}>
              {current.isFinal ? 'Finish' : 'Start Tour'}
            </button>
          </div>

          {!current.isFinal && (
            <button onClick={skip} style={{
              background: 'none', border: 'none', color: C.muted, fontSize: 12,
              cursor: 'pointer', marginTop: 14, padding: '4px 8px', fontFamily: 'inherit',
            }}>
              Skip tour
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Spotlight steps ────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      opacity: fadeIn ? 1 : 0,
      transition: 'opacity 0.25s ease',
    }}>
      {/* Backdrop with cutout */}
      <div onClick={skip} style={{
        position: 'absolute', inset: 0,
        background: 'transparent',
      }}>
        {/* Dark overlay - uses box-shadow to create spotlight cutout */}
        {hasSpot ? (
          <div style={{
            position: 'absolute',
            top: targetRect.top - spotPad,
            left: targetRect.left - spotPad,
            width: targetRect.width + spotPad * 2,
            height: targetRect.height + spotPad * 2,
            borderRadius: spotRadius,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
            zIndex: 10001,
            pointerEvents: 'none',
          }} />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.75)',
          }} />
        )}
      </div>

      {/* Spotlight ring glow */}
      {hasSpot && (
        <div style={{
          position: 'absolute',
          top: targetRect.top - spotPad - 2,
          left: targetRect.left - spotPad - 2,
          width: targetRect.width + (spotPad + 2) * 2,
          height: targetRect.height + (spotPad + 2) * 2,
          borderRadius: spotRadius + 2,
          border: `2px solid ${C.accent}`,
          pointerEvents: 'none',
          zIndex: 10002,
          opacity: 0.6,
        }} />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          ...tipPos,
          maxWidth: 320, width: 'calc(100vw - 24px)',
          background: C.card,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: 12,
          padding: '18px 20px 16px',
          zIndex: 10003,
          boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
          animation: 'tutorialSlideIn 0.3s ease',
        }}
      >
        {/* Arrow */}
        {hasSpot && arrowDir === 'top' && (
          <div style={{
            position: 'absolute', top: -7,
            left: Math.min(
              Math.max(
                (targetRect.left + targetRect.width / 2) - (typeof tipPos.left === 'number' ? tipPos.left : 0) - 7,
                16
              ),
              290
            ),
            width: 14, height: 14,
            background: C.card,
            border: `1px solid ${C.accentBorder}`,
            borderRight: 'none', borderBottom: 'none',
            transform: 'rotate(45deg)',
          }} />
        )}
        {hasSpot && arrowDir === 'bottom' && (
          <div style={{
            position: 'absolute', bottom: -7,
            left: Math.min(
              Math.max(
                (targetRect.left + targetRect.width / 2) - (typeof tipPos.left === 'number' ? tipPos.left : 0) - 7,
                16
              ),
              290
            ),
            width: 14, height: 14,
            background: C.card,
            border: `1px solid ${C.accentBorder}`,
            borderLeft: 'none', borderTop: 'none',
            transform: 'rotate(45deg)',
          }} />
        )}

        {/* Step counter */}
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', marginBottom: 6 }}>
          Step {step + 1} of {STEPS.length}
        </div>

        {/* Title */}
        <div style={{ ...TF, fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 6 }}>
          {current.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 16 }}>
          {current.text}
        </div>

        {/* Progress dots */}
        <ProgressDots total={STEPS.length} current={step} />

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          {step > 0 && (
            <button onClick={goBack} style={ghostBtnStyle}>
              &#8592; Back
            </button>
          )}
          <button onClick={goNext} style={primaryBtnStyle}>
            {step === STEPS.length - 1 ? 'Finish' : 'Next \u2192'}
          </button>
          <button onClick={skip} style={{
            background: 'none', border: 'none', color: C.muted, fontSize: 11,
            cursor: 'pointer', marginLeft: 'auto', padding: '4px 8px', fontFamily: 'inherit',
          }}>
            Skip
          </button>
        </div>
      </div>

      {/* Inject keyframe animation */}
      <style>{`
        @keyframes tutorialSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Progress Dots ──────────────────────────────────────────────────────────
function ProgressDots({ total, current }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current ? 10 : 6,
          height: 6,
          borderRadius: 3,
          background: i === current ? C.accent : C.border,
          transition: 'all 0.2s ease',
        }} />
      ))}
    </div>
  );
}

// ─── Shared button styles ───────────────────────────────────────────────────
const primaryBtnStyle = {
  background: C.accent, color: '#1a1a1a', border: 'none',
  borderRadius: 6, padding: '10px 20px', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const ghostBtnStyle = {
  background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// ─── Tutorial prompt (first-launch check) ───────────────────────────────────
export function TutorialPrompt({ onStart, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onDismiss}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card,
        border: `1px solid ${C.accentBorder}`,
        borderRadius: 14,
        padding: '28px 24px 22px',
        maxWidth: 340, width: '88vw',
        textAlign: 'center',
      }}>
        <div style={{ ...TF, fontSize: 26, fontWeight: 700, color: C.accent, marginBottom: 3 }}>
          SITE<span style={{ color: C.text }}>KIT</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          First time here? Take a quick tour to learn how SiteKit helps you manage your jobsite.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onDismiss} style={ghostBtnStyle}>
            Maybe Later
          </button>
          <button onClick={onStart} style={primaryBtnStyle}>
            Take the Tour
          </button>
        </div>
      </div>
    </div>
  );
}
