'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Calendar, Clock, CheckCircle2, Circle, Tag, Plus, 
  MessageSquare, ExternalLink, Sparkles, Trash2, Edit3, 
  Check, ArrowRight, CornerDownLeft, FileText, ChevronDown
} from 'lucide-react';
import { SubItem } from '@/lib/brototypeApi';
import { Todo } from '@/app/workspace/todos/page';
import Link from 'next/link';

interface TaskDetailSideMenuProps {
  todo: Todo | null;
  onClose: () => void;
  onToggleStatus: (newStatus: Todo['status']) => void;
  onToggleSubItem: (subId: string) => void;
  onChangePriority: (p: Todo['priority']) => void;
  onChangeDueDate: (date: string | null) => void;
  onAddSubItem: (text: string) => void;
  onAddComment: (commentText: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLearnings: () => void;
}

const PRIORITY_BADGES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.35)' },
  high: { label: 'High', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)' },
  medium: { label: 'Medium', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.35)' },
  low: { label: 'Low', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.35)' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  todo: { label: 'To do', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)' },
  in_progress: { label: 'In Progress', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.18)' },
  done: { label: 'Done', color: '#4ade80', bg: 'rgba(34, 197, 94, 0.18)' },
};

// Choose dynamic icon based on task title/topic
function getTaskIcon(title: string, topic?: string): string {
  const text = `${title} ${topic || ''}`.toLowerCase();
  if (text.includes('array') || text.includes('data')) return '🧩';
  if (text.includes('modern') || text.includes('es6')) return '⚡';
  if (text.includes('dom') || text.includes('browser')) return '🌐';
  if (text.includes('error') || text.includes('debug')) return '🛠️';
  if (text.includes('object') || text.includes('oop')) return '🏮';
  if (text.includes('async') || text.includes('promise')) return '⌛';
  if (text.includes('ai') || text.includes('think')) return '🗃️';
  if (text.includes('advanced')) return '🗂️';
  if (text.includes('core') || text.includes('concept')) return '🔴';
  return '📌';
}

export default function TaskDetailSideMenu({
  todo,
  onClose,
  onToggleStatus,
  onToggleSubItem,
  onChangePriority,
  onChangeDueDate,
  onAddSubItem,
  onAddComment,
  onEdit,
  onDelete,
  onOpenLearnings,
}: TaskDetailSideMenuProps) {
  const [commentInput, setCommentInput] = useState('');
  const [newSubItemInput, setNewSubItemInput] = useState('');
  const [isAddingSubItem, setIsAddingSubItem] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);

  const commentInputRef = useRef<HTMLInputElement>(null);

  if (!todo) return null;

  const subItems = todo.subItems || [];
  const completedCount = subItems.filter((s) => s.completed).length;
  const progressPercent = subItems.length > 0 ? Math.round((completedCount / subItems.length) * 100) : 0;
  const isAllDone = todo.status === 'done';

  const pBadge = PRIORITY_BADGES[todo.priority] || PRIORITY_BADGES.medium;
  const sBadge = STATUS_CONFIG[todo.status] || STATUS_CONFIG.todo;

  // Format date display
  const formattedDate = todo.dueDate
    ? new Date(todo.dueDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Empty';

  // Extract goal and finish check from description
  const parseDescriptionParts = (desc: string = '') => {
    let goal = '';
    let finishCheck = '';
    const otherLines: string[] = [];

    const lines = desc.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^goal[:\s]/i.test(trimmed)) {
        goal = trimmed.replace(/^goal[:\s]*/i, '');
      } else if (/^finish\s*check[:\s]/i.test(trimmed)) {
        finishCheck = trimmed.replace(/^finish\s*check[:\s]*/i, '');
      } else if (trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        otherLines.push(trimmed);
      }
    }

    return { goal, finishCheck, generalDesc: otherLines.join('\n') };
  };

  const { goal, finishCheck, generalDesc } = parseDescriptionParts(todo.description || '');

  const handleSendComment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commentInput.trim()) return;
    onAddComment(commentInput.trim());
    setCommentInput('');
  };

  const handleCreateSubItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSubItemInput.trim()) return;
    onAddSubItem(newSubItemInput.trim());
    setNewSubItemInput('');
    setIsAddingSubItem(false);
  };

  // Helper to highlight JS function names like map(), filter(), etc.
  const formatItemText = (text: string) => {
    const parts = text.split(/([a-zA-Z0-9_$]+(?:\(\)|\b))/g);
    return parts.map((part, i) => {
      if (part.includes('()') || ['map', 'filter', 'reduce', 'find', 'forEach', 'set', 'let', 'const'].includes(part.toLowerCase())) {
        return (
          <code
            key={i}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.92em',
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.08)',
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid rgba(239, 68, 68, 0.15)',
            }}
          >
            {part}
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
        background: '#191919',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: 14,
        overflow: 'hidden',
        color: '#e2e8f0',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        animation: 'notionSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes notionSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .notion-prop-row:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .notion-check-row:hover {
          background: rgba(255, 255, 255, 0.04);
        }
      `}</style>

      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onOpenLearnings}
            title={todo.pageId ? 'Open Connected Learnings Page' : 'Generate AI Notes & Learnings'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 6,
              background: todo.pageId ? 'rgba(124, 58, 237, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              border: todo.pageId ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              color: todo.pageId ? '#c4b5fd' : '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <span>🧠</span>
            <span>{todo.pageId ? 'Learnings Page' : 'Learnings'}</span>
            <ExternalLink size={11} style={{ opacity: 0.7 }} />
          </button>

          {todo.pageId && (
            <Link
              href={`/workspace/pages/${todo.pageId}`}
              style={{
                fontSize: 11,
                color: '#38bdf8',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <FileText size={12} />
              Open Page
            </Link>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={onEdit}
            title="Edit Task Details"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <Edit3 size={15} />
          </button>

          <button
            onClick={onDelete}
            title="Delete Task"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <Trash2 size={15} />
          </button>

          <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '5px 8px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header Icon + Title */}
        <div>
          <div style={{ fontSize: 36, marginBottom: 8, lineHeight: 1 }}>
            {getTaskIcon(todo.title, todo.topicHeading)}
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 6px 0',
              lineHeight: 1.3,
              letterSpacing: '-0.3px',
            }}
          >
            {todo.title}
          </h1>
          {todo.topicHeading && todo.topicHeading !== todo.title && (
            <div style={{ fontSize: 13, color: '#a78bfa', fontWeight: 500 }}>
              {todo.topicHeading}
            </div>
          )}
        </div>

        {/* Notion Properties Grid */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '4px 0',
          }}
        >
          {/* Deadline */}
          <div
            className="notion-prop-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <Calendar size={14} />
              <span>Deadline</span>
            </div>
            <div>
              {editingDate ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="date"
                    defaultValue={todo.dueDate || ''}
                    onChange={(e) => {
                      onChangeDueDate(e.target.value || null);
                      setEditingDate(false);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '2px 6px',
                      fontSize: 12,
                    }}
                  />
                  <button
                    onClick={() => setEditingDate(false)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => setEditingDate(true)}
                  style={{
                    color: todo.dueDate ? '#f1f5f9' : '#64748b',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  title="Click to edit date"
                >
                  {formattedDate}
                </span>
              )}
            </div>
          </div>

          {/* Estimated Time */}
          <div
            className="notion-prop-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <Clock size={14} />
              <span>Estimated Time</span>
            </div>
            <div style={{ color: '#f1f5f9' }}>
              {todo.estimatedTime || '3 hours'}
            </div>
          </div>

          {/* Priority */}
          <div
            className="notion-prop-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              gap: 12,
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <span>🎯</span>
              <span>Priority</span>
            </div>
            <div>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onClick={() => setPriorityMenuOpen(!priorityMenuOpen)}
                  style={{
                    background: pBadge.bg,
                    color: pBadge.color,
                    border: `1px solid ${pBadge.border}`,
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '2px 9px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    textTransform: 'capitalize',
                  }}
                >
                  <span>{pBadge.label}</span>
                  <ChevronDown size={11} />
                </button>

                {priorityMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: '#242427',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 8,
                      padding: 4,
                      zIndex: 100,
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
                      minWidth: 120,
                    }}
                  >
                    {(['urgent', 'high', 'medium', 'low'] as const).map((pr) => {
                      const cfg = PRIORITY_BADGES[pr];
                      return (
                        <button
                          key={pr}
                          onClick={() => {
                            onChangePriority(pr);
                            setPriorityMenuOpen(false);
                          }}
                          style={{
                            width: '100%',
                            background: todo.priority === pr ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            border: 'none',
                            color: cfg.color,
                            padding: '6px 10px',
                            fontSize: 12,
                            textAlign: 'left',
                            borderRadius: 5,
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{cfg.label}</span>
                          {todo.priority === pr && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category / Tags */}
          <div
            className="notion-prop-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <Tag size={14} />
              <span>Category</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                Academic
              </span>
              {todo.tags?.map((t, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Completed Checkbox */}
          <div
            className="notion-prop-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <CheckCircle2 size={14} />
              <span>Completed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={isAllDone}
                onChange={() => onToggleStatus(isAllDone ? 'todo' : 'done')}
                style={{
                  width: 16,
                  height: 16,
                  accentColor: '#3b82f6',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              />
            </div>
          </div>

          {/* Status */}
          <div
            className="notion-prop-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              gap: 12,
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <span>📌</span>
              <span>Status</span>
            </div>
            <div>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                  style={{
                    background: sBadge.bg,
                    color: sBadge.color,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 99,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: sBadge.color,
                    }}
                  />
                  <span>{sBadge.label}</span>
                  <ChevronDown size={11} />
                </button>

                {statusMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: '#242427',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 8,
                      padding: 4,
                      zIndex: 100,
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
                      minWidth: 130,
                    }}
                  >
                    {(['todo', 'in_progress', 'done'] as const).map((st) => {
                      const cfg = STATUS_CONFIG[st];
                      return (
                        <button
                          key={st}
                          onClick={() => {
                            onToggleStatus(st);
                            setStatusMenuOpen(false);
                          }}
                          style={{
                            width: '100%',
                            background: todo.status === st ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            border: 'none',
                            color: cfg.color,
                            padding: '6px 10px',
                            fontSize: 12,
                            textAlign: 'left',
                            borderRadius: 5,
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                          <span style={{ flex: 1 }}>{cfg.label}</span>
                          {todo.status === st && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Add a Property button */}
          <div style={{ padding: '6px 10px' }}>
            <button
              onClick={onEdit}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 0',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              <Plus size={13} />
              <span>Add a property</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Comments
          </div>

          {/* Add a comment input */}
          <form onSubmit={handleSendComment} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              M
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                padding: '6px 10px',
              }}
            >
              <input
                ref={commentInputRef}
                type="text"
                placeholder="Add a comment..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: 12.5,
                }}
              />
              {commentInput.trim() && (
                <button
                  type="submit"
                  style={{
                    background: 'var(--accent, #6366f1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Send
                </button>
              )}
            </div>
          </form>

          {/* Existing comments list */}
          {todo.comments && todo.comments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {todo.comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c4b5fd' }}>{c.user || 'You'}</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.4 }}>{c.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Goal Banner */}
        {goal && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#e2e8f0',
            }}
          >
            <span style={{ fontWeight: 700, color: '#fff' }}>Goal: </span>
            <span>{goal}</span>
          </div>
        )}

        {/* General Description if any */}
        {generalDesc && !goal && (
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {generalDesc}
          </div>
        )}

        {/* Interactive Checklist Topics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Checklist ({completedCount}/{subItems.length})
            </div>
            {subItems.length > 0 && (
              <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>{progressPercent}%</span>
            )}
          </div>

          {/* Progress Bar */}
          {subItems.length > 0 && (
            <div
              style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: 'rgba(255, 255, 255, 0.07)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: progressPercent === 100 ? '#22c55e' : 'linear-gradient(90deg, #6366f1, #3b82f6)',
                  borderRadius: 2,
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          )}

          {/* Sub-Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {subItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onToggleSubItem(item.id)}
                className="notion-check-row"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '6px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  marginLeft: (item.indent || 0) * 16,
                }}
              >
                {/* Notion Style Square Checkbox */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: item.completed ? '1.5px solid #22c55e' : '1.5px solid rgba(255, 255, 255, 0.3)',
                    background: item.completed ? '#22c55e' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    marginTop: 2,
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {item.completed && <Check size={11} strokeWidth={3} />}
                </div>

                {/* Subitem text with function/code highlight */}
                <div
                  style={{
                    flex: 1,
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: item.completed ? '#64748b' : '#f1f5f9',
                    textDecoration: item.completed ? 'line-through' : 'none',
                  }}
                >
                  {formatItemText(item.text)}
                </div>
              </div>
            ))}
          </div>

          {/* Add a checklist item */}
          {isAddingSubItem ? (
            <form onSubmit={handleCreateSubItem} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                autoFocus
                type="text"
                placeholder="Type checklist topic..."
                value={newSubItemInput}
                onChange={(e) => setNewSubItemInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '6px 10px',
                  fontSize: 12.5,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  background: 'var(--accent, #6366f1)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setIsAddingSubItem(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsAddingSubItem(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: 12.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                marginTop: 2,
                borderRadius: 4,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              <Plus size={13} />
              <span>Add a checklist item</span>
            </button>
          )}
        </div>

        {/* Finish check banner */}
        {finishCheck && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(124, 58, 237, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#c4b5fd',
            }}
          >
            <span style={{ fontWeight: 700, color: '#fff' }}>Finish check: </span>
            <span>{finishCheck}</span>
          </div>
        )}
      </div>
    </div>
  );
}
