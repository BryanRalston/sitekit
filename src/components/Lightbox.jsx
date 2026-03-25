import React, { useState } from 'react';
import { C, TF, MF } from '../tokens';
import { getItemStatus } from '../tokens';
import { Badge, Btn } from './ui';
import PhotoAnnotator from './PhotoAnnotator';
import { put } from '../db';

export default function Lightbox({ photo, imgSrc, allItems, onClose, onAnnotationSave }) {
  const [annotating, setAnnotating] = useState(false);

  const handleAnnotationSave = async (dataUrl) => {
    if (photo.id) {
      await put('blobs', { id: photo.id, data: dataUrl });
    }
    setAnnotating(false);
    if (onAnnotationSave) onAnnotationSave(dataUrl);
  };
  const linked = (photo.linkedItemIds || photo.linked_item_ids || [])
    .map(id => allItems.find(i => i.id === id))
    .filter(Boolean);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 300,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "zoom-out", padding: 20
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 860, width: "100%", display: "flex", flexDirection: "column", gap: 14
      }} className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ ...TF, fontSize: 24, fontWeight: 700, color: C.text }}>
              {photo.title || "Untitled"}
            </div>
            {photo.notes && (
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{photo.notes}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: 24, minWidth: 44, minHeight: 44
          }}>✕</button>
        </div>

        {imgSrc && (
          <img src={imgSrc} alt="" style={{
            width: "100%", maxHeight: "68vh", objectFit: "contain",
            borderRadius: 10, border: `1px solid ${C.border}`
          }} />
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photo.completed && (
            <span style={{
              padding: "3px 10px", borderRadius: 20,
              background: C.greenDim, border: `1px solid ${C.greenBorder}`,
              color: C.green, fontSize: 11, fontWeight: 700
            }}>✓ Completed</span>
          )}
          {(photo.isReference || photo.is_reference) && (
            <span style={{
              padding: "3px 10px", borderRadius: 20,
              background: C.purpleDim, border: `1px solid ${C.purpleBorder}`,
              color: C.purple, fontSize: 11, fontWeight: 700
            }}>⭐ Reference</span>
          )}
          {photo.tag && (
            <span style={{
              padding: "3px 10px", borderRadius: 20,
              background: C.blueDim, border: `1px solid ${C.blueBorder}`,
              color: C.blue, fontSize: 11, fontWeight: 700, textTransform: "capitalize"
            }}>{photo.tag}</span>
          )}
          {linked.map(item => (
            <span key={item.id} style={{
              ...MF, fontSize: 10, padding: "3px 9px",
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 4, color: C.accent
            }}>
              {item.itemNumber} · {item.description?.slice(0, 28)}
            </span>
          ))}
          {imgSrc && (
            <Btn variant="orange" size="sm" icon="✏️" onClick={() => setAnnotating(true)}>Annotate</Btn>
          )}
        </div>
      </div>

      {annotating && (
        <PhotoAnnotator
          imageSrc={imgSrc}
          onSave={handleAnnotationSave}
          onCancel={() => setAnnotating(false)}
        />
      )}
    </div>
  );
}
