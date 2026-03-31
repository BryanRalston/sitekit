import React, { useState, useEffect, useCallback, useRef } from 'react';
import { C, TF, MF } from './tokens';
import { Btn } from './components/ui';
import Sidebar, { NewJobModal } from './components/Sidebar';
import FixturesTab from './components/FixturesTab';
import VisualRefTab from './components/VisualRefTab';
import ReceiptsTab from './components/ReceiptsTab';
import CrewTab from './components/CrewTab';
import IssuesTab from './components/IssuesTab';
import PinGate from './components/PinGate';
import Tutorial, { TutorialPrompt } from './components/Tutorial';
import GlobalSearch from './components/GlobalSearch';
import FeedbackWidget from './components/FeedbackWidget';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/Toast';
import { SkeletonList } from './components/Skeleton';
import { api } from './api';
import { useMobile } from './hooks/useApi';
import { getOne, put } from './db';
import JobOverview from './components/JobOverview';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </ErrorBoundary>
  );
}

// ─── Job Progress Bar ──────────────────────────────────────────────────────────
function JobProgressBar({ job }) {
  const items = job.items || [];
  if (items.length === 0) return null;

  const totalItems = items.length;
  const receivedItems = items.filter(i => parseInt(i.qtyReceived || '0') > 0).length;
  const pct = Math.round((receivedItems / totalItems) * 100);

  const issueCount = items.filter(i => i.damaged || i.missingParts).length;
  const pendingCount = items.filter(i => {
    const rec = parseInt(i.qtyReceived || '0');
    return rec === 0 && !i.damaged && !i.missingParts;
  }).length;

  const barColor = pct > 75 ? C.green : pct > 40 ? C.blue : pct > 20 ? C.yellow : C.red;
  const barBg = pct > 75 ? C.greenDim : pct > 40 ? C.blueDim : pct > 20 ? C.yellowDim : C.redDim;

  return (
    <div style={{ padding: '6px 22px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>
          {receivedItems}/{totalItems} fixtures received ({pct}%)
        </span>
        {issueCount > 0 && (
          <span style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
        {pendingCount > 0 && (
          <span style={{ fontSize: 10, color: C.yellow }}>
            {pendingCount} pending
          </span>
        )}
      </div>
      <div style={{
        height: 6, borderRadius: 3, background: barBg, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 3, background: barColor,
          width: `${pct}%`, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

function JobCompletionStats({ job }) {
  const items = job.items || [];
  const received = items.filter(i => {
    const r = parseInt(i.qtyReceived || '0');
    const o = parseInt(i.qtyOrdered || '0');
    return r > 0 && o > 0 && r >= o;
  });
  if (received.length === 0) return null;

  const createdDate = job.createdAt ? new Date(job.createdAt) : (job.date ? new Date(job.date + 'T00:00:00') : null);
  if (!createdDate) return null;

  const now = new Date();
  const daysSinceCreated = Math.max(1, Math.floor((now - createdDate) / (1000 * 60 * 60 * 24)));
  const pace = received.length / daysSinceCreated;
  const remaining = items.length - received.length;
  const estDays = pace > 0 ? Math.ceil(remaining / pace) : null;

  return (
    <div style={{ padding: '0 22px 6px', fontSize: 11, color: C.faint, lineHeight: 1.4 }}>
      Day {daysSinceCreated} of remodel
      {' | '}Avg pace: {pace.toFixed(1)} items/day
      {estDays !== null && remaining > 0 && (
        <>{' | '}Est. completion: {estDays} day{estDays !== 1 ? 's' : ''}</>
      )}
      {remaining === 0 && <>{' | '}<span style={{ color: C.green }}>Complete</span></>}
    </div>
  );
}

// ─── PWA Install Prompt ────────────────────────────────────────────────────────
function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Check snooze
    const snoozedUntil = localStorage.getItem('sitekit_pwa_snooze');
    if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    setDismissed(true);
  };

  const handleDismiss = () => {
    // Snooze for 7 days
    localStorage.setItem('sitekit_pwa_snooze', (Date.now() + 7 * 24 * 60 * 60 * 1000).toString());
    setDismissed(true);
  };

  return (
    <div style={{
      padding: '8px 16px',
      background: C.subtleBg,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>
        Add SiteKit to your home screen for the best experience
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleDismiss} style={{
          background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5,
          color: C.muted, cursor: 'pointer', fontSize: 11, fontWeight: 600,
          padding: '4px 10px', fontFamily: 'inherit', minHeight: 30,
        }}>Not Now</button>
        <button onClick={handleInstall} style={{
          background: C.accent, border: 'none', borderRadius: 5,
          color: '#0d1117', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          padding: '4px 12px', fontFamily: 'inherit', minHeight: 30,
        }}>Install</button>
      </div>
    </div>
  );
}

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setShowReconnected(false);
      clearTimeout(timerRef.current);
    };
    const goOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      timerRef.current = setTimeout(() => setShowReconnected(false), 3000);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearTimeout(timerRef.current);
    };
  }, []);

  if (online && !showReconnected) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      padding: '5px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600,
      fontFamily: 'inherit', transition: 'opacity 0.3s',
      background: online ? 'rgba(63,185,80,0.9)' : 'rgba(210,153,34,0.9)',
      color: online ? '#fff' : '#1a1a1a',
      opacity: online && showReconnected ? 1 : online ? 0 : 1,
    }}>
      {online ? 'Back online' : "You're offline \u2014 data is saved locally"}
    </div>
  );
}

function AppInner() {
  const { toast, confirm } = useToast();
  const [unlocked, setUnlocked] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("fixtures");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showWelcomeNewJob, setShowWelcomeNewJob] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const isMobile = useMobile();

  // Full job data (with items + departments) for the active job
  const [activeJobFull, setActiveJobFull] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);

  // Crew member count for tab badge
  const [crewCount, setCrewCount] = useState(0);

  // Load job list
  const loadJobs = useCallback(async () => {
    try {
      const data = await api.getJobs();
      setJobs(data);
      return data;
    } catch (err) {
      setError("Failed to load jobs: " + err.message);
      return [];
    }
  }, []);

  // Load full job data
  const loadFullJob = useCallback(async (jobId) => {
    if (!jobId) { setActiveJobFull(null); return; }
    setJobLoading(true);
    try {
      const data = await api.getJob(jobId);
      setActiveJobFull(data);
    } catch (err) {
      setError("Failed to load job: " + err.message);
    } finally {
      setJobLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadJobs().then(data => {
      if (data.length > 0 && !activeJobId) {
        setActiveJobId(data[0].id);
      }
      setLoading(false);
    });
  }, []);

  // Load crew member count for tab badge — refresh on tab switch
  const refreshCrewCount = useCallback(() => {
    api.getCrewMembers?.().then(members => {
      setCrewCount((members || []).filter(m => m.active !== false).length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!unlocked || loading) return;
    refreshCrewCount();
  }, [unlocked, loading, activeTab, refreshCrewCount]);

  // Check tutorial completion on mount (after unlock)
  useEffect(() => {
    if (!unlocked || loading) return;
    getOne('config', 'tutorial_completed').then(result => {
      if (!result) setShowTutorialPrompt(true);
    }).catch(() => {});
  }, [unlocked, loading]);

  // Auto-backup reminder banner (after unlock)
  const [showBackupBanner, setShowBackupBanner] = useState(false);
  const [backupDaysSince, setBackupDaysSince] = useState(0);

  useEffect(() => {
    if (!unlocked || loading) return;
    (async () => {
      try {
        // Check snooze first
        const snoozedUntil = localStorage.getItem('sitekit_backup_snooze');
        if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) return;

        const config = await getOne('config', 'last_backup_date');
        if (!config) {
          // Never backed up — show banner if jobs exist
          if (jobs.length > 0) {
            setBackupDaysSince(-1); // -1 = never
            setShowBackupBanner(true);
          }
        } else {
          const days = (Date.now() - new Date(config.value).getTime()) / (1000 * 60 * 60 * 24);
          if (days > 7) {
            setBackupDaysSince(Math.floor(days));
            setShowBackupBanner(true);
          }
        }
      } catch (_) {}
    })();
  }, [unlocked, loading, jobs.length]);

  const handleBackupFromBanner = async () => {
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
      try { await put('config', { key: 'last_backup_date', value: new Date().toISOString() }); } catch (_) {}
      localStorage.setItem('sitekit_last_backup', Date.now().toString());
      setShowBackupBanner(false);
    } catch (err) {
      toast.error('Backup failed: ' + err.message);
    }
  };

  const handleBackupSnooze = () => {
    // Dismiss for 1 day
    localStorage.setItem('sitekit_backup_snooze', (Date.now() + 24 * 60 * 60 * 1000).toString());
    setShowBackupBanner(false);
  };

  // Ctrl+K / Cmd+K keyboard shortcut for global search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Reload full job when active job changes
  useEffect(() => {
    if (activeJobId) loadFullJob(activeJobId);
    else setActiveJobFull(null);
  }, [activeJobId, loadFullJob]);

  // Refresh: reload both jobs list and active job
  const refresh = useCallback(async () => {
    await Promise.all([
      loadJobs(),
      activeJobId ? loadFullJob(activeJobId) : Promise.resolve(),
    ]);
  }, [loadJobs, loadFullJob, activeJobId]);

  const handleSelectJob = (jobId) => {
    setActiveJobId(jobId);
    setActiveTab("fixtures");
  };

  const handleSearchNavigate = (tab, itemId) => {
    setActiveTab(tab);
    setShowGlobalSearch(false);
    // Scroll to item after tab switch settles
    if (itemId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-item-id="${itemId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = `2px solid ${C.accent}`;
          el.style.outlineOffset = '2px';
          setTimeout(() => { el.style.outline = 'none'; }, 2000);
        }
      }, 150);
    }
  };

  const handleNewJob = async (jobData) => {
    try {
      const created = await api.createJob(jobData);
      await loadJobs();
      setActiveJobId(created.id);
      setActiveTab("fixtures");
      toast.success("Job created");
    } catch (err) {
      toast.error("Failed to create job: " + err.message);
    }
  };

  const handleDeleteJob = async (jobId) => {
    try {
      await api.deleteJob(jobId);
      const remaining = await loadJobs();
      if (activeJobId === jobId) {
        setActiveJobId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.success("Job deleted");
    } catch (err) {
      toast.error("Failed to delete job: " + err.message);
    }
  };

  if (!unlocked) {
    return <PinGate onUnlock={() => setUnlocked(true)} />;
  }

  if (loading) {
    return (
      <div style={{
        height: "100vh", background: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...TF, fontSize: 28, fontWeight: 700, color: C.accent, marginBottom: 8 }}>
            SITE<span style={{ color: C.text }}>KIT</span>
          </div>
          <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, overflow: "hidden" }}>
      <OfflineBanner />
      <PwaInstallBanner />
      <a href="#main-content" className="skip-link" style={{
        position: 'absolute', top: -40, left: 0, background: '#22D3EE', color: '#000',
        padding: '8px 16px', zIndex: 1000, fontSize: 14, fontWeight: 700,
        transition: 'top 0.2s',
      }} onFocus={e => e.target.style.top = '0'} onBlur={e => e.target.style.top = '-40px'}>
        Skip to main content
      </a>

      {/* Sidebar */}
      <Sidebar
        jobs={jobs}
        activeJobId={activeJobId}
        onSelectJob={handleSelectJob}
        onNewJob={handleNewJob}
        onDeleteJob={handleDeleteJob}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main content */}
      <main id="main-content" role="main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Mobile header */}
        <div className="mobile-only" style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
          background: C.sidebar, flexShrink: 0
        }}>
          <button onClick={() => setMobileMenuOpen(true)} style={{
            background: "none", border: "none", color: C.text,
            cursor: "pointer", fontSize: 22, padding: 4, minWidth: 44, minHeight: 44,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            ☰
          </button>
          <div style={{ ...TF, fontSize: 18, fontWeight: 700, color: C.accent, flex: 1 }}>
            SITE<span style={{ color: C.text }}>KIT</span>
          </div>
          <button data-tutorial="global-search" onClick={() => setShowGlobalSearch(true)} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.muted, cursor: 'pointer', fontSize: 15,
            minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit',
          }}>&#x1F50D;</button>
          <button data-testid="help-btn" onClick={() => setShowTutorial(true)} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.muted, cursor: 'pointer', fontSize: 15, fontWeight: 700,
            minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit',
          }}>?</button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: "8px 16px", background: C.redDim, borderBottom: `1px solid ${C.redBorder}`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0
          }}>
            <span style={{ fontSize: 12, color: C.red }}>{error}</span>
            <button onClick={() => setError(null)} style={{
              background: "none", border: "none", color: C.red,
              cursor: "pointer", marginLeft: "auto", fontSize: 14
            }}>✕</button>
          </div>
        )}

        {!activeJobFull ? (
          jobs.length > 0 ? (
            /* Multi-job overview when jobs exist but none selected */
            <JobOverview jobs={jobs} onSelectJob={handleSelectJob} />
          ) : (
            /* Welcome screen — no jobs exist yet */
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 20,
              padding: "40px 24px", textAlign: "center"
            }}>
              <div style={{ ...TF, fontSize: 36, fontWeight: 700, color: C.accent, letterSpacing: "0.02em" }}>
                SITE<span style={{ color: C.text }}>KIT</span>
              </div>
              <div style={{ fontSize: 14, color: C.muted, maxWidth: 420, lineHeight: 1.8 }}>
                Your jobsite command center. Import fixture lists, track deliveries,
                flag issues, and build a photo reference library that gets smarter with every job.
              </div>

              <div style={{
                display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, marginTop: 8
              }}>
                <div style={{
                  padding: "16px 20px", background: C.card, borderRadius: 12,
                  border: `1px solid ${C.accentBorder}`, textAlign: "left"
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 6 }}>Step 1: Create a Job</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                    {isMobile ? "Tap ☰ then " : "Click "}
                    <strong style={{ color: C.text }}>+ New Job</strong> to set up your store remodel.
                    Enter the store name, number, and location.
                  </div>
                </div>

                <div style={{
                  padding: "16px 20px", background: C.card, borderRadius: 12,
                  border: `1px solid ${C.border}`, textAlign: "left"
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Step 2: Import Fixtures</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                    Upload your Assembly Detail PDF. SiteKit parses it automatically
                    — vendors, sections, quantities, fixture books, delivery dates.
                  </div>
                </div>

                <div style={{
                  padding: "16px 20px", background: C.card, borderRadius: 12,
                  border: `1px solid ${C.border}`, textAlign: "left"
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Step 3: Track on the Jobsite</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                    Mark items received, flag missing parts, document damage
                    with photos, and generate reports for the project manager.
                  </div>
                </div>
              </div>

              <Btn variant="primary" size="lg" icon="+" onClick={() => setShowWelcomeNewJob(true)}
                data-testid="get-started-btn"
                style={{ marginTop: 8, minHeight: 50, fontSize: 16, padding: "12px 28px" }}>
                Get Started
              </Btn>

              {showWelcomeNewJob && (
                <NewJobModal
                  onSave={(data) => { handleNewJob(data); setShowWelcomeNewJob(false); }}
                  onClose={() => setShowWelcomeNewJob(false)}
                />
              )}
            </div>
          )
        ) : (
          <>
            {/* Job header + tabs */}
            <div style={{ background: C.sidebar, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ padding: "15px 22px 0" }}>
                <div style={{ ...TF, fontSize: 23, fontWeight: 700, color: C.text }}>
                  {activeJobFull.name}
                </div>
                <div style={{
                  fontSize: 11, color: C.muted, marginTop: 2,
                  display: "flex", gap: 12, flexWrap: "wrap"
                }}>
                  {activeJobFull.storeNumber && <span>Store #{activeJobFull.storeNumber}</span>}
                  {activeJobFull.location && <span>{activeJobFull.location}</span>}
                  {activeJobFull.fileRef && <span style={MF}>File: {activeJobFull.fileRef}</span>}
                  {activeJobFull.date && <span>{activeJobFull.date}</span>}
                </div>
              </div>
              <JobProgressBar job={activeJobFull} />
              <JobCompletionStats job={activeJobFull} />
              <nav role="navigation" aria-label="Job tabs" style={{ display: "flex", padding: "10px 22px 0", gap: 3, overflowX: "auto", alignItems: "center" }}>
                {[
                  {
                    id: "fixtures", icon: "📋", label: "Fixtures",
                    count: (activeJobFull.items || []).length,
                    tutorial: null
                  },
                  {
                    id: "visual", icon: "🖼", label: isMobile ? "Dept" : "Department",
                    count: (activeJobFull.departments || []).reduce((a, d) => a + (d.photos || []).length, 0),
                    tutorial: "tab-visual"
                  },
                  {
                    id: "receipts", icon: "🧾", label: "Receipts",
                    count: (activeJobFull.receipts || []).length,
                    tutorial: "tab-receipts"
                  },
                  {
                    id: "crew", icon: "👷", label: "Crew",
                    count: crewCount,
                    tutorial: "tab-crew"
                  },
                  {
                    id: "issues", icon: "⚠️", label: "Issues",
                    count: (activeJobFull.items || []).filter(i => (i.missingParts && !i.missingPartsReported) || (i.damaged && !i.damageReported) || (i.additionalOrders && !i.additionalOrdersReported)).length,
                    tutorial: "tab-issues"
                  },
                ].map(tab => {
                  const isA = activeTab === tab.id;
                  return (
                    <button key={tab.id} data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)} data-tutorial={tab.tutorial || undefined} style={{
                      padding: "8px 17px", borderRadius: "8px 8px 0 0", cursor: "pointer",
                      background: isA ? C.bg : "transparent",
                      border: `1px solid ${isA ? C.border : "transparent"}`,
                      borderBottom: `1px solid ${isA ? C.bg : "transparent"}`,
                      color: isA ? C.text : C.muted, fontWeight: isA ? 700 : 500, fontSize: 13,
                      fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                      whiteSpace: "nowrap", minHeight: 44
                    }}>
                      <span>{tab.icon}</span> {tab.label}
                      {tab.count > 0 && (
                        <span style={{
                          padding: "1px 7px", borderRadius: 12,
                          background: isA ? C.accentDim : C.borderLight,
                          color: isA ? C.accent : C.muted, fontSize: 10, fontWeight: 700
                        }}>{tab.count}</span>
                      )}
                    </button>
                  );
                })}
                <button onClick={() => setShowGlobalSearch(true)} style={{
                  padding: "8px 12px", borderRadius: "8px 8px 0 0", cursor: "pointer",
                  background: "transparent", border: "1px solid transparent",
                  color: C.muted, fontSize: 14, fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                  minHeight: 44, marginLeft: "auto",
                }}
                  onMouseEnter={e => e.currentTarget.style.color = C.text}
                  onMouseLeave={e => e.currentTarget.style.color = C.muted}
                  title="Search (Ctrl+K)"
                >
                  &#x1F50D; <span style={{ fontSize: 11 }}>Search</span>
                </button>
              </nav>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {jobLoading ? (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <SkeletonList count={10} />
                </div>
              ) : (
                <>
                  {activeTab === "fixtures" && (
                    <FixturesTab key={activeJobId} job={activeJobFull} onRefresh={refresh} />
                  )}
                  {activeTab === "visual" && (
                    <VisualRefTab key={activeJobId + "-v"} job={activeJobFull} onRefresh={refresh} />
                  )}
                  {activeTab === "receipts" && (
                    <ReceiptsTab key={activeJobId + "-r"} job={activeJobFull} onRefresh={refresh} />
                  )}
                  {activeTab === "crew" && (
                    <CrewTab key={activeJobId + "-c"} job={activeJobFull} onCrewChange={refreshCrewCount} />
                  )}
                  {activeTab === "issues" && (
                    <IssuesTab key={activeJobId + "-i"} job={activeJobFull} onRefresh={refresh} />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* Global Search */}
      {showGlobalSearch && (
        <GlobalSearch
          job={activeJobFull}
          onClose={() => setShowGlobalSearch(false)}
          onNavigate={handleSearchNavigate}
        />
      )}

      {/* Tutorial */}
      {showTutorial && (
        <Tutorial onClose={() => setShowTutorial(false)} />
      )}
      {showTutorialPrompt && !showTutorial && (
        <TutorialPrompt
          onStart={() => { setShowTutorialPrompt(false); setShowTutorial(true); }}
          onDismiss={async () => {
            setShowTutorialPrompt(false);
            try { await put('config', { key: 'tutorial_completed', value: true }); } catch (_) {}
          }}
        />
      )}

      {/* Backup Reminder Banner */}
      {showBackupBanner && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(20,16,12,0.97) 0%, rgba(30,22,14,0.97) 100%)',
          borderTop: '2px solid rgba(245,158,11,0.4)',
          display: 'flex', alignItems: 'center', gap: 12,
          flexWrap: 'wrap', justifyContent: 'center',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: 18 }}>💾</span>
          <span style={{ fontSize: 13, color: '#f5f5f5', fontWeight: 600 }}>
            {backupDaysSince === -1
              ? "You haven't backed up your data yet. Back up now?"
              : `It's been ${backupDaysSince} days since your last backup. Back up now?`}
          </span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={handleBackupSnooze} style={{
              background: 'transparent', border: `1px solid rgba(255,255,255,0.15)`,
              borderRadius: 6, color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, padding: '6px 14px', fontFamily: 'inherit',
              minHeight: 34,
            }}>Remind Later</button>
            <button onClick={handleBackupFromBanner} style={{
              background: 'rgba(245,158,11,0.9)', border: 'none',
              borderRadius: 6, color: '#1a1a1a', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, padding: '6px 16px', fontFamily: 'inherit',
              minHeight: 34,
            }}>Back Up</button>
          </div>
        </div>
      )}

      {/* Feedback Widget */}
      <FeedbackWidget currentTab={activeTab} />
    </div>
  );
}
