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
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading page…</p>
      </div>
    }>
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
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } else {
      router.replace('/workspace/pages');
    }
    setLoading(false);
  }, [pageId, router]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const save = useCallback(async (t: string, c: string, i: string) => {
    setSaving(true);
    try {
      await pageApi.update(pageId, { title: t || 'Untitled', content: c, icon: i });
      setLastSaved(new Date());
    } catch { /* API fallback */ }

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
      }
      setLastSaved(new Date());
    } catch {}
    finally { setSaving(false); }
  }, [pageId]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val, content, icon), 1500);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(title, val, icon), 1500);
  };

  const handleIconChange = (newIcon: string) => {
    setIcon(newIcon);
    setShowIconPicker(false);
    save(title, content, newIcon);
  };

  const handleDelete = async () => {
    if (!confirm('Move this page to trash?')) return;
    await pageApi.delete(pageId);
    router.replace('/workspace/pages');
  };

  if (loading) {
    return (
      <div style={{ padding: '80px 56px', maxWidth: 800, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 48, width: '60%', marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 56px 80px' }} className="fade-in">
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 0', borderBottom: '1px solid var(--border)', marginBottom: 40,
        position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
      }}>
        <button onClick={() => router.push('/workspace/pages')}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {saving ? '💾 Saving…' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ''}
          </span>
          <button onClick={handleDelete}
            style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '5px 12px' }}>
            🗑️ Delete
          </button>
        </div>
      </div>

      {/* Icon picker */}
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
        <button onClick={() => setShowIconPicker(!showIconPicker)}
          style={{ fontSize: 48, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
          {icon}
        </button>
        {showIconPicker && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, zIndex: 20, boxShadow: 'var(--shadow)',
          }}>
            {ICONS.map(ic => (
              <button key={ic} onClick={() => handleIconChange(ic)}
                style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                {ic}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => handleTitleChange(e.target.value)}
        placeholder="Untitled"
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          fontSize: 40, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1px',
          marginBottom: 32, display: 'block',
        }}
      />

      {/* Content editor */}
      <textarea
        value={content}
        onChange={e => handleContentChange(e.target.value)}
        placeholder="Start writing… Use this space for notes, ideas, or anything you want to remember."
        style={{
          width: '100%', minHeight: 400, background: 'transparent', border: 'none', outline: 'none',
          fontSize: 16, lineHeight: 1.8, color: 'var(--text-primary)', resize: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}
