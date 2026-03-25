import React, { useState, useEffect, useCallback } from 'react';
import { C, TF, MF } from './tokens';
import { Btn } from './components/ui';
import Sidebar, { NewJobModal } from './components/Sidebar';
import FixturesTab from './components/FixturesTab';
import VisualRefTab from './components/VisualRefTab';
import ReceiptsTab from './components/ReceiptsTab';
import CrewTab from './components/CrewTab';
import PinGate from './components/PinGate';
import Tutorial, { TutorialPrompt } from './components/Tutorial';
import GlobalSearch from './components/GlobalSearch';
import FeedbackWidget from './components/FeedbackWidget';
import { ToastProvider, useToast } from './components/Toast';
import { SkeletonList } from './components/Skeleton';
import { api } from './api';
import { useMobile } from './hooks/useApi';
import { getOne, put } from './db';

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
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

  // Auto-backup reminder (after unlock)
  useEffect(() => {
    if (!unlocked || loading) return;
    (async () => {
      try {
        const config = await getOne('config', 'last_backup_date');
        if (!config) {
          // Never backed up — prompt after first job is created
          if (jobs.length > 0) {
            toast.info("Back up your data regularly. Tap the Backup button in the sidebar.", { duration: 8000 });
          }
        } else {
          const daysSince = (Date.now() - new Date(config.value).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 7) {
            toast.warning("It's been " + Math.floor(daysSince) + " days since your last backup.", { duration: 8000 });
          }
        }
      } catch (_) {}
    })();
  }, [unlocked, loading, jobs.length]);

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
      <a href="#main-content" style={{position:'absolute',left:'-9999px',top:'auto',width:'1px',height:'1px',overflow:'hidden'}}>Skip to main content</a>

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
      <main id="main-content" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

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
          /* Welcome / No job selected */
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
                <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 6 }}>Step 2: Import Fixtures</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                  Upload your Assembly Detail PDF. SiteKit parses it automatically
                  — vendors, sections, quantities, fixture books, delivery dates.
                </div>
              </div>

              <div style={{
                padding: "16px 20px", background: C.card, borderRadius: 12,
                border: `1px solid ${C.border}`, textAlign: "left"
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 6 }}>Step 3: Track on the Jobsite</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                  Mark items received, flag missing parts, document damage
                  with photos, and generate reports for the project manager.
                </div>
              </div>
            </div>

            <Btn variant="primary" size="lg" icon="＋" onClick={() => setShowWelcomeNewJob(true)}
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
              <div style={{ display: "flex", padding: "10px 22px 0", gap: 3, overflowX: "auto", alignItems: "center" }}>
                {[
                  {
                    id: "fixtures", icon: "📋", label: "Fixtures",
                    count: (activeJobFull.items || []).length,
                    tutorial: null
                  },
                  {
                    id: "visual", icon: "🖼", label: isMobile ? "Photos" : "Visual Reference",
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
              </div>
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

      {/* Feedback Widget */}
      <FeedbackWidget currentTab={activeTab} />
    </div>
  );
}
