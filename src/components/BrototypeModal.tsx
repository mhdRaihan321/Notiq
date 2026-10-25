'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  brototypeLogin,
  disconnectBrototype,
  getSavedBrototypeUser,
  getSavedBrototypeToken,
  fetchBrototypeTasks,
  BrototypeUser,
  BrototypeTask,
} from '@/lib/brototypeApi';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface BrototypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: BrototypeUser) => void;
}

export default function BrototypeModal({ isOpen, onClose, onSuccess }: BrototypeModalProps) {
  const router = useRouter();
  const { loginWithBrototype } = useAuth();
  const [currentUser, setCurrentUser] = useState<BrototypeUser | null>(null);
  const [mobile, setMobile] = useState('+919496213361');
  const [password, setPassword] = useState('Rraihan!@499100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [assignedTasks, setAssignedTasks] = useState<BrototypeTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const savedUser = getSavedBrototypeUser();
      setCurrentUser(savedUser);
      setError('');

      if (savedUser) {
        setTasksLoading(true);
        fetchBrototypeTasks()
          .then((tasks) => setAssignedTasks(tasks || []))
          .catch(() => setAssignedTasks([]))
          .finally(() => setTasksLoading(false));
      }
    }
  }, [isOpen]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await brototypeLogin(mobile, password);
      await loginWithBrototype(res.user, res.token, password);
      setCurrentUser(res.user);
      if (onSuccess) {
        onSuccess(res.user);
      }
      onClose();
      router.replace('/workspace');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnectBrototype();
    setCurrentUser(null);
  };

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} className="fade-in">
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logoBadge}>⚡</div>
            <div>
              <h2 style={styles.title}>Brototype Student Connect</h2>
              <p style={styles.subtitle}>Direct integration with Brototype Student Portal</p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {currentUser ? (
          /* Connected State */
          <div style={styles.content}>
            <div style={styles.connectedCard}>
              <div style={styles.avatar}>
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'B'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.userName}>{currentUser.name}</div>
                <div style={styles.userBatch}>{currentUser.batchName} • {currentUser.domainName}</div>
                <div style={styles.userMeta}>📱 {currentUser.mobile} | ✉️ {currentUser.email}</div>
              </div>
              <span style={styles.activeBadge}>Active</span>
            </div>

            {/* Assigned Tasks list */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  📋 Assigned Tasks ({assignedTasks.length})
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {tasksLoading ? 'Loading tasks…' : `${assignedTasks.length} modules`}
                </span>
              </div>

              <div style={{
                maxHeight: 180,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                paddingRight: 4,
              }}>
                {tasksLoading ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Fetching assigned modules…
                  </div>
                ) : assignedTasks.length > 0 ? (
                  assignedTasks.slice(0, 10).map((task, idx) => (
                    <div
                      key={task.taskAssignmentIdentifier || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 8,
                        fontSize: 12.5,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span>📌</span>
                        <span style={{ color: '#fff', fontWeight: 500 }}>{task.taskname}</span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(124, 58, 237, 0.2)',
                        color: '#c4b5fd',
                        flexShrink: 0,
                      }}>
                        Sem {task.semesterNumber || 1}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    No assigned tasks found.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={async () => {
                  const token = getSavedBrototypeToken();
                  if (currentUser && token) {
                    await loginWithBrototype(currentUser, token, password);
                  }
                  onClose();
                  router.replace('/workspace/brototype');
                }}
                style={styles.primaryBtn}
              >
                Open Brototype Hub 🚀
              </button>
              <button
                onClick={handleDisconnect}
                style={styles.disconnectBtn}
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          /* Login Form */
          <form onSubmit={handleLogin} style={styles.content}>
            {error && <div style={styles.errorBox}>{error}</div>}

            <div style={styles.field}>
              <label style={styles.label}>Registered Mobile Number</label>
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+919496213361"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Student Portal Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={styles.input}
              />
            </div>

            <button type="submit" disabled={loading} style={styles.primaryBtn}>
              {loading ? 'Connecting to Brototype…' : 'Sign in & Connect'}
            </button>

            <p style={styles.securityNote}>
              🔒 Secure direct connection: calls Brototype API via client-side HTTPS. Your token is kept only in your local browser storage.
            </p>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: 16,
  },
  modal: {
    background: 'var(--bg-secondary, #1a1a24)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: 16,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.15)',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.08) 0%, transparent 100%)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    color: '#fff',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
  },
  subtitle: {
    margin: 0,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    fontSize: 18,
    padding: 4,
    borderRadius: 6,
  },
  content: {
    padding: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.12)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
    transition: 'all 0.2s',
  },
  disconnectBtn: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid rgba(239, 68, 68, 0.4)',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBox: {
    padding: '10px 14px',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    fontSize: 13,
    marginBottom: 16,
  },
  securityNote: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 16,
    lineHeight: 1.4,
    textAlign: 'center',
  },
  connectedCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    background: 'rgba(124, 58, 237, 0.08)',
    border: '1px solid rgba(124, 58, 237, 0.25)',
    borderRadius: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  },
  userName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },
  userBatch: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  userMeta: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 4,
  },
  activeBadge: {
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#4ade80',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 12,
    fontWeight: 600,
  },
};
