import React, { useState, useRef } from 'react';
import { C, MF } from '../tokens';
import { Btn, Modal } from './ui';
import { api } from '../api';

export default function ReceiptLogImport({ onClose, onImport }) {
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (file) => {
    setError(null);
    setParsed(null);
    setResults(null);

    if (!file || !file.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        // Validate it's a ReceiptLog backup
        if (data.app !== 'ReceiptLog') {
          setError('This does not appear to be a ReceiptLog backup. Expected "app": "ReceiptLog" in the JSON.');
          return;
        }
        const jobs = data.jobs || [];
        const receipts = data.receipts || [];
        const withPhotos = receipts.filter(r => r.hasPhoto || r.photo).length;
        setParsed({ raw: data, jobCount: jobs.length, receiptCount: receipts.length, photoCount: withPhotos, jobs, receipts });
      } catch (e) {
        setError('Invalid JSON: ' + e.message);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    try {
      const result = await api.importReceiptLog(parsed.raw);
      setResults(result);
      if (onImport) onImport();
    } catch (err) {
      setError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal title="Import from ReceiptLog" onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Results view */}
        {results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{ textAlign: 'center', fontSize: 36, marginBottom: 4 }}>
              {results.error ? '⚠️' : '✅'}
            </div>
            <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: C.text }}>
              {results.error ? 'Import had issues' : 'Import Complete'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Jobs Created', value: results.jobsCreated ?? 0, color: C.green },
                { label: 'Jobs Matched', value: results.jobsMatched ?? 0, color: C.blue },
                { label: 'Receipts Imported', value: results.receiptsImported ?? 0, color: C.accent },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '10px 12px', background: C.bg, borderRadius: 8,
                  border: `1px solid ${C.borderLight}`, textAlign: 'center',
                }}>
                  <div style={{ ...MF, fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
              <Btn variant="primary" onClick={onClose}>Done</Btn>
            </div>
          </div>
        ) : (
          <>
            {/* Drop zone / file picker */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '32px 20px', borderRadius: 10, textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
                border: `2px dashed ${dragOver ? C.accent : C.border}`,
                background: dragOver ? C.accentDim : C.bg,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>{parsed ? '📄' : '📁'}</div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>
                {parsed ? parsed.raw.app + ' Backup' : 'Drop ReceiptLog backup JSON here'}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {parsed ? 'Click to choose a different file' : 'or click to browse'}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json,*/*"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 12,
                background: C.redDim, border: `1px solid ${C.redBorder}`, color: C.red,
              }}>
                {error}
              </div>
            )}

            {/* Preview */}
            {parsed && (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
                }}>
                  {[
                    { label: 'Jobs', value: parsed.jobCount, color: C.blue },
                    { label: 'Receipts', value: parsed.receiptCount, color: C.accent },
                    { label: 'With Photos', value: parsed.photoCount, color: C.teal },
                  ].map(s => (
                    <div key={s.label} style={{
                      padding: '10px 12px', background: C.bg, borderRadius: 8,
                      border: `1px solid ${C.borderLight}`, textAlign: 'center',
                    }}>
                      <div style={{ ...MF, fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Job mapping preview */}
                {parsed.jobs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                      Job Mapping
                    </label>
                    <div style={{
                      background: C.bg, borderRadius: 8, border: `1px solid ${C.borderLight}`,
                      overflow: 'hidden', maxHeight: 180, overflowY: 'auto',
                    }}>
                      {parsed.jobs.map((job, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', fontSize: 12,
                          borderBottom: i < parsed.jobs.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                        }}>
                          <span style={{ flex: 1, color: C.text, fontWeight: 600 }}>
                            {job.name || job.store || `Job ${i + 1}`}
                          </span>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10,
                            background: C.blueDim, color: C.blue, border: `1px solid ${C.blueBorder}`,
                          }}>
                            {job.receiptCount || parsed.receipts.filter(r => r.jobId === job.id).length} receipts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Import button */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                  <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
                  <Btn variant="primary" onClick={handleImport} disabled={importing}>
                    {importing ? 'Importing...' : `Import ${parsed.receiptCount} Receipts`}
                  </Btn>
                </div>
              </>
            )}

            {/* Cancel if no preview */}
            {!parsed && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
