'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { pageApi, workspaceApi } from '@/lib/api';

interface Page { id: string; title: string; icon?: string; }
interface Workspace { id: string; name: string; icon: string; }

export default function Sidebar() {
  const { user, workspaces, activeWorkspace, setActiveWorkspace, logout, refreshWorkspaces } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [pages, setPages] = useState<Page[]>([]);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const loadPages = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const { data } = await pageApi.getAll(activeWorkspace.id);
      setPages(data.pages.filter((p: Page & { parentId?: string }) => !p.parentId).slice(0, 8));
    } catch { /* */ }
  }, [activeWorkspace]);

  useEffect(() => { loadPages(); }, [loadPages]);

  const createPage = async () => {
    if (!activeWorkspace) return;
    const { data } = await pageApi.create({ title: 'Untitled', workspaceId: activeWorkspace.id });
    router.push(`/workspace/pages/${data.page.id}`);
    loadPages();
  };

  const createWorkspace = async () => {
    if (!newWsName.trim()) return;
    await workspaceApi.create({ name: newWsName, icon: '🏢' });
    await refreshWorkspaces();
    setNewWsName('');
    setShowNewWs(false);
    setShowWsMenu(false);
  };

  const navItem = (href: string, icon: string, label: string) => {
    const active = href === '/workspace'
      ? pathname === '/workspace'
      : (pathname === href || pathname.startsWith(href + '/'));
    return (
      <Link key={href} href={href} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500,
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-light)' : 'transparent',
        transition: 'background 0.15s, color 0.15s', marginBottom: 2,
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        {!collapsed && <span>{label}</span>}
      </Link>
    );
  };

  if (collapsed) {
    return (
      <div style={{ width: 52, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4 }}>
        <button onClick={() => setCollapsed(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '8px', borderRadius: 6 }}>
          ☰
        </button>
        <Link href="/workspace" style={{ textDecoration: 'none', padding: '8px', borderRadius: 6, fontSize: 18 }} title="Home">🏠</Link>
        <Link href="/workspace/todos" style={{ textDecoration: 'none', padding: '8px', borderRadius: 6, fontSize: 18 }} title="Tasks & Topics">📋</Link>
        <Link href="/workspace/pages" style={{ textDecoration: 'none', padding: '8px', borderRadius: 6, fontSize: 18 }} title="Pages">📄</Link>
        <Link href="/workspace/brototype" style={{ textDecoration: 'none', padding: '8px', borderRadius: 6, fontSize: 18 }} title="Brototype">⚡</Link>
      </div>
    );
  }

  return (
    <div style={{ width: 260, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {/* Workspace picker */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <button onClick={() => setShowWsMenu(!showWsMenu)}
          style={{
            width: '100%', background: 'transparent', border: 'none', display: 'flex',
            alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
            color: 'var(--text-primary)', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: 20 }}>{activeWorkspace?.icon || '🏠'}</span>
          <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeWorkspace?.name || 'No workspace'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⌄</span>
        </button>

        {showWsMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 8, right: 8, background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-light)', borderRadius: 10, zIndex: 50, padding: 8, boxShadow: 'var(--shadow)',
          }}>
            {workspaces.map((ws: Workspace) => (
              <button key={ws.id} onClick={() => { setActiveWorkspace(ws); setShowWsMenu(false); }}
                style={{
                  width: '100%', background: ws.id === activeWorkspace?.id ? 'var(--accent-light)' : 'transparent',
                  border: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 14, marginBottom: 2,
                }}>
                <span>{ws.icon}</span><span style={{ fontWeight: 500 }}>{ws.name}</span>
                {ws.id === activeWorkspace?.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 12 }}>✓</span>}
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              {showNewWs ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="Name…"
                    style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }}
                    onKeyDown={e => e.key === 'Enter' && createWorkspace()} autoFocus />
                  <button onClick={createWorkspace}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontSize: 13 }}>+</button>
                </div>
              ) : (
                <button onClick={() => setShowNewWs(true)}
                  style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, textAlign: 'left' }}>
                  + New workspace
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav style={{ padding: '8px 8px', flex: 1, overflowY: 'auto' }}>
        {navItem('/workspace', '🏠', 'Home')}
        {navItem('/workspace/todos', '📋', 'Tasks & Topics')}
        {navItem('/workspace/pages', '📄', 'Pages')}
        {navItem('/workspace/brototype', '⚡', 'Brototype')}

        {/* Pages quick list */}
        {pages.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pages</span>
              <button onClick={createPage}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }} title="New page">+</button>
            </div>
            {pages.map(p => (
              <Link key={p.id} href={`/workspace/pages/${p.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6,
                  textDecoration: 'none', fontSize: 13, color: pathname === `/workspace/pages/${p.id}` ? 'var(--accent)' : 'var(--text-secondary)',
                  background: pathname === `/workspace/pages/${p.id}` ? 'var(--accent-light)' : 'transparent', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (pathname !== `/workspace/pages/${p.id}`) (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (pathname !== `/workspace/pages/${p.id}`) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
              >
                <span>{p.icon || '📄'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Untitled'}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom: user + collapse */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={logout} title="Log out"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 4 }}>
            ↩
          </button>
        </div>
        <button onClick={() => setCollapsed(true)}
          style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}>
          ← Collapse sidebar
        </button>
      </div>
    </div>
  );
}
