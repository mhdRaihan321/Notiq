'use client';

import React, { useState, useEffect } from 'react';
import AIAssistant from '@/components/ai/AIAssistant';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, X, Minimize2, Maximize2, MessageSquare } from 'lucide-react';

export default function ChatBot() {
  const { activeWorkspace, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Keyboard shortcut: Ctrl + J or Alt + A to toggle chatbot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        fontFamily: 'inherit',
      }}
    >
      {/* Expanded / Open Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 0,
            width: isExpanded ? '520px' : '380px',
            height: isExpanded ? '640px' : '520px',
            maxHeight: 'calc(100vh - 90px)',
            maxWidth: 'calc(100vw - 40px)',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.12), 0 0 24px rgba(99, 102, 241, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-secondary, #18181b)',
            animation: 'fadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            transition: 'width 0.2s ease, height 0.2s ease',
          }}
        >
          {/* Top Window Controls Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Sparkles size={13} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Notiq AI Assistant</span>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 99,
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#c7d2fe',
                }}
              >
                Gemini Flash
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setIsExpanded(prev => !prev)}
                title={isExpanded ? 'Restore size' : 'Expand window'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close chatbot"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Imported AI Component */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <AIAssistant
              mode="full"
              showHeader={false}
              context={{
                workspaceId: activeWorkspace?.id,
                workspaceName: activeWorkspace?.name,
                userName: user?.name,
                userEmail: user?.email,
              }}
              placeholder="Ask anything about tasks, notes, or code..."
            />
          </div>
        </div>
      )}

      {/* Floating Bottom-Left Trigger Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '9px 16px',
          borderRadius: 999,
          background: isOpen
            ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
            : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 24px -4px rgba(99, 102, 241, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3)',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isOpen ? 'scale(0.97)' : 'scale(1)',
          backdropFilter: 'blur(12px)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px) scale(1.02)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 12px 28px -4px rgba(99, 102, 241, 0.6), 0 3px 8px rgba(0, 0, 0, 0.35)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = isOpen ? 'scale(0.97)' : 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 8px 24px -4px rgba(99, 102, 241, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3)';
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isOpen ? <X size={17} /> : <Sparkles size={17} />}
          {!isOpen && (
            <span
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 6px #4ade80',
              }}
            />
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.2px' }}>
          {isOpen ? 'Close AI' : 'Notiq AI'}
        </span>
      </button>

      {/* Animation helper */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
