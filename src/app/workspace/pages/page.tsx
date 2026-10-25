'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { pageApi } from '@/lib/api';
import Link from 'next/link';

interface Page {
  id: string;
  title: string;
  icon?: string;
  type: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function PagesListPage() {
  const { activeWorkspace } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchPages = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const { data } = await pageApi.getAll(activeWorkspace.id);
      setPages(data.pages.filter((p: Page) => !p.parentId)); // top-level only
    } catch { /* */ }
    finally { setLoading(false); }
  }, [activeWorkspace]);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const createPage = async () => {
    if (!activeWorkspace) return;
    setCreating(true);
    try {
      const { data } = await pageApi.create({ title: 'Untitled', workspaceId: activeWorkspace.id });
      // Redirect to the new page
      window.location.href = `/workspace/pages/${data.page.id}`;
    } catch { setCreating(false); }
  };

  return (
    <div style={{ padding: '40px 56px', maxWidth: 860, margin: '0 auto' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📄 Pages</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={createPage} disabled={creating}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          {creating ? 'Creating…' : '+ New Page'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : pages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📃</div>
          <p style={{ fontSize: 16, marginBottom: 8, color: 'var(--text-secondary)' }}>No pages yet</p>
          <p style={{ fontSize: 14 }}>Create your first page to get started</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {pages.map(page => (
            <Link key={page.id} href={`/workspace/pages/${page.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '20px', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s', height: 120,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
              >
                <div>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{page.icon || '📄'}</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {page.title || 'Untitled'}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(page.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
