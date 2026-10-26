'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import BrototypeModal from '@/components/BrototypeModal';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBrototypeModalOpen, setIsBrototypeModalOpen] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/workspace');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('demo@notiq.com');
    setPassword('demo1234');
  };

  return (
    <div
      suppressHydrationWarning
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 20%, rgba(124, 106, 247, 0.16) 0%, rgba(15, 15, 20, 0.95) 70%), #0c0d12',
        padding: '24px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background glows */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '20%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124, 106, 247, 0.22) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '15%',
          width: 450,
          height: 450,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="fade-in"
        style={{
          background: 'rgba(22, 23, 30, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          padding: '44px 36px',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 35px rgba(124, 106, 247, 0.12)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #7c6af7 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(124, 106, 247, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>N</span>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px', marginBottom: 6 }}>
            Welcome to Notiq
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #94a3b8)', margin: 0 }}>
            Curriculum tracking & workspace mastery
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 10,
              padding: '11px 14px',
              color: '#fca5a5',
              fontSize: 13,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              animation: 'shake 0.3s ease-in-out',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 9,
                padding: '12px 14px',
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent, #7c6af7)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124, 106, 247, 0.2)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 9,
                padding: '12px 14px',
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent, #7c6af7)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124, 106, 247, 0.2)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, var(--accent, #7c6af7) 0%, #6366f1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 9,
              padding: '13px',
              fontSize: 14.5,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
              boxShadow: '0 4px 18px rgba(124, 106, 247, 0.38)',
              transition: 'transform 0.1s, opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in to Workspace →'}
          </button>
        </form>

        {/* Demo Account Helper */}
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            onClick={fillDemo}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px dashed rgba(255, 255, 255, 0.16)',
              borderRadius: 7,
              color: 'var(--text-muted, #94a3b8)',
              fontSize: 12,
              padding: '5px 10px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent, #7c6af7)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
              e.currentTarget.style.color = 'var(--text-muted, #94a3b8)';
            }}
          >
            ⚡ Auto-fill Demo Credentials
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
            or connect portal
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
        </div>

        {/* Brototype Portal Button */}
        <button
          type="button"
          onClick={() => setIsBrototypeModalOpen(true)}
          style={{
            width: '100%',
            padding: '11px 16px',
            borderRadius: 9,
            border: '1px solid rgba(139, 92, 246, 0.35)',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.18) 0%, rgba(59, 130, 246, 0.12) 100%)',
            color: '#ffffff',
            fontSize: 13.5,
            fontWeight: 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'all 0.18s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.65)';
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.28) 0%, rgba(59, 130, 246, 0.2) 100%)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)';
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.18) 0%, rgba(59, 130, 246, 0.12) 100%)';
          }}
        >
          <span style={{ fontSize: 16 }}>⚡</span>
          <span>Connect Brototype Student Account</span>
        </button>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13.5, color: 'var(--text-muted, #94a3b8)', marginBottom: 0 }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: 'var(--accent, #7c6af7)', textDecoration: 'none', fontWeight: 650 }}>
            Create one free
          </Link>
        </p>

        <BrototypeModal isOpen={isBrototypeModalOpen} onClose={() => setIsBrototypeModalOpen(false)} />
      </div>
    </div>
  );
}
