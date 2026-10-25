'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamAI, AIMessage } from '@/lib/aiService';
import { useAuth } from '@/contexts/AuthContext';
import { todoApi, pageApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, Send, Copy, Check, Trash2, RotateCcw, 
  Bot, User, ArrowDown, ExternalLink, Lightbulb, ChevronRight,
  Plus, Calendar, CheckCircle2, AlertCircle, FileText, Clock,
  History, X, CheckSquare, Layers
} from 'lucide-react';

export interface AIChatSession {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messages: AIMessage[];
}

export interface AIAssistantProps {
  /** Mode of presentation */
  mode?: 'full' | 'compact' | 'embedded';
  /** System context (e.g. active workspace, current page, active task) */
  context?: Record<string, any>;
  /** Optional placeholder for the input box */
  placeholder?: string;
  /** Suggested quick prompt chips */
  quickSuggestions?: string[];
  /** Callback when AI generates a response */
  onResponse?: (content: string) => void;
  /** Callback when user clicks 'Insert / Use this' on an AI message */
  onInsert?: (content: string) => void;
  /** Header title */
  title?: string;
  /** Subtitle or model badge */
  subtitle?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Show header or not */
  showHeader?: boolean;
}

function formatTimeAgo(isoString: string): string {
  try {
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '';
  }
}

export default function AIAssistant({
  mode = 'full',
  context = {},
  placeholder = 'Ask Notiq AI anything or tell it to create a task or page...',
  quickSuggestions = [
    '📄 Make a page about JS Hoisting in simple English',
    '📋 Add task: Master Node.js Event Loop with checklist',
    '🎯 Key tips for Brototype technical reviews',
    '💡 Break down auth architecture & add page',
  ],
  onResponse,
  onInsert,
  title = 'Notiq AI',
  subtitle = 'Powered by Gemini Flash',
  style = {},
  showHeader = true,
}: AIAssistantProps) {
  const { activeWorkspace } = useAuth();
  const router = useRouter();

  // Chat sessions history (max 5 preview chats)
  const [sessions, setSessions] = useState<AIChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content: `Hello! 👋 I'm **Notiq AI**.\nHow can I assist you with your workspaces, tasks, notes, or learning today?`,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [savingPageMsgId, setSavingPageMsgId] = useState<string | null>(null);
  const [savedPageSuccessId, setSavedPageSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load saved history on mount
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_ai_sessions') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed.slice(0, 5));
        }
      }
    } catch {}
  }, []);

  // Save session helper (keeps top 5 preview chats)
  const saveSession = useCallback((sessionId: string, msgs: AIMessage[]) => {
    const userFirstMsg = msgs.find(m => m.role === 'user');
    if (!userFirstMsg) return;

    const titleText = userFirstMsg.content.slice(0, 38) + (userFirstMsg.content.length > 38 ? '…' : '');
    const lastModelMsg = [...msgs].reverse().find(m => m.role === 'model' && m.id !== 'welcome');
    const rawPreview = (lastModelMsg?.content || userFirstMsg.content)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*`_>-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const previewText = rawPreview.slice(0, 75) + (rawPreview.length > 75 ? '…' : '');

    setSessions(prev => {
      const existingIdx = prev.findIndex(s => s.id === sessionId);
      const sessionObj: AIChatSession = {
        id: sessionId,
        title: titleText,
        preview: previewText || 'Conversation notes...',
        updatedAt: new Date().toISOString(),
        messages: msgs,
      };

      let updatedList: AIChatSession[];
      if (existingIdx >= 0) {
        updatedList = [...prev];
        updatedList[existingIdx] = sessionObj;
        // Move active session to top
        const [target] = updatedList.splice(existingIdx, 1);
        updatedList.unshift(target);
      } else {
        updatedList = [sessionObj, ...prev];
      }

      const trimmed = updatedList.slice(0, 5);
      try {
        localStorage.setItem('notiq_ai_sessions', JSON.stringify(trimmed));
      } catch {}
      return trimmed;
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Auto-resize textarea as user types
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    setError(null);
    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveSession(currentSessionId, newMessages);

    if (!textToSend) setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);

    const aiMsgId = `ai-${Date.now()}`;
    let messageAdded = false;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = newMessages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const fullText = await streamAI({
        prompt: text,
        history,
        context,
        signal: controller.signal,
        onChunk: (_chunk, accumulated) => {
          if (!messageAdded) {
            messageAdded = true;
            setStreamingMsgId(aiMsgId);
            setMessages(prev => {
              const updated = [
                ...prev,
                {
                  id: aiMsgId,
                  role: 'model' as const,
                  content: accumulated,
                  createdAt: new Date().toISOString(),
                },
              ];
              return updated;
            });
          } else {
            setMessages(prev =>
              prev.map(m => m.id === aiMsgId ? { ...m, content: accumulated } : m)
            );
          }
        },
      });

      let finalMessages: AIMessage[];
      if (!messageAdded && fullText) {
        finalMessages = [
          ...newMessages,
          {
            id: aiMsgId,
            role: 'model',
            content: fullText,
            createdAt: new Date().toISOString(),
          },
        ];
        setMessages(finalMessages);
      } else if (messageAdded && fullText) {
        finalMessages = newMessages.concat({
          id: aiMsgId,
          role: 'model',
          content: fullText,
          createdAt: new Date().toISOString(),
        });
        setMessages(prev =>
          prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m)
        );
      } else {
        finalMessages = newMessages;
      }

      saveSession(currentSessionId, finalMessages);
      if (onResponse) onResponse(fullText);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('AI query error:', err);
      setError(err.message || 'Failed to connect to AI. Please try again.');
    } finally {
      setIsLoading(false);
      setStreamingMsgId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyCodeBlock = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2000);
  };

  const startNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content: `Hello! 👋 I'm **Notiq AI**.\nHow can I assist you with your workspaces, tasks, notes, or learning today?`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput('');
    setError(null);
    setShowHistoryModal(false);
  };

  const loadSession = (session: AIChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setShowHistoryModal(false);
  };

  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      try {
        localStorage.setItem('notiq_ai_sessions', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });
    if (currentSessionId === sessionId) {
      startNewChat();
    }
  };

  const clearCurrentChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content: `Conversation cleared. Ready for your next question! 🚀`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setError(null);
  };

  // 1-Click "Save as Page" from any AI response bubble
  const handleSaveMessageAsPage = async (msgId: string, content: string) => {
    setSavingPageMsgId(msgId);
    try {
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      const headingLine = lines.find(l => l.startsWith('#') || l.length > 5) || 'AI Generated Note';
      const cleanTitle = headingLine.replace(/^[#*`_\s-]+/, '').slice(0, 48) || 'AI Learning Note';
      const targetWsId = context?.workspaceId || activeWorkspace?.id;
      let newPageId = `page-${Date.now()}`;

      if (targetWsId) {
        try {
          const res = await pageApi.create({
            title: cleanTitle,
            icon: '📝',
            content: content,
            workspaceId: targetWsId,
          });
          if (res.data?.page?.id) newPageId = res.data.page.id;
        } catch (apiErr) {
          console.warn('API create page failed, saving locally:', apiErr);
        }
      }

      try {
        const raw = localStorage.getItem('notiq_pages');
        const list = raw ? JSON.parse(raw) : [];
        const newPageObj = {
          id: newPageId,
          title: cleanTitle,
          icon: '📝',
          content: content,
          workspaceId: targetWsId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        list.unshift(newPageObj);
        localStorage.setItem('notiq_pages', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notiq:page-created', { detail: newPageObj }));
      } catch {}

      setSavedPageSuccessId(newPageId);
    } catch (err) {
      console.error('Failed to save message as page:', err);
    } finally {
      setSavingPageMsgId(null);
    }
  };

  // Modern Markdown Renderer with strict zero-overflow and rich cards
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeLang = '';
    let codeBuffer: string[] = [];

    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          if (codeLang === 'notiq-task') {
            try {
              const raw = codeBuffer.join('\n').trim();
              const taskData = JSON.parse(raw);
              if (taskData && taskData.title) {
                elements.push(
                  <TaskConfirmationCard
                    key={`task-${index}`}
                    task={taskData}
                    workspaceId={context?.workspaceId || activeWorkspace?.id}
                  />
                );
              }
            } catch {
              // ignore malformed task json
            }
          } else if (codeLang === 'notiq-page') {
            try {
              const raw = codeBuffer.join('\n').trim();
              const pageData = JSON.parse(raw);
              if (pageData && pageData.title) {
                elements.push(
                  <PageConfirmationCard
                    key={`page-${index}`}
                    page={pageData}
                    workspaceId={context?.workspaceId || activeWorkspace?.id}
                  />
                );
              }
            } catch {
              // ignore malformed page json
            }
          } else {
            const blockCode = codeBuffer.join('\n');
            const codeKey = `code-${index}`;
            elements.push(
              <div
                key={codeKey}
                style={{
                  margin: '10px 0',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(10, 10, 15, 0.85)',
                  maxWidth: '100%',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {/* Code Header Bar with language tag & Copy Code button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: 11,
                    color: '#94a3b8',
                  }}
                >
                  <span style={{ fontWeight: 600, textTransform: 'lowercase', letterSpacing: '0.4px' }}>
                    {codeLang || 'code'}
                  </span>
                  <button
                    onClick={() => handleCopyCodeBlock(codeKey, blockCode)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedCodeKey === codeKey ? '#4ade80' : '#cbd5e1',
                      cursor: 'pointer',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      borderRadius: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    {copiedCodeKey === codeKey ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedCodeKey === codeKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <pre
                  style={{
                    padding: '12px 14px',
                    margin: 0,
                    fontSize: 12.5,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    overflowX: 'auto',
                    maxWidth: '100%',
                    color: '#38bdf8',
                    lineHeight: 1.5,
                    whiteSpace: 'pre',
                  }}
                >
                  <code>{blockCode}</code>
                </pre>
              </div>
            );
          }
          codeBuffer = [];
          codeLang = '';
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeBuffer = [];
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Headers
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={index} style={{ fontSize: 13.5, fontWeight: 700, margin: '8px 0 4px', color: '#f8fafc', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {formatInline(line.replace('### ', ''))}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={index} style={{ fontSize: 14.5, fontWeight: 700, margin: '10px 0 4px', color: '#f8fafc', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {formatInline(line.replace('## ', ''))}
          </h3>
        );
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2 key={index} style={{ fontSize: 16, fontWeight: 800, margin: '12px 0 6px', color: '#fff', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {formatInline(line.replace('# ', ''))}
          </h2>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <div key={index} style={{ display: 'flex', gap: 6, margin: '3px 0', alignItems: 'flex-start', paddingLeft: 4, minWidth: 0, width: '100%' }}>
            <span style={{ color: 'var(--accent, #6366f1)', fontSize: 12, marginTop: 2, flexShrink: 0 }}>•</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {formatInline(line.substring(2))}
            </div>
          </div>
        );
      } else if (/^\d+\.\s/.test(line)) {
        const num = line.match(/^(\d+)\.\s/)?.[1];
        elements.push(
          <div key={index} style={{ display: 'flex', gap: 6, margin: '3px 0', alignItems: 'flex-start', paddingLeft: 4, minWidth: 0, width: '100%' }}>
            <span style={{ color: 'var(--accent, #6366f1)', fontSize: 12, fontWeight: 700, marginTop: 1, flexShrink: 0 }}>{num}.</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </div>
          </div>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={index} style={{ height: 6 }} />);
      } else {
        elements.push(
          <p key={index} style={{ margin: '2px 0', fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0 }}>
            {formatInline(line)}
          </p>
        );
      }
    });

    // Handle streaming case where closing ``` has not arrived yet
    if (inCodeBlock && codeLang === 'notiq-task') {
      try {
        const raw = codeBuffer.join('\n').trim();
        if (raw.endsWith('}')) {
          const taskData = JSON.parse(raw);
          if (taskData && taskData.title) {
            elements.push(
              <TaskConfirmationCard
                key="task-streaming"
                task={taskData}
                workspaceId={context?.workspaceId || activeWorkspace?.id}
              />
            );
          }
        }
      } catch {}
    } else if (inCodeBlock && codeLang === 'notiq-page') {
      try {
        const raw = codeBuffer.join('\n').trim();
        if (raw.endsWith('}')) {
          const pageData = JSON.parse(raw);
          if (pageData && pageData.title) {
            elements.push(
              <PageConfirmationCard
                key="page-streaming"
                page={pageData}
                workspaceId={context?.workspaceId || activeWorkspace?.id}
              />
            );
          }
        }
      } catch {}
    }

    return elements;
  };

  const formatInline = (text: string): React.ReactNode => {
    // Bold **text**
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '2px 5px',
            borderRadius: 4,
            fontSize: '0.9em',
            fontFamily: 'monospace',
            color: '#38bdf8'
          }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-secondary, #18181b)',
        color: 'var(--text-primary, #f4f4f5)',
        borderRadius: mode === 'embedded' ? 12 : 16,
        overflow: 'hidden',
        boxShadow: mode === 'embedded' ? 'none' : '0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        ...style,
      }}
    >
      {/* Header */}
      {showHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                {title}
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }}>
                  Online
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>{subtitle}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={clearCurrentChat}
              title="Clear current conversation"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.08)';
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted, #94a3b8)';
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Sub-toolbar: Recent 5 Chats & New Chat Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 14px',
          background: 'rgba(255, 255, 255, 0.025)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: 12,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* History Button (shows last 5 preview chats) */}
          <button
            onClick={() => setShowHistoryModal(prev => !prev)}
            title="View recent preview chats"
            style={{
              background: showHistoryModal ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#e2e8f0',
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <Clock size={12} style={{ color: '#818cf8' }} />
            <span>Recent ({sessions.length})</span>
          </button>

          {/* New Chat Button */}
          <button
            onClick={startNewChat}
            title="Start fresh conversation"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#e2e8f0',
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.06)';
            }}
          >
            <Plus size={12} style={{ color: '#4ade80' }} />
            <span>New Chat</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={clearCurrentChat}
            title="Reset messages"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: 11,
              cursor: 'pointer',
              padding: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RotateCcw size={11} />
            <span>Clear</span>
          </button>
        </div>

        {/* 📌 Recent 5 Chats Dropdown / Popover */}
        {showHistoryModal && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 12,
              marginTop: 4,
              width: 'min(360px, calc(100vw - 32px))',
              background: 'linear-gradient(160deg, #1e1b2e 0%, #16161d 100%)',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              borderRadius: 12,
              boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.7), 0 0 20px rgba(99, 102, 241, 0.2)',
              zIndex: 99,
              padding: '10px 12px',
              backdropFilter: 'blur(16px)',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} style={{ color: '#a78bfa' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Recent Chats (5 Max)</span>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            </div>

            {sessions.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No recent conversations yet. Ask Notiq AI anything to start saving history!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {sessions.map(s => {
                  const isActive = s.id === currentSessionId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => loadSession(s)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                        border: isActive ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.08)';
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.04)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: isActive ? '#c7d2fe' : '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {s.title}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>
                            {formatTimeAgo(s.updatedAt)}
                          </span>
                          <button
                            onClick={e => deleteSession(s.id, e)}
                            title="Remove chat"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: 2,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.preview}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={startNewChat}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a5b4fc',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                }}
              >
                <Plus size={12} />
                <span>Start Fresh Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Messages Feed — STRICT ZERO-HORIZONTAL SCROLL */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {messages.map(msg => {
          if (!msg.content && msg.id !== 'welcome') return null;
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  width: '100%',
                  maxWidth: isUser ? '85%' : '100%',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  minWidth: 0,
                  boxSizing: 'border-box',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: isUser ? 'var(--accent, #6366f1)' : 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                    marginTop: 2,
                    boxShadow: isUser ? '0 2px 6px rgba(99, 102, 241, 0.4)' : 'none',
                  }}
                >
                  {isUser ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Bubble with strict wrapping & no overflow clipping */}
                <div
                  style={{
                    background: isUser ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'rgba(255, 255, 255, 0.04)',
                    color: isUser ? '#fff' : 'var(--text-primary, #e2e8f0)',
                    padding: '12px 16px',
                    borderRadius: 14,
                    borderTopRightRadius: isUser ? 2 : 14,
                    borderTopLeftRadius: isUser ? 14 : 2,
                    border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    flex: 1,
                    minWidth: 0,
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {isUser ? (
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div style={{ minWidth: 0, width: '100%' }}>{renderMarkdown(msg.content)}</div>
                  )}

                  {/* Actions for AI responses */}
                  {!isUser && msg.id !== 'welcome' && msg.content?.trim() && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: copiedId === msg.id ? '#4ade80' : 'var(--text-muted, #94a3b8)',
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 5,
                          transition: 'all 0.15s',
                        }}
                      >
                        {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      {/* 1-Click Save as Workspace Page */}
                      <button
                        onClick={() => handleSaveMessageAsPage(msg.id, msg.content)}
                        disabled={savingPageMsgId === msg.id}
                        title="Create a new workspace Page from this response"
                        style={{
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#7dd3fc',
                          fontSize: 11,
                          cursor: savingPageMsgId === msg.id ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 9px',
                          borderRadius: 5,
                          fontWeight: 500,
                          transition: 'all 0.15s',
                        }}
                      >
                        <FileText size={12} />
                        <span>{savingPageMsgId === msg.id ? 'Creating Page…' : '📄 Save as Page'}</span>
                      </button>

                      {savedPageSuccessId && (
                        <button
                          onClick={() => router.push(`/workspace/pages/${savedPageSuccessId}`)}
                          style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            color: '#4ade80',
                            fontSize: 11,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 5,
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle2 size={12} />
                          <span>View Saved Page →</span>
                        </button>
                      )}

                      {onInsert && (
                        <button
                          onClick={() => onInsert(msg.content)}
                          style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            color: '#a5b4fc',
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 5,
                          }}
                        >
                          <ExternalLink size={11} />
                          <span>Insert into Note</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && !streamingMsgId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px' }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                animation: 'pulse 1.5s infinite',
              }}
            >
              <Sparkles size={14} />
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>Thinking...</span>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6366f1', animation: 'bounce 1s infinite' }} />
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#a855f7', animation: 'bounce 1s infinite 0.2s' }} />
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#38bdf8', animation: 'bounce 1s infinite 0.4s' }} />
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => handleSend(messages[messages.length - 1]?.content)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
              }}
            >
              <RotateCcw size={12} /> Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips (shown if conversation is short) */}
      {messages.length <= 2 && quickSuggestions.length > 0 && !isLoading && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {quickSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(suggestion.replace(/^[^\w\s]+\s*/, ''))}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary, #cbd5e1)',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99, 102, 241, 0.15)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99, 102, 241, 0.35)';
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.04)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary, #cbd5e1)';
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 12,
            padding: '6px 10px',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent, #6366f1)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 13,
              lineHeight: 1.5,
              resize: 'none',
              maxHeight: 200,
              minHeight: 24,
              overflowY: 'auto',
              padding: '4px 0',
              transition: 'height 0.1s ease',
            }}
          />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: input.trim() && !isLoading ? 'var(--accent, #6366f1)' : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #64748b)', marginTop: 6, textAlign: 'center' }}>
          Enter to send • Shift + Enter for new line
        </div>
      </div>
    </div>
  );
}

// 📌 Interactive 1-Click Task Confirmation Card
interface TaskData {
  title: string;
  topicHeading?: string;
  description?: string;
  subItems?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  tags?: string[];
}

function TaskConfirmationCard({
  task,
  workspaceId,
}: {
  task: TaskData;
  workspaceId?: string;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showViewPopup, setShowViewPopup] = useState(false);
  const router = useRouter();

  const priorityColors: Record<string, { bg: string; color: string; border: string }> = {
    urgent: { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.35)' },
    high: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)' },
    medium: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.35)' },
    low: { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.35)' },
  };

  const pConfig = priorityColors[task.priority || 'medium'] || priorityColors.medium;

  // Extract sub-topics from subItems array or bulleted lines in description
  const subItemsList: string[] = React.useMemo(() => {
    if (Array.isArray(task.subItems) && task.subItems.length > 0) {
      return task.subItems.map((s: any) => typeof s === 'string' ? s : s.text || String(s)).filter(Boolean);
    }
    if (task.description) {
      const lines = task.description.split('\n');
      const extracted = lines
        .map(l => l.trim())
        .filter(l => l.startsWith('-') || l.startsWith('*') || l.startsWith('•') || /^\d+[.)]/.test(l))
        .map(l => l.replace(/^[-*•►▪▫\d.)]+\s*/, '').trim())
        .filter(Boolean);
      if (extracted.length > 0) return extracted;
    }
    return [];
  }, [task.subItems, task.description]);

  const handleAdd = async () => {
    if (!task.title) return;
    setIsAdding(true);
    setError(null);

    try {
      // Build final description: format sub-items as bullet points so Notiq's parseTopicSubItems recognizes them
      let finalDesc = task.description || '';
      if (subItemsList.length > 0 && (!finalDesc || !finalDesc.includes('\n'))) {
        finalDesc = subItemsList.map(s => `- ${s}`).join('\n');
      }

      // Generate SubItem objects with id, text, and completed: false
      const generatedSubs = subItemsList.map((item, idx) => ({
        id: `sub-${Math.random().toString(36).substring(2, 9)}`,
        prefix: `${idx + 1}.`,
        text: item,
        completed: false,
        indent: 0,
      }));

      const targetWsId = workspaceId;
      let createdId = `ai-todo-${Date.now()}`;

      if (targetWsId) {
        try {
          const res = await todoApi.create({
            workspaceId: targetWsId,
            title: task.title,
            topicHeading: task.topicHeading || task.title,
            description: finalDesc,
            priority: task.priority || 'medium',
            dueDate: task.dueDate || null,
            tags: task.tags || ['ai', 'checklist'],
            status: 'todo',
          });
          if (res.data?.todo?.id) {
            createdId = res.data.todo.id;
          }
        } catch (apiErr) {
          console.warn('API create todo failed, saving locally:', apiErr);
        }
      }

      // Save to localStorage with subItems populated
      try {
        const local = typeof window !== 'undefined' ? localStorage.getItem('notiq_todos') : null;
        const list = local ? JSON.parse(local) : [];
        const newLocalTodo = {
          id: createdId,
          title: task.title,
          topicHeading: task.topicHeading || task.title,
          description: finalDesc,
          priority: task.priority || 'medium',
          dueDate: task.dueDate || undefined,
          tags: task.tags || ['ai', 'checklist'],
          status: 'todo',
          subItems: generatedSubs,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
        };
        list.unshift(newLocalTodo);
        localStorage.setItem('notiq_todos', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notiq:todo-created', { detail: newLocalTodo }));
      } catch (storageErr) {
        console.error('Failed to update local storage:', storageErr);
      }

      setIsAdded(true);
    } catch (err: any) {
      console.error('Failed to create task from AI:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to add task');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 8,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.28)',
        boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>📌</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#c4b5fd' }}>
            Action Item
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.priority && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 99,
                background: pConfig.bg,
                color: pConfig.color,
                border: `1px solid ${pConfig.border}`,
                textTransform: 'capitalize',
              }}
            >
              {task.priority}
            </span>
          )}
          {task.dueDate && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 99,
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Calendar size={10} />
              {task.dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Task Title */}
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
        {task.title}
      </div>

      {/* Sub-topics Preview Checklist */}
      {subItemsList.length > 0 && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 10,
            padding: '10px 12px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c4b5fd' }}>
              Checklist Topics ({subItemsList.length} items)
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Checkboxes included
            </span>
          </div>

          <div
            style={{
              maxHeight: 140,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              paddingRight: 4,
            }}
          >
            {subItemsList.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#e2e8f0',
                  lineHeight: 1.35,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    border: '1.5px solid #a78bfa',
                    background: 'rgba(167, 139, 250, 0.1)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-bullet Description (if any) */}
      {task.description && subItemsList.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', margin: '0 0 10px', lineHeight: 1.45 }}>
          {task.description}
        </p>
      )}

      {/* Error if any */}
      {error && (
        <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* Action Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        {isAdded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  color: '#4ade80',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={14} />
                Added to Tasks & Topics!
              </span>
              <button
                onClick={() => setShowViewPopup(true)}
                style={{
                  fontSize: 11.5,
                  color: '#c4b5fd',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(124, 58, 237, 0.2)',
                  border: '1px solid rgba(124, 58, 237, 0.4)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124, 58, 237, 0.4)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124, 58, 237, 0.2)';
                }}
              >
                View in Tasks
                <ChevronRight size={12} />
              </button>
            </div>

            {/* Popup overlay for "View in Tasks" */}
            {showViewPopup && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(6px)',
                  animation: 'fadeIn 0.2s ease',
                }}
                onClick={() => setShowViewPopup(false)}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'linear-gradient(160deg, #1e1b2e 0%, #18181b 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    borderRadius: 16,
                    padding: '24px 28px',
                    width: 'min(380px, 90vw)',
                    boxShadow: '0 20px 60px -10px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.15)',
                    animation: 'scaleIn 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.05))',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <CheckCircle2 size={20} style={{ color: '#4ade80' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Task Created!</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Successfully added to your workspace</div>
                    </div>
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: 18,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{task.title}</div>
                    {subItemsList.length > 0 && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {subItemsList.length} checklist items • {task.priority || 'medium'} priority
                      </div>
                    )}
                    {task.tags && task.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {task.tags.map((tag, i) => (
                          <span key={i} style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                          }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowViewPopup(false)}
                      style={{
                        flex: 1,
                        padding: '8px 14px',
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.06)';
                      }}
                    >
                      Stay Here
                    </button>
                    <button
                      onClick={() => {
                        setShowViewPopup(false);
                        router.push('/workspace/todos');
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 14px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                      }}
                    >
                      <ExternalLink size={13} />
                      Go to Tasks
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleAdd}
            disabled={isAdding}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#fff',
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: isAdding ? 'not-allowed' : 'pointer',
              opacity: isAdding ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={13} />
            {isAdding ? 'Adding Task…' : `➕ Add to My Tasks (${subItemsList.length > 0 ? `${subItemsList.length} sub-topics` : '1 task'})`}
          </button>
        )}
      </div>
    </div>
  );
}

// 📄 Interactive 1-Click Page Confirmation Card
interface PageData {
  title: string;
  icon?: string;
  content: string;
}

function PageConfirmationCard({
  page,
  workspaceId,
}: {
  page: PageData;
  workspaceId?: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [createdPageId, setCreatedPageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async () => {
    if (!page.title) return;
    setIsCreating(true);
    setError(null);

    try {
      let newPageId = `page-${Date.now()}`;
      if (workspaceId) {
        try {
          const res = await pageApi.create({
            workspaceId,
            title: page.title,
            icon: page.icon || '⚡',
            content: page.content || `# ${page.title}\n\nDocument notes...`,
          });
          if (res.data?.page?.id) {
            newPageId = res.data.page.id;
          }
        } catch (apiErr) {
          console.warn('API create page failed, using local storage fallback:', apiErr);
        }
      }

      // Sync to localStorage
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_pages') : null;
        const list = raw ? JSON.parse(raw) : [];
        const newPageObj = {
          id: newPageId,
          title: page.title,
          icon: page.icon || '⚡',
          content: page.content || `# ${page.title}\n\nDocument notes...`,
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        list.unshift(newPageObj);
        localStorage.setItem('notiq_pages', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notiq:page-created', { detail: newPageObj }));
      } catch (storageErr) {
        console.error('Failed to update local storage for page:', storageErr);
      }

      setCreatedPageId(newPageId);
    } catch (err: any) {
      console.error('Failed to create page:', err);
      setError(err?.message || 'Failed to create page');
    } finally {
      setIsCreating(false);
    }
  };

  const previewSnippet = (page.content || '')
    .replace(/^[#*`_\s-]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 8,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
        border: '1px solid rgba(14, 165, 233, 0.3)',
        boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.35)',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{page.icon || '⚡'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#38bdf8' }}>
            Ready to Create Page
          </span>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6, wordBreak: 'break-word' }}>
        {page.title}
      </div>

      {previewSnippet && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted, #94a3b8)',
            marginBottom: 12,
            lineHeight: 1.5,
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255, 255, 255, 0.05)',
            maxHeight: 70,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {previewSnippet}…
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        {createdPageId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Page Added to Workspace!
            </span>
            <button
              onClick={() => router.push(`/workspace/pages/${createdPageId}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 14px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                color: '#fff',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
              }}
            >
              Open Page <ChevronRight size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreate}
            disabled={isCreating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              color: '#fff',
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: isCreating ? 'not-allowed' : 'pointer',
              opacity: isCreating ? 0.7 : 1,
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <FileText size={13} />
            {isCreating ? 'Creating Page…' : '📄 Create Page in Workspace'}
          </button>
        )}
      </div>
    </div>
  );
}

