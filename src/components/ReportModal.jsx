import React, { useState } from 'react';
import { C, TF, MF, STATUS, getItemStatus } from '../tokens';
import { Modal, Btn, Inp, Badge } from './ui';
import { api } from '../api';

const CONTRACTOR_KEY = 'sitekit_contractor';

function getContractorInfo() {
  try {
    return JSON.parse(localStorage.getItem(CONTRACTOR_KEY)) || {};
  } catch { return {}; }
}

function saveContractorInfo(info) {
  localStorage.setItem(CONTRACTOR_KEY, JSON.stringify(info));
}

export default function ReportModal({ job, groupBy, onClose }) {
  const items = job.items || [];
  const received = items.filter(i => getItemStatus(i) === "received").length;
  const partial = items.filter(i => getItemStatus(i) === "partial").length;
  const issues = items.filter(i => getItemStatus(i) === "issue").length;
  const overdue = items.filter(i => getItemStatus(i) === "overdue").length;
  const pending = items.filter(i => getItemStatus(i) === "pending").length;
  const damaged = items.filter(i => i.damaged);
  const missing = items.filter(i => i.missingParts);
  const additional = items.filter(i => i.additionalOrders);
  const overdueItems = items.filter(i => {
    const today = new Date().toISOString().slice(0, 10);
    return i.delDate && i.delDate < today && parseInt(i.qtyReceived || "0") === 0;
  });
  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const [contractor, setContractor] = useState(getContractorInfo);
  const [editContractor, setEditContractor] = useState(false);

  const updateContractor = (key, val) => {
    const updated = { ...contractor, [key]: val };
    setContractor(updated);
    saveContractorInfo(updated);
  };

  const grouped = items.reduce((acc, i) => {
    const key = groupBy === "section" ? (i.section || "Ungrouped") : (i.vendor || "Unknown");
    if (!acc[key]) acc[key] = [];
    acc[key].push(i);
    return acc;
  }, {});

  const Row = ({ item, i }) => (
    <div style={{
      display: "grid", gridTemplateColumns: "70px 60px 1fr 50px 50px 75px 85px",
      padding: "7px 12px", borderTop: `1px solid ${C.borderLight}`,
      background: i % 2 === 0 ? C.card : "transparent", fontSize: 11, alignItems: "center"
    }}>
      <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber || "---"}</span>
      <span style={{ ...MF, color: C.muted, fontSize: 10 }}>{item.fixtureBook || "---"}</span>
      <span style={{ color: C.text }}>
        {item.description || "---"}
        {groupBy === "section" && item.vendor && <span style={{ color: C.muted, fontSize: 10, marginLeft: 6 }}>{item.vendor}</span>}
      </span>
      <span style={{ color: C.muted }}>{item.showQtyOrdered !== false ? (item.qtyOrdered || "---") : "---"}</span>
      <span>{item.qtyReceived || "---"}</span>
      <span style={{ color: C.muted }}>{item.dateReceived || "---"}</span>
      <Badge status={getItemStatus(item)} />
    </div>
  );

  return (
    <Modal title={`Report - ${job.name}`} onClose={onClose} width={800}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Contractor Info */}
        <div style={{ padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Contractor Information
            </div>
            <button onClick={() => setEditContractor(e => !e)} style={{
              background: "none", border: "none", color: C.accent,
              cursor: "pointer", fontSize: 11, fontFamily: "inherit"
            }}>
              {editContractor ? "Done" : "Edit"}
            </button>
          </div>
          {editContractor ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Inp label="Name" value={contractor.name || ""} onChange={v => updateContractor("name", v)} placeholder="John Smith" />
              <Inp label="Company" value={contractor.company || ""} onChange={v => updateContractor("company", v)} placeholder="Smith Contracting" />
              <Inp label="Phone" value={contractor.phone || ""} onChange={v => updateContractor("phone", v)} placeholder="(555) 555-1234" />
              <Inp label="Email" value={contractor.email || ""} onChange={v => updateContractor("email", v)} placeholder="john@example.com" />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              {contractor.name || contractor.company ? (
                <>
                  {contractor.name && <span style={{ fontWeight: 700 }}>{contractor.name}</span>}
                  {contractor.company && <span style={{ color: C.muted }}> - {contractor.company}</span>}
                  {(contractor.phone || contractor.email) && (
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {contractor.phone}{contractor.phone && contractor.email ? " | " : ""}{contractor.email}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: C.faint, fontStyle: "italic" }}>Click "Edit" to add contractor info</span>
              )}
            </div>
          )}
        </div>

        {/* Report Header + Stats */}
        <div style={{ padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ ...TF, fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 3 }}>
            Fixture & Equipment Receiving Report
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <strong style={{ color: C.text }}>{job.store}</strong> #{job.storeNumber} - {job.location}
            {job.fileRef && <span style={{ ...MF, marginLeft: 10 }}>File: {job.fileRef}</span>}
            <span style={{ marginLeft: 10 }}>{now}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }}>
            {[
              { l: "Total", v: items.length, c: C.text },
              { l: "Received", v: received, c: C.green },
              { l: "Partial", v: partial, c: C.blue },
              { l: "Pending", v: pending, c: C.yellow },
              { l: "Issues", v: issues, c: C.red },
            ].map(s => (
              <div key={s.l} style={{ padding: "9px 13px", background: C.card, borderRadius: 7, textAlign: "center" }}>
                <div style={{ ...TF, fontSize: 26, fontWeight: 700, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Overdue section */}
        {overdueItems.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              🕐 Overdue Items ({overdueItems.length})
            </div>
            {overdueItems.map(item => (
              <div key={item.id} style={{
                padding: "8px 12px", background: C.redDim, border: `1px solid ${C.redBorder}`,
                borderRadius: 6, marginBottom: 6
              }}>
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.description}</span>
                  <span style={{ fontSize: 10, color: C.red, marginLeft: "auto" }}>Due: {item.delDate}</span>
                </div>
                {item.vendor && <div style={{ fontSize: 11, color: C.muted }}>{item.vendor}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Items grouped */}
        {Object.entries(grouped).map(([grp, gitems]) => (
          <div key={grp} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <div style={{
              padding: "6px 12px",
              background: groupBy === "section" ? C.tealDim : C.accentDim,
              borderBottom: `1px solid ${groupBy === "section" ? C.tealBorder : C.accentBorder}`,
              fontSize: 10, fontWeight: 700,
              color: groupBy === "section" ? C.teal : C.accent, textTransform: "uppercase"
            }}>
              {groupBy === "section" ? "📂" : "🏭"} {grp}{" "}
              <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", marginLeft: 6 }}>
                ({gitems.length} items)
              </span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "70px 60px 1fr 50px 50px 75px 85px",
              padding: "5px 12px", background: C.bg, fontSize: 9, fontWeight: 700,
              color: C.muted, textTransform: "uppercase"
            }}>
              {["Item #", "Fixt. Bk", "Description", "Ord", "Rec'd", "Date", "Status"].map(h => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {gitems.map((item, i) => <Row key={item.id} item={item} i={i} />)}
          </div>
        ))}

        {/* Missing Parts */}
        {missing.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ⚠ Missing Parts ({missing.length})
            </div>
            {missing.map(item => (
              <div key={item.id} style={{
                padding: "8px 12px", background: C.yellowDim,
                border: `1px solid ${C.yellowBorder}`, borderRadius: 6, marginBottom: 6
              }}>
                <div style={{ display: "flex", gap: 9, marginBottom: 3 }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.description}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{item.missingParts}</div>
              </div>
            ))}
          </div>
        )}

        {/* Additional Orders */}
        {additional.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              📦 Additional Orders ({additional.length})
            </div>
            {additional.map(item => (
              <div key={item.id} style={{
                padding: "8px 12px", background: C.blueDim,
                border: `1px solid ${C.blueBorder}`, borderRadius: 6, marginBottom: 6
              }}>
                <div style={{ display: "flex", gap: 9, marginBottom: 3 }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.description}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{item.additionalOrders}</div>
              </div>
            ))}
          </div>
        )}

        {/* Damaged */}
        {damaged.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              🔴 Damaged ({damaged.length})
            </div>
            {damaged.map(item => (
              <div key={item.id} style={{
                padding: "10px 12px", background: C.redDim,
                border: `1px solid ${C.redBorder}`, borderRadius: 6, marginBottom: 6
              }}>
                <div style={{ display: "flex", gap: 9, marginBottom: 4 }}>
                  <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.description}</span>
                </div>
                {item.damageNotes && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{item.damageNotes}</div>}
                {item.photo_id && (
                  <img src={api.getPhotoUrl(item.photo_id)} alt="" style={{
                    maxWidth: "100%", maxHeight: 150, borderRadius: 6,
                    border: `1px solid ${C.border}`
                  }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn variant="orange" icon="🖨" onClick={() => window.print()}>Print</Btn>
        </div>
      </div>
    </Modal>
  );
}
