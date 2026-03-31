import React, { useState, useRef } from 'react';
import { C, TF, MF, getItemStatus } from '../tokens';
import { Btn, Inp, Modal } from './ui';
import { api } from '../api';
import { put } from '../db';
import ReceiptLogImport from './ReceiptLogImport';
import FeedbackViewer from './FeedbackViewer';
import { useToast } from './Toast';
import { SHARE_FOOTER } from '../utils/shareFooter';

const PROFILE_KEY = 'sitekit_contractor_profile';

function getContractorProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; }
}

function saveContractorProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function ProfileModal({ onClose }) {
  const [profile, setProfile] = useState(getContractorProfile);

  const update = (key, val) => {
    const next = { ...profile, [key]: val };
    setProfile(next);
    saveContractorProfile(next);
  };

  return (
    <Modal title="Contractor Profile" onClose={onClose} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Inp label="Name" value={profile.name || ''} onChange={v => update('name', v)} placeholder="John Smith" />
        <Inp label="Company" value={profile.company || ''} onChange={v => update('company', v)} placeholder="Smith Contracting" />
        <Inp label="Phone" value={profile.phone || ''} onChange={v => update('phone', v)} placeholder="(555) 555-1234" />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>
          This info auto-fills "Prepared By" on reports and shows your name on the lock screen.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
          <Btn variant="primary" onClick={onClose}>Done</Btn>
        </div>
      </div>
    </Modal>
  );
}

function validateNewJob(f) {
  const errors = {};
  if (!f.name.trim()) errors.name = "Job name is required";
  else if (f.name.trim().length < 2) errors.name = "Job name must be at least 2 characters";
  else if (f.name.trim().length > 100) errors.name = "Job name must be 100 characters or less";
  if (!f.store.trim()) errors.store = "Store is required";
  if (f.storeNumber && f.storeNumber.length > 10) errors.storeNumber = "Store number must be 10 characters or less";
  else if (f.storeNumber && !/^[a-zA-Z0-9]*$/.test(f.storeNumber)) errors.storeNumber = "Store number must be letters and numbers only";
  if (f.location && f.location.length > 200) errors.location = "Location must be 200 characters or less";
  if (f.date && isNaN(Date.parse(f.date))) errors.date = "Please enter a valid date";
  return errors;
}

const fieldError = (msg) => msg ? (
  <div style={{ color: C.red, fontSize: 11, marginTop: 3 }}>{msg}</div>
) : null;

export function NewJobModal({ onSave, onClose }) {
  const [f, setF] = useState({
    name: "", store: "", storeNumber: "", location: "",
    fileRef: "", date: new Date().toISOString().slice(0, 10)
  });
  const [touched, setTouched] = useState({});
  const s = k => v => { setF(p => ({ ...p, [k]: v })); setTouched(p => ({ ...p, [k]: true })); };
  const errors = validateNewJob(f);
  const hasErrors = Object.keys(errors).length > 0;
  const errBorder = (field) => touched[field] && errors[field] ? { border: `1px solid ${C.red}`, borderRadius: 6 } : {};
  return (
    <Modal title="New Job" onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={errBorder("name")}><Inp label="Job Name *" value={f.name} onChange={s("name")} placeholder="TJ MAXX - Hybla Valley Remodel" /></div>
          {touched.name && fieldError(errors.name)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={errBorder("store")}><Inp label="Store / Chain *" value={f.store} onChange={s("store")} placeholder="TJ MAXX" /></div>
            {touched.store && fieldError(errors.store)}
          </div>
          <div>
            <div style={errBorder("storeNumber")}><Inp label="Store #" value={f.storeNumber} onChange={s("storeNumber")} placeholder="0092" mono /></div>
            {touched.storeNumber && fieldError(errors.storeNumber)}
          </div>
        </div>
        <div>
          <div style={errBorder("location")}><Inp label="Location" value={f.location} onChange={s("location")} placeholder="Hybla Valley, VA" /></div>
          {touched.location && fieldError(errors.location)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Inp label="File Reference" value={f.fileRef} onChange={s("fileRef")} placeholder="T0092Rem" mono />
          <div>
            <div style={errBorder("date")}><Inp label="Date" type="date" value={f.date} onChange={s("date")} /></div>
            {touched.date && fieldError(errors.date)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={hasErrors} onClick={() => { setTouched({ name: true, store: true, storeNumber: true, location: true, date: true }); if (!hasErrors) onSave(f); }}>Create Job</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ChangePinModal({ onClose }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = async () => {
    setError('');
    if (!/^\d{4}$/.test(currentPin)) { setError('Current PIN must be 4 digits'); return; }
    if (!/^\d{4}$/.test(newPin)) { setError('New PIN must be 4 digits'); return; }
    if (newPin !== confirmPin) { setError('New PINs do not match'); return; }
    try {
      const result = await api.auth.change(currentPin, newPin);
      if (!result.valid) { setError('Current PIN is incorrect'); return; }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err.message);
    }
  };

  const pinInputStyle = {
    ...MF, fontSize: 20, textAlign: 'center', letterSpacing: '0.3em',
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: C.bg, border: `1px solid ${C.border}`, color: C.text,
    outline: 'none',
  };

  return (
    <Modal title="Change PIN" onClose={onClose} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: C.green, fontWeight: 700, fontSize: 14 }}>
            PIN changed successfully
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>Current PIN</div>
              <input type="password" inputMode="numeric" maxLength={4} value={currentPin}
                onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                style={pinInputStyle} placeholder="----" autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>New PIN</div>
              <input type="password" inputMode="numeric" maxLength={4} value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                style={pinInputStyle} placeholder="----" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>Confirm New PIN</div>
              <input type="password" inputMode="numeric" maxLength={4} value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                style={pinInputStyle} placeholder="----" />
            </div>
            {error && <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={handleChange}>Change PIN</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function Sidebar({ jobs, activeJobId, onSelectJob, onNewJob, onDeleteJob, mobileOpen, onCloseMobile, onFeedback }) {
  const [showNewJob, setShowNewJob] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [showReceiptImport, setShowReceiptImport] = useState(false);
  const [showFeedbackViewer, setShowFeedbackViewer] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { toast, confirm: toastConfirm } = useToast();

  // Hidden admin trigger: 5 taps on logo within 3 seconds
  const logoTapsRef = useRef([]);
  const handleLogoTap = () => {
    const now = Date.now();
    logoTapsRef.current.push(now);
    // Keep only taps within the last 3 seconds
    logoTapsRef.current = logoTapsRef.current.filter(t => now - t < 3000);
    if (logoTapsRef.current.length >= 5) {
      logoTapsRef.current = [];
      setShowFeedbackViewer(true);
    }
  };

  const handleNewJob = (data) => {
    onNewJob(data);
    setShowNewJob(false);
  };

  const handleDelete = async (e, jobId) => {
    e.stopPropagation();
    const yes = await toastConfirm("Delete this job and all its data?", { confirmLabel: "Delete", dangerous: true });
    if (yes) {
      onDeleteJob(jobId);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sitekit-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
      // Track backup date for reminder system
      try { await put('config', { key: 'last_backup_date', value: new Date().toISOString() }); } catch (_) {}
      localStorage.setItem('sitekit_last_backup', Date.now().toString());
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
  };

  const triggerCsvDownload = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFixturesCsv = async () => {
    if (!activeJobId) { toast.error('Select a job first'); return; }
    try {
      const { csv, filename } = await api.exportFixturesCsv(activeJobId);
      triggerCsvDownload(csv, filename);
      toast.success('Fixtures CSV exported');
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
    setShowExportMenu(false);
  };

  const handleExportReceiptsCsv = async () => {
    if (!activeJobId) { toast.error('Select a job first'); return; }
    try {
      const { csv, filename } = await api.exportReceiptsCsv(activeJobId);
      triggerCsvDownload(csv, filename);
      toast.success('Receipts CSV exported');
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
    setShowExportMenu(false);
  };

  const handleDailySummary = async () => {
    if (!activeJobId) { toast.error('Select a job first'); return; }
    try {
      const { text, jobName } = await api.getDailySummary(activeJobId);
      const textWithFooter = text + SHARE_FOOTER;
      if (navigator.share) {
        try {
          await navigator.share({ title: `SiteKit Daily Summary \u2014 ${jobName}`, text: textWithFooter });
          toast.success('Summary shared');
          return;
        } catch (e) {
          if (e.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(textWithFooter);
      toast.success('Summary copied to clipboard');
    } catch (err) {
      toast.error('Summary failed: ' + err.message);
    }
  };

  const sidebarContent = (
    <div style={{
      width: 252, background: C.sidebar, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", flexShrink: 0, height: "100%"
    }}>
      {/* Logo — tap to go Home; 5 rapid taps opens admin feedback viewer */}
      <div style={{ padding: "17px 16px 13px", borderBottom: `1px solid ${C.border}` }}>
        <div
          onClick={() => {
            handleLogoTap();
            onSelectJob(null);
            if (onCloseMobile) onCloseMobile();
          }}
          style={{ ...TF, fontSize: 23, fontWeight: 700, color: C.accent, cursor: 'pointer', userSelect: 'none' }}
        >
          SITE<span style={{ color: C.text }}>KIT</span>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 1, letterSpacing: "0.04em" }}>
          Jobsite Command Center
        </div>
      </div>

      {/* Jobs list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <div style={{
          padding: "4px 15px 6px", fontSize: 9, fontWeight: 700,
          color: C.faint, textTransform: "uppercase", letterSpacing: "0.12em"
        }}>
          Jobs ({jobs.length})
        </div>

        {jobs.length === 0 && (
          <div style={{
            padding: "20px 15px", color: C.muted, fontSize: 12,
            textAlign: "center", lineHeight: 1.8
          }}>
            No jobs yet. Create your first job.
          </div>
        )}

        {jobs.map(job => {
          const isActive = job.id === activeJobId;
          const items = job.items || [];
          const itemCount = job.item_count ?? items.length;
          const issueCount = job.issue_count ?? items.filter(i => getItemStatus(i) === "issue").length;
          const sectionCount = job.section_count ?? [...new Set(items.map(i => i.section).filter(Boolean))].length;
          const deptCount = job.dept_count ?? (job.departments || []).length;
          const photoCount = job.photo_count ?? (job.departments || []).reduce((a, d) => a + (d.photos || []).length, 0);
          const donePhotos = job.done_photo_count ?? (job.departments || []).reduce((a, d) => a + (d.photos || []).filter(p => p.completed).length, 0);

          return (
            <div key={job.id} data-testid={`job-item-${job.id}`} onClick={() => { onSelectJob(job.id); if (onCloseMobile) onCloseMobile(); }}
              style={{
                padding: "9px 15px", cursor: "pointer",
                background: isActive ? C.accentDim : "transparent",
                borderLeft: `3px solid ${isActive ? C.accent : "transparent"}`,
                transition: "background 0.12s", minHeight: 44
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: isActive ? C.accent : C.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {job.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: C.muted, marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {job.location || job.store}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: C.muted }}>{itemCount} items</span>
                    {sectionCount > 0 && <span style={{ fontSize: 10, color: C.muted }}>📂 {sectionCount} sections</span>}
                    {issueCount > 0 && <span style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>⚠ {issueCount}</span>}
                    {photoCount > 0 && <span style={{ fontSize: 10, color: C.muted }}>📷 {donePhotos}/{photoCount}</span>}
                  </div>
                </div>
                <button data-testid={`delete-job-${job.id}`} onClick={e => handleDelete(e, job.id)}
                  style={{
                    background: "none", border: "none", color: C.muted,
                    cursor: "pointer", fontSize: 13, opacity: 0.35,
                    padding: "2px 4px", minWidth: 30, minHeight: 30
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "0.35"}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { icon: "🔒", label: "Lock", tutorial: "lock", testId: "lock-btn", onClick: () => { sessionStorage.removeItem('sitekit_unlocked'); window.location.reload(); } },
            { icon: "🔑", label: "PIN", testId: "change-pin-btn", onClick: () => setShowChangePin(true) },
            { icon: "📥", label: "ReceiptLog", testId: "receiptlog-import-btn", onClick: () => setShowReceiptImport(true) },
            { icon: "💾", label: "Backup", tutorial: "backup", testId: "backup-btn", onClick: handleExport },
            { icon: "📊", label: "Export CSV", testId: "export-csv-btn", onClick: () => setShowExportMenu(v => !v) },
            { icon: "📝", label: "Summary", testId: "daily-summary-btn", onClick: handleDailySummary },
            { icon: "👤", label: "Profile", testId: "profile-btn", onClick: () => setShowProfile(true) },
            { icon: "💬", label: "Feedback", testId: "feedback-btn", tutorial: "feedback-btn", onClick: () => { if (onFeedback) onFeedback(); } },
          ].map(btn => (
            <button key={btn.label} onClick={btn.onClick} data-tutorial={btn.tutorial || undefined} data-testid={btn.testId} style={{
              background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.muted, cursor: "pointer", fontSize: 11, padding: "6px 8px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 32,
              fontFamily: "inherit",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
            >
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>
        {showExportMenu && (
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            padding: 8, background: C.card, borderRadius: 8,
            border: `1px solid ${C.border}`,
          }}>
            <button onClick={handleExportFixturesCsv} data-testid="export-fixtures-csv" style={{
              background: "none", border: "none", color: C.text, cursor: "pointer",
              fontSize: 12, padding: "6px 10px", borderRadius: 6, textAlign: "left",
              fontFamily: "inherit",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.cardHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              📋 Export Fixtures CSV
            </button>
            <button onClick={handleExportReceiptsCsv} data-testid="export-receipts-csv" style={{
              background: "none", border: "none", color: C.text, cursor: "pointer",
              fontSize: 12, padding: "6px 10px", borderRadius: 6, textAlign: "left",
              fontFamily: "inherit",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.cardHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              🧾 Export Receipts CSV
            </button>
          </div>
        )}
        <Btn variant="primary" full icon="+" onClick={() => setShowNewJob(true)} data-tutorial="new-job" data-testid="new-job-btn">New Job</Btn>
      </div>

      {showNewJob && <NewJobModal onSave={handleNewJob} onClose={() => setShowNewJob(false)} />}
      {showChangePin && <ChangePinModal onClose={() => setShowChangePin(false)} />}
      {showReceiptImport && <ReceiptLogImport onClose={() => setShowReceiptImport(false)} onImport={() => setShowReceiptImport(false)} />}
      {showFeedbackViewer && <FeedbackViewer onClose={() => setShowFeedbackViewer(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );

  // Desktop: render sidebar directly
  // Mobile: render as overlay drawer
  return (
    <nav role="navigation" aria-label="Job sidebar">
      {/* Desktop sidebar */}
      <div className="desktop-only" style={{ display: "flex", flexShrink: 0 }}>
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="mobile-only" style={{
          position: "fixed", inset: 0, zIndex: 150,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)"
        }} onClick={onCloseMobile}>
          <div onClick={e => e.stopPropagation()} style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: 280, maxWidth: "85vw"
          }} className="fade-in">
            {sidebarContent}
          </div>
        </div>
      )}
    </nav>
  );
}
