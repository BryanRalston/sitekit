import React, { useState } from 'react';
import { C, ROLE_COLORS, DEPT_COLORS } from '../tokens';
import { Btn, Inp, Modal, Toggle } from './ui';
import { useToast } from './Toast';

const ROLES = ['Lead', 'Journeyman', 'Helper', 'Apprentice', 'Other'];

export default function CrewMemberModal({ member, onSave, onClose, onDelete }) {
  const { toast } = useToast();
  const isEditing = !!member;

  const [name, setName] = useState(member?.name || '');
  const [role, setRole] = useState(member?.role || 'Helper');
  const [customRole, setCustomRole] = useState('');
  const [dailyHours, setDailyHours] = useState(member?.dailyHours != null ? String(member.dailyHours) : '8');
  const [active, setActive] = useState(member?.active !== false);
  const [color, setColor] = useState(member?.color || DEPT_COLORS[Math.floor(Math.random() * DEPT_COLORS.length)]);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const effectiveRole = role === 'Other' && customRole.trim() ? customRole.trim() : role;
  const nameErr = touched && !name.trim() ? 'Name is required' : null;

  const handleSave = async () => {
    setTouched(true);
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        role: effectiveRole,
        dailyHours: parseFloat(dailyHours) || 8,
        active,
        color,
      });
      onClose();
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(member.id);
      onClose();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  return (
    <Modal title={isEditing ? 'Edit Crew Member' : 'Add Crew Member'} onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Name */}
        <div>
          <Inp
            label="Name *"
            value={name}
            onChange={v => { setName(v); setTouched(true); }}
            placeholder="e.g. Mike Johnson"
            autoFocus
          />
          {nameErr && (
            <div style={{ color: C.red, fontSize: 11, marginTop: 3 }}>{nameErr}</div>
          )}
        </div>

        {/* Role */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{
            fontSize: 10, fontWeight: 700, color: C.muted,
            letterSpacing: '0.09em', textTransform: 'uppercase',
          }}>
            Role
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROLES.map(r => {
              const isActive = role === r;
              const rs = ROLE_COLORS[r] || ROLE_COLORS.Other;
              return (
                <button key={r} onClick={() => setRole(r)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
                  background: isActive ? rs.bg : 'transparent',
                  color: isActive ? rs.color : C.muted,
                  border: `1px solid ${isActive ? rs.border : C.border}`,
                  transition: 'all 0.15s',
                }}>
                  {r}
                </button>
              );
            })}
          </div>
          {role === 'Other' && (
            <Inp
              value={customRole}
              onChange={setCustomRole}
              placeholder="Custom role name..."
              style={{ marginTop: 4 }}
            />
          )}
        </div>

        {/* Daily Hours Target */}
        <Inp
          label="Daily Hours Target"
          type="number"
          value={dailyHours}
          onChange={setDailyHours}
          placeholder="8"
          mono
        />

        {/* Color picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{
            fontSize: 10, fontWeight: 700, color: C.muted,
            letterSpacing: '0.09em', textTransform: 'uppercase',
          }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DEPT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 30, height: 30, borderRadius: '50%',
                background: c, border: color === c ? '2px solid #fff' : '2px solid transparent',
                cursor: 'pointer', transition: 'border 0.15s',
                boxShadow: color === c ? `0 0 8px ${c}` : 'none',
              }} />
            ))}
          </div>
        </div>

        {/* Active toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0',
          borderTop: `1px solid ${C.borderLight}`,
          paddingTop: 12,
        }}>
          <Toggle checked={active} onChange={setActive} />
          <span style={{ fontSize: 12, fontWeight: 600, color: active ? C.green : C.muted }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          {isEditing && onDelete && (
            <Btn variant="danger" size="sm" onClick={handleDelete} style={{ marginRight: 'auto' }}>
              Delete
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving || !!nameErr}>
            {saving ? 'Saving...' : (isEditing ? 'Save' : 'Add Member')}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
