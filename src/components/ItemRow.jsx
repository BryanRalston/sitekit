import React, { useRef, useState, useCallback } from 'react';
import { C, MF, getItemStatus } from '../tokens';
import { Badge } from './ui';
import { useMobile } from '../hooks/useApi';
import { haptic } from '../utils/haptic';

function issueIcon(hasIssue, reportedDate, resolvedDate, unreportedEmoji, title) {
  if (!hasIssue) return null;
  if (resolvedDate) return <span title={`${title} — Resolved`} style={{ fontSize: 11 }}>✅</span>;
  if (reportedDate) return <span title={`${title} — Reported`} style={{ fontSize: 11 }}>🟡</span>;
  return <span title={`${title} — Unreported`} style={{ fontSize: 11 }}>{unreportedEmoji}</span>;
}

const ISSUE_BADGE_STYLES = {
  damaged: { color: C.red, bg: C.redDim, border: C.redBorder, label: 'Damaged' },
  missing: { color: C.yellow, bg: C.yellowDim, border: C.yellowBorder, label: 'Missing' },
  additional: { color: C.blue, bg: C.blueDim, border: C.blueBorder, label: 'Need' },
};

function IssueBadge({ type, qty, onClick }) {
  const s = ISSUE_BADGE_STYLES[type];
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
        lineHeight: '16px', display: 'inline-block',
      }}
    >
      {s.label}{qty ? `: ${qty}` : ''}
    </span>
  );
}

// Swipe threshold in px
const SWIPE_THRESHOLD = 60;
const SWIPE_ACTION_WIDTH = 72;

export default function ItemRow({ item, onEdit, onQuickReceive, showQtyCol, groupBy, bulkMode, isSelected, onToggleSelect, onIssueBadgeClick, onSwipeDamage, onSwipeReceive }) {
  const status = getItemStatus(item);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = status === "overdue";
  const isToday = item.delDate === today && parseInt(item.qtyReceived || "0") === 0;
  const isMobile = useMobile();

  // Swipe state (mobile only)
  const touchStartRef = useRef({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const swipeDirectionRef = useRef(null); // 'horizontal' | 'vertical' | null

  const handleTouchStart = useCallback((e) => {
    if (!isMobile || bulkMode) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeDirectionRef.current = null;
    setSwiping(false);
  }, [isMobile, bulkMode]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || bulkMode) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Determine direction on first significant movement
    if (!swipeDirectionRef.current) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        swipeDirectionRef.current = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
      }
    }

    // Don't interfere with scrolling
    if (swipeDirectionRef.current !== 'horizontal') return;

    e.preventDefault(); // prevent scroll while swiping horizontally

    // Clamp: left swipe = negative (damage), right swipe = positive (receive)
    const clamped = Math.max(-SWIPE_ACTION_WIDTH, Math.min(SWIPE_ACTION_WIDTH, deltaX));
    setSwipeOffset(clamped);
    if (!swiping && Math.abs(clamped) > 10) setSwiping(true);
  }, [isMobile, bulkMode, swiping]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || bulkMode) return;
    // If swiped past threshold, keep action visible; otherwise snap back
    if (Math.abs(swipeOffset) >= SWIPE_THRESHOLD) {
      // Lock at action width
      setSwipeOffset(swipeOffset > 0 ? SWIPE_ACTION_WIDTH : -SWIPE_ACTION_WIDTH);
    } else {
      setSwipeOffset(0);
      setSwiping(false);
    }
    swipeDirectionRef.current = null;
  }, [isMobile, bulkMode, swipeOffset]);

  const handleDamageAction = useCallback((e) => {
    e.stopPropagation();
    haptic(80);
    setSwipeOffset(0);
    setSwiping(false);
    if (onSwipeDamage) onSwipeDamage(item);
  }, [item, onSwipeDamage]);

  const handleReceiveAction = useCallback((e) => {
    e.stopPropagation();
    haptic();
    setSwipeOffset(0);
    setSwiping(false);
    if (onSwipeReceive) onSwipeReceive(item);
  }, [item, onSwipeReceive]);

  const resetSwipe = useCallback(() => {
    setSwipeOffset(0);
    setSwiping(false);
  }, []);

  /* ── Mobile card layout ── */
  if (isMobile) {
    const showDamageAction = swipeOffset < -10;
    const showReceiveAction = swipeOffset > 10;

    return (
      <div
        data-testid={`item-row-${item.id}`}
        data-item-id={item.id}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderBottom: `1px solid ${C.borderLight}`,
        }}
      >
        {/* Left action (Receive) — revealed on swipe right */}
        <div
          onClick={handleReceiveAction}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: SWIPE_ACTION_WIDTH,
            background: C.green,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 2,
            opacity: showReceiveAction ? 1 : 0,
            transition: swiping ? 'none' : 'opacity 0.2s',
          }}
        >
          <span style={{ fontSize: 18, color: '#fff' }}>✓</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>Received</span>
        </div>

        {/* Right action (Damage) — revealed on swipe left */}
        <div
          onClick={handleDamageAction}
          style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: SWIPE_ACTION_WIDTH,
            background: C.red,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 2,
            opacity: showDamageAction ? 1 : 0,
            transition: swiping ? 'none' : 'opacity 0.2s',
          }}
        >
          <span style={{ fontSize: 18, color: '#fff' }}>⚠️</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>Issue</span>
        </div>

        {/* Sliding row content */}
        <div
          onClick={() => { if (swiping || Math.abs(swipeOffset) > 10) { resetSwipe(); return; } onEdit(item); }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            padding: "10px 14px",
            cursor: "pointer",
            background: isOverdue ? "rgba(248,81,73,0.05)" : C.card,
            transform: `translateX(${swipeOffset}px)`,
            transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
            position: 'relative', zIndex: 1,
          }}
        >
          {/* Row 1: codes + status badge */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            {bulkMode && (
              <div onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
                style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isSelected ? C.accent : C.faint}`,
                  background: isSelected ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  minWidth: 20, flexShrink: 0 }}>
                {isSelected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
              </div>
            )}
            <span style={{ ...MF, color: C.accent, fontSize: 11, fontWeight: 600 }}>{item.itemNumber || "---"}</span>
            {item.materialClass && <span style={{ ...MF, fontSize: 9, color: C.faint }}>· {item.materialClass}</span>}
            {item.fixtureBook && <span style={{ ...MF, fontSize: 9, color: C.muted }}>· {item.fixtureBook}</span>}
            <div style={{ marginLeft: "auto" }}>
              <Badge status={status} />
            </div>
          </div>

          {/* Row 2: description */}
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>
            {item.description || "No description"}
          </div>

          {/* Row 3: quantities + date + flags */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: C.muted }}>
            {showQtyCol && <span>Ord: {item.qtyOrdered || "---"}</span>}
            <span>Rec: {item.qtyReceived || "---"}</span>
            {item.delDate && <span>{isToday ? <span style={{color: C.blue, fontWeight: 700}}>TODAY</span> : item.delDate}</span>}
            <div style={{ display: "flex", gap: 3, marginLeft: "auto", alignItems: "center" }}>
              {issueIcon(item.damaged, item.damageReported, item.damageResolved, '🔴', 'Damaged')}
              {issueIcon(item.missingParts, item.missingPartsReported, item.missingPartsResolved, '⚠️', 'Missing Parts')}
              {issueIcon(item.additionalOrders, item.additionalOrdersReported, item.additionalOrdersResolved, '📦', 'Additional Orders')}
              {item.hasPhoto && <span>📷</span>}
            </div>
          </div>

          {/* Issue qty badges (mobile) */}
          {(item.damaged || item.missingParts || item.additionalOrders) && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {item.damaged && (
                <IssueBadge type="damaged" qty={item.damagedQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'damaged'); } : undefined} />
              )}
              {item.missingParts && (
                <IssueBadge type="missing" qty={item.missingPartsQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'missing'); } : undefined} />
              )}
              {item.additionalOrders && (
                <IssueBadge type="additional" qty={item.additionalOrdersQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'additional'); } : undefined} />
              )}
            </div>
          )}

          {/* Section/vendor context */}
          {groupBy === "vendor" && item.section && (
            <div style={{ fontSize: 10, color: C.teal, marginTop: 3 }}>§ {item.section}</div>
          )}
          {groupBy === "section" && item.vendor && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{item.vendor}</div>
          )}
        </div>
      </div>
    );
  }

  /* ── Desktop grid layout ── */
  const cols = showQtyCol
    ? "60px 55px 90px 1fr 60px 60px 75px 85px 95px"
    : "60px 55px 90px 1fr 60px 75px 85px 95px";

  // If bulk mode, prepend a checkbox column
  const gridCols = bulkMode ? `36px ${cols}` : cols;

  return (
    <div
      data-testid={`item-row-${item.id}`}
      data-item-id={item.id}
      onClick={() => onEdit(item)}
      style={{
        display: "grid", gridTemplateColumns: gridCols,
        padding: "0 14px", minHeight: 44, alignItems: "center",
        borderBottom: `1px solid ${C.borderLight}`,
        cursor: "pointer", transition: "background 0.1s",
        background: isOverdue ? "rgba(248,81,73,0.05)" : "transparent",
      }}
      onMouseEnter={e => e.currentTarget.style.background = isOverdue ? "rgba(248,81,73,0.1)" : C.cardHover}
      onMouseLeave={e => e.currentTarget.style.background = isOverdue ? "rgba(248,81,73,0.05)" : "transparent"}
    >
      {/* Bulk checkbox */}
      {bulkMode && (
        <div onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4,
            border: `2px solid ${isSelected ? C.accent : C.faint}`,
            background: isSelected ? C.accent : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", minWidth: 18
          }}>
            {isSelected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
          </div>
        </div>
      )}

      {/* Item # */}
      <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber || "---"}</span>

      {/* Class */}
      <span style={{ ...MF, fontSize: 9, color: C.faint }}>{item.materialClass || "---"}</span>

      {/* Fixture Book */}
      <span style={{ ...MF, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.fixtureBook || "---"}
      </span>

      {/* Description */}
      <span style={{ fontSize: 12, color: C.text, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.description}
        {groupBy === "section" && item.vendor && (
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 7 }}>{item.vendor}</span>
        )}
        {groupBy === "vendor" && item.section && (
          <span style={{ fontSize: 10, color: C.teal, marginLeft: 7 }}>§ {item.section}</span>
        )}
      </span>

      {/* Ordered qty */}
      {showQtyCol && (
        <span style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
          {item.showQtyOrdered !== false ? (item.qtyOrdered || "---") : "---"}
        </span>
      )}

      {/* Received qty */}
      <span style={{ fontSize: 11, textAlign: "center" }}>{item.qtyReceived || "---"}</span>

      {/* Delivery date */}
      <span style={{ fontSize: 10, color: isOverdue ? C.red : C.muted, display: "flex", alignItems: "center", gap: 3 }}>
        {isOverdue && <span style={{ fontSize: 11 }}>🕐</span>}
        {item.delDate || "---"}
        {isToday && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px",
            borderRadius: 4, background: C.blueDim, border: `1px solid ${C.blueBorder}`,
            color: C.blue, marginLeft: 2
          }}>TODAY</span>
        )}
      </span>

      {/* Flags + issue qty badges */}
      <span style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
        {item.damaged && (
          <IssueBadge type="damaged" qty={item.damagedQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'damaged'); } : undefined} />
        )}
        {item.missingParts && (
          <IssueBadge type="missing" qty={item.missingPartsQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'missing'); } : undefined} />
        )}
        {item.additionalOrders && (
          <IssueBadge type="additional" qty={item.additionalOrdersQty} onClick={onIssueBadgeClick ? (e) => { e.stopPropagation(); onIssueBadgeClick(item.id, 'additional'); } : undefined} />
        )}
        {item.hasPhoto && <span style={{ fontSize: 11 }}>📷</span>}
      </span>

      {/* Status badge */}
      <Badge status={status} />
    </div>
  );
}
