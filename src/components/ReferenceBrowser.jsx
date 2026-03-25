import React, { useState, useEffect } from 'react';
import { C, MF } from '../tokens';
import { Modal, Btn, Inp } from './ui';
import Lightbox from './Lightbox';
import { api } from '../api';

export default function ReferenceBrowser({ currentJobId, onClose }) {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterItem, setFilterItem] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    loadRefs();
  }, [filterItem, filterVendor, filterSection]);

  const loadRefs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterItem) params.item_number = filterItem;
      if (filterVendor) params.vendor = filterVendor;
      if (filterSection) params.section = filterSection;
      const result = await api.getReferenceLibrary(params);
      setRefs(Array.isArray(result) ? result : result.photos || []);
    } catch {
      setRefs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="⭐ Reference Library" onClose={onClose} width={860} noPad>
      <div style={{ display: "flex", flexDirection: "column", height: "72vh" }}>
        {/* Filters */}
        <div style={{
          padding: "12px 18px", borderBottom: `1px solid ${C.border}`,
          display: "flex", gap: 10, flexWrap: "wrap", background: C.bg
        }}>
          <div style={{ flex: "1 1 140px", minWidth: 100 }}>
            <input value={filterItem} onChange={e => setFilterItem(e.target.value)}
              placeholder="Filter by item #..."
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 12,
                outline: "none", ...MF, minHeight: 36
              }} />
          </div>
          <div style={{ flex: "1 1 140px", minWidth: 100 }}>
            <input value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
              placeholder="Filter by vendor..."
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 12,
                outline: "none", minHeight: 36
              }} />
          </div>
          <div style={{ flex: "1 1 140px", minWidth: 100 }}>
            <input value={filterSection} onChange={e => setFilterSection(e.target.value)}
              placeholder="Filter by section..."
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 12,
                outline: "none", minHeight: 36
              }} />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 13 }}>
              Loading references...
            </div>
          ) : refs.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 13, gap: 10 }}>
              <span style={{ fontSize: 36 }}>⭐</span>
              <span>No reference photos found.{(filterItem || filterVendor || filterSection) ? " Try adjusting filters." : ""}</span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 12 }}>
              {refs.map(photo => (
                <div key={photo.id} onClick={() => setLightboxPhoto(photo)}
                  style={{
                    borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden",
                    cursor: "pointer", transition: "transform 0.15s, border-color 0.15s"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = C.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = C.border; }}>
                  <div style={{ height: 125, background: C.bg, position: "relative" }}>
                    <img src={api.getPhotoUrl(photo.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { e.target.style.display = "none"; }} />
                    {photo.completed && (
                      <div style={{
                        position: "absolute", top: 5, right: 5,
                        background: C.green, color: "#fff", borderRadius: 4,
                        padding: "2px 6px", fontSize: 9, fontWeight: 700
                      }}>✓ Done</div>
                    )}
                    {photo.job_name && (
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        padding: "4px 8px", background: "rgba(0,0,0,0.65)",
                        fontSize: 9, color: C.muted
                      }}>{photo.job_name}</div>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {photo.title || "Untitled"}
                    </div>
                    {photo.linked_count > 0 && (
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                        {photo.linked_count} fixtures linked
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxPhoto && (
        <Lightbox
          photo={lightboxPhoto}
          imgSrc={api.getPhotoUrl(lightboxPhoto.id)}
          allItems={[]}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </Modal>
  );
}
