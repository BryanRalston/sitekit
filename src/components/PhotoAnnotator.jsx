import React, { useRef, useState, useEffect, useCallback } from 'react';
import { C } from '../tokens';
import { Btn } from './ui';

export default function PhotoAnnotator({ imageSrc, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#f85149');
  const [lineWidth, setLineWidth] = useState(3);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  // Resolve imageSrc (may be a promise or a string)
  const [resolvedSrc, setResolvedSrc] = useState(null);
  useEffect(() => {
    if (!imageSrc) return;
    if (typeof imageSrc === 'string') {
      setResolvedSrc(imageSrc);
    } else if (typeof imageSrc.then === 'function') {
      imageSrc.then(src => setResolvedSrc(src));
    }
  }, [imageSrc]);

  // Load image onto canvas
  useEffect(() => {
    if (!resolvedSrc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(window.innerWidth - 40, 800);
      const scale = maxW / img.width;
      canvas.width = maxW;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = resolvedSrc;
  }, [resolvedSrc]);

  // Redraw all strokes on canvas (after undo)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke[0].color;
      ctx.lineWidth = stroke[0].lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => { redraw(); }, [strokes, redraw]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
      color, lineWidth,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    setCurrentStroke([pos]);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrentStroke(prev => [...prev, pos]);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    if (currentStroke.length > 1) {
      setStrokes(prev => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  };

  const undo = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onSave(dataUrl);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)',
      zIndex: 400, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center',
        padding: '8px 16px', background: C.card, borderRadius: 10,
        border: `1px solid ${C.border}`, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {/* Color picker */}
        {['#f85149', '#d29922', '#58a6ff', '#3fb950'].map(c => (
          <button key={c} onClick={() => setColor(c)} style={{
            width: 28, height: 28, borderRadius: '50%', background: c,
            border: color === c ? '3px solid white' : '2px solid transparent',
            cursor: 'pointer', flexShrink: 0,
          }} />
        ))}
        <div style={{ width: 1, height: 24, background: C.border, margin: '0 4px' }} />
        {/* Line width */}
        {[2, 4, 8].map(w => (
          <button key={w} onClick={() => setLineWidth(w)} style={{
            width: 32, height: 32, borderRadius: 6, background: lineWidth === w ? C.accentDim : 'transparent',
            border: `1px solid ${lineWidth === w ? C.accentBorder : C.border}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{ width: w * 2 + 4, height: w * 2 + 4, borderRadius: '50%', background: C.text }} />
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: C.border, margin: '0 4px' }} />
        <Btn variant="ghost" size="sm" onClick={undo} disabled={strokes.length === 0}>Undo</Btn>
      </div>

      {/* Canvas */}
      {!loaded && resolvedSrc && (
        <div style={{ color: C.muted, fontSize: 13 }}>Loading image...</div>
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        style={{
          maxWidth: '100%', maxHeight: 'calc(100vh - 160px)',
          borderRadius: 8, border: `2px solid ${C.border}`,
          touchAction: 'none', cursor: 'crosshair',
          display: loaded ? 'block' : 'none',
        }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={!loaded}>Save Annotations</Btn>
      </div>
    </div>
  );
}
