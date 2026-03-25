import React, { useState, useEffect, useRef, useCallback } from 'react';
import { C, TF, MF } from '../tokens';
import { api } from '../api';

const NUM_DIGITS = 4;

function PinDots({ digits, error }) {
  return (
    <div style={{
      display: 'flex', gap: 16, justifyContent: 'center',
      animation: error ? 'shake 0.4s ease' : 'none',
    }}>
      {Array.from({ length: NUM_DIGITS }).map((_, i) => (
        <div key={i} style={{
          width: 20, height: 20, borderRadius: '50%',
          border: `2px solid ${digits[i] != null ? C.accent : C.border}`,
          background: digits[i] != null ? C.accent : 'transparent',
          transition: 'all 0.15s ease',
        }} />
      ))}
    </div>
  );
}

function PinBoxes({ digits, error }) {
  return (
    <div style={{
      display: 'flex', gap: 12, justifyContent: 'center',
      animation: error ? 'shake 0.4s ease' : 'none',
    }}>
      {Array.from({ length: NUM_DIGITS }).map((_, i) => (
        <div key={i} style={{
          width: 52, height: 60, borderRadius: 10,
          border: `2px solid ${digits[i] != null ? C.accent : C.border}`,
          background: C.card,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...MF, fontSize: 28, fontWeight: 700, color: C.text,
          transition: 'border-color 0.15s ease',
        }}>
          {digits[i] != null ? digits[i] : ''}
        </div>
      ))}
    </div>
  );
}

function NumberPad({ onDigit, onBackspace, onSubmit, disabled }) {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'back', 0, 'enter'];

  const btnBase = {
    width: 64, height: 64, borderRadius: '50%',
    border: `1px solid ${C.border}`,
    background: C.card,
    color: C.text,
    ...TF, fontSize: 24, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.12s ease',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 64px)',
      gap: 12, justifyContent: 'center',
    }}>
      {keys.map((key) => {
        if (key === 'back') {
          return (
            <button key="back" onClick={onBackspace} disabled={disabled} style={{
              ...btnBase,
              fontSize: 20,
              opacity: disabled ? 0.4 : 1,
            }}
              onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = C.cardHover; }}
              onMouseLeave={e => e.currentTarget.style.background = C.card}
            >
              ←
            </button>
          );
        }
        if (key === 'enter') {
          return (
            <button key="enter" onClick={onSubmit} disabled={disabled} style={{
              ...btnBase,
              fontSize: 18,
              background: C.accentDim,
              borderColor: C.accentBorder,
              color: C.accent,
              opacity: disabled ? 0.4 : 1,
            }}
              onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(249,115,22,0.25)'; }}
              onMouseLeave={e => e.currentTarget.style.background = C.accentDim}
            >
              ✓
            </button>
          );
        }
        return (
          <button key={key} onClick={() => onDigit(key)} disabled={disabled} style={{
            ...btnBase,
            opacity: disabled ? 0.4 : 1,
          }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = C.cardHover; }}
            onMouseLeave={e => e.currentTarget.style.background = C.card}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

function usePin() {
  const [digits, setDigits] = useState([]);

  const addDigit = useCallback((d) => {
    setDigits(prev => prev.length < NUM_DIGITS ? [...prev, d] : prev);
  }, []);

  const removeDigit = useCallback(() => {
    setDigits(prev => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => setDigits([]), []);

  return { digits, addDigit, removeDigit, clear, isFull: digits.length === NUM_DIGITS, pinStr: digits.join('') };
}

function SetupView({ onSetup }) {
  const pin1 = usePin();
  const pin2 = usePin();
  const [step, setStep] = useState(1); // 1 = enter, 2 = confirm
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const activePin = step === 1 ? pin1 : pin2;

  const handleDigit = (d) => {
    setError('');
    activePin.addDigit(d);
  };

  const handleSubmit = async () => {
    if (step === 1) {
      if (!pin1.isFull) return;
      setStep(2);
      return;
    }
    // Step 2: confirm
    if (!pin2.isFull) return;
    if (pin1.pinStr !== pin2.pinStr) {
      setError('PINs do not match');
      pin2.clear();
      return;
    }
    setLoading(true);
    try {
      await api.auth.setup(pin1.pinStr);
      onSetup();
    } catch (err) {
      setError(err.message);
      pin1.clear();
      pin2.clear();
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 4 digits entered on step 2
  useEffect(() => {
    if (step === 2 && pin2.isFull) {
      handleSubmit();
    }
  }, [pin2.digits.length]);

  // Keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(parseInt(e.key));
      else if (e.key === 'Backspace') activePin.removeDigit();
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, pin1.digits.length, pin2.digits.length]);

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
        maxWidth: 360, width: '100%',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...TF, fontSize: 36, fontWeight: 700, color: C.accent, letterSpacing: '0.02em' }}>
            SITE<span style={{ color: C.text }}>KIT</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            Set a 4-digit PIN to protect your data
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>
          {step === 1 ? 'Enter new PIN' : 'Confirm PIN'}
        </div>

        {/* PIN boxes */}
        <PinBoxes digits={activePin.digits} error={!!error} />

        {/* Error */}
        {error && (
          <div style={{ fontSize: 12, color: C.red, fontWeight: 600, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Number pad */}
        <NumberPad
          onDigit={handleDigit}
          onBackspace={() => activePin.removeDigit()}
          onSubmit={handleSubmit}
          disabled={loading}
        />

        {step === 2 && (
          <button onClick={() => { setStep(1); pin2.clear(); setError(''); }} style={{
            background: 'none', border: 'none', color: C.muted,
            cursor: 'pointer', fontSize: 12, padding: '6px 12px',
          }}>
            ← Start over
          </button>
        )}
      </div>
    </div>
  );
}

function VerifyView({ onUnlock }) {
  const pin = usePin();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDigit = (d) => {
    setError(false);
    pin.addDigit(d);
  };

  const handleSubmit = useCallback(async () => {
    if (!pin.isFull) return;
    setLoading(true);
    try {
      const result = await api.auth.verify(pin.pinStr);
      if (result.valid) {
        sessionStorage.setItem('sitekit_unlocked', 'true');
        onUnlock();
      } else {
        setError(true);
        pin.clear();
      }
    } catch (err) {
      setError(true);
      pin.clear();
    } finally {
      setLoading(false);
    }
  }, [pin.pinStr, pin.isFull]);

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.isFull) {
      handleSubmit();
    }
  }, [pin.digits.length]);

  // Keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(parseInt(e.key));
      else if (e.key === 'Backspace') pin.removeDigit();
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pin.digits.length]);

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
        maxWidth: 360, width: '100%',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...TF, fontSize: 36, fontWeight: 700, color: C.accent, letterSpacing: '0.02em' }}>
            SITE<span style={{ color: C.text }}>KIT</span>
          </div>
        </div>

        {/* Prompt */}
        <div style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>
          Enter PIN
        </div>

        {/* PIN dots */}
        <PinDots digits={pin.digits} error={error} />

        {/* Error */}
        {error && (
          <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>
            Wrong PIN
          </div>
        )}

        {/* Number pad */}
        <NumberPad
          onDigit={handleDigit}
          onBackspace={() => pin.removeDigit()}
          onSubmit={handleSubmit}
          disabled={loading}
        />
      </div>
    </div>
  );
}

export default function PinGate({ onUnlock }) {
  const [status, setStatus] = useState(null); // null = loading, 'setup', 'locked', 'unlocked'

  useEffect(() => {
    // Check if already unlocked this session
    if (sessionStorage.getItem('sitekit_unlocked') === 'true') {
      setStatus('unlocked');
      onUnlock();
      return;
    }

    // Check server for PIN configuration
    api.auth.status().then(data => {
      if (data.configured) {
        setStatus('locked');
      } else {
        setStatus('setup');
      }
    }).catch(() => {
      // If server is unreachable, let through (dev mode)
      setStatus('unlocked');
      onUnlock();
    });
  }, []);

  if (status === null) {
    // Loading state
    return (
      <div style={{
        minHeight: '100vh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...TF, fontSize: 28, fontWeight: 700, color: C.accent, marginBottom: 8 }}>
            SITE<span style={{ color: C.text }}>KIT</span>
          </div>
          <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (status === 'unlocked') return null;

  if (status === 'setup') {
    return <SetupView onSetup={() => {
      sessionStorage.setItem('sitekit_unlocked', 'true');
      setStatus('unlocked');
      onUnlock();
    }} />;
  }

  return <VerifyView onUnlock={() => {
    setStatus('unlocked');
    onUnlock();
  }} />;
}
