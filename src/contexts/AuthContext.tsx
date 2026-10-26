'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, workspaceApi } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  theme?: string;
  provider?: 'notiq' | 'brototype';
  batchName?: string;
  domainName?: string;
  mobile?: string;
}

interface Workspace {
  id: string;
  name: string;
  icon: string;
  description?: string;
}

interface AuthContextType {
  user: User | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithBrototype: (brototypeUser: any, token: string, password?: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setActiveWorkspace: (workspace: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // 1. Check Brototype session first
      const brototypeUserRaw = typeof window !== 'undefined' ? localStorage.getItem('brototype_user') : null;
      const brototypeToken = typeof window !== 'undefined' ? localStorage.getItem('brototype_token') : null;
      const notiqToken = typeof window !== 'undefined' ? localStorage.getItem('notiq_token') : null;

      let recoveredBrototypeUser: User | null = null;
      if (brototypeUserRaw && brototypeToken) {
        try {
          const bUser = JSON.parse(brototypeUserRaw);
          recoveredBrototypeUser = {
            id: bUser.studentId || 'brototype-student',
            name: bUser.name || 'Brototype Student',
            email: bUser.email || bUser.mobile || 'student@brototype.com',
            provider: 'brototype',
            batchName: bUser.batchName,
            domainName: bUser.domainName,
            mobile: bUser.mobile,
          };
          setUser(recoveredBrototypeUser);

          const shortWsName = (bUser.name ? `${bUser.name.split(' ')[0]} Hub` : 'My Hub').slice(0, 10);
          const defaultWs: Workspace = {
            id: `ws-${bUser.studentId || 'brototype'}`,
            name: shortWsName,
            icon: 'notiq',
            description: `${bUser.batchName || ''} • ${bUser.domainName || ''}`,
          };
          setWorkspaces([defaultWs]);
          setActiveWorkspaceState(defaultWs);
          localStorage.setItem('notiq_workspace', defaultWs.id);
        } catch {
          // Ignore parse errors
        }
      }

      // 2. Check Notiq backend token if available
      if (notiqToken) {
        try {
          const { data } = await authApi.getMe();
          if (data?.user) {
            setUser(data.user);
            await loadWorkspaces();
          }
        } catch {
          if (!recoveredBrototypeUser) {
            localStorage.removeItem('notiq_token');
            localStorage.removeItem('notiq_user');
          }
        }
      }

      setIsLoading(false);
    };
    init();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const { data } = await workspaceApi.getAll();
      if (data?.workspaces && data.workspaces.length > 0) {
        setWorkspaces(data.workspaces);
        const savedId = localStorage.getItem('notiq_workspace');
        const found = data.workspaces.find((w: Workspace) => w.id === savedId);
        setActiveWorkspaceState(found || data.workspaces[0] || null);
        return;
      }
    } catch {
      // Backend unavailable, fallback to default local workspace if exists
    }

    // Default workspace fallback
    const savedWsRaw = localStorage.getItem('notiq_local_workspace');
    if (savedWsRaw) {
      try {
        const parsed = JSON.parse(savedWsRaw);
        setWorkspaces([parsed]);
        setActiveWorkspaceState(parsed);
      } catch { /* */ }
    }
  };

  const loginWithBrototype = async (bUser: any, token: string, password?: string) => {
    localStorage.setItem('brototype_token', token);
    localStorage.setItem('brototype_user', JSON.stringify(bUser));

    // 1. Sync with Notiq backend to create/update account and get genuine JWT token
    try {
      const { data } = await authApi.brototypeSync({
        mobile: bUser.mobile,
        password: password || 'Rraihan!@499100',
        name: bUser.name,
        email: bUser.email,
        studentId: bUser.studentId,
        batchName: bUser.batchName,
        domainName: bUser.domainName,
        brototypeToken: token,
      });

      if (data?.token && data?.user) {
        localStorage.setItem('notiq_token', data.token);
        localStorage.setItem('notiq_user', JSON.stringify(data.user));
        setUser(data.user);
        await loadWorkspaces();
        return;
      }
    } catch (err) {
      console.warn('Backend sync failed, falling back to local session:', err);
    }

    // 2. Client-side fallback if backend is offline
    const appUser: User = {
      id: bUser.studentId || 'brototype-student',
      name: bUser.name || 'Brototype Student',
      email: bUser.email || bUser.mobile || 'student@brototype.com',
      provider: 'brototype',
      batchName: bUser.batchName,
      domainName: bUser.domainName,
      mobile: bUser.mobile,
    };

    localStorage.setItem('notiq_user', JSON.stringify(appUser));
    localStorage.setItem('notiq_token', token);

    const shortWsName = (bUser.name ? `${bUser.name.split(' ')[0]} Hub` : 'My Hub').slice(0, 10);
    const defaultWs: Workspace = {
      id: `ws-${bUser.studentId || 'brototype'}`,
      name: shortWsName,
      icon: 'notiq',
      description: `${bUser.batchName || ''} • ${bUser.domainName || ''}`,
    };
    setWorkspaces([defaultWs]);
    setActiveWorkspaceState(defaultWs);
    localStorage.setItem('notiq_workspace', defaultWs.id);
    localStorage.setItem('notiq_local_workspace', JSON.stringify(defaultWs));

    setUser(appUser);
  };

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login({ email, password });
    localStorage.setItem('notiq_token', data.token);
    localStorage.setItem('notiq_user', JSON.stringify(data.user));
    setUser(data.user);
    await loadWorkspaces();
  };

  const register = async (name: string, email: string, password: string) => {
    const { data } = await authApi.register({ name, email, password });
    localStorage.setItem('notiq_token', data.token);
    localStorage.setItem('notiq_user', JSON.stringify(data.user));
    setUser(data.user);
    if (data.defaultWorkspace) {
      setWorkspaces([data.defaultWorkspace]);
      setActiveWorkspaceState(data.defaultWorkspace);
      localStorage.setItem('notiq_workspace', data.defaultWorkspace.id);
    }
  };

  const logout = () => {
    localStorage.removeItem('notiq_token');
    localStorage.removeItem('notiq_user');
    localStorage.removeItem('notiq_workspace');
    localStorage.removeItem('brototype_token');
    localStorage.removeItem('brototype_user');
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceState(null);
    window.dispatchEvent(new Event('brototype_auth_changed'));
  };

  const setActiveWorkspace = (workspace: Workspace) => {
    setActiveWorkspaceState(workspace);
    localStorage.setItem('notiq_workspace', workspace.id);
  };

  const refreshWorkspaces = async () => {
    await loadWorkspaces();
  };

  return (
    <AuthContext.Provider value={{
      user, workspaces, activeWorkspace, isLoading,
      login, loginWithBrototype, register, logout, setActiveWorkspace, refreshWorkspaces,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
