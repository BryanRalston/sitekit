import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C, TF, MF } from '../tokens';
import { Btn } from './ui';
import { useMobile } from '../hooks/useApi';
import { api } from '../api';
import ReceiptModal from './ReceiptModal';
import { useToast } from './Toast';

// Category color definitions (pastel bg + dark text)
export const CATEGORIES = {
  Materials: { bg: '#DBEAFE', color: '#1E40AF', border: 'rgba(30,64,175,0.25)' },
  Tools:     { bg: '#F3E8FF', color: '#6B21A8', border: 'rgba(107,33,168,0.25)' },
  Gas:       { bg: '#FEF3C7', color: '#92400E', border: 'rgba(146,64,14,0.25)' },
  Permits:   { bg: '#D1FAE5', color: '#065F46', border: 'rgba(6,95,70,0.25)' },
  Meals:     { bg: '#FFE4E6', color: '#9F1239', border: 'rgba(159,18,57,0.25)' },
  Rental:    { bg: '#E0E7FF', color: '#3730A3', border: 'rgba(55,48,163,0.25)' },
  Other:     { bg: '#F0F2F7', color: '#475569', border: 'rgba(71,85,105,0.25)' },
};

function formatCurrency(amount) {
  const n = parseFloat(amount) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ReceiptsTab({ job, onRefresh }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editReceipt, setEditReceipt] = useState(null); // null=closed, {}=new, receipt=editing
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | pending | submitted
  const [collapsedStores, setCollapsedStores] = useState(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const isMobile = useMobile();
  const { toast, confirm: toastConfirm } = useToast();

  const loadReceipts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getReceipts(job.id);
      setReceipts(data);
    } catch (err) {
      console.error('Failed to load receipts:', err);
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const handleRefresh = useCallback(async () => {
    await loadReceipts();
    onRefresh();
  }, [loadReceipts, onRefresh]);

  const handleToggleSubmitted = async (receipt) => {
    try {
      await api.toggleSubmitted(receipt.id);
      await loadReceipts();
    } catch (err) {
      toast.error('Toggle failed: ' + err.message);
    }
  };

  const handleMarkAllSubmitted = async () => {
    try {
      await api.markAllSubmitted(job.id);
      await loadReceipts();
      toast.success('All receipts marked submitted');
    } catch (err) {
      toast.error('Mark all submitted failed: ' + err.message);
    }
  };

  const toggleStoreCollapse = (store) => {
    setCollapsedStores(prev => {
      const next = new Set(prev);
      if (next.has(store)) next.delete(store);
      else next.add(store);
      return next;
    });
  };

  // Filter receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      const ql = search.toLowerCase();
      const matchSearch = !ql
        || (r.store || '').toLowerCase().includes(ql)
        || (r.notes || '').toLowerCase().includes(ql)
        || (r.category || '').toLowerCase().includes(ql);
      const matchStatus = filterStatus === 'all'
        || (filterStatus === 'submitted' && r.submitted)
        || (filterStatus === 'pending' && !r.submitted);
      return matchSearch && matchStatus;
    });
  }, [receipts, search, filterStatus]);

  // Group by store
  const grouped = useMemo(() => {
    const groups = {};
    filteredReceipts.forEach(r => {
      const store = r.store || 'No Store';
      if (!groups[store]) groups[store] = [];
      groups[store].push(r);
    });
    // Sort stores alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredReceipts]);

  // Stats
  const stats = useMemo(() => {
    const totalSpend = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const gasTotal = receipts.filter(r => r.category === 'Gas').reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const pendingCount = receipts.filter(r => !r.submitted).length;
    return { totalSpend, gasTotal, pendingCount, count: receipts.length };
  }, [receipts]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const cats = {};
    receipts.forEach(r => {
      const cat = r.category || 'Other';
      cats[cat] = (cats[cat] || 0) + (parseFloat(r.amount) || 0);
    });
    return Object.entries(cats).sort(([,a], [,b]) => b - a);
  }, [receipts]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
        Loading receipts...
      </div>
    );
  }

  // ── Empty state ──
  if (receipts.length === 0 && !search && filterStatus === 'all') {
    return (
      <>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center', gap: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 4 }}>🧾</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>No receipts yet</div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 360, lineHeight: 1.7 }}>
            Track every purchase for this job. Add receipts manually, snap photos of paper receipts, and keep everything organized by store and category.
          </div>
          <Btn variant="primary" size="lg" icon="+" onClick={() => setEditReceipt({})} style={{ marginTop: 8 }}>
            Add First Receipt
          </Btn>
        </div>
        {editReceipt !== null && (
          <ReceiptModal
            receipt={editReceipt?.id ? editReceipt : null}
            jobId={job.id}
            onSave={handleRefresh}
            onClose={() => setEditReceipt(null)}
            onDelete={editReceipt?.id ? async () => { await api.deleteReceipt(editReceipt.id); setEditReceipt(null); await handleRefresh(); } : undefined}
          />
        )}
      </>
    );
  }

  const statCards = [
    { label: 'Total Spend', value: formatCurrency(stats.totalSpend), color: C.accent },
    { label: 'Receipts', value: String(stats.count), color: C.blue },
    { label: 'Gas Total', value: formatCurrency(stats.gasTotal), color: C.yellow },
    { label: 'Pending', value: String(stats.pendingCount), color: stats.pendingCount > 0 ? C.accent : C.green },
  ];

  return (
    <>
      {/* Summary bar */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.card }}>
        {/* Stat cards row */}
        <div style={{
          display: 'flex', gap: 10, padding: '12px 18px 8px',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {statCards.map(s => (
            <div key={s.label} style={{
              flex: isMobile ? '0 0 auto' : 1, minWidth: isMobile ? 120 : 0,
              padding: '10px 14px', background: C.bg, borderRadius: 8,
              border: `1px solid ${C.borderLight}`,
            }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ ...MF, fontSize: 18, fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
          {stats.pendingCount > 0 && !isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Btn variant="green" size="sm" onClick={handleMarkAllSubmitted}>
                Mark All Submitted
              </Btn>
            </div>
          )}
        </div>

        {/* Mobile mark-all button */}
        {stats.pendingCount > 0 && isMobile && (
          <div style={{ padding: '0 18px 8px' }}>
            <Btn variant="green" size="sm" full onClick={handleMarkAllSubmitted}>
              Mark All Submitted
            </Btn>
          </div>
        )}

        {/* Category breakdown pills */}
        {categoryBreakdown.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, padding: '4px 18px 10px',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            overflowX: isMobile ? 'auto' : 'visible',
            WebkitOverflowScrolling: 'touch',
          }}>
            {categoryBreakdown.map(([cat, total]) => {
              const catStyle = CATEGORIES[cat] || CATEGORIES.Other;
              return (
                <span key={cat} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: catStyle.bg, color: catStyle.color,
                  border: `1px solid ${catStyle.border}`, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {cat}: {formatCurrency(total)}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Toolbar */}
      {isMobile ? (
        <div className="no-print" style={{ flexShrink: 0, background: C.card, borderBottom: `1px solid ${C.border}` }}>
          {/* Row 1: Search + Filter toggle */}
          <div style={{ padding: '10px 14px 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 14 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search store, notes..."
                style={{
                  width: '100%', background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, padding: '6px 12px 6px 30px',
                  fontSize: 13, outline: 'none', minHeight: 44, boxSizing: 'border-box',
                }} />
            </div>
            <button onClick={() => setShowMobileFilters(v => !v)} style={{
              position: 'relative', background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: 'pointer', padding: '0 12px',
              minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              ☰
              {(filterStatus !== 'all' || search) && (
                <span style={{
                  position: 'absolute', top: 6, right: 6, width: 7, height: 7,
                  borderRadius: '50%', background: C.accent,
                }} />
              )}
            </button>
          </div>

          {/* Row 2: Add Receipt */}
          <div style={{ padding: '4px 14px 10px', display: 'flex', gap: 8 }}>
            <Btn variant="primary" size="sm" icon="+" onClick={() => setEditReceipt({})} style={{ flex: 1, justifyContent: 'center', minHeight: 44 }}>
              Add Receipt
            </Btn>
          </div>

          {/* Mobile filter dropdown */}
          {showMobileFilters && (
            <div style={{
              margin: '0 14px 10px', padding: 14, background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Status</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All', count: receipts.length },
                    { id: 'pending', label: 'Pending', count: receipts.filter(r => !r.submitted).length },
                    { id: 'submitted', label: 'Submitted', count: receipts.filter(r => r.submitted).length },
                  ].map(f => (
                    <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
                      background: filterStatus === f.id ? C.accent : 'transparent',
                      color: filterStatus === f.id ? '#fff' : C.muted,
                      border: `1px solid ${filterStatus === f.id ? C.accent : C.border}`,
                    }}>
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Desktop toolbar */
        <div className="no-print" style={{
          padding: '10px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', gap: 9, alignItems: 'center', flexShrink: 0,
          background: C.card, flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search store name, notes..."
              style={{
                width: '100%', background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text, padding: '6px 12px 6px 30px',
                fontSize: 12, outline: 'none', minHeight: 36,
              }} />
          </div>

          {/* Status filters */}
          {[
            { id: 'all', label: 'All', count: receipts.length },
            { id: 'pending', label: 'Pending', count: receipts.filter(r => !r.submitted).length },
            { id: 'submitted', label: 'Submitted', count: receipts.filter(r => r.submitted).length },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 30,
              background: filterStatus === f.id ? C.accent : 'transparent',
              color: filterStatus === f.id ? '#fff' : C.muted,
              border: `1px solid ${filterStatus === f.id ? C.accent : C.border}`,
            }}>
              {f.label} ({f.count})
            </button>
          ))}

          <div style={{ height: 20, width: 1, background: C.border, flexShrink: 0 }} />

          <Btn variant="primary" size="sm" icon="+" onClick={() => setEditReceipt({})}>Add Receipt</Btn>
        </div>
      )}

      {/* Receipt list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {grouped.length === 0 ? (
          <div style={{ padding: 56, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 34, marginBottom: 11 }}>🧾</div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 5 }}>No receipts match</div>
            <div style={{ fontSize: 12 }}>Clear search or filter.</div>
          </div>
        ) : (
          grouped.map(([store, storeReceipts]) => {
            const isCollapsed = collapsedStores.has(store);
            const storeTotal = storeReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
            return (
              <div key={store}>
                {/* Store header */}
                <button
                  onClick={() => toggleStoreCollapse(store)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px', cursor: 'pointer',
                    background: C.accentDim, border: 'none',
                    borderBottom: `1px solid ${C.accentBorder}`,
                    borderTop: `1px solid ${C.accentBorder}`,
                    fontFamily: 'inherit', textAlign: 'left', minHeight: 44,
                  }}
                >
                  <span style={{ fontSize: 12, color: C.muted, transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>
                    ▼
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    🏪 {store}
                  </span>
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>
                    ({storeReceipts.length})
                  </span>
                  <span style={{ ...MF, fontSize: 11, fontWeight: 700, color: C.text, marginLeft: 'auto' }}>
                    {formatCurrency(storeTotal)}
                  </span>
                </button>

                {/* Receipt cards */}
                {!isCollapsed && storeReceipts.map(receipt => {
                  const catStyle = CATEGORIES[receipt.category] || CATEGORIES.Other;
                  return (
                    <div
                      key={receipt.id}
                      onClick={() => setEditReceipt(receipt)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: isMobile ? '10px 14px' : '8px 14px',
                        borderBottom: `1px solid ${C.borderLight}`,
                        cursor: 'pointer', minHeight: 44,
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.cardHover; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Photo thumbnail */}
                      {receipt.hasPhoto && (
                        <div style={{
                          width: 36, height: 36, borderRadius: 6, overflow: 'hidden',
                          flexShrink: 0, background: C.bg, border: `1px solid ${C.borderLight}`,
                        }}>
                          <img
                            src={api.getReceiptPhotoUrl(receipt.id)}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      )}

                      {/* Date */}
                      <div style={{ fontSize: 11, color: C.muted, minWidth: 46, flexShrink: 0 }}>
                        {formatDate(receipt.date)}
                      </div>

                      {/* Amount */}
                      <div style={{ ...MF, fontSize: 18, fontWeight: 700, color: C.text, minWidth: 90, flexShrink: 0 }}>
                        {formatCurrency(receipt.amount)}
                      </div>

                      {/* Category badge */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                        background: catStyle.bg, color: catStyle.color,
                        border: `1px solid ${catStyle.border}`, whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {receipt.category || 'Other'}
                      </span>

                      {/* Notes (truncated) */}
                      <div style={{
                        flex: 1, fontSize: 12, color: C.muted, minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {receipt.notes || ''}
                      </div>

                      {/* Status dot */}
                      <div
                        onClick={e => { e.stopPropagation(); handleToggleSubmitted(receipt); }}
                        style={{
                          width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                        title={receipt.submitted ? 'Submitted (click to toggle)' : 'Pending (click to toggle)'}
                      >
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: receipt.submitted ? '#3fb950' : '#f97316',
                          boxShadow: `0 0 6px ${receipt.submitted ? 'rgba(63,185,80,0.4)' : 'rgba(249,115,22,0.4)'}`,
                          transition: 'background 0.2s',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {editReceipt !== null && (
        <ReceiptModal
          receipt={editReceipt?.id ? editReceipt : null}
          jobId={job.id}
          onSave={handleRefresh}
          onClose={() => setEditReceipt(null)}
          onDelete={editReceipt?.id ? async () => {
            const yes = await toastConfirm('Delete this receipt?', { confirmLabel: 'Delete', dangerous: true });
            if (!yes) return;
            try {
              await api.deleteReceipt(editReceipt.id);
              setEditReceipt(null);
              await handleRefresh();
              toast.success('Receipt deleted');
            } catch (err) {
              toast.error('Delete failed: ' + err.message);
            }
          } : undefined}
        />
      )}
    </>
  );
}
