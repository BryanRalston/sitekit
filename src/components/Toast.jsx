import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { C } from '../tokens';
import { haptic } from '../utils/haptic';

const TOAST_TYPES = {
  success: { color: C.green, icon: '\u2713', border: C.greenBorder, bg: C.greenDim },
  error:   { color: C.red,   icon: '\u2715', border: C.redBorder,   bg: C.redDim },
  info:    { color: C.blue,  icon: '\u2139', border: C.blueBorder,  bg: C.blueDim },
  warning: { color: C.yellow, icon: '\u26A0', border: C.yellowBorder, bg: C.yellowDim },
};

const MAX_TOASTS = 3;

const ToastContext = createContext(null);

let nextId = 1;

function ToastItem({ toast, onDismiss, onAction }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);
  const cfg = TOAST_TYPES[toast.type] || TOAST_TYPES.info;

  useEffect(() => {
    if (toast.duration !== 0) {
      timerRef.current = setTimeout(() => {
        setExiting(true);
        setTimeout(() => onDismiss(toast.id), 200);
      }, toast.duration || 4000);
    }
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  const handleAction = (actionKey) => {
    clearTimeout(timerRef.current);
    if (onAction) onAction(toast.id, actionKey);
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      onClick={!toast.actions ? handleDismiss : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', minWidth: 280, maxWidth: 420,
        background: C.card, borderRadius: 10,
        borderLeft: `4px solid ${cfg.color}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        cursor: toast.actions ? 'default' : 'pointer',
        animation: exiting ? 'toastOut 0.2s ease forwards' : 'toastIn 0.25s ease forwards',
        pointerEvents: 'auto',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, color: cfg.color, fontWeight: 700, flexShrink: 0,
      }}>
        {cfg.icon}
      </div>

      {/* Message */}
      <div style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.4 }}>
        {toast.message}
      </div>

      {/* Action buttons (for confirm toasts) */}
      {toast.actions && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {toast.actions.map(a => (
            <button
              key={a.key}
              onClick={() => handleAction(a.key)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', minHeight: 30,
                background: a.variant === 'danger' ? C.redDim : a.variant === 'primary' ? C.accent : 'transparent',
                color: a.variant === 'danger' ? C.red : a.variant === 'primary' ? '#1a1a1a' : C.muted,
                border: `1px solid ${a.variant === 'danger' ? C.redBorder : a.variant === 'primary' ? C.accent : C.border}`,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Close button (non-action toasts) */}
      {!toast.actions && (
        <button
          onClick={handleDismiss}
          style={{
            background: 'none', border: 'none', color: C.faint,
            cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0,
            minWidth: 24, minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          \u2715
        </button>
      )}
    </div>
  );
}

function ToastContainer({ toasts, onDismiss, onAction }) {
  return (
    <>
      <style>{`
        .toast-container-outer {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 999;
          display: flex;
          flex-direction: column-reverse;
          gap: 8px;
          pointer-events: none;
        }
        @media (min-width: 769px) {
          .toast-container-outer {
            left: auto;
            right: 20px;
            transform: none;
          }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(16px); }
        }
      `}</style>
      <div className="toast-container-outer">
        {toasts.slice(0, MAX_TOASTS).map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} onAction={onAction} />
        ))}
      </div>
    </>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const resolversRef = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    // If there was a confirm resolver and it was never resolved, resolve true (default action proceeds)
    // For undo toasts dismissed without clicking Undo, false triggers the deleteCallback
    if (resolversRef.current[id]) {
      resolversRef.current[id](false);
      delete resolversRef.current[id];
    }
  }, []);

  const handleAction = useCallback((id, actionKey) => {
    if (resolversRef.current[id]) {
      resolversRef.current[id](actionKey === 'yes' || actionKey === 'undo');
      delete resolversRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, options = {}) => {
    const id = nextId++;
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, type, message, duration: options.duration, actions: options.actions }]);
    return id;
  }, []);

  const undoTimersRef = useRef({});

  const toast = {
    success: (msg, opts) => addToast('success', msg, opts),
    error: (msg, opts) => addToast('error', msg, opts),
    info: (msg, opts) => addToast('info', msg, opts),
    warning: (msg, opts) => addToast('warning', msg, opts),
    /**
     * Show an undo toast. Calls deleteCallback after timeout unless user clicks Undo.
     * @param {string} message - e.g. "Receipt deleted"
     * @param {Function} undoCallback - called if user clicks Undo
     * @param {Function} deleteCallback - called when timeout expires (actual delete)
     * @param {number} timeout - ms before real delete (default 5000)
     */
    undo: (message, undoCallback, deleteCallback, timeout = 5000) => {
      haptic();
      const id = nextId++;
      // Set timer for the real delete
      undoTimersRef.current[id] = setTimeout(() => {
        deleteCallback();
        delete undoTimersRef.current[id];
        setToasts(prev => prev.filter(t => t.id !== id));
      }, timeout);
      setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), {
        id,
        type: 'warning',
        message,
        duration: 0, // managed by our own timer
        actions: [
          { key: 'undo', label: 'Undo', variant: 'primary' },
        ],
      }]);
      // Store the undo callback in resolvers so handleAction can find it
      resolversRef.current[id] = (didUndo) => {
        clearTimeout(undoTimersRef.current[id]);
        delete undoTimersRef.current[id];
        if (didUndo) undoCallback();
        else deleteCallback();
      };
      return id;
    },
  };

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      const id = nextId++;
      resolversRef.current[id] = resolve;
      setToasts(prev => [
        ...prev.slice(-(MAX_TOASTS - 1)),
        {
          id,
          type: options.type || 'warning',
          message,
          duration: 0, // Don't auto-dismiss confirms
          actions: [
            { key: 'no', label: options.cancelLabel || 'Cancel', variant: 'ghost' },
            { key: 'yes', label: options.confirmLabel || 'Yes', variant: options.dangerous ? 'danger' : 'primary' },
          ],
        },
      ]);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} onAction={handleAction} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
