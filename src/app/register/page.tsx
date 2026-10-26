'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await register(name, email, password);
      router.replace('/workspace');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="fade-in">
        <div style={styles.logo}>
          <img src="/icon.svg" alt="Notiq Logo" style={{ width: 36, height: 36, borderRadius: 9, boxShadow: '0 4px 12px rgba(106, 85, 232, 0.35)' }} />
          <span style={styles.logoText}>Notiq</span>
        </div>
        <h1 style={styles.title}>Create your account</h1>
        <p style={styles.subtitle}>Start your Notiq workspace for free</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              minLength={2}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              style={styles.input}
            />
          </div>
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link href="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 70% 80%, rgba(124,106,247,0.08) 0%, transparent 60%), var(--bg-primary)',
    padding: '24px',
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: 400,
    boxShadow: 'var(--shadow-lg)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' },
  logoIcon: {
    width: 36, height: 36, background: 'var(--accent)', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 18, color: '#fff',
  } as React.CSSProperties,
  logoText: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  title: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 32 },
  error: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, padding: '12px 16px', color: '#f87171', fontSize: 14, marginBottom: 24,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' },
  input: {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '12px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  },
  btn: {
    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
    padding: '13px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4,
  },
  footer: { textAlign: 'center', marginTop: 28, fontSize: 14, color: 'var(--text-muted)' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 },
};
