'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { todoApi } from '@/lib/api';
import Link from 'next/link';

interface Stats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  overdue: number;
}

export default function WorkspacePage() {
  const { user, activeWorkspace } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (activeWorkspace) {
      todoApi.getStats(activeWorkspace.id)
        .then(({ data }) => setStats(data.stats))
        .catch(() => {
          // fallback to localStorage
          if (typeof window !== 'undefined') {
            const local = localStorage.getItem('notiq_todos');
            if (local) {
              try {
                const todos = JSON.parse(local);
                setStats({
                  total: todos.length,
                  done: todos.filter((t: any) => t.status === 'done').length,
                  inProgress: todos.filter((t: any) => t.status === 'in_progress').length,
                  todo: todos.filter((t: any) => t.status === 'todo').length,
                  overdue: 0,
                });
              } catch { /* */ }
            }
          }
        });
    }
  }, [activeWorkspace]);

  const [greeting, setGreeting] = useState('Welcome back');

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <div style={{ padding: '48px 56px', maxWidth: 900, margin: '0 auto' }} className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.5px' }}>
          {greeting}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Here&apos;s what&apos;s happening in <strong style={{ color: 'var(--accent)' }}>{activeWorkspace?.icon} {activeWorkspace?.name}</strong>
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 48 }}>
          <StatCard label="Total tasks" value={stats.total} color="var(--accent)" icon="📋" />
          <StatCard label="Completed" value={stats.done} color="var(--success)" icon="✅" />
          <StatCard label="In progress" value={stats.inProgress} color="var(--warning)" icon="⏳" />
          <StatCard label="Overdue" value={stats.overdue} color="var(--danger)" icon="🚨" />
        </div>
      )}

      {/* Quick actions */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: 'var(--text-primary)' }}>Quick access</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <QuickCard
          href="/workspace/todos"
          icon="✅"
          title="My Todos"
          desc="Manage your tasks and to-do lists"
          color="#7c6af7"
        />
        <QuickCard
          href="/workspace/brototype"
          icon="⚡"
          title="Brototype Hub"
          desc="Student tasks, exams & curriculum"
          color="#a855f7"
        />
        <QuickCard
          href="/workspace/pages"
          icon="📄"
          title="Pages"
          desc="Rich text notes and documents"
          color="#22c55e"
        />
        <QuickCard
          href="/workspace/todos?status=in_progress"
          icon="🔥"
          title="In Progress"
          desc="Things you're currently working on"
          color="#f59e0b"
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px 24px',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ fontSize: 22, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function QuickCard({ href, icon, title, desc, color }: { href: string; icon: string; title: string; desc: string; color: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        cursor: 'pointer',
        transition: 'border-color 0.2s, transform 0.15s',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = color; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </Link>
  );
}
