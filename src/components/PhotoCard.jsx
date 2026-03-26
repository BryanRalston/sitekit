import React, { useState, useRef, useEffect } from 'react';
import { C } from '../tokens';
import { Btn, Toggle } from './ui';
import Lightbox from './Lightbox';
import FixturePicker from './FixturePicker';
import PhotoAnnotator from './PhotoAnnotator';
import { api } from '../api';
import { put } from '../db';
import { useToast } from './Toast';

const TAGS = ["before", "during", "after", "issue", "reference"];
const TAG_COLORS = {
  before: { color: C.yellow, bg: C.yellowDim, border: C.yellowBorder },
  during: { color: C.blue, bg: C.blueDim, border: C.blueBorder },
  after: { color: C.green, bg: C.greenDim, border: C.greenBorder },
  issue: { color: C.red, bg: C.redDim, border: C.redBorder },
  reference: { color: C.purple, bg: C.purpleDim, border: C.purpleBorder },
};

export default function PhotoCard({ photo, allItems, color, onUpdate, onDelete, jobId, deptId }) {
  const [showPicker, setShowPicker] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const fileRef = useRef();
  const { toast } = useToast();

  const handleAnnotationSave = async (dataUrl) => {
    if (photo.id) {
      await put('blobs', { id: photo.id, data: dataUrl });
    }
    setAnnotating(false);
    toast.success("Annotations saved");
  };

  const linked = allItems.filter(i => (photo.linkedItemIds || photo.linked_item_ids || []).includes(i.id));
  const [imgSrc, setImgSrc] = useState(null);
  useEffect(() => {
    if (photo.id) {
      api.getPhotoUrl(photo.id).then(url => { if (url) setImgSrc(url); });
    }
  }, [photo.id]);
  const hasImage = photo.hasPhoto || photo.has_photo || photo.id;

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("type", "department");
      if (photo.id) fd.append("photoId", photo.id);
      if (jobId) fd.append("job_id", jobId);
      if (deptId) fd.append("departmentId", deptId);
      if (photo.title) fd.append("title", photo.title);
      const result = await api.uploadPhoto(fd);
      onUpdate({ ...photo, ...result, hasPhoto: true });
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleLinked = async (itemId) => {
    const cur = photo.linkedItemIds || photo.linked_item_ids || [];
    const newIds = cur.includes(itemId) ? cur.filter(x => x !== itemId) : [...cur, itemId];
    try {
      if (photo.id) {
        await api.linkPhoto(photo.id, newIds);
      }
      onUpdate({ ...photo, linkedItemIds: newIds, linked_item_ids: newIds });
    } catch (err) {
      // fallback to local update
      onUpdate({ ...photo, linkedItemIds: newIds, linked_item_ids: newIds });
    }
  };

  const handleTagChange = (tag) => {
    const updated = { ...photo, tag };
    if (photo.id) {
      api.updatePhoto(photo.id, { tag }).catch(() => {});
    }
    onUpdate(updated);
  };

  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {/* Photo area */}
        <div style={{ height: 155, background: C.bg, position: "relative" }}>
          {hasImage && imgSrc
            ? <img src={imgSrc} alt="" onClick={() => setShowLightbox(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} />
            : <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "100%", gap: 7, color: C.faint
              }}>
                <span style={{ fontSize: 32 }}>📷</span>
                <span style={{ fontSize: 11 }}>{uploading ? "Uploading..." : "No photo"}</span>
              </div>}

          {/* Status badges */}
          <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 5 }}>
            {photo.completed && (
              <span style={{ background: C.green, color: "#fff", borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700 }}>✓ Done</span>
            )}
            {(photo.isReference || photo.is_reference) && (
              <span style={{ background: C.purple, color: "#fff", borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700 }}>⭐</span>
            )}
          </div>

          {/* Upload button */}
          <button onClick={() => fileRef.current.click()} style={{
            position: "absolute", top: 6, right: 6,
            background: "rgba(0,0,0,0.65)", border: "none", color: "#fff",
            borderRadius: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer",
            minHeight: 30
          }}>
            📷 {hasImage ? "Replace" : "Add"}
          </button>
          <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }}
            onChange={handlePhoto} />
        </div>

        {/* Card body */}
        <div style={{ padding: "10px 11px" }}>
          <input value={photo.title || ""} onChange={e => onUpdate({ ...photo, title: e.target.value })}
            placeholder="Label this photo..."
            style={{
              width: "100%", background: "transparent", border: "none",
              borderBottom: `1px solid ${C.borderLight}`, color: C.text,
              fontSize: 13, fontWeight: 600, outline: "none", paddingBottom: 4, marginBottom: 7
            }} />
          <textarea value={photo.notes || ""} onChange={e => onUpdate({ ...photo, notes: e.target.value })}
            placeholder="Notes..." rows={2}
            style={{
              width: "100%", background: "transparent", border: "none",
              color: C.muted, fontSize: 11, outline: "none", resize: "none", lineHeight: 1.5
            }} />

          {/* Tags */}
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {TAGS.map(tag => {
              const tc = TAG_COLORS[tag] || {};
              const isActive = photo.tag === tag;
              return (
                <button key={tag} onClick={() => handleTagChange(isActive ? null : tag)}
                  style={{
                    padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                    background: isActive ? tc.bg : "transparent",
                    color: isActive ? tc.color : C.faint,
                    border: `1px solid ${isActive ? tc.border : "transparent"}`,
                    minHeight: 24
                  }}>
                  {tag}
                </button>
              );
            })}
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <Toggle checked={!!photo.completed} onChange={v => onUpdate({ ...photo, completed: v })} label="Completed" right />
            <Toggle checked={!!(photo.isReference || photo.is_reference)} onChange={v => onUpdate({ ...photo, isReference: v, is_reference: v })} label="Reference ⭐" right />
          </div>

          {/* Linked items */}
          {linked.length > 0 && (
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {linked.map(item => (
                <span key={item.id} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "2px 7px",
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 4, color: C.accent
                }}>
                  {item.itemNumber || item.description?.slice(0, 14) || "---"}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Btn variant="ghost" size="sm" icon="🔗" onClick={() => setShowPicker(true)}>
              {linked.length > 0 ? `${linked.length} Linked` : "Link Fixtures"}
            </Btn>
            {hasImage && imgSrc && (
              <Btn variant="orange" size="sm" icon="✏️" onClick={() => setAnnotating(true)}>Annotate</Btn>
            )}
            <Btn variant="danger" size="sm" onClick={onDelete} style={{ marginLeft: "auto" }}>✕</Btn>
          </div>
        </div>
      </div>

      {showLightbox && imgSrc && (
        <Lightbox photo={photo} imgSrc={imgSrc} allItems={allItems}
          onClose={() => setShowLightbox(false)}
          onAnnotationSave={() => { /* blob updated in Lightbox handler */ }} />
      )}
      {showPicker && (
        <FixturePicker allItems={allItems}
          linkedIds={photo.linkedItemIds || photo.linked_item_ids || []}
          onToggle={toggleLinked} onClose={() => setShowPicker(false)} />
      )}
      {annotating && imgSrc && (
        <PhotoAnnotator
          imageSrc={imgSrc}
          onSave={handleAnnotationSave}
          onCancel={() => setAnnotating(false)}
        />
      )}
    </>
  );
}
