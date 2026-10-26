'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace('/workspace');
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <img
          src="/icon.svg"
          alt="Notiq"
          style={{
            width: 52,
            height: 52,
            borderRadius: 13,
            margin: '0 auto 16px',
            display: 'block',
            boxShadow: '0 8px 24px rgba(106, 85, 232, 0.45)',
          }}
        />
        <div style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: '#7c6af7',
          margin: '0 auto 14px',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Loading Notiq…</p>
      </div>
    </div>
  );
}
