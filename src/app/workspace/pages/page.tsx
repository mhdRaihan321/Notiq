'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { pageApi } from '@/lib/api';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';

interface Page {
  id: string;
  title: string;
  icon?: string;
  type: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_HOISTING_PAGE = {
  id: 'page-js-hoisting-guide',
  title: 'JavaScript Hoisting in Simple English',
  icon: '⚡',
  content: `# ⚡ JavaScript Hoisting in Simple English

Hoisting is one of the most fundamental concepts in JavaScript, but it often confuses beginners. Here is a simple, clear, and practical explanation.

---

## 🎯 What is Hoisting?

In JavaScript, **Hoisting** is the behavior where variable and function declarations are "lifted" or registered to the top of their scope before the code actually runs.

Think of it this way:
Before JavaScript runs a single line of code, it does a **Setup Phase** (Creation Phase). It reads your entire file, discovers every variable and function declaration, and allocates memory space for them.

---

## 1️⃣ Variable Hoisting: var vs let and const

### 🔹 1. The \`var\` keyword (Hoisted with \`undefined\`)
When you use \`var\`, JavaScript hoists the declaration to the top and initializes it with \`undefined\`.

\`\`\`javascript
console.log(framework); // Output: undefined (no error!)
var framework = "React";
console.log(framework); // Output: "React"
\`\`\`

**Behind the scenes, JavaScript treats it like this:**
\`\`\`javascript
var framework; // Declaration hoisted & initialized to undefined
console.log(framework); // undefined
framework = "React"; // Assignment stays on original line
console.log(framework); // "React"
\`\`\`

---

### 🔹 2. The \`let\` and \`const\` keywords (Temporal Dead Zone)
\`let\` and \`const\` are also hoisted, but **they are NOT initialized**.

From the start of the block until the line of declaration, the variable exists in what is called the **Temporal Dead Zone (TDZ)**. If you try to access it during this time, JavaScript throws a \`ReferenceError\`.

\`\`\`javascript
console.log(student); // ❌ ReferenceError: Cannot access 'student' before initialization
let student = "Raihan";
\`\`\`

> **💡 Rule of thumb:**
> - \`var\`: Hoisted and initialized to \`undefined\`.
> - \`let\` & \`const\`: Hoisted, but placed in the TDZ until the code reaches their declaration.

---

## 2️⃣ Function Hoisting: Declarations vs Expressions

### 🔹 Function Declarations (Fully Hoisted)
Function declarations are hoisted with their **entire body**. You can safely call them before where they are written in the file!

\`\`\`javascript
sayHello("Brototype"); // ✅ "Hello, Brototype!"

function sayHello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

---

### 🔹 Function Expressions and Arrow Functions (Not Function Hoisted)
If you assign a function or arrow function to a variable, it follows **variable hoisting rules**:

\`\`\`javascript
greetUser(); // ❌ TypeError: greetUser is not a function (if var)
             // ❌ ReferenceError (if const / let)

const greetUser = () => {
  console.log("Welcome back!");
};
\`\`\`

---

## 3️⃣ Quick Summary Table

| Declaration Type | Is it Hoisted? | Initialized Value | Accessing Before Line Gives... |
| :--- | :---: | :---: | :--- |
| \`function name() {}\` | **Yes** | Entire function body | ✅ Runs without issue |
| \`var x = 10\` | **Yes** | \`undefined\` | ⚠️ Returns \`undefined\` |
| \`let x = 10\` | **Yes** | None (TDZ) | ❌ \`ReferenceError\` |
| \`const x = 10\` | **Yes** | None (TDZ) | ❌ \`ReferenceError\` |
| \`const fn = () => {}\` | **Yes** (as variable) | None (TDZ) | ❌ \`ReferenceError\` |

---

## 💡 Best Practices to Avoid Hoisting Bugs

1. **Always use \`const\` and \`let\`** instead of \`var\`.
2. **Declare variables at the top of their scope** before using them.
3. **Declare functions or helper arrow functions before calling them** for readability and predictability.
`,
  type: 'page',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function PagesListPage() {
  const { activeWorkspace } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    let allPages: Page[] = [];

    // 1. Fetch from backend API if activeWorkspace exists
    if (activeWorkspace) {
      try {
        const { data } = await pageApi.getAll(activeWorkspace.id);
        if (data?.pages) {
          allPages = data.pages.filter((p: Page) => !p.parentId);
        }
      } catch { /* API fallback */ }
    }

    // 2. Load from localStorage
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_pages') : null;
      if (raw) {
        const localList: Page[] = JSON.parse(raw);
        for (const lp of localList) {
          if (!allPages.some(p => p.id === lp.id)) {
            allPages.push(lp);
          }
        }
      }
    } catch {}

    // 3. Filter out deleted pages and seed Hoisting guide ONLY if never deleted
    try {
      const deletedRaw = typeof window !== 'undefined' ? localStorage.getItem('notiq_deleted_pages') : null;
      const deletedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
      allPages = allPages.filter(p => !deletedIds.includes(p.id));

      if (!deletedIds.includes(DEFAULT_HOISTING_PAGE.id) && !allPages.some(p => p.id === DEFAULT_HOISTING_PAGE.id || p.title.toLowerCase().includes('hoisting'))) {
        allPages.unshift(DEFAULT_HOISTING_PAGE as Page);
        const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_pages') : null;
        const list = raw ? JSON.parse(raw) : [];
        if (!list.some((p: any) => p.id === DEFAULT_HOISTING_PAGE.id)) {
          list.unshift(DEFAULT_HOISTING_PAGE);
          localStorage.setItem('notiq_pages', JSON.stringify(list));
        }
      }
    } catch {}

    setPages(allPages);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    const handlePageEvent = () => fetchPages();
    window.addEventListener('notiq:page-created', handlePageEvent);
    window.addEventListener('notiq:page-deleted', handlePageEvent);
    return () => {
      window.removeEventListener('notiq:page-created', handlePageEvent);
      window.removeEventListener('notiq:page-deleted', handlePageEvent);
    };
  }, [fetchPages]);

  const deletePage = async (e: React.MouseEvent, pageId: string, pageTitle: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${pageTitle || 'Untitled'}"?`)) {
      return;
    }

    // 1. Immediately remove from local state
    setPages(prev => prev.filter(p => p.id !== pageId));

    // 2. Track in notiq_deleted_pages so it never resurrects
    try {
      const deletedRaw = typeof window !== 'undefined' ? localStorage.getItem('notiq_deleted_pages') : null;
      const deletedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
      if (!deletedIds.includes(pageId)) {
        deletedIds.push(pageId);
        localStorage.setItem('notiq_deleted_pages', JSON.stringify(deletedIds));
      }
    } catch {}

    // 3. Remove from notiq_pages in localStorage
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_pages') : null;
      if (raw) {
        const list = JSON.parse(raw).filter((p: any) => p.id !== pageId);
        localStorage.setItem('notiq_pages', JSON.stringify(list));
      }
    } catch {}

    // 4. Call backend API
    try {
      await pageApi.delete(pageId);
    } catch {}

    // 5. Notify Sidebar and components
    window.dispatchEvent(new CustomEvent('notiq:page-deleted', { detail: { id: pageId } }));
    window.dispatchEvent(new CustomEvent('notiq:page-created'));
  };

  const createPage = async () => {
    setCreating(true);
    const newId = `page-${Date.now()}`;
    const newPageObj: Page = {
      id: newId,
      title: 'Untitled Page',
      icon: '📄',
      type: 'page',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (activeWorkspace) {
      try {
        const { data } = await pageApi.create({ title: 'Untitled Page', workspaceId: activeWorkspace.id });
        if (data?.page?.id) {
          newPageObj.id = data.page.id;
        }
      } catch { /* fallback */ }
    }

    // Save to local storage
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_pages') : null;
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(newPageObj);
      localStorage.setItem('notiq_pages', JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('notiq:page-created'));
    } catch {}

    window.location.href = `/workspace/pages/${newPageObj.id}`;
  };

  return (
    <div style={{ padding: '40px 56px', maxWidth: 860, margin: '0 auto' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📄 Pages</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={createPage}
          disabled={creating}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
        >
          {creating ? 'Creating…' : '+ New Page'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius)' }} />)}
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
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '18px 20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
                  height: 126,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>{page.icon || '📄'}</span>
                    <button
                      onClick={(e) => deletePage(e, page.id, page.title)}
                      title={`Delete "${page.title || 'Untitled'}"`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted, #64748b)',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#f87171';
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted, #64748b)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {page.title || 'Untitled'}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {page.updatedAt ? new Date(page.updatedAt).toLocaleDateString() : 'Just now'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
