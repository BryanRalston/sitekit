import React from 'react';
import { C } from '../tokens';

export function SkeletonLine({ width = "100%", height = 14, style }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonCard({ style }) {
  return (
    <div style={{ padding: 14, borderBottom: `1px solid ${C.borderLight}`, ...style }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <SkeletonLine width={50} height={12} />
        <SkeletonLine width={40} height={12} />
        <SkeletonLine width={60} height={12} />
      </div>
      <SkeletonLine width="80%" height={14} style={{ marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 12 }}>
        <SkeletonLine width={60} height={11} />
        <SkeletonLine width={60} height={11} />
        <SkeletonLine width={70} height={11} />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 8 }) {
  return <>{Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}</>;
}
