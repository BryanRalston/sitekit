import React, { useState, useRef, useEffect } from 'react';
import { C, MF } from '../tokens';
import { Modal, Inp, Btn, Toggle } from './ui';
import FixtureKnowledge from './FixtureKnowledge';
import { api } from '../api';
import { useToast } from './Toast';

function validateItem(f, isEditing) {
  const errors = {};
  // Item number is required for manual adds (new items), not for edits (which may be imports)
  if (!isEditing && !f.itemNumber?.trim()) errors.itemNumber = "Item number is required";
  if (!f.description?.trim()) errors.description = "Description is required";
  if (f.qtyOrdered !== '' && f.qtyOrdered != null) {
    const qty = Number(f.qtyOrdered);
    if (isNaN(qty) || qty < 0) errors.qtyOrdered = "Quantity must be a positive number";
  }
  return errors;
}

async function shareIssue(job, item, issueType) {
  let subject = '';
  let body = '';
  const header = `SiteKit Issue Report — ${job.name}\nStore: ${job.store} #${job.storeNumber}\nDate: ${new Date().toLocaleDateString()}\n\n`;

  if (issueType === 'missing') {
    subject = `Missing Parts — ${item.itemNumber} — ${job.name}`;
    body = header + `MISSING PARTS:\n• ${item.itemNumber} (${item.description})\n  ${item.missingParts}\n  Qty Ordered: ${item.qtyOrdered || 'N/A'} | Section: ${item.section || 'N/A'}`;
  } else if (issueType === 'order') {
    subject = `Additional Order Needed — ${item.itemNumber} — ${job.name}`;
    body = header + `ADDITIONAL ORDER NEEDED:\n• ${item.itemNumber} (${item.description})\n  ${item.additionalOrders}\n  Section: ${item.section || 'N/A'}`;
  } else if (issueType === 'damage') {
    subject = `Damage Report — ${item.itemNumber} — ${job.name}`;
    body = header + `DAMAGE REPORT:\n• ${item.itemNumber} (${item.description})\n  ${item.damageNotes}\n  Qty: ${item.qtyOrdered || 'N/A'} | Section: ${item.section || 'N/A'}`;
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: subject, text: body });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(body); } catch {}
        return true;
      }
      return false;
    }
  } else {
    try { await navigator.clipboard.writeText(body); } catch {}
    return true;
  }
}

function IssueTracker({ issueType, hasContent, reportedDate, resolvedDate, onMarkReported, onMarkResolved, onReopen, onShare }) {
  if (!hasContent) return null;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';

  if (resolvedDate) {
    return (
      <div style={{ padding: '8px 12px', background: C.greenDim, borderRadius: 6, border: `1px solid ${C.greenBorder}`, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Status: Resolved {fmtDate(resolvedDate)}</span>
          <button onClick={onReopen} style={{
            background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.muted, fontSize: 11, padding: '4px 10px', cursor: 'pointer',
            fontFamily: 'inherit', minHeight: 32, minWidth: 44
          }}>Reopen</button>
        </div>
      </div>
    );
  }

  if (reportedDate) {
    return (
      <div style={{ padding: '8px 12px', background: C.yellowDim, borderRadius: 6, border: `1px solid ${C.yellowBorder}`, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.yellow, fontWeight: 600 }}>Status: Reported {fmtDate(reportedDate)}</span>
          <button onClick={onMarkResolved} style={{
            background: C.greenDim, border: `1px solid ${C.greenBorder}`, borderRadius: 6,
            color: C.green, fontSize: 11, padding: '4px 10px', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 600, minHeight: 32, minWidth: 44
          }}>Mark Resolved</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 12px', background: C.redDim, borderRadius: 6, border: `1px solid ${C.redBorder}`, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Status: Not Reported</span>
        <button onClick={onShare} style={{
          background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
          color: C.text, fontSize: 11, padding: '4px 10px', cursor: 'pointer',
          fontFamily: 'inherit', minHeight: 32, minWidth: 44
        }}>Share</button>
        <button onClick={onMarkReported} style={{
          background: C.yellowDim, border: `1px solid ${C.yellowBorder}`, borderRadius: 6,
          color: C.yellow, fontSize: 11, padding: '4px 10px', cursor: 'pointer',
          fontFamily: 'inherit', fontWeight: 600, minHeight: 32, minWidth: 44
        }}>Mark Reported</button>
      </div>
    </div>
  );
}

export default function ItemModal({ item, jobId, job, onSave, onClose, onDelete }) {
  const isEditing = !!item;
  const { toast } = useToast();
  const [f, setF] = useState(item || {
    vendor: "", materialClass: "", description: "", itemNumber: "", fixtureBook: "", section: "",
    qtyOrdered: "", delDate: "", showQtyOrdered: true, qtyReceived: "", dateReceived: "",
    missingParts: "", additionalOrders: "", damaged: false, damageNotes: "", notes: "", hasPhoto: false,
    missingPartsReported: "", missingPartsResolved: "",
    additionalOrdersReported: "", additionalOrdersResolved: "",
    damageReported: "", damageResolved: ""
  });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState({});
  const fileRef = useRef();
  const s = k => v => { setF(p => ({ ...p, [k]: v })); setTouched(p => ({ ...p, [k]: true })); };
  const itemErrors = validateItem(f, isEditing);
  const hasItemErrors = Object.keys(itemErrors).length > 0;
  const itemErrBorder = (field) => touched[field] && itemErrors[field] ? { border: `1px solid ${C.red}`, borderRadius: 6 } : {};
  const itemFieldError = (field) => touched[field] && itemErrors[field] ? (
    <div style={{ color: C.red, fontSize: 11, marginTop: 3 }}>{itemErrors[field]}</div>
  ) : null;

  // Load existing photo if item has one
  const [photoUrl, setPhotoUrl] = useState(null);
  useEffect(() => {
    if (item?.photo_id) {
      api.getPhotoUrl(item.photo_id).then(url => { if (url) setPhotoUrl(url); });
    }
  }, [item?.photo_id]);

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      // Show local preview immediately
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target.result);
      reader.readAsDataURL(file);

      // Upload to server
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("type", "item");
      if (f.id) fd.append("item_id", f.id);
      if (jobId) fd.append("job_id", jobId);
      const result = await api.uploadPhoto(fd);
      setF(p => ({ ...p, hasPhoto: true, photo_id: result.id }));
    } catch (err) {
      toast.error("Photo upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (f.photo_id) {
      try { await api.deletePhoto(f.photo_id); } catch {}
    }
    setPhotoPreview(null);
    setF(p => ({ ...p, hasPhoto: false, photo_id: undefined }));
  };

  const displayPhoto = photoPreview || photoUrl;

  return (
    <Modal title={item ? "Edit Item" : "Add Fixture Item"} onClose={onClose} width={700}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Fixture Information */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
            Fixture Information
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10 }}>
              <Inp label="Vendor" value={f.vendor} onChange={s("vendor")} placeholder="ACME PLASTICS" />
              <Inp label="Material Class" value={f.materialClass} onChange={s("materialClass")} placeholder="DGS / IMPORT" mono />
              <div>
                <div style={itemErrBorder("itemNumber")}><Inp label={isEditing ? "Item #" : "Item # *"} value={f.itemNumber} onChange={s("itemNumber")} placeholder="ACDQ" mono /></div>
                {itemFieldError("itemNumber")}
              </div>
            </div>
            <div>
              <div style={itemErrBorder("description")}><Inp label="Description *" value={f.description} onChange={s("description")} placeholder="4.25Hx5.5 W S/H GLS" /></div>
              {itemFieldError("description")}
            </div>
            <Inp label="Section / Area" value={f.section} onChange={s("section")} placeholder="TJ Smart Gondolas High Rise" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Inp label="Fixture Book" value={f.fixtureBook} onChange={s("fixtureBook")} placeholder="P85" mono />
              <div>
                <div style={itemErrBorder("qtyOrdered")}><Inp label="Qty Ordered" type="number" value={f.qtyOrdered} onChange={s("qtyOrdered")} /></div>
                {itemFieldError("qtyOrdered")}
              </div>
              <Inp label="Del. Date" type="date" value={f.delDate} onChange={s("delDate")} />
            </div>
            <Toggle checked={f.showQtyOrdered !== false} onChange={s("showQtyOrdered")} label="Include ordered qty in report" />
          </div>
        </div>

        {/* Receiving */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.blue, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
            Receiving
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Inp label="Qty Received" type="number" value={f.qtyReceived} onChange={s("qtyReceived")} />
            <Inp label="Date Received" type="date" value={f.dateReceived} onChange={s("dateReceived")} />
          </div>
        </div>

        {/* Issues */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
            Issues
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Inp label="Missing Parts" value={f.missingParts} onChange={s("missingParts")} placeholder="Describe missing parts..." multiline rows={2} />
            <IssueTracker
              issueType="missing"
              hasContent={!!f.missingParts}
              reportedDate={f.missingPartsReported}
              resolvedDate={f.missingPartsResolved}
              onMarkReported={() => { s("missingPartsReported")(new Date().toISOString()); }}
              onMarkResolved={() => { s("missingPartsResolved")(new Date().toISOString()); }}
              onReopen={() => { s("missingPartsResolved")(""); }}
              onShare={async () => {
                if (job) {
                  const ok = await shareIssue(job, f, 'missing');
                  if (ok) { s("missingPartsReported")(new Date().toISOString()); toast.success("Missing parts issue shared"); }
                } else { toast.error("Job context not available"); }
              }}
            />
            <Inp label="Additional Items to Order" value={f.additionalOrders} onChange={s("additionalOrders")} placeholder="Additional items needed..." multiline rows={2} />
            <IssueTracker
              issueType="order"
              hasContent={!!f.additionalOrders}
              reportedDate={f.additionalOrdersReported}
              resolvedDate={f.additionalOrdersResolved}
              onMarkReported={() => { s("additionalOrdersReported")(new Date().toISOString()); }}
              onMarkResolved={() => { s("additionalOrdersResolved")(new Date().toISOString()); }}
              onReopen={() => { s("additionalOrdersResolved")(""); }}
              onShare={async () => {
                if (job) {
                  const ok = await shareIssue(job, f, 'order');
                  if (ok) { s("additionalOrdersReported")(new Date().toISOString()); toast.success("Additional order issue shared"); }
                } else { toast.error("Job context not available"); }
              }}
            />
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase" }}>Damaged</label>
                <Toggle checked={f.damaged} onChange={s("damaged")} label="Mark as damaged" />
              </div>
              {f.damaged && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 10, padding: 13,
                  background: C.redDim, borderRadius: 8, border: `1px solid ${C.redBorder}`
                }}>
                  <Inp label="Damage Notes" value={f.damageNotes} onChange={s("damageNotes")} placeholder="Describe damage..." multiline rows={2} />
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>
                      Damage Photo
                    </label>
                    {uploading && <div style={{ color: C.muted, fontSize: 12 }}>Uploading...</div>}
                    {displayPhoto && (
                      <div style={{ position: "relative", display: "inline-block", marginBottom: 9 }}>
                        <img src={displayPhoto} alt="" style={{ maxWidth: "100%", maxHeight: 170, borderRadius: 6, border: `1px solid ${C.border}` }} />
                        <button onClick={removePhoto}
                          style={{
                            position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.7)",
                            border: "none", color: "#fff", borderRadius: "50%",
                            width: 24, height: 24, cursor: "pointer", fontSize: 12
                          }}>✕</button>
                      </div>
                    )}
                    <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={handlePhoto} capture="environment" />
                    <Btn variant="ghost" size="sm" icon="📷" onClick={() => fileRef.current.click()}>
                      {displayPhoto ? "Replace" : "Add Photo"}
                    </Btn>
                  </div>
                  <IssueTracker
                    issueType="damage"
                    hasContent={f.damaged}
                    reportedDate={f.damageReported}
                    resolvedDate={f.damageResolved}
                    onMarkReported={() => { s("damageReported")(new Date().toISOString()); }}
                    onMarkResolved={() => { s("damageResolved")(new Date().toISOString()); }}
                    onReopen={() => { s("damageResolved")(""); }}
                    onShare={async () => {
                      if (job) {
                        const ok = await shareIssue(job, f, 'damage');
                        if (ok) { s("damageReported")(new Date().toISOString()); toast.success("Damage report shared"); }
                      } else { toast.error("Job context not available"); }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* General Notes */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <Inp label="General Notes" value={f.notes} onChange={s("notes")} placeholder="Any other notes..." multiline rows={2} />
        </div>

        {/* Fixture Knowledge */}
        {f.itemNumber && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <FixtureKnowledge itemNumber={f.itemNumber} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
          {onDelete
            ? <Btn variant="danger" size="sm" onClick={onDelete}>Delete Item</Btn>
            : <div />}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" disabled={hasItemErrors} onClick={() => { setTouched({ itemNumber: true, description: true, qtyOrdered: true }); if (!hasItemErrors) onSave({ ...f }); }}>Save Item</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
