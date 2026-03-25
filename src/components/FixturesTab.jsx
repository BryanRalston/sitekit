import React, { useState, useCallback } from 'react';
import { C, TF, MF, STATUS, getItemStatus } from '../tokens';
import { Btn, Toggle } from './ui';
import { useMobile } from '../hooks/useApi';
import ItemRow from './ItemRow';
import QuickReceive from './QuickReceive';
import ItemModal from './ItemModal';
import ImportModal from './ImportModal';
import ReportModal from './ReportModal';
import { api } from '../api';

export default function FixturesTab({ job, onRefresh }) {
  const [editItem, setEditItem] = useState(null); // null = closed, {} = new, item = editing
  const [showImport, setShowImport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [search, setSearch] = useState("");
  const [showQtyCol, setShowQtyCol] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [groupBy, setGroupBy] = useState("vendor");
  const [quickReceiveId, setQuickReceiveId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const isMobile = useMobile();

  const items = job.items || [];

  const saveItem = async (itemData) => {
    try {
      if (itemData.id) {
        await api.updateItem(itemData.id, itemData);
      } else {
        await api.createItem(job.id, itemData);
      }
      setEditItem(null);
      onRefresh();
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  };

  const deleteItem = async (id) => {
    if (!confirm("Delete this item?")) return;
    try {
      await api.deleteItem(id);
      setEditItem(null);
      onRefresh();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleQuickReceive = async (itemId, data) => {
    try {
      await api.quickReceive(itemId, data);
      setQuickReceiveId(null);
      onRefresh();
    } catch (err) {
      alert("Quick receive failed: " + err.message);
    }
  };

  const handleBulkReceive = async () => {
    if (selectedIds.size === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.bulkReceive(job.id, {
        item_ids: [...selectedIds],
        date_received: today,
      });
      setSelectedIds(new Set());
      setBulkMode(false);
      onRefresh();
    } catch (err) {
      alert("Bulk receive failed: " + err.message);
    }
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleImportDone = () => {
    setShowImport(false);
    onRefresh();
  };

  const handleItemClick = (item) => {
    if (bulkMode) {
      toggleSelect(item.id);
    } else if (quickReceiveId === item.id) {
      setQuickReceiveId(null);
    } else {
      setEditItem(item);
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    const ql = search.toLowerCase();
    const m = !ql
      || (item.description || "").toLowerCase().includes(ql)
      || (item.itemNumber || "").toLowerCase().includes(ql)
      || (item.vendor || "").toLowerCase().includes(ql)
      || (item.section || "").toLowerCase().includes(ql)
      || (item.fixtureBook || "").toLowerCase().includes(ql)
      || (item.materialClass || "").toLowerCase().includes(ql);
    const st = filterStatus === "all" || getItemStatus(item) === filterStatus;
    return m && st;
  });

  // Group items
  const grouped = filteredItems.reduce((acc, item) => {
    const key = groupBy === "section" ? (item.section || "No Section") : (item.vendor || "Ungrouped");
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Sections for quick-jump pills
  const allSections = [...new Set(items.map(i => i.section).filter(Boolean))];

  const cols = showQtyCol
    ? "60px 55px 90px 1fr 60px 60px 75px 85px 95px"
    : "60px 55px 90px 1fr 60px 75px 85px 95px";
  const headerCols = bulkMode ? `36px ${cols}` : cols;

  return (
    <>
      {/* Toolbar */}
      {isMobile ? (
        /* ── Mobile Toolbar ── */
        <div className="no-print" style={{ flexShrink: 0, background: C.card, borderBottom: `1px solid ${C.border}` }}>
          {/* Row 1: Search + Filter toggle */}
          <div style={{ padding: "10px 14px 6px", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 14 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search items..."
                style={{
                  width: "100%", background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, padding: "6px 12px 6px 30px",
                  fontSize: 13, outline: "none", minHeight: 44, boxSizing: "border-box"
                }} />
            </div>
            <button onClick={() => setShowMobileFilters(v => !v)} style={{
              position: "relative", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", padding: "0 12px",
              minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16
            }}>
              ☰
              {/* Active filter indicator dot */}
              {(filterStatus !== "all" || search) && (
                <span style={{
                  position: "absolute", top: 6, right: 6, width: 7, height: 7,
                  borderRadius: "50%", background: C.accent
                }} />
              )}
            </button>
          </div>

          {/* Row 2: Primary actions */}
          <div style={{ padding: "4px 14px 10px", display: "flex", gap: 8 }}>
            <Btn variant="ghost" size="sm" icon="⬆" onClick={() => setShowImport(true)} data-tutorial="import" style={{ flex: 1, justifyContent: "center", minHeight: 44 }}>Import</Btn>
            <Btn variant="primary" size="sm" icon="+" onClick={() => setEditItem({})} style={{ flex: 1, justifyContent: "center", minHeight: 44 }}>Add Item</Btn>
          </div>

          {/* Mobile filter dropdown panel */}
          {showMobileFilters && (
            <div style={{
              margin: "0 14px 10px", padding: 14, background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, display: "flex", flexDirection: "column", gap: 12
            }}>
              {/* Status filter pills */}
              <div data-tutorial="status-filters">
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Status</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["all", "pending", "partial", "received", "issue", "overdue"].map(f => {
                    const cnt = f === "all" ? items.length : items.filter(i => getItemStatus(i) === f).length;
                    if (f !== "all" && cnt === 0) return null;
                    return (
                      <button key={f} onClick={() => setFilterStatus(f)} style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit", minHeight: 36,
                        background: filterStatus === f ? (f === "all" ? C.accent : STATUS[f]?.bg || C.accent) : "transparent",
                        color: filterStatus === f ? (f === "all" ? "#fff" : STATUS[f]?.color || "#fff") : C.muted,
                        border: `1px solid ${filterStatus === f ? (f === "all" ? C.accent : STATUS[f]?.border || C.accent) : C.border}`
                      }}>
                        {f === "all" ? "All" : STATUS[f]?.label} ({cnt})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group-by toggle */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Group By</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { id: "vendor", label: "By Vendor", icon: "🏭" },
                    { id: "section", label: "By Section", icon: "📂" }
                  ].map(g => (
                    <button key={g.id} onClick={() => setGroupBy(g.id)} style={{
                      padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", minHeight: 36, flex: 1,
                      background: groupBy === g.id ? (g.id === "section" ? C.tealDim : C.accentDim) : "transparent",
                      color: groupBy === g.id ? (g.id === "section" ? C.teal : C.accent) : C.muted,
                      border: `1px solid ${groupBy === g.id ? (g.id === "section" ? C.tealBorder : C.accentBorder) : C.border}`
                    }}>
                      {g.icon} {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles row */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <Toggle checked={showQtyCol} onChange={setShowQtyCol} label="Ord. Qty" />
                <Toggle checked={bulkMode} onChange={v => { setBulkMode(v); setSelectedIds(new Set()); }} label="Bulk" />
              </div>

              {/* Report button in filter panel */}
              <Btn variant="orange" size="sm" icon="📊" onClick={() => setShowReport(true)} data-tutorial="report" style={{ minHeight: 44 }}>Report</Btn>
            </div>
          )}
        </div>
      ) : (
        /* ── Desktop Toolbar (unchanged) ── */
        <div className="no-print" style={{
          padding: "10px 18px", borderBottom: `1px solid ${C.border}`,
          display: "flex", gap: 9, alignItems: "center", flexShrink: 0,
          background: C.card, flexWrap: "wrap"
        }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search item #, description, vendor, section, fixture book..."
              style={{
                width: "100%", background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text, padding: "6px 12px 6px 30px",
                fontSize: 12, outline: "none", minHeight: 36
              }} />
          </div>

          {/* Status filters */}
          <div data-tutorial="status-filters" style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          {["all", "pending", "partial", "received", "issue", "overdue"].map(f => {
            const cnt = f === "all" ? items.length : items.filter(i => getItemStatus(i) === f).length;
            if (f !== "all" && cnt === 0) return null;
            return (
              <button key={f} onClick={() => setFilterStatus(f)} style={{
                padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", minHeight: 30,
                background: filterStatus === f ? (f === "all" ? C.accent : STATUS[f]?.bg || C.accent) : "transparent",
                color: filterStatus === f ? (f === "all" ? "#fff" : STATUS[f]?.color || "#fff") : C.muted,
                border: `1px solid ${filterStatus === f ? (f === "all" ? C.accent : STATUS[f]?.border || C.accent) : C.border}`
              }}>
                {f === "all" ? "All" : STATUS[f]?.label} ({cnt})
              </button>
            );
          })}
          </div>

          <div style={{ height: 20, width: 1, background: C.border, flexShrink: 0 }} />

          {/* Group by toggle */}
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { id: "vendor", label: "By Vendor", icon: "🏭" },
              { id: "section", label: "By Section", icon: "📂" }
            ].map(g => (
              <button key={g.id} onClick={() => setGroupBy(g.id)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", minHeight: 30,
                background: groupBy === g.id ? (g.id === "section" ? C.tealDim : C.accentDim) : "transparent",
                color: groupBy === g.id ? (g.id === "section" ? C.teal : C.accent) : C.muted,
                border: `1px solid ${groupBy === g.id ? (g.id === "section" ? C.tealBorder : C.accentBorder) : C.border}`
              }}>
                {g.icon} {g.label}
              </button>
            ))}
          </div>

          <div style={{ height: 20, width: 1, background: C.border, flexShrink: 0 }} />
          <Toggle checked={showQtyCol} onChange={setShowQtyCol} label="Ord. Qty" />
          <Toggle checked={bulkMode} onChange={v => { setBulkMode(v); setSelectedIds(new Set()); }} label="Bulk" />
          <Btn variant="ghost" size="sm" icon="⬆" onClick={() => setShowImport(true)} data-tutorial="import">Import</Btn>
          <Btn variant="orange" size="sm" icon="📊" onClick={() => setShowReport(true)} data-tutorial="report">Report</Btn>
          <Btn variant="primary" size="sm" icon="+" onClick={() => setEditItem({})}>Add Item</Btn>
        </div>
      )}

      {/* Bulk actions bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div style={{
          padding: "8px 18px", background: C.greenDim,
          borderBottom: `1px solid ${C.greenBorder}`,
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0
        }} className="fade-in">
          <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>
            {selectedIds.size} selected
          </span>
          <Btn variant="green" size="sm" onClick={handleBulkReceive}>
            Mark Selected Received
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => { setSelectedIds(new Set()); setBulkMode(false); }}>
            Cancel
          </Btn>
        </div>
      )}

      {/* Section pills */}
      {allSections.length > 0 && groupBy === "vendor" && (
        <div style={{
          padding: "6px 18px", borderBottom: `1px solid ${C.borderLight}`,
          display: "flex", gap: 5, flexWrap: isMobile ? "nowrap" : "wrap",
          background: C.bg, flexShrink: 0,
          ...(isMobile ? { overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 8 } : {})
        }}>
          <span style={{ fontSize: 10, color: C.faint, alignSelf: "center", marginRight: 4 }}>SECTIONS:</span>
          <button onClick={() => setSearch("")} style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 4,
            color: C.faint, border: "none", cursor: "pointer",
            fontFamily: "inherit", background: "transparent", minHeight: 28
          }}>
            All
          </button>
          {allSections.map(sec => (
            <button key={sec} onClick={() => setSearch(sec === search ? "" : sec)} style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              fontFamily: "inherit", minHeight: 28,
              background: search === sec ? C.tealDim : "transparent",
              color: search === sec ? C.teal : C.faint,
              border: `1px solid ${search === sec ? C.tealBorder : "transparent"}`
            }}>
              {sec}
            </button>
          ))}
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: headerCols, padding: "6px 14px",
        position: "sticky", top: 0, zIndex: 10, background: C.card,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0
      }}>
        {bulkMode && <span />}
        {["Item #", "Class", "Fixt. Book", "Description", ...(showQtyCol ? ["Ord."] : []), "Rec'd", "Del. Date", "Flags", "Status"].map(h => (
          <span key={h} style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div data-tutorial="fixture-list" style={{ flex: 1, overflowY: "auto" }}>
        {Object.entries(grouped).length === 0 ? (
          <div style={{ padding: 56, textAlign: "center", color: C.muted }}>
            <div style={{ fontSize: 34, marginBottom: 11 }}>📋</div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 5 }}>
              {search || filterStatus !== "all" ? "No items match" : "No items yet"}
            </div>
            <div style={{ fontSize: 12 }}>
              {search || filterStatus !== "all"
                ? "Clear search or filter."
                : "Add items or import from Assembly Detail."}
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([grp, gitems]) => (
            <div key={grp}>
              <div style={{
                padding: "5px 14px",
                background: groupBy === "section" ? C.tealDim : C.accentDim,
                borderBottom: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
                borderTop: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
                fontSize: 9, fontWeight: 700,
                color: groupBy === "section" ? C.teal : C.accent,
                textTransform: "uppercase", letterSpacing: "0.07em",
                display: "flex", gap: 8, alignItems: "center"
              }}>
                {groupBy === "section" ? "📂" : "🏭"} {grp}
                <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  ({gitems.length})
                </span>
              </div>
              {gitems.map((item, itemIdx) => (
                <React.Fragment key={item.id}>
                  <div data-tutorial={itemIdx === 0 ? "item-row" : undefined}>
                    <ItemRow
                      item={item}
                      onEdit={handleItemClick}
                      onQuickReceive={() => setQuickReceiveId(quickReceiveId === item.id ? null : item.id)}
                      showQtyCol={showQtyCol}
                      groupBy={groupBy}
                      bulkMode={bulkMode}
                      isSelected={selectedIds.has(item.id)}
                      onToggleSelect={toggleSelect}
                    />
                  </div>
                  {quickReceiveId === item.id && !bulkMode && (
                    <QuickReceive
                      item={item}
                      onSave={(data) => handleQuickReceive(item.id, data)}
                      onCancel={() => setQuickReceiveId(null)}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      {editItem !== null && (
        <ItemModal
          item={editItem?.id ? editItem : null}
          jobId={job.id}
          onSave={saveItem}
          onClose={() => setEditItem(null)}
          onDelete={editItem?.id ? () => deleteItem(editItem.id) : undefined}
        />
      )}
      {showImport && (
        <ImportModal
          jobId={job.id}
          onImport={handleImportDone}
          onClose={() => setShowImport(false)}
        />
      )}
      {showReport && <ReportModal job={job} groupBy={groupBy} onClose={() => setShowReport(false)} />}
    </>
  );
}
