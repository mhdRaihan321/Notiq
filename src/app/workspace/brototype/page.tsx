'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BrototypeUser,
  BrototypeTask,
  BrototypeDashboard,
  getSavedBrototypeUser,
  getSavedBrototypeToken,
  fetchBrototypeDashboard,
  fetchBrototypeTasks,
  fetchBrototypeTaskDetail,
  syncTaskToNotiqTodos,
  disconnectBrototype,
} from '@/lib/brototypeApi';
import BrototypeModal from '@/components/BrototypeModal';
import { useAuth } from '@/contexts/AuthContext';

export default function BrototypeHubPage() {
  const { activeWorkspace } = useAuth();
  const [user, setUser] = useState<BrototypeUser | null>(null);
  const [dashboard, setDashboard] = useState<BrototypeDashboard | null>(null);
  const [tasks, setTasks] = useState<BrototypeTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<BrototypeTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importingTaskId, setImportingTaskId] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const [filterSemester, setFilterSemester] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadData = useCallback(async () => {
    const token = getSavedBrototypeToken();
    if (!token) {
      setUser(null);
      return;
    }

    setUser(getSavedBrototypeUser());
    setLoading(true);
    setError('');

    try {
      const [dashData, taskList] = await Promise.all([
        fetchBrototypeDashboard().catch(() => null),
        fetchBrototypeTasks().catch(() => []),
      ]);
      setDashboard(dashData);
      setTasks(taskList);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch Brototype data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleAuthChange = () => loadData();
    window.addEventListener('brototype_auth_changed', handleAuthChange);
    return () => window.removeEventListener('brototype_auth_changed', handleAuthChange);
  }, [loadData]);

  const handleOpenDetail = async (task: BrototypeTask) => {
    setSelectedTask(task);
    setDetailLoading(true);
    try {
      const detail = await fetchBrototypeTaskDetail(task.taskAssignmentIdentifier);
      setSelectedTask(detail);
    } catch {
      // Keep basic task info if detail fetch fails
    } finally {
      setDetailLoading(false);
    }
  };

  const handleImportSingle = async (task: BrototypeTask) => {
    if (!activeWorkspace) {
      setError('Please select or create an active workspace in Notiq first.');
      return;
    }

    // Check if task is already in todos with complete sub-items
    const existingRaw = typeof window !== 'undefined' ? localStorage.getItem('notiq_todos') : null;
    if (existingRaw) {
      try {
        const existingTodos = JSON.parse(existingRaw);
        const normalize = (s?: string) => (s || '').toLowerCase().replace(/^\[brototype\]\s*/i, '').replace(/[^a-z0-9]/g, '').trim();
        const normTask = normalize(task.taskname);
        const alreadyWithSubs = existingTodos.some(
          (t: any) =>
            (normalize(t.title) === normTask || t.id === `bt-${task.taskAssignmentIdentifier}`) &&
            t.subItems &&
            t.subItems.length > 0
        );
        if (alreadyWithSubs) {
          setImportSuccessMsg(`ℹ️ Already added! "${task.taskname}" is already in your Todos with its checklist.`);
          setTimeout(() => setImportSuccessMsg(''), 5000);
          return;
        }
      } catch { /* */ }
    }

    setImportingTaskId(task.taskAssignmentIdentifier);
    try {
      const imported = await syncTaskToNotiqTodos(task, activeWorkspace.id);
      const count = imported.length;
      const totalChecklistItems = imported.reduce((acc, t) => acc + (t.subItems?.length || 0), 0);
      if (count > 1) {
        setImportSuccessMsg(`🎉 Added "${task.taskname}" with ${count} topic cards (${totalChecklistItems} checklist items) into your Todos!`);
      } else {
        setImportSuccessMsg(`🎉 Added "${task.taskname}" with ${totalChecklistItems} checklist items into your Todos!`);
      }
      setTimeout(() => setImportSuccessMsg(''), 5000);
    } catch (err: any) {
      setError('Import failed: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setError(''), 5000);
    } finally {
      setImportingTaskId(null);
    }
  };

  const handleImportAll = async () => {
    if (!activeWorkspace) {
      setError('Please select or create an active workspace in Notiq first.');
      return;
    }

    // Check existing todos to filter out duplicates
    const existingRaw = typeof window !== 'undefined' ? localStorage.getItem('notiq_todos') : null;
    let existingTodos: any[] = [];
    if (existingRaw) {
      try {
        existingTodos = JSON.parse(existingRaw);
      } catch { /* */ }
    }

    const normalize = (s?: string) => (s || '').toLowerCase().replace(/^\[brototype\]\s*/i, '').replace(/[^a-z0-9]/g, '').trim();
    const existingSet = new Set(existingTodos.filter((et: any) => et.subItems && et.subItems.length > 0).map((t: any) => normalize(t.title)));

    const tasksToImport = filteredTasks.filter(
      (t) =>
        !existingSet.has(normalize(t.taskname)) &&
        !existingTodos.some((et: any) => et.id === `bt-${t.taskAssignmentIdentifier}` && et.subItems && et.subItems.length > 0)
    );

    if (tasksToImport.length === 0) {
      setImportSuccessMsg(`ℹ️ All ${filteredTasks.length} tasks are already in your Todos with their checklists! No duplicates imported.`);
      setTimeout(() => setImportSuccessMsg(''), 5000);
      return;
    }

    setLoading(true);
    try {
      let totalCreated = 0;
      let totalSubs = 0;
      for (const t of tasksToImport) {
        const res = await syncTaskToNotiqTodos(t, activeWorkspace.id);
        totalCreated += res.length;
        totalSubs += res.reduce((acc, item) => acc + (item.subItems?.length || 0), 0);
      }
      const skippedCount = filteredTasks.length - tasksToImport.length;
      if (skippedCount > 0) {
        setImportSuccessMsg(`🎉 Imported ${totalCreated} topics with ${totalSubs} checklist items! (${skippedCount} already in Todos were skipped).`);
      } else {
        setImportSuccessMsg(`🎉 Successfully imported all ${totalCreated} topics with ${totalSubs} checklist items into your Todos!`);
      }
      setTimeout(() => setImportSuccessMsg(''), 6000);
    } catch (err: any) {
      setError('Error during bulk import: ' + err.message);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSem = filterSemester === 'all' || t.semesterNumber === filterSemester;
    const matchesSearch =
      !searchQuery ||
      t.taskname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.paperName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSem && matchesSearch;
  });

  return (
    <div style={{ ...styles.container, padding: isMobile ? '20px 14px' : '32px 40px' }}>
      {/* Top Banner */}
      <div style={{ ...styles.topBar, paddingTop: isMobile ? 44 : 0 }}>
        <div>
          <h1 style={styles.pageTitle}>Brototype Student Hub</h1>
          <p style={styles.pageSubtitle}>
            Live sync with your Brototype portal tasks, syllabus, and academic progression.
          </p>
        </div>

        {user ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={loadData} disabled={loading} style={styles.secondaryBtn}>
              {loading ? 'Refreshing…' : '🔄 Refresh'}
            </button>
            <button
              onClick={() => {
                disconnectBrototype();
                setUser(null);
                setDashboard(null);
                setTasks([]);
              }}
              style={styles.dangerBtn}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={() => setIsModalOpen(true)} style={styles.primaryBtn}>
            ⚡ Connect Brototype Account
          </button>
        )}
      </div>

      {importSuccessMsg && (
        <div style={styles.successBanner}>
          <span>✅ {importSuccessMsg}</span>
        </div>
      )}

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Disconnected State */}
      {!user && (
        <div style={styles.connectHero}>
          <div style={styles.heroBadge}>⚡</div>
          <h2 style={styles.heroTitle}>Connect Your Brototype Student Account</h2>
          <p style={styles.heroDesc}>
            Access your 13+ module tasks, review topics, semester milestones, and average exam scores right inside your personal Notiq workspace.
          </p>
          <button onClick={() => setIsModalOpen(true)} style={styles.heroBtn}>
            Sign In with Brototype
          </button>
          <div style={styles.featureGrid}>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>📋</span>
              <div style={styles.featureText}>
                <strong>Task Syncer</strong>
                <p>Import technical papers and module tasks straight into your Notion-like todos.</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>📊</span>
              <div style={styles.featureText}>
                <strong>Progress Tracking</strong>
                <p>View your official exam average scores and semester completion percentage.</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>🔒</span>
              <div style={styles.featureText}>
                <strong>Client-Side & Secure</strong>
                <p>Direct HTTPS connection with CORS support. No intermediate backend required.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connected Dashboard View */}
      {user && (
        <>
          {/* Profile Card - Responsive */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: isMobile ? 12 : 18,
              padding: isMobile ? '16px 14px' : '20px 24px',
              borderRadius: 14,
              background: 'var(--bg-secondary, #161616)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              marginBottom: 24,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            {/* Top/Left Section: Avatar + Name + Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: isMobile ? 44 : 50,
                  height: isMobile ? 44 : 50,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
                  color: '#fff',
                  fontSize: isMobile ? 18 : 22,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                }}
              >
                {user.name ? user.name.charAt(0).toUpperCase() : 'B'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                  <h3 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#f8fafc', margin: 0, letterSpacing: '-0.2px' }}>
                    {user.name}
                  </h3>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: 'rgba(34, 197, 94, 0.16)',
                      color: '#4ade80',
                      fontSize: 11,
                      fontWeight: 700,
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Active Student
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {user.batchName && (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.06)',
                        fontSize: 11.5,
                        color: '#cbd5e1',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.batchName}
                    </span>
                  )}
                  {user.domainName && (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'rgba(124, 106, 247, 0.14)',
                        border: '1px solid rgba(124, 106, 247, 0.28)',
                        fontSize: 11.5,
                        color: '#c4b5fd',
                        fontWeight: 600,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={user.domainName}
                    >
                      {user.domainName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Details (Phone & Email) */}
            {(user.mobile || user.email) && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'row' : 'column',
                  flexWrap: 'wrap',
                  alignItems: isMobile ? 'flex-start' : 'flex-end',
                  justifyContent: 'space-between',
                  gap: isMobile ? 10 : 5,
                  fontSize: 12,
                  color: 'var(--text-muted, #94a3b8)',
                  borderTop: isMobile ? '1px solid rgba(255, 255, 255, 0.07)' : 'none',
                  paddingTop: isMobile ? 10 : 0,
                  minWidth: 0,
                }}
              >
                {user.mobile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <span>📱</span>
                    <span>{user.mobile}</span>
                  </div>
                )}
                {user.email && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                      maxWidth: '100%',
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>✉️</span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={user.email}
                    >
                      {user.email}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Tasks Section */}
          <div style={styles.tasksSection}>
            <div style={styles.tasksHeader}>
              <div>
                <h3 style={styles.sectionHeader}>Assigned Tasks ({filteredTasks.length})</h3>
                <p style={styles.sectionSub}>Review study topics and sync them directly into Notiq Todos.</p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search tasks…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />

                <select
                  value={filterSemester}
                  onChange={(e) => setFilterSemester(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  style={styles.selectInput}
                >
                  <option value="all">All Semesters</option>
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>

                {filteredTasks.length > 0 && (
                  <button onClick={handleImportAll} style={styles.importAllBtn}>
                    📥 Import All to Todos
                  </button>
                )}
              </div>
            </div>

            {loading && tasks.length === 0 ? (
              <div style={styles.loadingBox}>Loading tasks from Brototype API…</div>
            ) : filteredTasks.length === 0 ? (
              <div style={styles.emptyBox}>No tasks matching your filter.</div>
            ) : (
              <div style={{ ...styles.taskGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {filteredTasks.map((t) => (
                  <div key={t.taskAssignmentIdentifier} style={styles.taskCard}>
                    <div style={styles.taskCardHeader}>
                      <span style={styles.taskTypeBadge}>{t.tasktype}</span>
                      <span style={styles.taskStatusBadge}>{t.taskStatus}</span>
                      <span style={styles.taskSemBadge}>{t.semesterName} • {t.paperName}</span>
                    </div>

                    <h4 style={styles.taskTitle}>{t.taskname}</h4>
                    <p style={styles.taskDesc}>
                      {t.description ? t.description.slice(0, 140) + '…' : 'No description provided.'}
                    </p>

                    <div style={styles.taskFooter}>
                      <span style={styles.topicCount}>📚 {t.topicsCount} Topics</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleOpenDetail(t)}
                          style={styles.detailBtn}
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleImportSingle(t)}
                          disabled={importingTaskId === t.taskAssignmentIdentifier}
                          style={styles.syncBtn}
                        >
                          {importingTaskId === t.taskAssignmentIdentifier ? 'Adding…' : '+ Add to Todos'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Task Details Drawer / Modal */}
      {selectedTask && (
        <div style={styles.drawerOverlay} onClick={() => setSelectedTask(null)}>
          <div style={{ ...styles.drawer, maxWidth: isMobile ? '100%' : 580 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <div>
                <span style={styles.taskTypeBadge}>{selectedTask.tasktype}</span>
                <h3 style={styles.drawerTitle}>{selectedTask.taskname}</h3>
                <div style={styles.drawerSub}>
                  {selectedTask.semesterName} • {selectedTask.paperName} • Status: {selectedTask.taskStatus}
                </div>
              </div>
              <button onClick={() => setSelectedTask(null)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.drawerBody}>
              <div style={styles.sectionBlock}>
                <h4 style={styles.blockTitle}>Description & Guidelines</h4>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {selectedTask.description}
                </p>
              </div>

              {detailLoading ? (
                <div style={styles.loadingBox}>Fetching detailed curriculum topics…</div>
              ) : selectedTask.topics && selectedTask.topics.length > 0 ? (
                <div style={styles.sectionBlock}>
                  <h4 style={styles.blockTitle}>Topics to Revise & Prepare ({selectedTask.topics.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {selectedTask.topics.map((top, idx) => (
                      <div key={top.taskAssignmentTopicIdentifier || idx} style={styles.topicCard}>
                        <div style={styles.topicHeader}>
                          <span style={styles.topicNumber}>{idx + 1}</span>
                          <strong>{top.topicName || 'Topic'}</strong>
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                          {top.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={styles.emptyBox}>No specific sub-topics listed for this paper exam.</div>
              )}
            </div>

            <div style={styles.drawerFooter}>
              <button
                onClick={() => handleImportSingle(selectedTask)}
                style={styles.primaryBtn}
              >
                📥 Add this Task to Notiq Todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      <BrototypeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => loadData()}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px 40px',
    maxWidth: 1200,
    margin: '0 auto',
    color: 'var(--text-primary)',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: 700,
    margin: 0,
    background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  pageSubtitle: {
    margin: '4px 0 0',
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  primaryBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.35)',
  },
  secondaryBtn: {
    padding: '9px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '9px 14px',
    borderRadius: 8,
    border: '1px solid rgba(239, 68, 68, 0.4)',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    fontSize: 13,
    cursor: 'pointer',
  },
  successBanner: {
    padding: '12px 18px',
    borderRadius: 8,
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.35)',
    color: '#4ade80',
    marginBottom: 20,
    fontSize: 14,
  },
  errorBanner: {
    padding: '12px 18px',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#fca5a5',
    marginBottom: 20,
    fontSize: 14,
  },
  connectHero: {
    background: 'radial-gradient(ellipse at 50% 0%, rgba(124, 58, 237, 0.15) 0%, rgba(20, 20, 30, 0.8) 100%)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: 16,
    padding: '48px 32px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-lg)',
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    fontSize: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 18px',
    boxShadow: '0 8px 24px rgba(124, 58, 237, 0.4)',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  heroDesc: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    maxWidth: 600,
    margin: '0 auto 24px',
    lineHeight: 1.5,
  },
  heroBtn: {
    padding: '14px 28px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(124, 58, 237, 0.4)',
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 20,
    marginTop: 40,
    textAlign: 'left',
  },
  featureItem: {
    display: 'flex',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border)',
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '18px 24px',
    borderRadius: 12,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    marginBottom: 24,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
    color: '#fff',
    fontSize: 20,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileName: {
    fontSize: 17,
    fontWeight: 600,
  },
  profileDetails: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  profileMeta: {
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'right',
  },
  pill: {
    padding: '2px 8px',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.06)',
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  pillActive: {
    padding: '2px 8px',
    borderRadius: 6,
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    fontSize: 12,
    fontWeight: 600,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    padding: 18,
    borderRadius: 12,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  statLabel: {
    fontSize: 12,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    marginTop: 6,
    color: 'var(--accent)',
  },
  statSub: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginTop: 4,
  },
  semesterCard: {
    padding: 20,
    borderRadius: 12,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    marginBottom: 28,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  sectionSub: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: 0,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    background: 'linear-gradient(90deg, #7c3aed 0%, #38bdf8 100%)',
    transition: 'width 0.4s ease',
  },
  tasksSection: {
    marginTop: 16,
  },
  tasksHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  searchInput: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  },
  selectInput: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  },
  importAllBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  taskGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
  },
  taskCard: {
    padding: 18,
    borderRadius: 12,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.15s, border-color 0.15s',
  },
  taskCardHeader: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  taskTypeBadge: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(124, 58, 237, 0.2)',
    color: '#a78bfa',
    fontWeight: 600,
  },
  taskStatusBadge: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(59, 130, 246, 0.2)',
    color: '#60a5fa',
    fontWeight: 600,
  },
  taskSemBadge: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--text-muted)',
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: 600,
    margin: '0 0 6px',
    lineHeight: 1.4,
  },
  taskDesc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    margin: '0 0 14px',
    flex: 1,
  },
  taskFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTop: '1px solid var(--border)',
  },
  topicCount: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  detailBtn: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
  },
  syncBtn: {
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  drawerOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  drawer: {
    width: '100%',
    maxWidth: 580,
    height: '100%',
    background: 'var(--bg-primary, #121218)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  drawerHeader: {
    padding: '24px 28px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '6px 0 4px',
  },
  drawerSub: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 20,
    cursor: 'pointer',
  },
  drawerBody: {
    padding: '24px 28px',
    overflowY: 'auto',
    flex: 1,
  },
  drawerFooter: {
    padding: '16px 28px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  sectionBlock: {
    marginBottom: 24,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-muted)',
    marginBottom: 10,
  },
  topicCard: {
    padding: 14,
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  topicHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
  },
  topicNumber: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    padding: 32,
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 14,
  },
  emptyBox: {
    padding: 24,
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
};
