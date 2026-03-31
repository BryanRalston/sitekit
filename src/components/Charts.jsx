import React, { useMemo } from 'react';
import { C, MF } from '../tokens';

// ─── ProgressRing ────────────────────────────────────────────────────────────
export function ProgressRing({ percent = 0, size = 48, color = C.accent, label, strokeWidth }) {
  const sw = strokeWidth || Math.max(3, size * 0.08);
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const dashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={C.borderLight}
          strokeWidth={sw}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {label && (
        <span style={{ fontSize: 9, color: C.muted, fontWeight: 600, textAlign: 'center', lineHeight: 1.1, maxWidth: size + 8 }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ─── BarChart (horizontal bars) ──────────────────────────────────────────────
export function BarChart({ data = [], maxValue: maxProp }) {
  const maxVal = maxProp || Math.max(...data.map(d => d.value), 1);

  if (data.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {data.map((d, i) => {
        const pct = Math.min(100, (d.value / maxVal) * 100);
        return (
          <div key={d.label || i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontSize: 10, color: C.muted, fontWeight: 600,
              minWidth: 70, maxWidth: 90, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
            }}>
              {d.label}
            </div>
            <div style={{ flex: 1, height: 14, borderRadius: 4, background: C.borderLight, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: d.color || C.accent,
                width: `${pct}%`,
                transition: 'width 0.5s ease',
                minWidth: pct > 0 ? 2 : 0,
              }} />
            </div>
            <div style={{ ...MF, fontSize: 10, fontWeight: 700, color: C.text, minWidth: 36, textAlign: 'right' }}>
              {typeof d.formatValue === 'function' ? d.formatValue(d.value) : d.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MiniLineChart (sparkline) ───────────────────────────────────────────────
export function MiniLineChart({ data = [], color = C.accent, width = 120, height = 32 }) {
  const points = useMemo(() => {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const padX = 2;
    const padY = 3;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    return data.map((v, i) => ({
      x: padX + (i / (data.length - 1)) * usableW,
      y: padY + usableH - ((v - min) / range) * usableH,
    }));
  }, [data, width, height]);

  if (!points || points.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 9, color: C.faint }}>No data</span>
      </div>
    );
  }

  const polylineStr = points.map(p => `${p.x},${p.y}`).join(' ');
  // Gradient fill polygon
  const fillStr = [
    `${points[0].x},${height}`,
    ...points.map(p => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${height}`,
  ].join(' ');

  const gradId = `sparkGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillStr} fill={`url(#${gradId})`} />
      <polyline
        points={polylineStr}
        fill="none" stroke={color}
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5} fill={color}
      />
    </svg>
  );
}

// ─── PieChart (donut) ────────────────────────────────────────────────────────
export function PieChart({ data = [], size = 100 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total === 0 || data.length === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size - 4) / 2;
  const innerR = outerR * 0.55; // donut hole

  const slices = useMemo(() => {
    const result = [];
    let cumAngle = -Math.PI / 2; // start from top

    for (const d of data) {
      const pct = d.value / total;
      const angle = pct * 2 * Math.PI;
      const startAngle = cumAngle;
      const endAngle = cumAngle + angle;

      const x1Outer = cx + outerR * Math.cos(startAngle);
      const y1Outer = cy + outerR * Math.sin(startAngle);
      const x2Outer = cx + outerR * Math.cos(endAngle);
      const y2Outer = cy + outerR * Math.sin(endAngle);

      const x1Inner = cx + innerR * Math.cos(endAngle);
      const y1Inner = cy + innerR * Math.sin(endAngle);
      const x2Inner = cx + innerR * Math.cos(startAngle);
      const y2Inner = cy + innerR * Math.sin(startAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      const path = [
        `M ${x1Outer} ${y1Outer}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
        `L ${x1Inner} ${y1Inner}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
        'Z',
      ].join(' ');

      result.push({
        path,
        color: d.color || C.accent,
        label: d.label,
        value: d.value,
        pct: Math.round(pct * 100),
      });

      cumAngle = endAngle;
    }
    return result;
  }, [data, total, cx, cy, outerR, innerR]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} style={{ transition: 'opacity 0.2s' }}>
            <title>{s.label}: ${typeof s.value === 'number' ? s.value.toFixed(2) : s.value} ({s.pct}%)</title>
          </path>
        ))}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 80 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: C.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
            <span style={{ ...MF, fontSize: 9, color: C.text, fontWeight: 700 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
