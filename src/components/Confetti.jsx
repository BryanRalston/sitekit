import React, { useState, useEffect } from 'react';

const PARTICLE_COUNT = 24;
const COLORS = ['#ea580c', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed', '#0d9488', '#dc2626', '#db2777'];

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

export default function Confetti({ trigger, duration = 2000 }) {
  const [active, setActive] = useState(false);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    const ps = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: randomBetween(10, 90),
      color: COLORS[i % COLORS.length],
      delay: randomBetween(0, 400),
      rotate: randomBetween(0, 360),
      size: randomBetween(5, 10),
      drift: randomBetween(-30, 30),
      type: Math.random() > 0.5 ? 'rect' : 'circle',
    }));
    setParticles(ps);
    setActive(true);
    const timer = setTimeout(() => setActive(false), duration);
    return () => clearTimeout(timer);
  }, [trigger, duration]);

  if (!active) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', zIndex: 9999, overflow: 'hidden',
    }}>
      <style>{`
        @keyframes sitekit-confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: -20,
            width: p.type === 'rect' ? p.size : p.size * 0.8,
            height: p.type === 'rect' ? p.size * 0.5 : p.size * 0.8,
            borderRadius: p.type === 'circle' ? '50%' : 2,
            background: p.color,
            animation: `sitekit-confetti-fall ${randomBetween(1.2, 2.0)}s ease-out forwards`,
            animationDelay: `${p.delay}ms`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
