import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { C, TF, MF, STATUS, getItemStatus } from '../tokens';
import { Btn, Toggle } from './ui';
import { MiniLineChart, ProgressRing } from './Charts';
import { SHARE_FOOTER } from '../utils/shareFooter';
import { useMobile } from '../hooks/useApi';
import ItemRow from './ItemRow';
import QuickReceive from './QuickReceive';
import ItemModal from './ItemModal';
import ImportModal from './ImportModal';
import ReportModal from './ReportModal';
import VirtualList from './VirtualList';
import ActivityFeed from './ActivityFeed';
import QuickIssueReport, { IssueFAB } from './QuickDamageReport';
import { api } from '../api';
import { useToast } from './Toast';
import { haptic } from '../utils/haptic';

// ─── Inline Issue Editor ────────────────────────────────────────────────────
function InlineIssueEditor({ item, issueType, onSave, onCancel }) {
  const FIELDS = {
    damaged: { qtyField: 'damagedQty', descField: 'damageNotes', label: 'Damaged', color: C.red, bg: C.redDim, border: C.redBorder },
    missing: { qtyField: 'missingPartsQty', descField: 'missingParts', label: 'Missing Parts', color: C.yellow, bg: C.yellowDim, border: C.yellowBorder },
    additional: { qtyField: 'additionalOrdersQty', descField: 'additionalOrders', label: 'Additional Orders', color: C.blue, bg: C.blueDim, border: C.blueBorder },
  };
  const f = FIELDS[issueType];
  const [qty, setQty] = useState(item[f.qtyField] || '');
  const [desc, setDesc] = useState(item[f.descField] || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(item.id, { ...item, [f.qtyField]: qty, [f.descField]: desc });
    setSaving(false);
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{
      padding: '10px 14px', margin: '0 14px 4px',
      background: f.bg, border: `1px solid ${f.border}`, borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: f.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {f.label} — {item.itemNumber || '---'}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>Qty</label>
          <input
            type="number" min="0" value={qty}
            onChange={e => setQty(e.target.value)}
            style={{
              width: 60, padding: '5px 8px', fontSize: 12, borderRadius: 5,
              border: `1px solid ${C.border}`, background: C.bg, color: C.text,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>Description</label>
          <input
            type="text" value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Details..."
            style={{
              width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 5,
              border: `1px solid ${C.border}`, background: C.bg, color: C.text,
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={saving} onClick={handleSave} style={{
            padding: '5px 14px', fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
            background: f.color, color: '#fff', border: 'none', fontFamily: 'inherit',
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={onCancel} style={{
            padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, fontFamily: 'inherit',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FixturesTab({ job, onRefresh }) {
  const { toast, confirm: toastConfirm } = useToast();
  const [editItem, setEditItem] = useState(null); // null = closed, {} = new, item = editing
  const [showImport, setShowImport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [search, setSearch] = useState("");
  const [showQtyCol, setShowQtyCol] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [groupBy, setGroupBy] = useState("vendor");
  const [quickReceiveId, setQuickReceiveId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(true);
  const [deliveryFilter, setDeliveryFilter] = useState(null); // null | "overdue" | "today" | "week" | "received-today"
  const [issuesFilter, setIssuesFilter] = useState(false); // show only unreported issues
  const [quickReportMode, setQuickReportMode] = useState(false);
  const [quickReportSelected, setQuickReportSelected] = useState(new Set());
  const isMobile = useMobile();
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [sectionNicknames, setSectionNicknames] = useState({});
  const [editingNickname, setEditingNickname] = useState(null); // group name being edited
  const [issueReportOpen, setIssueReportOpen] = useState(false);
  const [issueReportItem, setIssueReportItem] = useState(null); // prefilled item from swipe
  const [nicknameInput, setNicknameInput] = useState("");
  const [editingIssue, setEditingIssue] = useState(null); // { itemId, issueType }

  // Load section nicknames from localStorage on mount / job change
  useEffect(() => {
    if (!job?.id) return;
    try {
      const stored = localStorage.getItem(`sitekit_section_nicknames_${job.id}`);
      if (stored) setSectionNicknames(JSON.parse(stored));
      else setSectionNicknames({});
    } catch { setSectionNicknames({}); }
  }, [job?.id]);

  // Save nicknames to localStorage whenever they change
  const saveNickname = useCallback((original, nickname) => {
    setSectionNicknames(prev => {
      const next = { ...prev };
      if (nickname && nickname.trim()) {
        next[original] = nickname.trim();
      } else {
        delete next[original];
      }
      if (job?.id) {
        try { localStorage.setItem(`sitekit_section_nicknames_${job.id}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
    setEditingNickname(null);
    setNicknameInput("");
  }, [job?.id]);

  const toggleGroupCollapse = useCallback((groupName) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  // Get display name for a group (nickname or original)
  const getGroupDisplayName = useCallback((groupName) => {
    const nickname = sectionNicknames[groupName];
    return nickname || groupName;
  }, [sectionNicknames]);

  const items = job.items || [];

  // Delivery overview computation
  const deliveryStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let overdue = 0, arrivingToday = 0, thisWeek = 0, receivedToday = 0;
    const hasAnyDates = items.some(i => i.delDate);
    for (const item of items) {
      // Count received today regardless of delivery date
      if (item.dateReceived === today) receivedToday++;
      if (!item.delDate) continue;
      const rec = parseInt(item.qtyReceived || "0");
      if (item.delDate < today && rec === 0) overdue++;
      if (item.delDate === today) arrivingToday++;
      if (item.delDate > today && item.delDate <= weekAhead) thisWeek++;
    }
    return { overdue, arrivingToday, thisWeek, receivedToday, hasAnyDates };
  }, [items]);

  // Delivery timeline: next 7 days with delivery counts
  const deliveryTimeline = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = items.filter(it => it.delDate === dateStr).length;
      if (count > 0) {
        days.push({
          dateStr,
          label: `${dayNames[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`,
          count,
        });
      }
    }
    return days;
  }, [items]);

  // Receiving trend: items received per day over last 7 days
  const receivingTrend = useMemo(() => {
    const trend = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = items.filter(it => it.dateReceived === dateStr).length;
      trend.push(count);
    }
    return trend;
  }, [items]);

  // Overall progress
  const overallProgress = useMemo(() => {
    const total = items.length;
    const received = items.filter(i => {
      const r = parseInt(i.qtyReceived || '0');
      const o = parseInt(i.qtyOrdered || '0');
      return r > 0 && o > 0 && r >= o;
    }).length;
    return { total, received, pct: total > 0 ? Math.round((received / total) * 100) : 0 };
  }, [items]);

  // Unreported issues computation
  const unreportedIssues = useMemo(() => {
    return items.filter(i => {
      const hasMissing = i.missingParts && !i.missingPartsReported;
      const hasOrder = i.additionalOrders && !i.additionalOrdersReported;
      const hasDamage = i.damaged && !i.damageReported;
      return hasMissing || hasOrder || hasDamage;
    });
  }, [items]);

  // Share all unreported issues
  const handleShareAllIssues = async () => {
    if (unreportedIssues.length === 0) return;
    const header = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber} | Date: ${new Date().toLocaleDateString()}\n`;
    let body = header;

    const missingItems = unreportedIssues.filter(i => i.missingParts && !i.missingPartsReported);
    const damagedItems = unreportedIssues.filter(i => i.damaged && !i.damageReported);
    const orderItems = unreportedIssues.filter(i => i.additionalOrders && !i.additionalOrdersReported);

    if (missingItems.length > 0) {
      body += `\nMISSING PARTS (${missingItems.length} item${missingItems.length > 1 ? 's' : ''}):\n`;
      for (const i of missingItems) {
        const qtyTag = i.missingPartsQty ? ` (Qty: ${i.missingPartsQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${qtyTag} — ${i.missingParts}\n`;
      }
    }
    if (damagedItems.length > 0) {
      body += `\nDAMAGED (${damagedItems.length} item${damagedItems.length > 1 ? 's' : ''}):\n`;
      for (const i of damagedItems) {
        const qtyTag = i.damagedQty ? ` (Qty: ${i.damagedQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${qtyTag} — ${i.damageNotes || 'see photo'}\n`;
      }
    }
    if (orderItems.length > 0) {
      body += `\nADDITIONAL ORDERS NEEDED (${orderItems.length} item${orderItems.length > 1 ? 's' : ''}):\n`;
      for (const i of orderItems) {
        const qtyTag = i.additionalOrdersQty ? ` (Qty: ${i.additionalOrdersQty})` : '';
        body += `• ${i.itemNumber} — ${i.description}${qtyTag} — ${i.additionalOrders}\n`;
      }
    }

    body += SHARE_FOOTER;
    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share({ title: `SiteKit Issues — ${job.name}`, text: body });
        shared = true;
      } catch (e) {
        if (e.name !== 'AbortError') {
          try { await navigator.clipboard.writeText(body); shared = true; } catch {}
        }
      }
    } else {
      try { await navigator.clipboard.writeText(body); shared = true; } catch {}
    }

    if (shared) {
      // Mark all included items as reported
      const now = new Date().toISOString();
      for (const i of unreportedIssues) {
        const updates = {};
        if (i.missingParts && !i.missingPartsReported) updates.missingPartsReported = now;
        if (i.damaged && !i.damageReported) updates.damageReported = now;
        if (i.additionalOrders && !i.additionalOrdersReported) updates.additionalOrdersReported = now;
        if (Object.keys(updates).length > 0) {
          try { await api.updateItem(i.id, { ...i, ...updates }); } catch {}
        }
      }
      onRefresh();
      toast.success(`All ${unreportedIssues.length} issues shared and marked reported`);
    }
  };

  const saveItem = async (itemData) => {
    try {
      if (itemData.id) {
        await api.updateItem(itemData.id, itemData);
      } else {
        await api.createItem(job.id, itemData);
      }
      setEditItem(null);
      onRefresh();
      toast.success(itemData.id ? "Item updated" : "Item added");
    } catch (err) {
      toast.error("Save failed: " + err.message);
    }
  };

  const deleteItem = async (id) => {
    const yes = await toastConfirm("Delete this item?", { confirmLabel: "Delete", dangerous: true });
    if (!yes) return;
    try {
      await api.deleteItem(id);
      setEditItem(null);
      onRefresh();
      toast.success("Item deleted");
    } catch (err) {
      toast.error("Delete failed: " + err.message);
    }
  };

  const handleQuickReceive = async (itemId, data) => {
    try {
      await api.quickReceive(itemId, data);
      setQuickReceiveId(null);
      onRefresh();
      toast.success("Item received");
    } catch (err) {
      toast.error("Quick receive failed: " + err.message);
    }
  };

  const handleBulkReceive = async () => {
    if (selectedIds.size === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.bulkReceive(job.id, {
        itemIds: [...selectedIds],
        dateReceived: today,
      });
      toast.success(`${selectedIds.size} items marked received`);
      setSelectedIds(new Set());
      setBulkMode(false);
      onRefresh();
    } catch (err) {
      toast.error("Bulk receive failed: " + err.message);
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
    if (quickReportMode) {
      toggleQuickReportSelect(item.id);
    } else if (bulkMode) {
      toggleSelect(item.id);
    } else if (quickReceiveId === item.id) {
      setQuickReceiveId(null);
    } else {
      setEditItem(item);
    }
  };

  const handleIssueBadgeClick = useCallback((itemId, issueType) => {
    haptic();
    setEditingIssue(prev => (prev && prev.itemId === itemId && prev.issueType === issueType) ? null : { itemId, issueType });
  }, []);

  const handleInlineIssueSave = useCallback(async (itemId, updatedData) => {
    try {
      await api.updateItem(itemId, updatedData);
      setEditingIssue(null);
      onRefresh();
      toast.success("Issue updated");
    } catch (err) {
      toast.error("Update failed: " + err.message);
    }
  }, [onRefresh, toast]);

  // Swipe action handlers
  const handleSwipeDamage = useCallback((item) => {
    setIssueReportItem(item);
    setIssueReportOpen(true);
  }, []);

  const handleSwipeReceive = useCallback((item) => {
    setQuickReceiveId(prev => prev === item.id ? null : item.id);
  }, []);

  const handleIssueFABClick = useCallback(() => {
    setIssueReportItem(null);
    setIssueReportOpen(true);
  }, []);

  const handleIssueReportClose = useCallback(() => {
    setIssueReportOpen(false);
    setIssueReportItem(null);
  }, []);

  const toggleQuickReportSelect = useCallback((id) => {
    setQuickReportSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleQuickReportGenerate = async () => {
    const selected = items.filter(i => quickReportSelected.has(i.id));
    if (selected.length === 0) return;

    const header = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber}\nDate: ${new Date().toLocaleDateString()}\n`;
    let body = header;

    const missingItems = selected.filter(i => i.missingParts);
    const damagedItems = selected.filter(i => i.damaged);
    const orderItems = selected.filter(i => i.additionalOrders);

    if (missingItems.length > 0) {
      body += `\nMISSING PARTS (${missingItems.length} item${missingItems.length > 1 ? 's' : ''}):\n`;
      for (const i of missingItems) {
        const qtyLine = i.missingPartsQty ? ` | Qty Missing: ${i.missingPartsQty}` : '';
        body += `• ${i.itemNumber || '---'} — ${i.description}${qtyLine}\n  ${i.missingParts}\n  Qty Ordered: ${i.qtyOrdered || 'N/A'} | Section: ${i.section || 'N/A'}\n`;
      }
    }
    if (damagedItems.length > 0) {
      body += `\nDAMAGE (${damagedItems.length} item${damagedItems.length > 1 ? 's' : ''}):\n`;
      for (const i of damagedItems) {
        const qtyLine = i.damagedQty ? ` | Qty Damaged: ${i.damagedQty}` : '';
        body += `• ${i.itemNumber || '---'} — ${i.description}${qtyLine}\n  ${i.damageNotes || 'see photo'}\n  Qty Ordered: ${i.qtyOrdered || 'N/A'} | Section: ${i.section || 'N/A'}\n`;
      }
    }
    if (orderItems.length > 0) {
      body += `\nADDITIONAL ORDERS (${orderItems.length} item${orderItems.length > 1 ? 's' : ''}):\n`;
      for (const i of orderItems) {
        const qtyLine = i.additionalOrdersQty ? ` | Qty Needed: ${i.additionalOrdersQty}` : '';
        body += `• ${i.itemNumber || '---'} — ${i.description}${qtyLine}\n  ${i.additionalOrders}\n  Section: ${i.section || 'N/A'}\n`;
      }
    }

    // Items with no specific issue type but still selected
    const noIssueItems = selected.filter(i => !i.missingParts && !i.damaged && !i.additionalOrders);
    if (noIssueItems.length > 0) {
      body += `\nOTHER ITEMS (${noIssueItems.length}):\n`;
      for (const i of noIssueItems) {
        body += `• ${i.itemNumber || '---'} — ${i.description} | Qty Ordered: ${i.qtyOrdered || 'N/A'} | Section: ${i.section || 'N/A'}\n`;
      }
    }

    body += SHARE_FOOTER;
    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share({ title: `SiteKit Report — ${job.name}`, text: body });
        shared = true;
      } catch (e) {
        if (e.name !== 'AbortError') {
          try { await navigator.clipboard.writeText(body); shared = true; } catch {}
        }
      }
    } else {
      try { await navigator.clipboard.writeText(body); shared = true; } catch {}
    }

    if (shared) {
      toast.success(`Report generated for ${selected.length} items`);
      setQuickReportMode(false);
      setQuickReportSelected(new Set());
    }
  };

  const handleDeliveryChipClick = (chip) => {
    if (deliveryFilter === chip) {
      setDeliveryFilter(null);
    } else {
      setDeliveryFilter(chip);
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    const ql = search.toLowerCase();
    const vendorNick = sectionNicknames[item.vendor || ""] || "";
    const sectionNick = sectionNicknames[item.section || ""] || "";
    const m = !ql
      || (item.description || "").toLowerCase().includes(ql)
      || (item.itemNumber || "").toLowerCase().includes(ql)
      || (item.vendor || "").toLowerCase().includes(ql)
      || (item.section || "").toLowerCase().includes(ql)
      || (item.fixtureBook || "").toLowerCase().includes(ql)
      || (item.materialClass || "").toLowerCase().includes(ql)
      || vendorNick.toLowerCase().includes(ql)
      || sectionNick.toLowerCase().includes(ql);
    const st = filterStatus === "all" || getItemStatus(item) === filterStatus;

    // Delivery filter
    let df = true;
    if (deliveryFilter) {
      const today = new Date().toISOString().slice(0, 10);
      const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const rec = parseInt(item.qtyReceived || "0");
      if (deliveryFilter === "overdue") df = item.delDate && item.delDate < today && rec === 0;
      else if (deliveryFilter === "today") df = item.delDate === today;
      else if (deliveryFilter === "week") df = item.delDate && item.delDate > today && item.delDate <= weekAhead;
      else if (deliveryFilter === "received-today") df = item.dateReceived === today;
      else if (deliveryFilter.match(/^\d{4}-\d{2}-\d{2}$/)) df = item.delDate === deliveryFilter;
    }

    // Unreported issues filter
    let uf = true;
    if (issuesFilter) {
      const hasMissing = item.missingParts && !item.missingPartsReported;
      const hasOrder = item.additionalOrders && !item.additionalOrdersReported;
      const hasDamage = item.damaged && !item.damageReported;
      uf = hasMissing || hasOrder || hasDamage;
    }

    return m && st && df && uf;
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
  const headerCols = (bulkMode || quickReportMode) ? `36px ${cols}` : cols;

  return (
    <>
      {/* Job Dashboard Cards — collapsible */}
      {items.length > 0 && (
        <div className="no-print" style={{ background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={() => setShowDashboard(v => !v)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "6px 14px", background: "transparent", border: "none", cursor: "pointer",
            color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
            fontFamily: "inherit",
          }}>
            <span style={{ transition: "transform 0.15s", transform: showDashboard ? "rotate(0)" : "rotate(-90deg)", fontSize: 8 }}>▼</span>
            Dashboard
            {!showDashboard && (deliveryStats.overdue > 0 || unreportedIssues.length > 0) && (
              <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>
                {deliveryStats.overdue + unreportedIssues.length}
              </span>
            )}
          </button>
          {showDashboard && <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: 10, padding: isMobile ? "0 14px 10px" : "0 18px 12px",
          }}>
          {/* Overdue */}
          <button onClick={() => { setDeliveryFilter(deliveryFilter === "overdue" ? null : "overdue"); setIssuesFilter(false); }} style={{
            padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            textAlign: "center", transition: "all 0.15s", border: "none",
            background: deliveryFilter === "overdue" ? C.redDim : C.subtleBg,
            outline: deliveryFilter === "overdue" ? `2px solid ${C.redBorder}` : `1px solid ${C.borderLight}`,
          }}>
            <div style={{ ...MF, fontSize: 26, fontWeight: 700, color: deliveryStats.overdue > 0 ? C.red : C.faint, lineHeight: 1 }}>
              {deliveryStats.overdue}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: deliveryStats.overdue > 0 ? C.red : C.faint, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Overdue
            </div>
          </button>

          {/* Arriving This Week */}
          <button onClick={() => { setDeliveryFilter(deliveryFilter === "week" ? null : "week"); setIssuesFilter(false); }} style={{
            padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            textAlign: "center", transition: "all 0.15s", border: "none",
            background: deliveryFilter === "week" ? C.blueDim : C.subtleBg,
            outline: deliveryFilter === "week" ? `2px solid ${C.blueBorder}` : `1px solid ${C.borderLight}`,
          }}>
            <div style={{ ...MF, fontSize: 26, fontWeight: 700, color: deliveryStats.thisWeek > 0 ? C.blue : C.faint, lineHeight: 1 }}>
              {deliveryStats.thisWeek}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: deliveryStats.thisWeek > 0 ? C.blue : C.faint, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              This Week
            </div>
          </button>

          {/* Unreported Issues */}
          <button onClick={() => { setIssuesFilter(!issuesFilter); setDeliveryFilter(null); }} style={{
            padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            textAlign: "center", transition: "all 0.15s", border: "none",
            background: issuesFilter ? C.accentDim : C.subtleBg,
            outline: issuesFilter ? `2px solid ${C.accentBorder}` : `1px solid ${C.borderLight}`,
          }}>
            <div style={{ ...MF, fontSize: 26, fontWeight: 700, color: unreportedIssues.length > 0 ? C.accent : C.faint, lineHeight: 1 }}>
              {unreportedIssues.length}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: unreportedIssues.length > 0 ? C.accent : C.faint, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Issues
            </div>
          </button>

          {/* Received Today */}
          <button onClick={() => { setDeliveryFilter(deliveryFilter === "received-today" ? null : "received-today"); setIssuesFilter(false); }} style={{
            padding: "12px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            textAlign: "center", transition: "all 0.15s", border: "none",
            background: deliveryFilter === "received-today" ? C.greenDim : C.subtleBg,
            outline: deliveryFilter === "received-today" ? `2px solid ${C.greenBorder}` : `1px solid ${C.borderLight}`,
          }}>
            <div style={{ ...MF, fontSize: 26, fontWeight: 700, color: deliveryStats.receivedToday > 0 ? C.green : C.faint, lineHeight: 1 }}>
              {deliveryStats.receivedToday}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: deliveryStats.receivedToday > 0 ? C.green : C.faint, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Received Today
            </div>
          </button>

          {/* Progress ring + Receiving trend row */}
          {overallProgress.total > 0 && (
            <div style={{
              gridColumn: isMobile ? '1 / -1' : '1 / -1',
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 4px 4px',
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <ProgressRing
                    percent={overallProgress.pct}
                    size={52}
                    color={overallProgress.pct > 75 ? C.green : overallProgress.pct > 40 ? C.blue : C.accent}
                  />
                  <div style={{
                    position: 'absolute', top: 0, left: 0, width: 52, height: 52,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ ...MF, fontSize: 11, fontWeight: 700, color: C.text }}>{overallProgress.pct}%</span>
                  </div>
                </div>
                <div>
                  <div style={{ ...MF, fontSize: 12, fontWeight: 700, color: C.text }}>{overallProgress.received}/{overallProgress.total}</div>
                  <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>Received</div>
                </div>
              </div>

              {receivingTrend.some(v => v > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>7-Day Trend</div>
                    <MiniLineChart data={receivingTrend} color={C.green} width={100} height={28} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>}
        </div>
      )}

      {/* Activity Feed */}
      {items.length > 0 && <ActivityFeed job={job} />}

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

          {/* Issues summary bar (mobile) */}
          {unreportedIssues.length > 0 && (
            <div style={{ padding: "4px 14px 10px", display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setIssuesFilter(v => !v)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", minHeight: 36,
                background: issuesFilter ? C.redDim : "transparent",
                color: C.red, border: `1px solid ${issuesFilter ? C.redBorder : C.border}`,
              }}>
                <span data-tutorial="issues-badge" style={{ fontSize: 13 }}>🔴</span> {unreportedIssues.length} unreported issue{unreportedIssues.length !== 1 ? 's' : ''}
              </button>
              <button onClick={handleShareAllIssues} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", minHeight: 36,
                background: C.redDim, color: C.red, border: `1px solid ${C.redBorder}`,
              }}>
                📤 Share All
              </button>
            </div>
          )}

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
            <input data-testid="search-input" value={search} onChange={e => setSearch(e.target.value)}
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
              <button key={f} data-testid={`filter-${f}`} onClick={() => setFilterStatus(f)} style={{
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
              <button key={g.id} data-testid={`group-${g.id}`} onClick={() => setGroupBy(g.id)} style={{
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
          <Toggle checked={showQtyCol} onChange={setShowQtyCol} label="Ord. Qty" data-testid="qty-toggle" />
          <Toggle checked={bulkMode} onChange={v => { setBulkMode(v); setSelectedIds(new Set()); }} label="Bulk" data-testid="bulk-toggle" />
          <Btn variant="ghost" size="sm" icon="⬆" onClick={() => setShowImport(true)} data-tutorial="import" data-testid="import-btn">Import</Btn>
          <Btn variant="orange" size="sm" icon="📊" onClick={() => setShowReport(true)} data-tutorial="report" data-testid="report-btn">Report</Btn>
          {unreportedIssues.length > 0 && (
            <>
              <button onClick={() => setIssuesFilter(v => !v)} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", minHeight: 30,
                background: issuesFilter ? C.redDim : "transparent",
                color: C.red, border: `1px solid ${issuesFilter ? C.redBorder : C.border}`,
              }}>
                🔴 {unreportedIssues.length} unreported
              </button>
              <button onClick={handleShareAllIssues} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", minHeight: 30,
                background: C.redDim, color: C.red, border: `1px solid ${C.redBorder}`,
              }}>
                📤 Share All
              </button>
            </>
          )}
          <Btn variant="primary" size="sm" icon="+" onClick={() => setEditItem({})} data-testid="add-item-btn">Add Item</Btn>
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

      {/* Delivery Overview Bar */}
      {items.length > 0 && deliveryStats.hasAnyDates && (deliveryStats.overdue > 0 || deliveryStats.arrivingToday > 0 || deliveryStats.thisWeek > 0) && (
        <div className="no-print" style={{
          background: C.card, border: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={() => setDeliveryOpen(v => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: isMobile ? "8px 14px" : "6px 18px",
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Delivery Overview
            </span>
            <span style={{ fontSize: 10, color: C.faint, transform: deliveryOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              ▼
            </span>
            {!deliveryOpen && deliveryStats.overdue > 0 && (
              <span style={{ ...MF, fontSize: 10, color: C.red, fontWeight: 700, marginLeft: 4 }}>
                {deliveryStats.overdue} overdue
              </span>
            )}
          </button>
          {deliveryOpen && (
            <div style={{
              display: "flex", gap: 12, padding: isMobile ? "0 14px 10px" : "0 18px 8px",
              flexWrap: "wrap", alignItems: "center",
            }}>
              {/* Overdue chip */}
              {deliveryStats.overdue > 0 && (
                <button onClick={() => handleDeliveryChipClick("overdue")} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                  borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", minHeight: isMobile ? 36 : 28, transition: "all 0.15s",
                  background: deliveryFilter === "overdue" ? C.redDim : "transparent",
                  color: deliveryFilter === "overdue" ? C.red : C.muted,
                  border: `1px solid ${deliveryFilter === "overdue" ? C.redBorder : C.border}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
                  <span style={{ ...MF, fontSize: 13, fontWeight: 700, color: C.red }}>{deliveryStats.overdue}</span>
                  Overdue
                </button>
              )}
              {/* Arriving Today chip */}
              {deliveryStats.arrivingToday > 0 && (
                <button onClick={() => handleDeliveryChipClick("today")} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                  borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", minHeight: isMobile ? 36 : 28, transition: "all 0.15s",
                  background: deliveryFilter === "today" ? C.blueDim : "transparent",
                  color: deliveryFilter === "today" ? C.blue : C.muted,
                  border: `1px solid ${deliveryFilter === "today" ? C.blueBorder : C.border}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
                  <span style={{ ...MF, fontSize: 13, fontWeight: 700, color: C.blue }}>{deliveryStats.arrivingToday}</span>
                  Arriving Today
                </button>
              )}
              {/* This Week chip */}
              {deliveryStats.thisWeek > 0 && (
                <button onClick={() => handleDeliveryChipClick("week")} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                  borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", minHeight: isMobile ? 36 : 28, transition: "all 0.15s",
                  background: deliveryFilter === "week" ? C.accentDim : "transparent",
                  color: deliveryFilter === "week" ? C.muted : C.muted,
                  border: `1px solid ${deliveryFilter === "week" ? C.accentBorder : C.border}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.muted, flexShrink: 0 }} />
                  <span style={{ ...MF, fontSize: 13, fontWeight: 700, color: C.text }}>{deliveryStats.thisWeek}</span>
                  This Week
                </button>
              )}
              {/* Clear filter indicator */}
              {deliveryFilter && (
                <button onClick={() => setDeliveryFilter(null)} style={{
                  fontSize: 10, color: C.faint, background: "transparent", border: "none",
                  cursor: "pointer", fontFamily: "inherit", textDecoration: "underline",
                }}>
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delivery Timeline */}
      {deliveryTimeline.length > 0 && (
        <div className="no-print" style={{
          flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center',
          padding: isMobile ? '6px 14px' : '6px 18px',
          borderBottom: `1px solid ${C.borderLight}`,
          background: C.bg, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          <span style={{ fontSize: 9, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', marginRight: 4 }}>
            Upcoming:
          </span>
          {deliveryTimeline.map(day => {
            const isActive = deliveryFilter === day.dateStr;
            return (
              <button
                key={day.dateStr}
                onClick={() => setDeliveryFilter(isActive ? null : day.dateStr)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  minHeight: isMobile ? 34 : 26, flexShrink: 0,
                  background: isActive ? C.accentDim : 'transparent',
                  color: isActive ? C.accent : C.muted,
                  border: `1px solid ${isActive ? C.accentBorder : C.border}`,
                  transition: 'all 0.15s',
                }}
              >
                {day.label}
                <span style={{
                  ...MF, fontSize: 10, fontWeight: 700, color: isActive ? C.accent : C.text,
                  background: isActive ? 'transparent' : C.card,
                  padding: '0 5px', borderRadius: 8,
                }}>
                  ({day.count})
                </span>
              </button>
            );
          })}
          {deliveryFilter && deliveryFilter.match(/^\d{4}-\d{2}-\d{2}$/) && (
            <button onClick={() => setDeliveryFilter(null)} style={{
              fontSize: 10, color: C.faint, background: 'transparent', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', whiteSpace: 'nowrap',
            }}>
              Clear
            </button>
          )}
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
          {allSections.map(sec => {
            const displayName = getGroupDisplayName(sec);
            return (
              <button key={sec} onClick={() => setSearch(sec === search ? "" : sec)} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                fontFamily: "inherit", minHeight: 28,
                background: search === sec ? C.tealDim : "transparent",
                color: search === sec ? C.teal : C.faint,
                border: `1px solid ${search === sec ? C.tealBorder : "transparent"}`
              }}>
                {displayName}
              </button>
            );
          })}
        </div>
      )}

      {/* Column headers (hidden on mobile — items render as cards) */}
      {!isMobile && (
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
      )}

      {/* Rows */}
      {Object.entries(grouped).length === 0 ? (
        <div data-tutorial="fixture-list" style={{ flex: 1, overflowY: "auto" }}>
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
        </div>
      ) : filteredItems.length > 50 ? (
        /* ── Virtual Scrolling for large lists ── */
        <VirtualList
          items={(() => {
            // Flatten grouped items into a single array with group headers as entries
            const flat = [];
            for (const [grp, gitems] of Object.entries(grouped)) {
              flat.push({ _type: 'header', _group: grp, _count: gitems.length });
              if (search.trim() || expandedGroups.has(grp)) {
                for (let idx = 0; idx < gitems.length; idx++) {
                  flat.push({ _type: 'item', _itemIdx: idx, ...gitems[idx] });
                }
              }
            }
            return flat;
          })()}
          itemHeight={isMobile ? 100 : 44}
          overscan={10}
          containerStyle={{ flex: 1 }}
          renderItem={(entry, i) => {
            if (entry._type === 'header') {
              const isCollapsed = search.trim() ? false : !expandedGroups.has(entry._group);
              const nickname = sectionNicknames[entry._group];
              const displayName = nickname || entry._group;
              return (
                <div key={`hdr-${entry._group}`} style={{
                  padding: "5px 14px",
                  background: groupBy === "section" ? C.tealDim : C.accentDim,
                  borderBottom: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
                  borderTop: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
                  fontSize: 9, fontWeight: 700,
                  color: groupBy === "section" ? C.teal : C.accent,
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  display: "flex", gap: 8, alignItems: "center",
                  height: isMobile ? 100 : 44, boxSizing: "border-box",
                  cursor: "pointer", userSelect: "none"
                }}
                  onClick={() => toggleGroupCollapse(entry._group)}
                >
                  <span style={{ fontSize: 8, transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                  {groupBy === "section" ? "📂" : "🏭"} {displayName}
                  {nickname && (
                    <span style={{ color: C.faint, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 8 }}>
                      ({entry._group})
                    </span>
                  )}
                  <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    ({entry._count})
                  </span>
                  {editingNickname === entry._group ? (
                    <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <input
                        autoFocus
                        value={nicknameInput}
                        onChange={e => setNicknameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveNickname(entry._group, nicknameInput); if (e.key === "Escape") { setEditingNickname(null); setNicknameInput(""); } }}
                        placeholder="Nickname..."
                        style={{
                          width: 120, padding: "2px 6px", fontSize: 10, borderRadius: 4,
                          border: `1px solid ${C.border}`, background: C.bg, color: C.text,
                          fontFamily: "inherit", outline: "none"
                        }}
                      />
                      <button onClick={() => saveNickname(entry._group, nicknameInput)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: C.green, fontFamily: "inherit" }}>✓</button>
                      <button onClick={() => { setEditingNickname(null); setNicknameInput(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: C.red, fontFamily: "inherit" }}>✕</button>
                    </span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setEditingNickname(entry._group); setNicknameInput(sectionNicknames[entry._group] || ""); }}
                      title="Set nickname"
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: C.faint, padding: "0 2px", opacity: 0.6 }}
                    >✏️</button>
                  )}
                </div>
              );
            }
            return (
              <div key={entry.id} data-tutorial={entry._itemIdx === 0 ? "item-row" : undefined}>
                <ItemRow
                  item={entry}
                  onEdit={handleItemClick}
                  onQuickReceive={() => setQuickReceiveId(quickReceiveId === entry.id ? null : entry.id)}
                  showQtyCol={showQtyCol}
                  groupBy={groupBy}
                  bulkMode={bulkMode || quickReportMode}
                  isSelected={quickReportMode ? quickReportSelected.has(entry.id) : selectedIds.has(entry.id)}
                  onToggleSelect={quickReportMode ? toggleQuickReportSelect : toggleSelect}
                  onIssueBadgeClick={handleIssueBadgeClick}
                  onSwipeDamage={handleSwipeDamage}
                  onSwipeReceive={handleSwipeReceive}
                />
                {editingIssue && editingIssue.itemId === entry.id && (
                  <InlineIssueEditor
                    item={entry}
                    issueType={editingIssue.issueType}
                    onSave={handleInlineIssueSave}
                    onCancel={() => setEditingIssue(null)}
                  />
                )}
                {quickReceiveId === entry.id && !bulkMode && !quickReportMode && (
                  <QuickReceive
                    item={entry}
                    onSave={(data) => handleQuickReceive(entry.id, data)}
                    onCancel={() => setQuickReceiveId(null)}
                    onOpenModal={() => { setQuickReceiveId(null); setEditItem(entry); }}
                  />
                )}
              </div>
            );
          }}
        />
      ) : (
        /* ── Standard rendering for small lists ── */
        <div data-tutorial="fixture-list" style={{ flex: 1, overflowY: "auto" }}>
          {Object.entries(grouped).map(([grp, gitems]) => {
            const isCollapsed = search.trim() ? false : !expandedGroups.has(grp);
            const nickname = sectionNicknames[grp];
            const displayName = nickname || grp;
            return (
              <div key={grp}>
                <div
                  onClick={() => toggleGroupCollapse(grp)}
                  style={{
                    padding: "5px 14px",
                    background: groupBy === "section" ? C.tealDim : C.accentDim,
                    borderBottom: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
                    borderTop: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
                    fontSize: 9, fontWeight: 700,
                    color: groupBy === "section" ? C.teal : C.accent,
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    display: "flex", gap: 8, alignItems: "center",
                    cursor: "pointer", userSelect: "none"
                  }}
                >
                  <span style={{ fontSize: 8, transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                  {groupBy === "section" ? "📂" : "🏭"} {displayName}
                  {nickname && (
                    <span style={{ color: C.faint, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 8 }}>
                      ({grp})
                    </span>
                  )}
                  <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    ({gitems.length})
                  </span>
                  {editingNickname === grp ? (
                    <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <input
                        autoFocus
                        value={nicknameInput}
                        onChange={e => setNicknameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveNickname(grp, nicknameInput); if (e.key === "Escape") { setEditingNickname(null); setNicknameInput(""); } }}
                        placeholder="Nickname..."
                        style={{
                          width: 120, padding: "2px 6px", fontSize: 10, borderRadius: 4,
                          border: `1px solid ${C.border}`, background: C.bg, color: C.text,
                          fontFamily: "inherit", outline: "none"
                        }}
                      />
                      <button onClick={() => saveNickname(grp, nicknameInput)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: C.green, fontFamily: "inherit" }}>✓</button>
                      <button onClick={() => { setEditingNickname(null); setNicknameInput(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: C.red, fontFamily: "inherit" }}>✕</button>
                    </span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setEditingNickname(grp); setNicknameInput(sectionNicknames[grp] || ""); }}
                      title="Set nickname"
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: C.faint, padding: "0 2px", opacity: 0.6 }}
                    >✏️</button>
                  )}
                </div>
                {!isCollapsed && gitems.map((item, itemIdx) => (
                  <React.Fragment key={item.id}>
                    <div data-tutorial={itemIdx === 0 ? "item-row" : undefined}>
                      <ItemRow
                        item={item}
                        onEdit={handleItemClick}
                        onQuickReceive={() => setQuickReceiveId(quickReceiveId === item.id ? null : item.id)}
                        showQtyCol={showQtyCol}
                        groupBy={groupBy}
                        bulkMode={bulkMode || quickReportMode}
                        isSelected={quickReportMode ? quickReportSelected.has(item.id) : selectedIds.has(item.id)}
                        onToggleSelect={quickReportMode ? toggleQuickReportSelect : toggleSelect}
                        onIssueBadgeClick={handleIssueBadgeClick}
                        onSwipeDamage={handleSwipeDamage}
                        onSwipeReceive={handleSwipeReceive}
                      />
                    </div>
                    {editingIssue && editingIssue.itemId === item.id && (
                      <InlineIssueEditor
                        item={item}
                        issueType={editingIssue.issueType}
                        onSave={handleInlineIssueSave}
                        onCancel={() => setEditingIssue(null)}
                      />
                    )}
                    {quickReceiveId === item.id && !bulkMode && !quickReportMode && (
                      <QuickReceive
                        item={item}
                        onSave={(data) => handleQuickReceive(item.id, data)}
                        onCancel={() => setQuickReceiveId(null)}
                        onOpenModal={() => { setQuickReceiveId(null); setEditItem(item); }}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {editItem !== null && (
        <ItemModal
          item={editItem?.id ? editItem : null}
          jobId={job.id}
          job={job}
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

      {/* Quick Report floating action bar */}
      {quickReportMode && (
        <div className="no-print" style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          padding: "12px 18px", display: "flex", alignItems: "center", gap: 12,
          background: C.card, borderTop: `2px solid ${C.purpleBorder}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
          justifyContent: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.purple }}>
            {quickReportSelected.size} selected
          </span>
          <Btn variant="purple" size="sm" icon="📋" disabled={quickReportSelected.size === 0} onClick={handleQuickReportGenerate}>
            Generate Report
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => { setQuickReportMode(false); setQuickReportSelected(new Set()); }}>
            Cancel
          </Btn>
        </div>
      )}

      {/* Issue FAB — always visible on fixtures tab */}
      {items.length > 0 && !quickReportMode && !bulkMode && (
        <IssueFAB onClick={handleIssueFABClick} />
      )}

      {/* Quick Issue Report overlay */}
      {issueReportOpen && (
        <QuickIssueReport
          items={items}
          onRefresh={onRefresh}
          onClose={handleIssueReportClose}
          prefilledItem={issueReportItem}
        />
      )}
    </>
  );
}
