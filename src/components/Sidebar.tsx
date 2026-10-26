'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { pageApi, workspaceApi } from '@/lib/api';
import {
  Home,
  CheckSquare,
  FileText,
  Zap,
  Plus,
  Search,
  ChevronsUpDown,
  Check,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  X,
  Menu,
} from 'lucide-react';

interface Page {
  id: string;
  title: string;
  icon?: string;
  parentId?: string;
}

interface Workspace {
  id: string;
  name: string;
  icon: string;
}

const NAV_ITEMS = [
  { href: '/workspace', icon: Home, label: 'Home' },
  { href: '/workspace/todos', icon: CheckSquare, label: 'Tasks & Topics' },
  { href: '/workspace/pages', icon: FileText, label: 'Pages & Notes' },
  { href: '/workspace/brototype', icon: Zap, label: 'Brototype Hub' },
] as const;

export default function Sidebar() {
  const { user, workspaces, activeWorkspace, setActiveWorkspace, logout, refreshWorkspaces } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [pages, setPages] = useState<Page[]>([]);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [todoCount, setTodoCount] = useState<number | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  // ──────────────────────────────────────────────
  // 10-Character Workspace Name Enforcement & Notification
  // ──────────────────────────────────────────────
  const isNameTooLong = Boolean(
    activeWorkspace && activeWorkspace.name && activeWorkspace.name.trim().length > 10
  );
  const [shortNameInput, setShortNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccessToast, setNameSuccessToast] = useState('');

  useEffect(() => {
    if (activeWorkspace?.name) {
      if (activeWorkspace.name.trim().length > 10) {
        setShortNameInput(activeWorkspace.name.trim().slice(0, 10));
      } else {
        setShortNameInput(activeWorkspace.name.trim());
      }
    }
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  const handleSaveShortName = async () => {
    const trimmed = shortNameInput.trim();
    if (!trimmed) {
      setNameError('Workspace name cannot be empty.');
      return;
    }
    if (trimmed.length > 10) {
      setNameError('Workspace name must be 10 characters or shorter.');
      return;
    }
    if (!activeWorkspace) return;

    setSavingName(true);
    setNameError('');
    try {
      // 1. Update on backend API
      await workspaceApi.update(activeWorkspace.id, { name: trimmed }).catch(() => {});

      // 2. Update AuthContext activeWorkspace
      const updatedWs: Workspace = { ...activeWorkspace, name: trimmed };
      setActiveWorkspace(updatedWs);

      // 3. Update local storage caches
      try {
        localStorage.setItem('notiq_workspace', updatedWs.id);
        localStorage.setItem('notiq_local_workspace', JSON.stringify(updatedWs));
        const bUserRaw = localStorage.getItem('brototype_user');
        if (bUserRaw) {
          const bUser = JSON.parse(bUserRaw);
          bUser.workspaceName = trimmed;
          localStorage.setItem('brototype_user', JSON.stringify(bUser));
        }
      } catch {}

      await refreshWorkspaces().catch(() => {});
      setNameSuccessToast(`Workspace renamed to "${trimmed}"!`);
      setTimeout(() => setNameSuccessToast(''), 3500);
    } catch {
      setNameError('Failed to update workspace name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      const mob = window.innerWidth < 768;
      setIsMobile(mob);
      if (!mob) setMobileDrawerOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Load pages
  const loadPages = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const { data } = await pageApi.getAll(activeWorkspace.id);
      if (data?.pages && Array.isArray(data.pages)) {
        setPages(data.pages.filter((p: Page) => !p.parentId).slice(0, 10));
        return;
      }
    } catch {}

    try {
      const local = localStorage.getItem('notiq_pages');
      if (local) {
        setPages(JSON.parse(local).filter((p: Page) => !p.parentId).slice(0, 10));
      }
    } catch {}
  }, [activeWorkspace]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  useEffect(() => {
    const handlePageCreated = () => loadPages();
    window.addEventListener('notiq:page-created', handlePageCreated);
    return () => window.removeEventListener('notiq:page-created', handlePageCreated);
  }, [loadPages]);

  // Update pending task count
  useEffect(() => {
    const updateTaskCount = () => {
      try {
        const raw = localStorage.getItem('notiq_todos');
        if (raw) {
          const list = JSON.parse(raw);
          setTodoCount(list.filter((t: any) => t.status !== 'done').length);
        }
      } catch {}
    };
    updateTaskCount();
    window.addEventListener('focus', updateTaskCount);
    return () => window.removeEventListener('focus', updateTaskCount);
  }, [pathname]);

  const handleCreatePage = async () => {
    if (!activeWorkspace) return;
    try {
      const { data } = await pageApi.create({ title: 'Untitled', workspaceId: activeWorkspace.id });
      if (data?.page?.id) {
        router.push(`/workspace/pages/${data.page.id}`);
        loadPages();
        return;
      }
    } catch {}

    // Fallback local create
    const localId = `page-${Date.now()}`;
    const newPageObj = {
      id: localId,
      title: 'Untitled',
      icon: '📄',
      content: '',
      workspaceId: activeWorkspace.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem('notiq_pages');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(newPageObj);
      localStorage.setItem('notiq_pages', JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('notiq:page-created'));
    } catch {}
    router.push(`/workspace/pages/${localId}`);
  };

  const handleCreateWorkspace = async () => {
    const trimmed = newWsName.trim();
    if (!trimmed) return;
    if (trimmed.length > 10) {
      alert('Workspace name must be 10 characters or shorter.');
      return;
    }
    await workspaceApi.create({ name: trimmed, icon: '🏢' }).catch(() => {});
    await refreshWorkspaces().catch(() => {});
    setNewWsName('');
    setShowNewWs(false);
    setShowWsMenu(false);
  };

  const filteredPages = searchQuery.trim()
    ? pages.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : pages;

  // ──────────────────────────────────────────────
  // Nav Item Renderer
  // ──────────────────────────────────────────────
  const renderNavItem = (
    href: string,
    IconComponent: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>,
    label: string,
    isCollapsedMode: boolean,
    badgeCount?: number | null
  ) => {
    const active =
      href === '/workspace'
        ? pathname === '/workspace'
        : pathname === href || pathname.startsWith(href + '/');

    return (
      <Link
        key={href}
        href={href}
        title={isCollapsedMode ? label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: isCollapsedMode ? '10px 0' : '8px 12px',
          justifyContent: isCollapsedMode ? 'center' : 'flex-start',
          borderRadius: 8,
          textDecoration: 'none',
          fontSize: 13.5,
          fontWeight: active ? 600 : 500,
          color: active ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
          background: active
            ? 'linear-gradient(90deg, rgba(124, 106, 247, 0.18) 0%, rgba(99, 102, 241, 0.10) 100%)'
            : 'transparent',
          border: active
            ? '1px solid rgba(124, 106, 247, 0.35)'
            : '1px solid transparent',
          position: 'relative',
          marginBottom: 3,
          transition: 'all 0.15s ease',
          boxShadow: active ? '0 2px 10px rgba(124, 106, 247, 0.2)' : 'none',
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#ffffff';
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
          }
        }}
      >
        {active && !isCollapsedMode && (
          <div
            style={{
              position: 'absolute',
              left: -1,
              top: '22%',
              bottom: '22%',
              width: 3.5,
              borderRadius: '0 4px 4px 0',
              background: 'linear-gradient(180deg, var(--accent, #7c6af7), #a855f7)',
              boxShadow: '0 0 8px var(--accent, #7c6af7)',
            }}
          />
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            flexShrink: 0,
            color: active ? 'var(--accent, #7c6af7)' : 'var(--text-muted, #94a3b8)',
            filter: active ? 'drop-shadow(0 0 6px rgba(124, 106, 247, 0.4))' : 'none',
          }}
        >
          <IconComponent size={18} />
        </div>

        {!isCollapsedMode && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>

            {badgeCount !== undefined && badgeCount !== null && badgeCount > 0 && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 99,
                  background: 'rgba(124, 106, 247, 0.22)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(124, 106, 247, 0.35)',
                  lineHeight: 1.3,
                  flexShrink: 0,
                }}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </div>
        )}
      </Link>
    );
  };

  // ──────────────────────────────────────────────
  // Common Sidebar Internal Body (used for desktop & mobile drawer)
  // ──────────────────────────────────────────────
  const renderSidebarContent = (isCollapsedMode: boolean) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'linear-gradient(180deg, var(--bg-secondary, #14151a) 0%, #101116 100%)',
        color: 'var(--text-primary, #f0f0f0)',
        borderRight: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
        userSelect: 'none',
      }}
    >
      {/* Workspace Header / Dropdown Area */}
      <div
        style={{
          padding: isCollapsedMode ? '10px 0' : '12px 10px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          position: 'relative',
        }}
      >
        {isCollapsedMode ? (
          /* COLLAPSED MODE: Clean vertical layout, NO horizontal overlap! */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {/* Dedicated Expand Button */}
            <button
              onClick={() => setCollapsed(false)}
              title="Expand Sidebar"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(124, 106, 247, 0.15)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = 'rgba(124, 106, 247, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <PanelLeft size={18} />
            </button>

            {/* Workspace Icon Button */}
            <button
              onClick={() => setShowWsMenu(!showWsMenu)}
              title={activeWorkspace?.name || 'Workspace'}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(124, 106, 247, 0.35) 0%, rgba(99, 102, 241, 0.25) 100%)',
                border: '1px solid rgba(124, 106, 247, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                transition: 'transform 0.12s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {activeWorkspace?.icon && activeWorkspace.icon !== '🏢' ? (
                activeWorkspace.icon
              ) : (
                <img src="/icon.svg" alt="Notiq" style={{ width: 22, height: 22, borderRadius: 5 }} />
              )}
            </button>
          </div>
        ) : (
          /* EXPANDED MODE: Workspace Selector on left + Collapse Button on right */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <button
              onClick={() => setShowWsMenu(!showWsMenu)}
              title={activeWorkspace?.name || 'Workspace'}
              style={{
                flex: 1,
                minWidth: 0,
                background: showWsMenu ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '6px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                color: 'var(--text-primary, #f8fafc)',
                transition: 'background 0.15s ease',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!showWsMenu) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                if (!showWsMenu) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, rgba(124, 106, 247, 0.35) 0%, rgba(99, 102, 241, 0.25) 100%)',
                  border: '1px solid rgba(124, 106, 247, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                {activeWorkspace?.icon && activeWorkspace.icon !== '🏢' ? (
                  activeWorkspace.icon
                ) : (
                  <img src="/icon.svg" alt="Notiq" style={{ width: 18, height: 18, borderRadius: 4 }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeWorkspace?.name || 'Notiq'}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)', marginTop: 1 }}>
                  {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
                </div>
              </div>

              <ChevronsUpDown size={14} style={{ color: 'var(--text-muted, #94a3b8)', flexShrink: 0 }} />
            </button>

            {!isMobile && (
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse Sidebar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted, #94a3b8)';
                }}
              >
                <PanelLeftClose size={17} />
              </button>
            )}

            {isMobile && (
              <button
                onClick={() => setMobileDrawerOpen(false)}
                title="Close Menu"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  color: 'var(--text-secondary, #94a3b8)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Workspace Dropdown */}
        {showWsMenu && (
          <div
            style={{
              position: 'absolute',
              top: isCollapsedMode ? 46 : '100%',
              left: isCollapsedMode ? 60 : 8,
              width: 240,
              background: 'var(--bg-tertiary, #1c1d24)',
              border: '1px solid var(--border-light, rgba(255, 255, 255, 0.12))',
              borderRadius: 10,
              zIndex: 100,
              padding: 6,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(16px)',
              marginTop: 4,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Your Workspaces
            </div>
            {workspaces.map((ws: Workspace) => (
              <button
                key={ws.id}
                onClick={() => {
                  setActiveWorkspace(ws);
                  setShowWsMenu(false);
                }}
                style={{
                  width: '100%',
                  background: ws.id === activeWorkspace?.id ? 'rgba(124, 106, 247, 0.16)' : 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '7px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: 'var(--text-primary, #f0f0f0)',
                  fontSize: 13,
                  marginBottom: 2,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (ws.id !== activeWorkspace?.id) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (ws.id !== activeWorkspace?.id) e.currentTarget.style.background = 'transparent';
                }}
              >
                {ws.icon && ws.icon !== '🏢' ? (
                  <span style={{ fontSize: 15 }}>{ws.icon}</span>
                ) : (
                  <img src="/icon.svg" alt="Notiq" style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, fontWeight: ws.id === activeWorkspace?.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ws.name}
                </span>
                {ws.id === activeWorkspace?.id && <Check size={14} style={{ color: 'var(--accent, #7c6af7)' }} />}
              </button>
            ))}

            <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '6px 4px' }} />

            {showNewWs ? (
              <div style={{ padding: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Max 10 characters</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: newWsName.length === 10 ? '#f59e0b' : '#a1a1aa' }}>
                    {newWsName.length}/10
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={10}
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value.slice(0, 10))}
                  placeholder="Name (max 10 chars)..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateWorkspace();
                    if (e.key === 'Escape') setShowNewWs(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--accent, #7c6af7)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    color: '#fff',
                    fontSize: 12.5,
                    outline: 'none',
                    marginBottom: 6,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={!newWsName.trim()}
                    style={{
                      flex: 1,
                      background: 'var(--accent, #7c6af7)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 8px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: !newWsName.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewWs(false)}
                    style={{
                      background: 'transparent',
                      color: 'var(--text-muted, #94a3b8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewWs(true)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: 'var(--accent, #7c6af7)',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(124, 106, 247, 0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Plus size={14} />
                <span>Create Workspace</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Nav Items */}
      <div style={{ padding: isCollapsedMode ? '10px 6px' : '10px 10px 4px' }}>
        {NAV_ITEMS.map((item) =>
          renderNavItem(
            item.href,
            item.icon,
            item.label,
            isCollapsedMode,
            item.href === '/workspace/todos' ? todoCount : undefined
          )
        )}
      </div>

      {/* Pages Section (Desktop Expanded or Mobile Drawer) */}
      {!isCollapsedMode && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 12px', minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted, #94a3b8)',
            }}
          >
            <span>Notes & Pages</span>
            <button
              onClick={handleCreatePage}
              title="Create New Page"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent, #7c6af7)',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent, #7c6af7)')}
            >
              <Plus size={15} />
            </button>
          </div>

          {pages.length > 5 && (
            <div style={{ position: 'relative', margin: '4px 2px 8px' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
              <input
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  padding: '5px 8px 5px 26px',
                  fontSize: 11.5,
                  color: '#fff',
                  outline: 'none',
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
            {filteredPages.map((page) => {
              const active = pathname === `/workspace/pages/${page.id}`;
              return (
                <Link
                  key={page.id}
                  href={`/workspace/pages/${page.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: 13,
                    color: active ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                    background: active ? 'rgba(124, 106, 247, 0.16)' : 'transparent',
                    border: active ? '1px solid rgba(124, 106, 247, 0.3)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ fontSize: 14 }}>{page.icon || '📄'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {page.title || 'Untitled'}
                  </span>
                </Link>
              );
            })}

            {filteredPages.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                {searchQuery ? 'No matching pages' : 'No pages yet'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spacer if collapsed */}
      {isCollapsedMode && <div style={{ flex: 1 }} />}

      {/* Bottom User Profile & Logout */}
      <div
        style={{
          padding: isCollapsedMode ? '14px 0 24px' : '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: isCollapsedMode ? 'center' : 'flex-start' }}>
          <button
            onClick={logout}
            title={`Sign out (${user?.name || 'Account'})`}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent, #7c6af7) 0%, #a855f7 100%)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(124, 106, 247, 0.3)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (isCollapsedMode) {
                e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.6)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
              }
            }}
            onMouseLeave={(e) => {
              if (isCollapsedMode) {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(124, 106, 247, 0.3)';
                e.currentTarget.style.background = 'linear-gradient(135deg, var(--accent, #7c6af7) 0%, #a855f7 100%)';
              }
            }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </button>

          {!isCollapsedMode && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'Account'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || ''}
              </div>
            </div>
          )}

          {!isCollapsedMode && (
            <button
              onClick={logout}
              title="Sign Out"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#f87171';
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted, #94a3b8)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ──────────────────────────────────────────────
  // Render Mobile vs Desktop
  // ──────────────────────────────────────────────
  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* ⚠️ Workspace Name Shortening Notification Modal (Required if > 10 chars) */}
      {isNameTooLong && mounted && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0, 0, 0, 0.84)',
            backdropFilter: 'blur(10px)',
            animation: 'overlayFadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'linear-gradient(180deg, #181922 0%, #111217 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(245, 158, 11, 0.15)',
              borderRadius: 18,
              padding: '28px 24px',
              position: 'relative',
              animation: 'modalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Alert Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                ⚠️
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
                  Workspace Name Must Be Short
                </h3>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.45 }}>
                  Workspace names must be <strong>10 characters or shorter</strong> to keep your navigation and tabs clean and responsive.
                </p>
              </div>
            </div>

            {/* Current Name Warning */}
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 20,
                fontSize: 12.5,
                color: '#fbbf24',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                Current: <strong>&ldquo;{activeWorkspace?.name}&rdquo;</strong>
              </span>
              <span style={{ fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', flexShrink: 0 }}>
                {activeWorkspace?.name?.length} chars
              </span>
            </div>

            {/* Input with 10-char counter */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 650, color: '#f1f5f9' }}>
                  New Shortened Name
                </label>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: shortNameInput.length > 10 ? '#ef4444' : shortNameInput.length > 0 ? '#10b981' : '#94a3b8',
                  }}
                >
                  {shortNameInput.length}/10 chars
                </span>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  maxLength={10}
                  value={shortNameInput}
                  onChange={(e) => {
                    setShortNameInput(e.target.value.slice(0, 10));
                    setNameError('');
                  }}
                  placeholder="Max 10 chars..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveShortName();
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1.5px solid var(--accent, #7c6af7)',
                    borderRadius: 10,
                    padding: '11px 14px',
                    color: '#ffffff',
                    fontSize: 14.5,
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: '0 0 0 3px rgba(124, 106, 247, 0.2)',
                  }}
                />
              </div>

              {nameError && (
                <p style={{ color: '#f87171', fontSize: 12, margin: '6px 0 0' }}>{nameError}</p>
              )}
            </div>

            {/* Quick suggestion chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>Suggestions:</span>
              {[
                activeWorkspace?.name ? activeWorkspace.name.split(' ')[0].slice(0, 10) : '',
                'Raihan Hub',
                'Notiq',
                'Dev Hub',
                'My Hub',
              ]
                .filter((chip, idx, arr) => chip && chip.length <= 10 && arr.indexOf(chip) === idx)
                .map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setShortNameInput(chip);
                      setNameError('');
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 11.5,
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent, #7c6af7)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = '#cbd5e1';
                    }}
                  >
                    {chip}
                  </button>
                ))}
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleSaveShortName}
              disabled={savingName || !shortNameInput.trim() || shortNameInput.trim().length > 10}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--accent, #7c6af7) 0%, #6366f1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 700,
                cursor: savingName || !shortNameInput.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 18px rgba(124, 106, 247, 0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>💾</span>
              <span>{savingName ? 'Saving Workspace…' : 'Save & Update Workspace'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Success Toast */}
      {nameSuccessToast && mounted && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999999,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13.5,
            boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'toastSlide 0.25s ease-out',
          }}
        >
          <span>✅</span>
          <span>{nameSuccessToast}</span>
        </div>,
        document.body
      )}

      {/* Main Sidebar (Desktop vs Mobile) */}
      {isMobile ? (
        <>
          {/* Mobile Top App Bar with Workspace name & hamburger button */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: 48,
              background: 'rgba(20, 21, 26, 0.94)',
              backdropFilter: 'blur(16px)',
              borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              zIndex: 9980,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <button
                onClick={() => setMobileDrawerOpen(true)}
                aria-label="Open Navigation Menu"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Menu size={18} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {activeWorkspace?.icon && activeWorkspace.icon !== '🏢' ? (
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{activeWorkspace.icon}</span>
                ) : (
                  <img src="/icon.svg" alt="Notiq" style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeWorkspace?.name || 'Notiq'}
                </span>
                {isNameTooLong && (
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                    ⚠️ Long
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Slide-in Drawer Overlay */}
          {mobileDrawerOpen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
              }}
            >
              {/* Backdrop */}
              <div
                onClick={() => setMobileDrawerOpen(false)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.72)',
                  backdropFilter: 'blur(6px)',
                  animation: 'overlayFadeIn 0.2s ease-out',
                }}
              />

              {/* Sliding Drawer Body */}
              <div
                style={{
                  position: 'relative',
                  width: 280,
                  maxWidth: '85vw',
                  height: '100%',
                  boxShadow: '4px 0 24px rgba(0, 0, 0, 0.7)',
                  zIndex: 1,
                  animation: 'slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {renderSidebarContent(false)}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Desktop Collapsible Sidebar */
        <div
          style={{
            width: collapsed ? 60 : 260,
            minWidth: collapsed ? 60 : 260,
            height: '100%',
            flexShrink: 0,
            boxSizing: 'border-box',
            transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {renderSidebarContent(collapsed)}
        </div>
      )}
    </>
  );
}
