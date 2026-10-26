'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import ChatBot from '@/components/ChatBot';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const showContent = !isLoading && !!user;

  return (
    <div
      suppressHydrationWarning
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {showContent && <Sidebar />}
      <main
        suppressHydrationWarning
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--bg-primary)',
          visibility: showContent ? 'visible' : 'hidden',
          paddingTop: showContent && isMobile ? 48 : 0,
          marginLeft: 0,
          width: '100%',
        }}
      >
        {children}
      </main>
      {showContent && <ChatBot />}
      {!showContent && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <div style={{ textAlign: 'center' }}>
            <img
              src="/icon.svg"
              alt="Notiq"
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                margin: '0 auto 14px',
                display: 'block',
                boxShadow: '0 8px 24px rgba(106, 85, 232, 0.4)',
              }}
            />
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.1)', borderTopColor: '#7c6af7', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading Notiq…</p>
          </div>
        </div>
      )}
    </div>
  );
}
