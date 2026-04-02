import React, { useState, useRef } from 'react';
import { C, TF } from '../tokens';
import { Btn } from './ui';
import PhotoCard from './PhotoCard';
import { api } from '../api';
import { useToast } from './Toast';

export default function DeptPanel({ dept, allItems, color, jobId, onUpdate, onDelete, onRefresh }) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(dept.name);
  const { toast, confirm: toastConfirm } = useToast();
  const addCameraRef = useRef(null);
  const addGalleryRef = useRef(null);

  const photos = dept.photos || [];
  const done = photos.filter(p => p.completed).length;

  const handleRename = async () => {
    if (draftName.trim() && draftName !== dept.name) {
      try {
        await api.updateDepartment(dept.id, { name: draftName.trim() });
        onRefresh();
      } catch (err) {
        toast.error("Rename failed: " + err.message);
      }
    }
    setRenaming(false);
  };

  const handleDeleteDept = async () => {
    const yes = await toastConfirm(`Delete "${dept.name}"?`, { confirmLabel: "Delete", dangerous: true });
    if (!yes) return;
    try {
      await api.deleteDepartment(dept.id);
      onRefresh();
      toast.success("Department deleted");
    } catch (err) {
      toast.error("Delete failed: " + err.message);
    }
  };

  const addPhotoCamera = () => addCameraRef.current?.click();
  const addPhotoGallery = () => addGalleryRef.current?.click();

  const handleAddPhotoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('type', 'department');
      fd.append('departmentId', dept.id);
      if (jobId) fd.append('job_id', jobId);
      const newPhoto = await api.uploadPhoto(fd);
      toast.success('Photo added');
      onUpdate({ ...dept, photos: [...photos, newPhoto] });
    } catch (err) {
      toast.error('Failed to add photo: ' + err.message);
    }
  };

  const updatePhoto = async (photo) => {
    if (photo.id) {
      try {
        await api.updatePhoto(photo.id, {
          title: photo.title,
          notes: photo.notes,
          completed: photo.completed,
          isReference: photo.isReference || photo.is_reference,
          tag: photo.tag,
        });
      } catch {}
    }
    onUpdate({ ...dept, photos: photos.map(p => (p.id === photo.id || (!p.id && !photo.id)) ? photo : p) });
  };

  const deletePhoto = async (photo) => {
    const yes = await toastConfirm("Delete this photo?", { confirmLabel: "Delete", dangerous: true });
    if (!yes) return;
    if (photo.id) {
      try { await api.deletePhoto(photo.id); } catch {}
    }
    onUpdate({ ...dept, photos: photos.filter(p => p !== photo) });
    onRefresh();
    toast.success("Photo deleted");
  };

  return (
    <div style={{
      marginBottom: 22, background: C.sidebar, borderRadius: 12,
      border: `1px solid ${C.border}`, overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 11, padding: "12px 16px",
        cursor: "pointer", background: `${color}0c`,
        borderBottom: open ? `1px solid ${C.border}` : "none",
        minHeight: 48
      }}
        onClick={() => !renaming && setOpen(o => !o)}>
        <div style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />

        {renaming ? (
          <input value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onClick={e => e.stopPropagation()} autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            onBlur={handleRename}
            style={{
              flex: 1, background: C.bg, border: `1px solid ${color}`, borderRadius: 5,
              color: C.text, padding: "3px 10px", fontSize: 14, fontWeight: 700, outline: "none"
            }} />
        ) : (
          <span style={{ ...TF, fontSize: 18, fontWeight: 700, color: C.text, flex: 1 }}>{dept.name}</span>
        )}

        <span style={{ fontSize: 11, color: C.muted }}>{done}/{photos.length} done</span>

        <div style={{ width: 70, height: 4, background: C.borderLight, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${photos.length > 0 ? (done / photos.length) * 100 : 0}%`,
            background: color, borderRadius: 2, transition: "width 0.3s"
          }} />
        </div>

        <div style={{ display: "flex", gap: 5 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setRenaming(r => !r); setDraftName(dept.name); }}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, minWidth: 30, minHeight: 30 }}>✏️</button>
          <button onClick={handleDeleteDept}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, minWidth: 30, minHeight: 30 }}>🗑️</button>
        </div>

        <span style={{ color: C.faint, fontSize: 13 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Photo grid */}
      {open && (
        <div style={{ padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 12 }}>
            {photos.map((photo, idx) => (
              <PhotoCard
                key={photo.id || `new-${idx}`}
                photo={photo}
                allItems={allItems}
                color={color}
                jobId={jobId}
                deptId={dept.id}
                onUpdate={updatePhoto}
                onDelete={() => deletePhoto(photo)}
              />
            ))}
            <input type="file" accept="image/*" capture="environment" ref={addCameraRef} style={{ display: 'none' }}
              onChange={handleAddPhotoFile} />
            <input type="file" accept="image/*" ref={addGalleryRef} style={{ display: 'none' }}
              onChange={handleAddPhotoFile} />
            <div style={{
              minHeight: 195, border: `2px dashed ${C.border}`, borderRadius: 10,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 8, color: C.faint,
              transition: "all 0.15s"
            }}>
              <span style={{ fontSize: 22, marginBottom: 4 }}>+</span>
              <Btn variant="ghost" size="sm" icon="📷" onClick={addPhotoCamera} style={{ minWidth: 130 }}>Take Photo</Btn>
              <Btn variant="ghost" size="sm" icon="🖼️" onClick={addPhotoGallery} style={{ minWidth: 130 }}>Choose Photo</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
