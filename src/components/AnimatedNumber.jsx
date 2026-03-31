import React, { useState, useEffect, useRef } from 'react';

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

export default function AnimatedNumber({
  value,
  duration = 500,
  prefix = '',
  suffix = '',
  decimals = 0,
  style,
  formatFn,
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(0);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const target = typeof value === 'number' ? value : parseFloat(value) || 0;

    // Only animate the first time (from 0 to target)
    if (!hasAnimatedRef.current && target > 0) {
      hasAnimatedRef.current = true;
      fromRef.current = 0;
      startRef.current = performance.now();

      const animate = (now) => {
        const elapsed = now - startRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        const current = fromRef.current + (target - fromRef.current) * eased;
        setDisplay(current);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    } else {
      // After first animation, just snap to the value
      setDisplay(target);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  let formatted;
  if (formatFn) {
    formatted = formatFn(display);
  } else {
    formatted = `${prefix}${decimals > 0 ? display.toFixed(decimals) : Math.round(display)}${suffix}`;
  }

  return <span style={style}>{formatted}</span>;
}
