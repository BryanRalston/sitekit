import React, { useState, useEffect, useRef, useCallback } from 'react';
import { C, TF } from '../tokens';
import { getOne, put } from '../db';

// ─── Tutorial Steps ─────────────────────────────────────────────────────────
const STEPS = [
  // ── Welcome ──
  {
    id: 'welcome', target: null, fullScreen: true,
    title: 'Welcome to SiteKit!',
    text: "Your complete jobsite command center \u2014 fixtures, deliveries, photos, receipts, crew hours, and issue tracking. All offline, all on your phone. Let\u2019s walk through it.",
  },

  // ── Getting Started ──
  {
    id: 'new-job', target: 'new-job', interactive: true, triggerClick: true,
    title: '1. Create a Job',
    text: 'Every remodel starts here. Tap to create a job with the store name, number, and location. You can manage multiple jobs from the sidebar.',
  },
  {
    id: 'import', target: 'import', interactive: true, triggerClick: true,
    title: '2. Import Your Fixture List',
    text: 'Upload the Assembly Detail PDF. SiteKit parses vendors, item numbers, sections, quantities, and delivery dates \u2014 500+ items in seconds.',
  },

  // ── Fixtures Tab ──
  {
    id: 'fixture-list', target: 'fixture-list',
    title: '3. Your Fixture List',
    text: 'Fixtures organized by vendor or section. Tap any group header to collapse it. Tap the \u270F\uFE0F pencil to rename a section \u2014 "D-WALL-COSM-GND" becomes "Cosmetics Gondola".',
  },
  {
    id: 'dashboard-cards', target: null,
    title: '4. Dashboard Cards',
    text: 'Tap "Dashboard" at the top to see what needs attention: overdue deliveries, arriving this week, unreported issues, and received today. Tap any card to filter your list instantly.',
  },
  {
    id: 'delivery-timeline', target: null,
    title: '5. Delivery Timeline',
    text: "Timeline pills show what\u2019s arriving each day this week. Tap a day to filter. When your PM asks \"When\u2019s the next delivery?\" \u2014 you\u2019ll know instantly.",
  },
  {
    id: 'item-row', target: 'item-row',
    title: '6. Quick Receive',
    text: 'Tap the \u2713 button on any item to mark it received right from the list \u2014 quantity and date, done. No need to open the full details for simple receives.',
  },
  {
    id: 'ref-photo', target: null,
    title: '7. Reference Photos',
    text: 'Open any fixture item and snap a reference photo \u2014 it saves with the item for quick visual reference later. A \uD83D\uDCF7 icon shows on items that have photos.',
  },
  {
    id: 'status-filters', target: 'status-filters',
    title: '8. Status Filters',
    text: 'Filter by Pending, Partial, Received, Overdue, or Issue. Combine with search and section filters to find exactly what you need.',
  },

  // ── Issues ──
  {
    id: 'issues', target: 'issues-badge',
    title: '9. Flag Issues',
    text: 'Missing parts, damage, or need to reorder? Flag it with a description, quantity, and photo. Tap the colored badges on any item row to edit issues inline \u2014 no modal needed.',
  },
  {
    id: 'quick-report', target: null,
    title: '10. Quick Report',
    text: 'Need to report multiple issues at once? Tap Quick Report in the toolbar, select the items, and generate one formatted message for your PM. One tap to share via text or email.',
  },
  {
    id: 'tab-issues', target: 'tab-issues',
    title: '11. Issues Dashboard',
    text: 'The Issues tab shows all missing parts, damage, and additional orders across every fixture. Edit quantities inline, filter by unreported, share in bulk, track resolution.',
  },

  // ── Department Photos ──
  {
    id: 'tab-visual', target: 'tab-visual', interactive: true, triggerClick: true,
    title: '12. Department Photos',
    text: 'Create departments for each area of the store. Take photos as you install \u2014 build a visual reference that carries forward to future jobs.',
  },

  // ── Receipts ──
  {
    id: 'tab-receipts', target: 'tab-receipts', interactive: true, triggerClick: true,
    title: '13. Receipt Tracking',
    text: 'Track every purchase with photos. Take a picture of your receipt, tap Scan Receipt, and SiteKit reads the total, date, and store automatically. Categorize as Materials, Tools, Gas, Meals, and more.',
  },
  {
    id: 'gas-tracking', target: null,
    title: '14. Gas & Expense Views',
    text: 'Toggle to Gas Only for gas-specific stats \u2014 total spend, fill-ups, average per fill. Filter by week or month. Generate printable receipt reports for your PM.',
  },

  // ── Crew Hours ──
  {
    id: 'tab-crew', target: 'tab-crew', interactive: true, triggerClick: true,
    title: '15. Crew Hours',
    text: 'Add your crew, set daily hour targets, and log hours on the weekly grid. The summary card shows available vs. logged hours with shortage alerts.',
  },

  // ── Reports & Tools ──
  {
    id: 'report', target: 'report',
    title: '16. Reports',
    text: 'Generate reports grouped by vendor or section with a "Prepared By" field. Print directly or share with your project manager. Receipt reports include photo thumbnails.',
  },
  {
    id: 'global-search', target: 'global-search',
    title: '17. Search Everything',
    text: 'Search across fixtures, departments, and receipts all at once. Tap \uD83D\uDD0D or press Ctrl+K. Section nicknames are searchable too.',
  },

  // ── Data Safety ──
  {
    id: 'offline', target: null,
    title: '18. Works Offline',
    text: "No signal on the jobsite? No problem. SiteKit saves everything on your device. A yellow banner shows when you\u2019re offline \u2014 your data is safe.",
  },
  {
    id: 'backup', target: 'backup',
    title: '19. Back Up Your Data',
    text: 'All data lives on this device. Download a backup regularly \u2014 SiteKit reminds you every 7 days. Backups include all photos and can be restored on any device.',
  },

  // ── Finishing Up ──
  {
    id: 'feedback', target: 'feedback-btn',
    title: '20. Send Feedback',
    text: 'See something that could be better? The \uD83D\uDCAC button is always there. Bug reports, feature ideas, anything \u2014 it goes straight to the development team.',
  },
  {
    id: 'lock', target: 'lock',
    title: '21. Lock Your App',
    text: 'Lock the app when you\u2019re done. Your PIN is securely hashed \u2014 safe even on a shared device. Change it anytime from the sidebar.',
  },

  // ── Done ──
  {
    id: 'done', target: null, fullScreen: true, isFinal: true,
    title: "You\u2019re ready to go!",
    text: "SiteKit was built on real jobsites by real contractors. Every feature exists because someone needed it in the field. Your fixtures, photos, receipts, and crew hours \u2014 all in one place, always on your phone.\n\nGo run your remodel. SiteKit has your back.",
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
  const [animKey, setAnimKey] = useState(0); // drives re-mount animation on step change
  const tooltipRef = useRef(null);
  const current = STEPS[step];

  // Check if target element exists for interactive steps
  const [targetExists, setTargetExists] = useState(false);

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
      setTargetExists(false);
      return;
    }
    const el = document.querySelector(`[data-tutorial="${current.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setTargetExists(true);
      // Scroll into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
      setTargetExists(false);
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

  // Bump animKey on step change for entrance animation
  useEffect(() => {
    setAnimKey(k => k + 1);
  }, [step]);

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

  // Handle "Try it" — click the target element, then advance after delay
  const handleTryIt = () => {
    const el = document.querySelector(`[data-tutorial="${current.target}"]`);
    if (el) {
      el.click();
      setTimeout(goNext, 500);
    } else {
      goNext();
    }
  };

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

  // Determine button mode for this step
  const isInteractive = current.interactive && current.triggerClick && targetExists;

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
        <div key={animKey} onClick={e => e.stopPropagation()} style={{
          background: C.card,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: 16,
          padding: '36px 32px 28px',
          maxWidth: 380, width: '90vw',
          textAlign: 'center',
          animation: 'tutorialFadeSlide 0.35s ease',
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

          {/* Step counter text */}
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>
            Step {step + 1} of {STEPS.length}
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

        {/* Inject keyframe animations */}
        <style>{`
          @keyframes tutorialFadeSlide {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
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
        key={animKey}
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
          animation: 'tutorialFadeSlide 0.3s ease',
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

        {/* Step counter text */}
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {step > 0 && (
            <button onClick={goBack} style={ghostBtnStyle}>
              &#8592; Back
            </button>
          )}

          {isInteractive ? (
            /* Interactive step: "Try it" as primary action */
            <button onClick={handleTryIt} style={tryItBtnStyle}>
              Try it &#8594;
            </button>
          ) : (
            /* Normal step: standard Next button */
            <button onClick={goNext} style={primaryBtnStyle}>
              {step === STEPS.length - 1 ? 'Finish' : 'Next \u2192'}
            </button>
          )}

          {/* Skip link — also serves as "Skip" for interactive steps */}
          <button onClick={isInteractive ? goNext : skip} style={{
            background: 'none', border: 'none', color: C.muted, fontSize: 11,
            cursor: 'pointer', marginLeft: 'auto', padding: '4px 8px', fontFamily: 'inherit',
            minHeight: 44, display: 'inline-flex', alignItems: 'center',
          }}>
            {isInteractive ? 'Skip' : 'Skip tour'}
          </button>
        </div>
      </div>

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes tutorialFadeSlide {
          from { opacity: 0; transform: translateY(10px); }
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

const tryItBtnStyle = {
  background: C.accent, color: '#1a1a1a', border: 'none',
  borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 6, letterSpacing: '0.01em',
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
