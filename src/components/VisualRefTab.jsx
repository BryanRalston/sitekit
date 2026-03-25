import React, { useState, useEffect } from 'react';
import { C, TF, DEPT_COLORS } from '../tokens';
import { Btn } from './ui';
import DeptPanel from './DeptPanel';
import ReferenceBrowser from './ReferenceBrowser';
import { api } from '../api';
import { useToast } from './Toast';

export default function VisualRefTab({ job, onRefresh }) {
  const { toast } = useToast();
  const [showNewDept, setShowNewDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [showRefBrowser, setShowRefBrowser] = useState(false);
  const [matchedRefs, setMatchedRefs] = useState(null);

  const depts = job.departments || [];
  const totalPhotos = depts.reduce((a, d) => a + (d.photos || []).length, 0);
  const donePhotos = depts.reduce((a, d) => a + (d.photos || []).filter(p => p.completed).length, 0);
  const refPhotos = depts.reduce((a, d) => a + (d.photos || []).filter(p => p.isReference || p.is_reference).length, 0);

  // Check for matched references from other jobs
  useEffect(() => {
    if (job.id) {
      api.getMatchedReferences(job.id)
        .then(data => setMatchedRefs(data))
        .catch(() => setMatchedRefs(null));
    }
  }, [job.id]);

  const addDept = async () => {
    if (!newDeptName.trim()) return;
    const color = DEPT_COLORS[depts.length % DEPT_COLORS.length];
    try {
      await api.createDepartment(job.id, { name: newDeptName.trim(), color });
      setNewDeptName("");
      setShowNewDept(false);
      onRefresh();
    } catch (err) {
      toast.error("Failed to create department: " + err.message);
    }
  };

  const handleDeptUpdate = (dept) => {
    // Local optimistic update — DeptPanel handles API calls for specific operations
    // This is for local state changes like photo array reordering
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 22, gap: 12, flexWrap: "wrap"
      }}>
        <div>
          <div style={{ ...TF, fontSize: 22, fontWeight: 700, color: C.text }}>Visual Reference</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3, display: "flex", gap: 16 }}>
            <span>{depts.length} departments</span>
            <span style={{ color: C.green }}>{donePhotos}/{totalPhotos} complete</span>
            {refPhotos > 0 && <span style={{ color: C.purple }}>⭐ {refPhotos} reference</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="purple" size="sm" icon="⭐" onClick={() => setShowRefBrowser(true)}>Browse References</Btn>
          <Btn variant="primary" size="sm" icon="+" onClick={() => setShowNewDept(true)}>Add Department</Btn>
        </div>
      </div>

      {/* Matched references banner */}
      {matchedRefs && Array.isArray(matchedRefs) && matchedRefs.length > 0 && (
        <div style={{
          padding: "12px 16px", marginBottom: 18,
          background: C.purpleDim, border: `1px solid ${C.purpleBorder}`,
          borderRadius: 8, display: "flex", alignItems: "center", gap: 12
        }} className="fade-in">
          <span style={{ fontSize: 20 }}>⭐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.purple }}>
              Matched References Available
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {matchedRefs.length} items in this job have reference photos from other projects.
            </div>
          </div>
          <Btn variant="purple" size="sm" onClick={() => setShowRefBrowser(true)}>View</Btn>
        </div>
      )}

      {/* New department form */}
      {showNewDept && (
        <div style={{
          display: "flex", gap: 10, marginBottom: 18, padding: 14,
          background: C.card, border: `1px solid ${C.accentBorder}`, borderRadius: 10
        }} className="fade-in">
          <input value={newDeptName}
            onChange={e => setNewDeptName(e.target.value)}
            placeholder="Department name (e.g. Women's Shoes, Beauty, Dressing Rooms...)"
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") addDept(); if (e.key === "Escape") setShowNewDept(false); }}
            style={{
              flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.text, padding: "8px 12px", fontSize: 13, outline: "none", minHeight: 44
            }} />
          <Btn variant="primary" onClick={addDept}>Create</Btn>
          <Btn variant="ghost" onClick={() => setShowNewDept(false)}>Cancel</Btn>
        </div>
      )}

      {/* Empty state */}
      {depts.length === 0 && !showNewDept && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "70px 20px", gap: 14, textAlign: "center"
        }}>
          <span style={{ fontSize: 52 }}>🏪</span>
          <div style={{ ...TF, fontSize: 26, fontWeight: 700, color: C.text }}>No Departments Yet</div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 400, lineHeight: 1.8 }}>
            Organize installation photos by department. Mark any as{" "}
            <strong style={{ color: C.purple }}>⭐ Reference</strong> to reuse across projects.
          </div>
          <Btn variant="primary" size="lg" icon="+" onClick={() => setShowNewDept(true)}>Add First Department</Btn>
        </div>
      )}

      {/* Department panels */}
      {depts.map(dept => (
        <DeptPanel
          key={dept.id}
          dept={dept}
          allItems={job.items || []}
          color={dept.color || C.accent}
          jobId={job.id}
          onUpdate={handleDeptUpdate}
          onDelete={() => {}} // Handled inside DeptPanel
          onRefresh={onRefresh}
        />
      ))}

      {showRefBrowser && (
        <ReferenceBrowser currentJobId={job.id} onClose={() => setShowRefBrowser(false)} />
      )}
    </div>
  );
}
