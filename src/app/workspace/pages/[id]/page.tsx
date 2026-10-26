'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { pageApi } from '@/lib/api';

interface Page {
  id: string;
  title: string;
  content: string;
  icon?: string;
  coverImage?: string;
  isPublic: boolean;
}

const ICONS = ['📄', '📝', '📋', '📚', '🗒️', '📓', '📔', '🗂️', '💡', '🎯', '🔖', '✅', '🚀', '⭐', '🧠', '💼'];

export default function PageDetailPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading page…</p>
        </div>
      }
    >
      <PageDetailPageInner />
    </Suspense>
  );
}

function PageDetailPageInner() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.id as string;

  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [icon, setIcon] = useState('📄');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    let loadedPage: Page | null = null;

    try {
      const { data } = await pageApi.getOne(pageId);
      if (data?.page) {
        loadedPage = data.page;
      }
    } catch {
      // API error or offline - fallback to localStorage
    }

    if (!loadedPage && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('notiq_pages');
        if (raw) {
          const list = JSON.parse(raw);
          const found = list.find((p: any) => p.id === pageId);
          if (found) {
            loadedPage = {
              id: found.id,
              title: found.title,
              content: found.content || '',
              icon: found.icon || '📄',
              isPublic: false,
            };
          }
        }
      } catch {}
    }

    if (loadedPage) {
      setPage(loadedPage);
      setTitle(loadedPage.title || '');
      setContent(loadedPage.content || '');
      setIcon(loadedPage.icon || '📄');
      setHasUnsavedChanges(false);
    } else {
      router.replace('/workspace/pages');
    }
    setLoading(false);
  }, [pageId, router]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const save = useCallback(
    async (t: string, c: string, i: string) => {
      setSaving(true);
      try {
        await pageApi.update(pageId, { title: t || 'Untitled', content: c, icon: i });
      } catch {
        /* API fallback */
      }

      // Sync to localStorage
      try {
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem('notiq_pages');
          const list = raw ? JSON.parse(raw) : [];
          const idx = list.findIndex((p: any) => p.id === pageId);
          const updatedObj = {
            id: pageId,
            title: t || 'Untitled',
            content: c,
            icon: i,
            updatedAt: new Date().toISOString(),
          };
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...updatedObj };
          } else {
            list.unshift(updatedObj);
          }
          localStorage.setItem('notiq_pages', JSON.stringify(list));
          window.dispatchEvent(new CustomEvent('notiq:page-created'));
        }
      } catch {} finally {
        setSaving(false);
        setJustSaved(true);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        setTimeout(() => setJustSaved(false), 2200);
      }
    },
    [pageId]
  );

  const handleManualSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    save(title, content, icon);
  };

  // Keyboard shortcut Ctrl+S or Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, content, icon, save]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setHasUnsavedChanges(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val, content, icon), 1800);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    setHasUnsavedChanges(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(title, val, icon), 1800);
  };

  const handleIconChange = (newIcon: string) => {
    setIcon(newIcon);
    setShowIconPicker(false);
    save(title, content, newIcon);
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      save(title, content, icon);
    }
    router.push('/workspace/pages');
  };

  const handleDelete = async () => {
    if (!confirm('Move this page to trash?')) return;
    try {
      await pageApi.delete(pageId);
    } catch {}
    try {
      const raw = localStorage.getItem('notiq_pages');
      if (raw) {
        const list = JSON.parse(raw).filter((p: any) => p.id !== pageId);
        localStorage.setItem('notiq_pages', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notiq:page-created'));
      }
    } catch {}
    router.replace('/workspace/pages');
  };

  if (loading) {
    return (
      <div style={{ padding: isMobile ? '32px 16px' : '80px 56px', maxWidth: 840, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 44, width: '55%', marginBottom: 24, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div
      suppressHydrationWarning
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: isMobile ? '16px 18px 80px' : '24px 56px 80px',
        width: '100%',
        boxSizing: 'border-box',
      }}
      className="fade-in"
    >
      {/* Sticky Top Toolbar with SAVE button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
          marginBottom: 32,
          position: 'sticky',
          top: 0,
          background: 'var(--bg-primary, #0f0f0f)',
          zIndex: 20,
          gap: 12,
        }}
      >
        <button
          onClick={handleBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary, #94a3b8)',
            cursor: 'pointer',
            fontSize: 13.5,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <span>←</span>
          <span>Pages</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Status Indicator */}
          <span style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', display: isMobile ? 'none' : 'inline' }}>
            {saving
              ? '⏳ Saving…'
              : justSaved
              ? '✅ Saved'
              : hasUnsavedChanges
              ? '● Unsaved changes'
              : lastSaved
              ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Auto-save active'}
          </span>

          {/* 💾 Manual Save Button */}
          <button
            onClick={handleManualSave}
            disabled={saving}
            title="Save Page (Ctrl+S / Cmd+S)"
            style={{
              background: justSaved
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, var(--accent, #7c6af7) 0%, #6366f1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 7,
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 650,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: justSaved
                ? '0 2px 10px rgba(16, 185, 129, 0.4)'
                : '0 2px 10px rgba(124, 106, 247, 0.35)',
              transition: 'all 0.18s ease',
            }}
          >
            <span style={{ fontSize: 13 }}>{justSaved ? '✓' : '💾'}</span>
            <span>{saving ? 'Saving…' : justSaved ? 'Saved!' : 'Save'}</span>
          </button>

          {/* Delete Page */}
          <button
            onClick={handleDelete}
            title="Delete this page"
            style={{
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 7,
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 12.5,
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
            }}
          >
            <span>🗑️</span>
            {!isMobile && <span>Delete</span>}
          </button>
        </div>
      </div>

      {/* Icon Picker */}
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 18 }}>
        <button
          onClick={() => setShowIconPicker(!showIconPicker)}
          title="Change Page Icon"
          style={{
            fontSize: isMobile ? 40 : 48,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            lineHeight: 1,
            padding: 4,
            borderRadius: 8,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          {icon}
        </button>

        {showIconPicker && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              background: 'var(--bg-secondary, #161616)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
              borderRadius: 12,
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: 6,
              zIndex: 30,
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(16px)',
              marginTop: 6,
            }}
          >
            {ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => handleIconChange(ic)}
                style={{
                  fontSize: 20,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {ic}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Page Title */}
      <input
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Untitled"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: isMobile ? 28 : 38,
          fontWeight: 800,
          color: 'var(--text-primary, #ffffff)',
          letterSpacing: '-0.8px',
          marginBottom: 24,
          display: 'block',
          fontFamily: 'inherit',
        }}
      />

      {/* Page Content Editor */}
      <textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Start writing notes, curriculum summaries, code snippets, or ideas here..."
        style={{
          width: '100%',
          minHeight: 520,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: isMobile ? 15 : 16,
          lineHeight: 1.8,
          color: 'var(--text-primary, #f0f0f0)',
          resize: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
