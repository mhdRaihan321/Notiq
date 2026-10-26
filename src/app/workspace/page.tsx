'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { todoApi, pageApi } from '@/lib/api';
import Link from 'next/link';

interface Stats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  overdue: number;
}

interface MiniTask {
  id: string;
  title: string;
  topicHeading?: string;
  status: string;
  subItems?: Array<{ completed: boolean }>;
}

interface MiniPage {
  id: string;
  title: string;
  icon?: string;
  updatedAt: string;
}

export default function WorkspacePage() {
  const { user, activeWorkspace } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTasks, setRecentTasks] = useState<MiniTask[]>([]);
  const [recentPages, setRecentPages] = useState<MiniPage[]>([]);
  const [greeting, setGreeting] = useState('Welcome back');
  const [dateStr, setDateStr] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
    setDateStr(
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    );

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadData = useCallback(async () => {
    if (!activeWorkspace) return;

    // 1. Fetch Stats
    try {
      const { data } = await todoApi.getStats(activeWorkspace.id);
      if (data?.stats) setStats(data.stats);
    } catch {
      try {
        const local = localStorage.getItem('notiq_todos');
        if (local) {
          const todos = JSON.parse(local);
          setStats({
            total: todos.length,
            done: todos.filter((t: any) => t.status === 'done').length,
            inProgress: todos.filter((t: any) => t.status === 'in_progress').length,
            todo: todos.filter((t: any) => t.status === 'todo').length,
            overdue: 0,
          });
        }
      } catch {}
    }

    // 2. Fetch Recent Tasks
    try {
      const local = localStorage.getItem('notiq_todos');
      if (local) {
        const todos: MiniTask[] = JSON.parse(local);
        const inProg = todos.filter((t) => t.status === 'in_progress');
        const remaining = todos.filter((t) => t.status !== 'done' && t.status !== 'in_progress');
        setRecentTasks([...inProg, ...remaining].slice(0, 4));
      }
    } catch {}

    // 3. Fetch Recent Pages
    try {
      const { data } = await pageApi.getAll(activeWorkspace.id);
      if (data?.pages && Array.isArray(data.pages)) {
        setRecentPages(data.pages.slice(0, 4));
        return;
      }
    } catch {}

    try {
      const local = localStorage.getItem('notiq_pages');
      if (local) {
        setRecentPages(JSON.parse(local).slice(0, 4));
      }
    } catch {}
  }, [activeWorkspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const completionRate = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div
      suppressHydrationWarning
      style={{
        padding: isMobile ? '20px 14px 60px' : '36px 44px 80px',
        maxWidth: 1040,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
      className="fade-in"
    >
      {/* Hero Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(124, 106, 247, 0.12) 0%, rgba(20, 21, 28, 0.7) 100%)',
          border: '1px solid rgba(124, 106, 247, 0.25)',
          borderRadius: 16,
          padding: isMobile ? '20px 16px' : '28px 32px',
          marginBottom: 28,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 18,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}>
              📅 {dateStr}
            </span>
            <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--accent, #7c6af7)' }}>
              {activeWorkspace?.icon || '🏢'} {activeWorkspace?.name || 'Workspace'}
            </span>
          </div>

          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px', margin: '0 0 6px' }}>
            {greeting}, {user?.name?.split(' ')[0] || 'Scholar'} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14, margin: 0 }}>
            {completionRate}% of curriculum tasks completed across your modules.
          </p>
        </div>

        {/* Progress Metric Pill */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: '14px 20px',
            minWidth: 160,
            textAlign: 'center',
            alignSelf: isMobile ? 'stretch' : 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            <span>Curriculum Progress</span>
            <span style={{ fontWeight: 700, color: '#fff' }}>{completionRate}%</span>
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${completionRate}%`,
                height: '100%',
                borderRadius: 3,
                background: 'linear-gradient(90deg, #7c6af7 0%, #10b981 100%)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 28,
        }}
      >
        <KpiCard
          label="Total Tasks"
          value={stats?.total ?? 0}
          icon="📋"
          color="var(--accent, #7c6af7)"
          href="/workspace/todos"
        />
        <KpiCard
          label="In Progress"
          value={stats?.inProgress ?? 0}
          icon="⏳"
          color="#f59e0b"
          href="/workspace/todos"
        />
        <KpiCard
          label="Completed"
          value={stats?.done ?? 0}
          icon="✅"
          color="#10b981"
          href="/workspace/todos"
        />
        <KpiCard
          label="Notes & Pages"
          value={recentPages.length}
          icon="📄"
          color="#38bdf8"
          href="/workspace/pages"
        />
      </div>

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
          gap: 20,
          alignItems: 'start',
          marginBottom: 32,
        }}
      >
        {/* Left Column: Jump Back into Tasks */}
        <div
          style={{
            background: 'var(--bg-secondary, #161616)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            borderRadius: 14,
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📌</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>Continue Tasks</h2>
            </div>
            <Link
              href="/workspace/todos"
              style={{ fontSize: 12.5, color: 'var(--accent, #7c6af7)', textDecoration: 'none', fontWeight: 650 }}
            >
              View Board →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentTasks.map((t) => {
              const completedCount = (t.subItems || []).filter((s) => s.completed).length;
              const totalSub = (t.subItems || []).length;
              return (
                <Link
                  key={t.id}
                  href="/workspace/todos"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 14px',
                    borderRadius: 9,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(124, 106, 247, 0.4)';
                    e.currentTarget.style.background = 'rgba(124, 106, 247, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                    {t.topicHeading && (
                      <div style={{ fontSize: 10, color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px', marginBottom: 2 }}>
                        {t.topicHeading}
                      </div>
                    )}
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </div>
                  </div>

                  {totalSub > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(255, 255, 255, 0.07)', color: '#94a3b8' }}>
                      {completedCount}/{totalSub}
                    </span>
                  )}
                </Link>
              );
            })}

            {recentTasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted, #94a3b8)', fontSize: 13 }}>
                No active tasks. Sync from Brototype or create one!
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recent Pages */}
        <div
          style={{
            background: 'var(--bg-secondary, #161616)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            borderRadius: 14,
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>Recent Notes</h2>
            </div>
            <Link
              href="/workspace/pages"
              style={{ fontSize: 12.5, color: 'var(--accent, #7c6af7)', textDecoration: 'none', fontWeight: 650 }}
            >
              All Pages →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentPages.map((p) => (
              <Link
                key={p.id}
                href={`/workspace/pages/${p.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 12px',
                  borderRadius: 9,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
                  e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                }}
              >
                <span style={{ fontSize: 18 }}>{p.icon || '📄'}</span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title || 'Untitled'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
                  {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) : ''}
                </span>
              </Link>
            ))}

            {recentPages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted, #94a3b8)', fontSize: 13 }}>
                No notes created yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Launchpad Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
        <ActionLaunchpad
          href="/workspace/todos"
          icon="📋"
          title="Curriculum Kanban"
          desc="Track daily topics, nested checklists & mastery quizzes"
          tag="Tasks"
        />
        <ActionLaunchpad
          href="/workspace/brototype"
          icon="⚡"
          title="Brototype Hub"
          desc="Sync Technical curriculum topics with one click"
          tag="Portal"
        />
        <ActionLaunchpad
          href="/workspace/pages"
          icon="🧠"
          title="Knowledge Base"
          desc="Learnings pages, notes, and study guides"
          tag="Docs"
        />
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color, href }: { label: string; value: number; icon: string; color: string; href: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--bg-secondary, #161616)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
          borderRadius: 12,
          padding: '16px',
          transition: 'all 0.15s ease',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border, rgba(255, 255, 255, 0.08))';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', fontWeight: 500 }}>{label}</div>
      </div>
    </Link>
  );
}

function ActionLaunchpad({ href, icon, title, desc, tag }: { href: string; icon: string; title: string; desc: string; tag: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 14,
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxSizing: 'border-box',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent, #7c6af7)';
          e.currentTarget.style.background = 'rgba(124, 106, 247, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}>
            {tag}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.45 }}>{desc}</div>
      </div>
    </Link>
  );
}
