import React, { useState, useRef, useCallback } from 'react';
import { C, MF, TF } from '../tokens';
import { Modal, Btn, Inp } from './ui';
import { api } from '../api';

export default function ImportModal({ jobId, onImport, onClose }) {
  const [mode, setMode] = useState("file"); // "file" | "paste"
  const [text, setText] = useState("");
  const [preview, setPreview] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState({});
  const fileInputRef = useRef();

  const startEdit = (index) => {
    const item = preview[index];
    setEditingIndex(index);
    setEditForm({
      vendor: item.vendor || '',
      materialClass: item.materialClass || item.material_class || '',
      itemNumber: item.itemNumber || item.item_number || '',
      description: item.description || '',
      qtyOrdered: item.qtyOrdered || item.qty_ordered || '',
      fixtureBook: item.fixtureBook || item.fixture_book || '',
      section: item.section || '',
    });
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    setPreview(prev => prev.map((item, i) =>
      i === editingIndex ? { ...item, ...editForm } : item
    ));
    setEditingIndex(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditForm({});
  };

  const deletePreviewItem = (index) => {
    setPreview(prev => prev.filter((_, i) => i !== index));
    setEditingIndex(null);
    setEditForm({});
  };

  const addSkippedManually = (lineIndex) => {
    const line = skipped[lineIndex];
    const lineText = typeof line === 'string' ? line : line.text || JSON.stringify(line);
    setPreview(prev => [...prev, {
      vendor: '', materialClass: '', itemNumber: '', description: lineText,
      qtyOrdered: '', fixtureBook: '', section: '',
    }]);
    setSkipped(prev => prev.filter((_, i) => i !== lineIndex));
    // Open edit on the newly added item
    const newIndex = preview.length;
    setTimeout(() => startEdit(newIndex), 50);
  };

  const handleFileUpload = async (file) => {
    setError("");
    setLoading(true);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await api.importPreview(jobId, fd);
      setPreview(result.items || []);
      setSkipped(result.skipped || []);
      if (!(result.items || []).length) {
        setError("Could not parse any items from this file. Check the format.");
      }
    } catch (err) {
      setError("Import failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTextParse = async (raw) => {
    setText(raw);
    if (!raw.trim()) { setPreview([]); setSkipped([]); return; }
    setError("");
    setLoading(true);
    try {
      const result = await api.importPreview(jobId, { text: raw, format: "text" });
      setPreview(result.items || []);
      setSkipped(result.skipped || []);
      if (!(result.items || []).length) {
        setError("Could not parse any items - check the format.");
      }
    } catch (err) {
      setError("Parse failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [jobId]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await api.importConfirm(jobId, preview);
      onImport(preview);
    } catch (err) {
      setError("Confirm failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const sections = [...new Set(preview.map(i => i.section).filter(Boolean))];

  return (
    <Modal title="Import Fixture Items" onClose={onClose} width={720}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginRight: 4, alignSelf: "center" }}>IMPORT METHOD:</div>
          {[
            { id: "file", label: "📁 File Upload", desc: "Drop or pick a PDF/CSV file" },
            { id: "paste", label: "📋 Paste Data", desc: "Paste tab/CSV text from spreadsheet" },
          ].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setPreview([]); setSkipped([]); setError(""); }}
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 7, cursor: "pointer",
                background: mode === m.id ? C.accentDim : "transparent",
                border: `1px solid ${mode === m.id ? C.accentBorder : C.border}`,
                color: mode === m.id ? C.accent : C.muted, fontFamily: "inherit",
                textAlign: "left", minHeight: 44
              }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: 10, marginTop: 3, lineHeight: 1.4, opacity: 0.8 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* File upload mode */}
        {mode === "file" && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "36px 20px", borderRadius: 10, cursor: "pointer",
              border: `2px dashed ${dragOver ? C.accent : C.border}`,
              background: dragOver ? C.accentDim : C.bg,
              textAlign: "center", transition: "all 0.2s"
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>{fileName ? "📄" : "📁"}</div>
            {fileName ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fileName}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Click or drop to replace</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Drop a file here</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>or click to browse. Supports PDF, CSV, XLS</div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              style={{ display: "none" }}
              onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); }}
            />
          </div>
        )}

        {/* Paste mode */}
        {mode === "paste" && (
          <>
            <div style={{
              padding: "10px 14px", background: "rgba(45,212,191,0.06)",
              border: `1px solid ${C.tealBorder}`, borderRadius: 8
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 5 }}>
                📌 How to paste from the Assembly Detail PDF
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                1. Open the Assembly Detail spreadsheet (Excel/PDF viewer)<br />
                2. Select all rows including the section header lines (the ones starting with <em>"- TJ ..."</em>)<br />
                3. Copy and paste below - sections will be auto-detected and attached to each item
              </div>
            </div>

            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Paste Data
              </label>
              <textarea
                value={text}
                onChange={e => handleTextParse(e.target.value)}
                rows={9}
                placeholder="Paste rows from Assembly Detail spreadsheet here - include section header lines..."
                style={{
                  width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                  color: C.text, padding: 12, fontSize: 11, ...MF, resize: "vertical"
                }}
              />
            </div>
          </>
        )}

        {loading && <div style={{ fontSize: 12, color: C.accent, textAlign: "center", padding: 10 }}>Processing...</div>}
        {error && <div style={{ color: C.red, fontSize: 12 }}>⚠ {error}</div>}

        {/* Preview results */}
        {preview.length > 0 && (
          <div>
            <div style={{ display: "flex", gap: 16, marginBottom: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {preview.length} items ready</span>
              {sections.length > 0 && (
                <span style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>📂 {sections.length} sections detected</span>
              )}
              {skipped.length > 0 && (
                <button onClick={() => setShowSkipped(s => !s)} style={{
                  fontSize: 11, color: C.yellow, background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit", textDecoration: "underline"
                }}>
                  {skipped.length} lines skipped {showSkipped ? "▲" : "▼"}
                </button>
              )}
            </div>

            {/* Section breakdown */}
            {sections.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                {sections.map(sec => (
                  <span key={sec} style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 4,
                    background: C.tealDim, border: `1px solid ${C.tealBorder}`, color: C.teal
                  }}>
                    {sec} ({preview.filter(i => i.section === sec).length})
                  </span>
                ))}
              </div>
            )}

            {/* Skipped lines */}
            {showSkipped && skipped.length > 0 && (
              <div style={{
                marginBottom: 10, padding: 10, background: C.yellowDim,
                border: `1px solid ${C.yellowBorder}`, borderRadius: 6,
                maxHeight: 160, overflowY: "auto"
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>
                  SKIPPED LINES ({skipped.length}):
                </div>
                {skipped.map((line, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 10, color: C.muted, marginBottom: 4, lineHeight: 1.5,
                    padding: "3px 0", borderBottom: i < skipped.length - 1 ? `1px solid ${C.yellowBorder}` : "none",
                  }}>
                    <span style={{ ...MF, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {typeof line === 'string' ? line : line.text || JSON.stringify(line)}
                    </span>
                    <button onClick={() => addSkippedManually(i)} style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                      background: C.accentDim, color: C.accent, border: `1px solid ${C.accentBorder}`,
                      whiteSpace: "nowrap",
                    }}>
                      + Add Manually
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Preview table */}
            <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "70px 60px 1fr 60px 80px",
                padding: "5px 12px", background: C.bg, fontSize: 9, fontWeight: 700,
                color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em",
                position: "sticky", top: 0, zIndex: 2
              }}>
                <span>Item #</span><span>Fixt. Bk</span><span>Description</span><span>Qty</span><span>Section</span>
              </div>
              {preview.map((item, i) => (
                <div key={i}>
                  {/* Normal row — click to edit */}
                  <div
                    onClick={() => editingIndex === i ? cancelEdit() : startEdit(i)}
                    style={{
                      display: "grid", gridTemplateColumns: "70px 60px 1fr 60px 80px",
                      padding: "5px 12px", borderTop: `1px solid ${C.borderLight}`,
                      background: editingIndex === i ? C.accentDim : i % 2 === 0 ? C.card : "transparent",
                      fontSize: 11, cursor: "pointer", transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (editingIndex !== i) e.currentTarget.style.background = C.cardHover; }}
                    onMouseLeave={e => { if (editingIndex !== i) e.currentTarget.style.background = editingIndex === i ? C.accentDim : i % 2 === 0 ? C.card : "transparent"; }}
                  >
                    <span style={{ ...MF, color: C.accent, fontSize: 10 }}>{item.itemNumber || item.item_number || "---"}</span>
                    <span style={{ ...MF, color: C.muted, fontSize: 10 }}>{item.fixtureBook || item.fixture_book || "---"}</span>
                    <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </span>
                    <span style={{ color: C.muted }}>{item.qtyOrdered || item.qty_ordered || "---"}</span>
                    <span style={{ color: C.teal, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.section || "---"}
                    </span>
                  </div>

                  {/* Inline edit form */}
                  {editingIndex === i && (
                    <div style={{
                      padding: "10px 12px", background: C.bg,
                      borderTop: `1px solid ${C.accentBorder}`,
                      borderBottom: `1px solid ${C.accentBorder}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Edit Item
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {/* Row 1: Vendor + Item # */}
                        <EditField label="Vendor" value={editForm.vendor} onChange={v => setEditForm(f => ({ ...f, vendor: v }))} mono />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <EditField label="Item #" value={editForm.itemNumber} onChange={v => setEditForm(f => ({ ...f, itemNumber: v }))} mono />
                          <EditField label="Class" value={editForm.materialClass} onChange={v => setEditForm(f => ({ ...f, materialClass: v }))} mono />
                        </div>
                        {/* Row 2: Description (full width) */}
                        <div style={{ gridColumn: "1 / -1" }}>
                          <EditField label="Description" value={editForm.description} onChange={v => setEditForm(f => ({ ...f, description: v }))} />
                        </div>
                        {/* Row 3: Qty + Book + Section */}
                        <div style={{ display: "grid", gridTemplateColumns: "80px 80px 1fr", gap: 8 }}>
                          <EditField label="Qty" value={editForm.qtyOrdered} onChange={v => setEditForm(f => ({ ...f, qtyOrdered: v }))} mono />
                          <EditField label="Book" value={editForm.fixtureBook} onChange={v => setEditForm(f => ({ ...f, fixtureBook: v }))} mono />
                          <EditField label="Section" value={editForm.section} onChange={v => setEditForm(f => ({ ...f, section: v }))} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                        <button onClick={(e) => { e.stopPropagation(); deletePreviewItem(i); }} style={{
                          padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit", marginRight: "auto",
                          background: "transparent", color: C.red, border: `1px solid ${C.redBorder}`,
                        }}>Delete</button>
                        <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} style={{
                          padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                          background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
                        }}>Cancel</button>
                        <button onClick={(e) => { e.stopPropagation(); saveEdit(); }} style={{
                          padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                          background: C.accent, color: "#1a1a1a", border: "none",
                        }}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tap-to-edit hint */}
        {preview.length > 0 && editingIndex === null && (
          <div style={{ fontSize: 10, color: C.faint, textAlign: "center", marginTop: -8 }}>
            Tap any row to edit before importing
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!preview.length || loading} onClick={handleConfirm}>
            Import {preview.length ? `${preview.length} Items` : ""}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Compact inline edit field for the import preview */
function EditField({ label, value, onChange, mono }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label style={{ fontSize: 8, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
          color: C.text, padding: "4px 8px", fontSize: 11, outline: "none",
          boxSizing: "border-box",
          ...(mono ? MF : {}),
        }}
        onFocus={e => { e.target.style.borderColor = C.accent; }}
        onBlur={e => { e.target.style.borderColor = C.border; }}
      />
    </div>
  );
}
