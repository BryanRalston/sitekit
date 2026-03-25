import React, { useState, useEffect } from 'react';
import { C, TF, MF } from '../tokens';
import { Btn, Inp } from './ui';
import { api } from '../api';
import { useToast } from './Toast';

const TYPE_ICONS = {
  tip: '💡',
  warning: '⚠️',
  sequence: '📋',
};

const TYPE_COLORS = {
  tip: { color: C.green, bg: C.greenDim, border: C.greenBorder },
  warning: { color: C.yellow, bg: C.yellowDim, border: C.yellowBorder },
  sequence: { color: C.blue, bg: C.blueDim, border: C.blueBorder },
};

export default function FixtureKnowledge({ itemNumber, compact }) {
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("tip");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!itemNumber) return;
    setLoading(true);
    api.getFixtureKnowledge(itemNumber)
      .then(data => setTips(Array.isArray(data) ? data : data.tips || []))
      .catch(() => setTips([]))
      .finally(() => setLoading(false));
  }, [itemNumber]);

  const handleAddTip = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const result = await api.addFixtureKnowledge({
        item_number: itemNumber,
        note: noteText.trim(),
        note_type: noteType,
      });
      setTips(prev => [...prev, result]);
      setNoteText("");
      setShowAdd(false);
    } catch (err) {
      toast.error("Failed to save tip: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!itemNumber) return null;
  if (loading) return <div style={{ fontSize: 11, color: C.muted, padding: compact ? 0 : 10 }}>Loading tips...</div>;
  if (tips.length === 0 && compact && !showAdd) return null;

  return (
    <div style={{
      padding: compact ? 0 : 14,
      background: compact ? "transparent" : C.bg,
      borderRadius: compact ? 0 : 8,
      border: compact ? "none" : `1px solid ${C.border}`,
    }}>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ ...TF, fontSize: 14, fontWeight: 700, color: C.purple }}>
            💡 Fixture Knowledge: <span style={{ ...MF, color: C.accent }}>{itemNumber}</span>
          </div>
          <Btn variant="purple" size="sm" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? "Cancel" : "+ Add Tip"}
          </Btn>
        </div>
      )}

      {tips.length === 0 && !compact && !showAdd && (
        <div style={{ fontSize: 12, color: C.muted, padding: "10px 0" }}>
          No tips yet for this item number. Add the first one!
        </div>
      )}

      {tips.map((tip, i) => {
        const tc = TYPE_COLORS[tip.note_type] || TYPE_COLORS.tip;
        return (
          <div key={tip.id || i} style={{
            padding: "8px 12px", marginBottom: 6,
            background: tc.bg, border: `1px solid ${tc.border}`,
            borderRadius: 6, fontSize: 12, color: C.text, lineHeight: 1.6
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{TYPE_ICONS[tip.note_type] || '💡'}</span>
              <div style={{ flex: 1 }}>
                <div>{tip.note}</div>
                {tip.job_name && (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                    From: {tip.job_name}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {(showAdd || (compact && tips.length > 0)) && compact && (
        <Btn variant="purple" size="sm" onClick={() => setShowAdd(s => !s)} style={{ marginTop: 6 }}>
          {showAdd ? "Cancel" : "+ Add Tip"}
        </Btn>
      )}

      {showAdd && (
        <div style={{
          padding: 12, background: C.purpleDim, border: `1px solid ${C.purpleBorder}`,
          borderRadius: 8, marginTop: 8, display: "flex", flexDirection: "column", gap: 10
        }} className="fade-in">
          <div style={{ display: "flex", gap: 6 }}>
            {["tip", "warning", "sequence"].map(t => (
              <button key={t} onClick={() => setNoteType(t)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                background: noteType === t ? (TYPE_COLORS[t]?.bg || C.purpleDim) : "transparent",
                color: noteType === t ? (TYPE_COLORS[t]?.color || C.purple) : C.muted,
                border: `1px solid ${noteType === t ? (TYPE_COLORS[t]?.border || C.purpleBorder) : C.border}`,
                minHeight: 36
              }}>
                {TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <Inp
            label="Note"
            value={noteText}
            onChange={setNoteText}
            placeholder="Enter a tip, warning, or install sequence note..."
            multiline
            rows={2}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn variant="purple" size="sm" disabled={!noteText.trim() || saving} onClick={handleAddTip}>
              {saving ? "Saving..." : "Save Tip"}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
