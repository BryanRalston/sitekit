import React, { useState, useEffect, useRef } from 'react';
import { C, MF } from '../tokens';

export default function GlobalSearch({ job, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ fixtures: [], departments: [], receipts: [] });
  const inputRef = useRef(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!query || query.length < 2 || !job) {
      setResults({ fixtures: [], departments: [], receipts: [] });
      return;
    }
    const q = query.toLowerCase();

    const fixtures = (job.items || []).filter(item =>
      (item.itemNumber || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.vendor || '').toLowerCase().includes(q) ||
      (item.section || '').toLowerCase().includes(q) ||
      (item.fixtureBook || '').toLowerCase().includes(q)
    ).slice(0, 20);

    const departments = (job.departments || []).filter(dept =>
      (dept.name || '').toLowerCase().includes(q)
    ).slice(0, 10);

    const receipts = (job.receipts || []).filter(r =>
      (r.store || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q)
    ).slice(0, 10);

    setResults({ fixtures, departments, receipts });
  }, [query, job]);

  const total = results.fixtures.length + results.departments.length + results.receipts.length;

  const handleNavigate = (tab, id) => {
    onNavigate(tab, id);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      backdropFilter: 'blur(5px)', zIndex: 250,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Search header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 18, color: C.muted }}>&#x1F50D;</span>
        <input
          ref={inputRef}
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search fixtures, departments, receipts..."
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: C.text, fontSize: 16, outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.muted,
          cursor: 'pointer', fontSize: 20, minWidth: 44, minHeight: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>&#x2715;</button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {query.length < 2 && (
          <div style={{ textAlign: 'center', color: C.muted, marginTop: 40, fontSize: 13 }}>
            Type at least 2 characters to search
          </div>
        )}

        {query.length >= 2 && total === 0 && (
          <div style={{ textAlign: 'center', color: C.muted, marginTop: 40, fontSize: 13 }}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Fixtures results */}
        {results.fixtures.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Fixtures ({results.fixtures.length})
            </div>
            {results.fixtures.map(item => (
              <div key={item.id} onClick={() => handleNavigate('fixtures', item.id)} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                marginBottom: 4, transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 11 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{item.description}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {item.vendor}{item.section ? ` \u00B7 ${item.section}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Departments results */}
        {results.departments.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Departments ({results.departments.length})
            </div>
            {results.departments.map(dept => (
              <div key={dept.id} onClick={() => handleNavigate('visual', dept.id)} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color || C.accent }} />
                  <span style={{ fontSize: 13, color: C.text }}>{dept.name}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{(dept.photos || []).length} photos</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Receipts results */}
        {results.receipts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Receipts ({results.receipts.length})
            </div>
            {results.receipts.map(r => (
              <div key={r.id} onClick={() => handleNavigate('receipts', r.id)} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...MF, fontSize: 14, fontWeight: 700, color: C.text }}>
                    ${(r.amount || 0).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 12, color: C.muted }}>{r.store}</span>
                  <span style={{ fontSize: 10, color: C.faint }}>{r.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
