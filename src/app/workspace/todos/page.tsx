'use client';

import { useState, useEffect, useCallback, DragEvent, Suspense, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { todoApi, pageApi } from '@/lib/api';
import {
  fetchBrototypeTasks,
  fetchBrototypeTaskDetail,
  getSavedBrototypeToken,
  parseTopicSubItems,
  SubItem,
} from '@/lib/brototypeApi';
import BrototypeModal from '@/components/BrototypeModal';
import { generateLearningNotesForTask } from '@/lib/aiService';
import TaskDetailSideMenu from '@/components/TaskDetailSideMenu';

export interface Todo {
  id: string;
  title: string;
  topicHeading?: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  assignedAt?: string;
  tags: string[];
  sortOrder?: number;
  subItems?: SubItem[];
  pageId?: string;
  learningNotes?: string;
  estimatedTime?: string;
  comments?: Array<{ id: string; user: string; text: string; createdAt: string }>;
  createdAt: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  medium: { label: 'Medium', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  high: { label: 'High', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
};

const COLUMNS: Array<{ id: 'todo' | 'in_progress' | 'done'; title: string; icon: string }> = [
  { id: 'todo', title: 'To Do', icon: '📌' },
  { id: 'in_progress', title: 'In Progress', icon: '⏳' },
  { id: 'done', title: 'Completed', icon: '✅' },
];

export default function TodosPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading tasks…</p>
        </div>
      </div>
    }>
      <TodosPageInner />
    </Suspense>
  );
}

function TodosPageInner() {
  const { activeWorkspace } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultStatus = searchParams.get('status') || '';

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Learnings & Notes Modal state
  const [learningModalTodo, setLearningModalTodo] = useState<Todo | null>(null);
  const [learningNotesDraft, setLearningNotesDraft] = useState('');
  const [savingLearnings, setSavingLearnings] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  const [isGeneratingAiNotes, setIsGeneratingAiNotes] = useState(false);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [filter, setFilter] = useState(defaultStatus);
  const [showForm, setShowForm] = useState(false);

  // Brototype integration state
  const [brototypeLoading, setBrototypeLoading] = useState(false);
  const [isBrototypeModalOpen, setIsBrototypeModalOpen] = useState(false);
  const [brototypeMsg, setBrototypeMsg] = useState<{ title?: string; text: string; type?: 'info' | 'success' | 'error' } | null>(null);

  // Drag and Drop state
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Expanded sub-items map
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Priority menu open map
  const [priorityMenuId, setPriorityMenuId] = useState<string | null>(null);

  // Custom Delete Confirmation Modal state
  const [deleteConfirmTodo, setDeleteConfirmTodo] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Custom 2-Step "Delete All" Confirmation Modal state
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllStep, setDeleteAllStep] = useState<1 | 2>(1);
  const [deletingAll, setDeletingAll] = useState(false);

  // 📌 Notion-style Side Menu Detailed View state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTodo = todos.find((t) => t.id === selectedTaskId) || null;

  // Keyboard shortcut listener for Modals & Side Menu (Escape to cancel/close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteConfirmTodo && !deleting) setDeleteConfirmTodo(null);
        if (showDeleteAllModal && !deletingAll) {
          setShowDeleteAllModal(false);
          setDeleteAllStep(1);
        }
        if (selectedTaskId) {
          setSelectedTaskId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmTodo, deleting, showDeleteAllModal, deletingAll, selectedTaskId]);

  // Form state
  const [form, setForm] = useState({
    title: '',
    topicHeading: '',
    description: '',
    priority: 'medium' as Todo['priority'],
    dueDate: '',
    status: 'todo' as Todo['status'],
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    let loaded = false;

    if (activeWorkspace) {
      try {
        const params: Record<string, string> = { workspaceId: activeWorkspace.id };
        if (filter) params.status = filter;
        const { data } = await todoApi.getAll(params);
        if (data?.todos && Array.isArray(data.todos) && data.todos.length > 0) {
          const localCache = localStorage.getItem('notiq_todos');
          const cacheMap = new Map<string, Todo>();
          if (localCache) {
            try {
              const parsed: Todo[] = JSON.parse(localCache);
              parsed.forEach((t) => cacheMap.set(t.id, t));
            } catch { /* */ }
          }

          const enriched: Todo[] = data.todos.map((t: any) => {
            const cached = cacheMap.get(t.id);
            return {
              ...t,
              topicHeading: t.topicHeading || cached?.topicHeading,
              subItems: t.subItems || cached?.subItems || parseTopicSubItems(t.description || ''),
              sortOrder: t.sortOrder ?? cached?.sortOrder ?? 0,
              assignedAt: t.assignedAt || cached?.assignedAt,
            };
          });

          // Sort: newest tasks at top, high priority items first
          const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          enriched.sort((a, b) => {
            const pA = priorityWeight[a.priority] ?? 2;
            const pB = priorityWeight[b.priority] ?? 2;
            if (pA !== pB) return pA - pB;
            const timeA = new Date(a.createdAt || a.assignedAt || 0).getTime();
            const timeB = new Date(b.createdAt || b.assignedAt || 0).getTime();
            return timeB - timeA;
          });
          setTodos(enriched);
          localStorage.setItem('notiq_todos', JSON.stringify(enriched));
          loaded = true;
        }
      } catch {
        // Fallback to local storage
      }
    }

    if (!loaded) {
      const local = typeof window !== 'undefined' ? localStorage.getItem('notiq_todos') : null;
      if (local) {
        try {
          let parsed: Todo[] = JSON.parse(local);
          if (filter) parsed = parsed.filter((t) => t.status === filter);
          const priorityWeight2: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          parsed.sort((a, b) => {
            const pA = priorityWeight2[a.priority] ?? 2;
            const pB = priorityWeight2[b.priority] ?? 2;
            if (pA !== pB) return pA - pB;
            const timeA = new Date(a.createdAt || a.assignedAt || 0).getTime();
            const timeB = new Date(b.createdAt || b.assignedAt || 0).getTime();
            return timeB - timeA;
          });
          setTodos(parsed);
        } catch { /* */ }
      }
    }
    setLoading(false);
  }, [activeWorkspace, filter]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  useEffect(() => {
    const handleTodoCreated = () => {
      fetchTodos();
    };
    window.addEventListener('notiq:todo-created', handleTodoCreated);
    return () => window.removeEventListener('notiq:todo-created', handleTodoCreated);
  }, [fetchTodos]);

  const saveTodosToStorage = (updatedList: Todo[]) => {
    localStorage.setItem('notiq_todos', JSON.stringify(updatedList));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const parsedSubs = parseTopicSubItems(form.description);

      if (editId) {
        await todoApi.update(editId, form).catch(() => {});
        setTodos((prev) => {
          const updated: Todo[] = prev.map((t) =>
            t.id === editId
              ? {
                  ...t,
                  title: form.title,
                  topicHeading: form.topicHeading || t.topicHeading,
                  description: form.description,
                  priority: form.priority,
                  status: form.status,
                  dueDate: form.dueDate,
                  subItems: parsedSubs.length > 0 ? parsedSubs : t.subItems,
                }
              : t
          );
          saveTodosToStorage(updated);
          return updated;
        });
      } else {
        const minOrder = Math.min(0, ...todos.map((t) => t.sortOrder ?? 0));
        const newTodo: Todo = {
          id: `todo-${Date.now()}`,
          title: form.title,
          topicHeading: form.topicHeading,
          description: form.description,
          priority: form.priority,
          status: form.status,
          dueDate: form.dueDate,
          tags: form.topicHeading ? [form.topicHeading] : [],
          sortOrder: minOrder - 1,
          subItems: parsedSubs,
          createdAt: new Date().toISOString(),
        };

        if (activeWorkspace) {
          try {
            const { data } = await todoApi.create({ ...form, workspaceId: activeWorkspace.id });
            if (data?.todo) newTodo.id = data.todo.id;
          } catch { /* offline */ }
        }

        setTodos((prev) => {
          const updated = [newTodo, ...prev];
          saveTodosToStorage(updated);
          return updated;
        });
      }

      setForm({
        title: '',
        topicHeading: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        status: 'todo',
      });
      setEditId(null);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubItem = (todoId: string, subItemId: string) => {
    setTodos((prev) => {
      const updated: Todo[] = prev.map((t): Todo => {
        if (t.id !== todoId || !t.subItems) return t;
        const newSubs = t.subItems.map((s) => (s.id === subItemId ? { ...s, completed: !s.completed } : s));
        const allCompleted = newSubs.length > 0 && newSubs.every((s) => s.completed);

        const nextStatus: Todo['status'] = allCompleted ? 'done' : t.status === 'done' ? 'in_progress' : t.status;
        if (nextStatus !== t.status) {
          todoApi.update(t.id, { status: nextStatus }).catch(() => {});
        }

        return {
          ...t,
          subItems: newSubs,
          status: nextStatus,
        };
      });
      saveTodosToStorage(updated);
      return updated;
    });
  };

  const handleChangePriority = async (todoId: string, newPriority: Todo['priority']) => {
    setPriorityMenuId(null);
    try {
      await todoApi.update(todoId, { priority: newPriority }).catch(() => {});
    } catch { /* */ }

    setTodos((prev) => {
      const updated: Todo[] = prev.map((t) => (t.id === todoId ? { ...t, priority: newPriority } : t));
      saveTodosToStorage(updated);
      return updated;
    });
  };

  const handleStatusToggle = async (todo: Todo) => {
    const next: Todo['status'] = todo.status === 'done' ? 'todo' : todo.status === 'todo' ? 'in_progress' : 'done';
    try {
      await todoApi.update(todo.id, { status: next }).catch(() => {});
    } catch { /* */ }
    setTodos((prev) => {
      const updated: Todo[] = prev.map((t) => (t.id === todo.id ? { ...t, status: next } : t));
      saveTodosToStorage(updated);
      return updated;
    });
  };

  // Direct status update (from Side Menu status dropdown)
  const handleUpdateTaskStatus = async (todoId: string, newStatus: Todo['status']) => {
    try {
      await todoApi.update(todoId, { status: newStatus }).catch(() => {});
    } catch { /* */ }
    setTodos((prev) => {
      const updated: Todo[] = prev.map((t) => (t.id === todoId ? { ...t, status: newStatus } : t));
      saveTodosToStorage(updated);
      return updated;
    });
  };

  // Direct due date update (from Side Menu)
  const handleUpdateTaskDueDate = async (todoId: string, newDueDate: string | null) => {
    try {
      await todoApi.update(todoId, { dueDate: newDueDate }).catch(() => {});
    } catch { /* */ }
    setTodos((prev) => {
      const updated: Todo[] = prev.map((t) => (t.id === todoId ? { ...t, dueDate: newDueDate || undefined } : t));
      saveTodosToStorage(updated);
      return updated;
    });
  };

  // Add sub-item directly from Side Menu
  const handleAddSubItemToTask = (todoId: string, itemText: string) => {
    if (!itemText.trim()) return;
    const newSubItem: SubItem = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      prefix: '',
      text: itemText.trim(),
      completed: false,
      indent: 0,
    };
    setTodos((prev) => {
      const updated = prev.map((t) => {
        if (t.id !== todoId) return t;
        const subItems = [...(t.subItems || []), newSubItem];
        return { ...t, subItems };
      });
      saveTodosToStorage(updated);
      return updated;
    });
  };

  // Add comment directly from Side Menu
  const handleAddComment = (todoId: string, commentText: string) => {
    if (!commentText.trim()) return;
    const newComment = {
      id: `comment-${Date.now()}`,
      user: 'You',
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    setTodos((prev) => {
      const updated = prev.map((t) => {
        if (t.id !== todoId) return t;
        const comments = [...(t.comments || []), newComment];
        return { ...t, comments };
      });
      saveTodosToStorage(updated);
      return updated;
    });
  };

  // Open custom delete modal
  const promptDelete = (todo: Todo) => {
    setDeleteConfirmTodo(todo);
  };

  // Execute deletion of a single task
  const executeDelete = async (targetTodo: Todo) => {
    setDeleting(true);
    try {
      await todoApi.delete(targetTodo.id, { title: targetTodo.title }).catch(() => {});
      setTodos((prev) => {
        const updated = prev.filter((t) => String(t.id) !== String(targetTodo.id));
        saveTodosToStorage(updated);
        return updated;
      });
      if (selectedTaskId === targetTodo.id) {
        setSelectedTaskId(null);
      }
      setDeleteConfirmTodo(null);
    } catch {
      setTodos((prev) => {
        const updated = prev.filter((t) => String(t.id) !== String(targetTodo.id));
        saveTodosToStorage(updated);
        return updated;
      });
      if (selectedTaskId === targetTodo.id) {
        setSelectedTaskId(null);
      }
      setDeleteConfirmTodo(null);
    } finally {
      setDeleting(false);
    }
  };

  // Execute deletion of all tasks (after 2-step confirmation)
  const executeDeleteAll = async () => {
    setDeletingAll(true);
    try {
      if (activeWorkspace) {
        await todoApi.deleteAll({ workspaceId: activeWorkspace.id }).catch(() => {});
      }
      setTodos([]);
      saveTodosToStorage([]);
      setShowDeleteAllModal(false);
      setDeleteAllStep(1);
      setBrototypeMsg({
        title: 'All Tasks Cleared',
        text: 'All tasks and topics have been permanently removed.',
        type: 'info',
      });
      setTimeout(() => setBrototypeMsg(null), 5000);
    } catch {
      setTodos([]);
      saveTodosToStorage([]);
      setShowDeleteAllModal(false);
      setDeleteAllStep(1);
    } finally {
      setDeletingAll(false);
    }
  };

  const handleEdit = (todo: Todo) => {
    setForm({
      title: todo.title,
      topicHeading: todo.topicHeading || '',
      description: todo.description || '',
      priority: todo.priority,
      dueDate: todo.dueDate || '',
      status: todo.status,
    });
    setEditId(todo.id);
    setShowForm(true);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: DragEvent, id: string) => {
    setDraggedTodoId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTodoId(null);
    setDragOverCol(null);
  };

  const handleDragOverCol = (e: DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleDropOnCol = (e: DragEvent, targetStatus: Todo['status']) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('text/plain') || draggedTodoId;
    if (!id) return;
    setDraggedTodoId(null);

    setTodos((prev) => {
      const movingTodo = prev.find((t) => t.id === id);
      if (!movingTodo || movingTodo.status === targetStatus) return prev;

      const updated = prev.map((t) => (t.id === id ? { ...t, status: targetStatus } : t));
      saveTodosToStorage(updated);
      todoApi.update(id, { status: targetStatus }).catch(() => {});
      return updated;
    });
  };

  const handleDropOnCard = (e: DragEvent, targetCardId: string, targetStatus: Todo['status']) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('text/plain') || draggedTodoId;
    if (!id || id === targetCardId) return;
    setDraggedTodoId(null);

    setTodos((prev) => {
      const copy = [...prev];
      const draggedIndex = copy.findIndex((t) => t.id === id);
      const targetIndex = copy.findIndex((t) => t.id === targetCardId);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const [removed] = copy.splice(draggedIndex, 1);
      removed.status = targetStatus;
      copy.splice(targetIndex, 0, removed);

      copy.forEach((t, i) => {
        t.sortOrder = i;
      });

      saveTodosToStorage(copy);
      todoApi.update(removed.id, { status: targetStatus, sortOrder: targetIndex }).catch(() => {});
      return copy;
    });
  };

  // 🧠 What I Learned Handlers
  const openLearningsModal = (todo: Todo) => {
    if (todo.pageId) {
      // Direct navigation if full page is linked
      router.push(`/workspace/pages/${todo.pageId}`);
      return;
    }
    setLearningModalTodo(todo);
    setLearningNotesDraft(todo.learningNotes || todo.description || '');
  };

  const handleSaveLearnings = async () => {
    if (!learningModalTodo) return;
    setSavingLearnings(true);
    try {
      const updated = todos.map((t) =>
        t.id === learningModalTodo.id
          ? { ...t, learningNotes: learningNotesDraft, description: learningNotesDraft }
          : t
      );
      setTodos(updated);
      saveTodosToStorage(updated);
      await todoApi.update(learningModalTodo.id, {
        description: learningNotesDraft,
        learningNotes: learningNotesDraft,
      }).catch(() => {});
      setLearningModalTodo(null);
    } finally {
      setSavingLearnings(false);
    }
  };

  const handleCreateLearningsPage = async () => {
    if (!learningModalTodo || !activeWorkspace) return;
    setCreatingPage(true);
    try {
      const pageTitle = `🧠 Learnings: ${learningModalTodo.title}`;
      const checklistMd =
        learningModalTodo.subItems && learningModalTodo.subItems.length > 0
          ? `\n## ✅ Completed Checklist & Topics\n` +
            learningModalTodo.subItems
              .map((s) => `- [${s.completed ? 'x' : ' '}] **${s.prefix}** ${s.text}`)
              .join('\n')
          : '';

      const initialContent = `# 🧠 Learnings: ${learningModalTodo.title}
${learningModalTodo.topicHeading ? `**Module / Topic:** ${learningModalTodo.topicHeading}\n` : ''}
---

## 📌 Summary & Core Concepts
${learningNotesDraft || 'Document what you understood and mastered in this topic.'}
${checklistMd}

## 💡 Key Takeaways & Best Practices
- Takeaway 1...
- Takeaway 2...

## ❓ Questions & Future Review
- Doubts or key points to review before evaluation:
`;

      const { data } = await pageApi.create({
        title: pageTitle,
        workspaceId: activeWorkspace.id,
        icon: '🧠',
        content: initialContent,
      });

      const newPageId = data.page.id;

      const updated = todos.map((t) =>
        t.id === learningModalTodo.id
          ? { ...t, pageId: newPageId, learningNotes: learningNotesDraft }
          : t
      );
      setTodos(updated);
      saveTodosToStorage(updated);
      await todoApi.update(learningModalTodo.id, {
        pageId: newPageId,
        description: learningNotesDraft,
      }).catch(() => {});

      setLearningModalTodo(null);
      router.push(`/workspace/pages/${newPageId}`);
    } catch (err) {
      console.error('Failed to create page', err);
    } finally {
      setCreatingPage(false);
    }
  };

  // Deep load all Brototype Tasks with Duplicate Check
  const handleLoadBrototypeTasks = async () => {
    const token = getSavedBrototypeToken();
    if (!token) {
      setIsBrototypeModalOpen(true);
      return;
    }

    setBrototypeLoading(true);
    setBrototypeMsg(null);

    try {
      const bTasks = await fetchBrototypeTasks();
      // Filter strictly for tasktype = Technical
      const technicalTasks = (bTasks || []).filter(
        (t) => t.tasktype?.trim().toLowerCase() === 'technical'
      );

      if (!technicalTasks || technicalTasks.length === 0) {
        setBrototypeMsg({ text: 'No Technical tasks found in your Brototype portal.', type: 'info' });
        setTimeout(() => setBrototypeMsg(null), 4000);
        return;
      }

      // Sort by assignedAt descending so newest assigned tasks are processed first
      technicalTasks.sort((a, b) => {
        const timeA = new Date(a.assignedAt || 0).getTime();
        const timeB = new Date(b.assignedAt || 0).getTime();
        return timeB - timeA;
      });

      const generatedTodos: Todo[] = [];
      const minExistingOrder = Math.min(0, ...todos.map((t) => t.sortOrder ?? 0));
      let orderCounter = minExistingOrder - technicalTasks.length - 20;

      // Fetch deep details for the active tasks (up to 5 main technical assignments)
      const tasksToFetch = technicalTasks.slice(0, 5);

      for (const t of tasksToFetch) {
        try {
          const detail = await fetchBrototypeTaskDetail(t.taskAssignmentIdentifier);
          const topics = detail?.topics || [];

          if (topics.length > 0) {
            for (const top of topics) {
              const subItems = parseTopicSubItems(top.description);

              generatedTodos.push({
                id: `bt-top-${top.taskAssignmentTopicIdentifier || top.taskAssignmentTopicId || Math.random()}`,
                title: top.topicName || t.taskname,
                topicHeading: `${t.paperName || 'Paper'} • ${top.topicName || 'Topic'}`,
                description: top.description || '',
                status: t.taskStatus?.toLowerCase() === 'completed' ? 'done' : 'todo',
                priority: 'high',
                dueDate: t.assignedAt ? t.assignedAt.split('T')[0] : '',
                assignedAt: t.assignedAt,
                tags: ['Brototype', 'Technical', t.semesterName || 'Sem 1', t.paperName || 'Paper 1'].filter(Boolean),
                sortOrder: orderCounter++,
                subItems,
                createdAt: t.assignedAt || new Date().toISOString(),
              });
            }
          } else {
            const subItems = parseTopicSubItems(t.description);
            generatedTodos.push({
              id: `bt-${t.taskAssignmentIdentifier}`,
              title: t.taskname,
              topicHeading: `${t.semesterName} • ${t.paperName}`,
              description: t.description || '',
              status: t.taskStatus?.toLowerCase() === 'completed' ? 'done' : 'todo',
              priority: 'high',
              dueDate: t.assignedAt ? t.assignedAt.split('T')[0] : '',
              assignedAt: t.assignedAt,
              tags: ['Brototype', 'Technical', t.semesterName || 'Sem 1', t.paperName || 'Paper 1'].filter(Boolean),
              sortOrder: orderCounter++,
              subItems,
              createdAt: t.assignedAt || new Date().toISOString(),
            });
          }
        } catch {
          const subItems = parseTopicSubItems(t.description);
          generatedTodos.push({
            id: `bt-${t.taskAssignmentIdentifier}`,
            title: t.taskname,
            topicHeading: `${t.semesterName} • ${t.paperName}`,
            description: t.description || '',
            status: t.taskStatus?.toLowerCase() === 'completed' ? 'done' : 'todo',
            priority: 'high',
            assignedAt: t.assignedAt,
            tags: ['Brototype', 'Technical', t.paperName || 'Paper 1'],
            sortOrder: orderCounter++,
            subItems,
            createdAt: t.assignedAt || new Date().toISOString(),
          });
        }
      }

      // Retrieve all existing todos (from state and local storage) to prevent duplicates even if filtered
      const allExistingTodos: Todo[] = (() => {
        try {
          const raw = typeof window !== 'undefined' ? localStorage.getItem('notiq_todos') : null;
          const parsed: Todo[] = raw ? JSON.parse(raw) : [];
          const map = new Map<string, Todo>();
          parsed.forEach((t) => map.set(t.id, t));
          todos.forEach((t) => map.set(t.id, t));
          return Array.from(map.values());
        } catch {
          return todos;
        }
      })();

      const normalize = (s?: string) =>
        (s || '')
          .toLowerCase()
          .replace(/^\[brototype\]\s*/i, '')
          .replace(/[^a-z0-9]/g, '')
          .trim();

      const existingTitles = new Set(allExistingTodos.map((p) => normalize(p.title)).filter(Boolean));
      const existingIds = new Set(allExistingTodos.map((p) => p.id));
      const existingHeadings = new Set(allExistingTodos.map((p) => normalize(p.topicHeading)).filter(Boolean));

      const uniqueToAdd = generatedTodos.filter((nt) => {
        const normTitle = normalize(nt.title);
        const normHeading = normalize(nt.topicHeading);
        const titleMatch = existingTitles.has(normTitle);
        const idMatch = existingIds.has(nt.id);
        const headingMatch = normHeading && existingHeadings.has(normHeading);
        return !titleMatch && !idMatch && !headingMatch;
      });

      if (uniqueToAdd.length === 0) {
        setBrototypeMsg({
          title: 'Already Added',
          text: 'All Brototype tasks are already added to your todo board. No duplicate tasks were imported.',
          type: 'info',
        });
        setTimeout(() => setBrototypeMsg(null), 6000);
        return;
      }

      const duplicateCount = generatedTodos.length - uniqueToAdd.length;
      const merged = [...uniqueToAdd, ...todos];
      saveTodosToStorage(merged);
      setTodos(merged);

      // Persist to backend if connected
      if (activeWorkspace) {
        for (const nt of uniqueToAdd) {
          todoApi.create({
            title: nt.title,
            description: nt.description,
            priority: nt.priority,
            status: nt.status,
            tags: nt.tags,
            dueDate: nt.dueDate,
            workspaceId: activeWorkspace.id,
          }).catch(() => {});
        }
      }

      if (duplicateCount > 0) {
        setBrototypeMsg({
          title: 'Tasks Synced',
          text: `Added ${uniqueToAdd.length} new topics. (${duplicateCount} existing topics were already added).`,
          type: 'success',
        });
      } else {
        setBrototypeMsg({
          title: 'Import Successful',
          text: `Successfully imported ${uniqueToAdd.length} topics with checklist items from Brototype!`,
          type: 'success',
        });
      }
      setTimeout(() => setBrototypeMsg(null), 5000);
    } catch (err: any) {
      setBrototypeMsg({
        title: 'Sync Notice',
        text: `Failed to load tasks: ${err?.message || 'Check connection'}`,
        type: 'error',
      });
      setTimeout(() => setBrototypeMsg(null), 5000);
    } finally {
      setBrototypeLoading(false);
    }
  };

  const isOverdue = (todo: Todo) => todo.dueDate && new Date(todo.dueDate) < new Date() && todo.status !== 'done';

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: selectedTaskId ? '100%' : 1440, margin: '0 auto', overflowX: 'hidden', width: '100%' }} className="fade-in">
      <style>{`
        @keyframes pulseAura {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.22); opacity: 0.6; }
        }
        @keyframes modalPop {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes overlayFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes toastSlide {
          0% { opacity: 0; transform: translateY(-8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .subitem-row:hover {
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: rgba(139, 92, 246, 0.35) !important;
        }
        .task-action-btn:hover {
          color: #fff !important;
          background: rgba(255, 255, 255, 0.08) !important;
        }
        .task-delete-btn:hover {
          color: #ef4444 !important;
          background: rgba(239, 68, 68, 0.12) !important;
        }
      `}</style>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16, width: '100%' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📋 Tasks & Topics
            </h1>
            <span style={{ fontSize: 13, background: 'var(--bg-tertiary)', padding: '3px 10px', borderRadius: 12, color: 'var(--text-muted)' }}>
              {todos.length} total
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, margin: '4px 0 0' }}>
            Interactive topics with sub-items checklist, customizable priority, and drag-and-drop board.
          </p>
        </div>

        {/* View Toggle + Action Buttons (wraps cleanly, never causes horizontal scroll) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setViewMode('board')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === 'board' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'board' ? '#fff' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              📌 Board View
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === 'list' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'list' ? '#fff' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              📑 List View
            </button>
          </div>

          <button
            onClick={handleLoadBrototypeTasks}
            disabled={brototypeLoading}
            style={brototypeBtnStyle}
          >
            <span style={{ fontSize: 15 }}>⚡</span>
            <span>{brototypeLoading ? 'Fetching Topics…' : 'Load Tasks from Brototype'}</span>
          </button>

          <button
            onClick={() => {
              setShowForm(true);
              setEditId(null);
              setForm({
                title: '',
                topicHeading: '',
                description: '',
                priority: 'medium',
                dueDate: '',
                status: 'todo',
              });
            }}
            style={btnStyle}
          >
            + New Task
          </button>

          {todos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeleteAllStep(1);
                setShowDeleteAllModal(true);
              }}
              title="Delete all tasks from workspace"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.22)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
              }}
            >
              <span style={{ fontSize: 14 }}>🗑️</span>
              <span>Delete All</span>
            </button>
          )}
        </div>
      </div>

      {/* Brototype Feedback Banner / Toast */}
      {brototypeMsg && (
        <div
          style={{
            padding: '14px 20px',
            borderRadius: 12,
            marginBottom: 24,
            fontSize: 13.5,
            background:
              brototypeMsg.type === 'error'
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(185, 28, 28, 0.12) 100%)'
                : brototypeMsg.type === 'info'
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(37, 99, 235, 0.12) 100%)'
                : 'linear-gradient(135deg, rgba(124, 58, 237, 0.16) 0%, rgba(99, 102, 241, 0.12) 100%)',
            border:
              brototypeMsg.type === 'error'
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : brototypeMsg.type === 'info'
                ? '1px solid rgba(59, 130, 246, 0.4)'
                : '1px solid rgba(139, 92, 246, 0.4)',
            boxShadow:
              brototypeMsg.type === 'error'
                ? '0 8px 24px rgba(239, 68, 68, 0.15)'
                : brototypeMsg.type === 'info'
                ? '0 8px 24px rgba(59, 130, 246, 0.15)'
                : '0 8px 24px rgba(139, 92, 246, 0.15)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            animation: 'toastSlide 0.25s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
                background:
                  brototypeMsg.type === 'error'
                    ? 'rgba(239, 68, 68, 0.25)'
                    : brototypeMsg.type === 'info'
                    ? 'rgba(59, 130, 246, 0.25)'
                    : 'rgba(124, 58, 237, 0.25)',
              }}
            >
              {brototypeMsg.type === 'error' ? '⚠️' : brototypeMsg.type === 'info' ? 'ℹ️' : '🎉'}
            </div>
            <div>
              {brototypeMsg.title && (
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color:
                      brototypeMsg.type === 'error'
                        ? '#fca5a5'
                        : brototypeMsg.type === 'info'
                        ? '#93c5fd'
                        : '#c4b5fd',
                    marginBottom: 2,
                  }}
                >
                  {brototypeMsg.title}
                </div>
              )}
              <div
                style={{
                  color: 'var(--text-primary)',
                  fontSize: 13.5,
                  lineHeight: 1.45,
                }}
              >
                {brototypeMsg.text}
              </div>
            </div>
          </div>

          <button
            onClick={() => setBrototypeMsg(null)}
            title="Dismiss"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: 'var(--text-muted)',
              width: 26,
              height: 26,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 13 }}>Loading tasks…</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && todos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📚</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No tasks yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, maxWidth: 460, margin: '0 auto 20px' }}>
            Click &ldquo;Load Tasks from Brototype&rdquo; to automatically pull your curriculum topics, headings, and detailed sub-item checklists!
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={handleLoadBrototypeTasks} style={brototypeBtnStyle}>
              ⚡ Load Tasks from Brototype
            </button>
            <button onClick={() => setShowForm(true)} style={btnStyle}>
              + Create Task
            </button>
          </div>
        </div>
      )}

      {/* 📌 MAIN TASKS AREA + NOTION-STYLE SIDE MENU SPLIT VIEW */}
      {!loading && todos.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 20,
            alignItems: 'flex-start',
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Left: The board/list view area */}
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
            {/* 📌 KANBAN BOARD VIEW (Drag & Drop) */}
            {viewMode === 'board' && (
              <div
                style={{
                  width: '100%',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 16,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: selectedTaskId ? 'repeat(3, minmax(260px, 1fr))' : 'repeat(3, minmax(280px, 1fr))',
                    gap: 16,
                    alignItems: 'start',
                    minWidth: 820,
                  }}
                >
                  {COLUMNS.map((col) => {
                    const colTodos = todos.filter((t) => t.status === col.id);
                    const isTarget = dragOverCol === col.id;

                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => handleDragOverCol(e, col.id)}
                        onDrop={(e) => handleDropOnCol(e, col.id)}
                        style={{
                          background: isTarget ? 'rgba(124, 58, 237, 0.08)' : 'var(--bg-secondary)',
                          border: isTarget ? '2px dashed var(--accent)' : '1px solid var(--border)',
                          borderRadius: 14,
                          padding: 16,
                          minHeight: 520,
                          display: 'flex',
                          flexDirection: 'column',
                          transition: 'background 0.15s, border-color 0.15s',
                        }}
                      >
                        {/* Column Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>{col.icon}</span>
                            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{col.title}</span>
                          </div>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-muted)',
                          }}>
                            {colTodos.length}
                          </span>
                        </div>

                        {/* Column Drop Area & Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                          {colTodos.map((todo) => (
                            <TaskCard
                              key={todo.id}
                              todo={todo}
                              isSelected={selectedTaskId === todo.id}
                              onSelect={() => setSelectedTaskId(selectedTaskId === todo.id ? null : todo.id)}
                              isDragging={draggedTodoId === todo.id}
                              onDragStart={(e) => handleDragStart(e, todo.id)}
                              onDragEnd={handleDragEnd}
                              onDropOnCard={(e) => handleDropOnCard(e, todo.id, col.id)}
                              onToggleStatus={() => handleStatusToggle(todo)}
                              onToggleSubItem={(subId) => handleToggleSubItem(todo.id, subId)}
                              onChangePriority={(p) => handleChangePriority(todo.id, p)}
                              onEdit={() => handleEdit(todo)}
                              onDelete={() => promptDelete(todo)}
                              onOpenLearnings={() => openLearningsModal(todo)}
                              isOverdue={Boolean(isOverdue(todo))}
                              isExpanded={Boolean(expandedItems[todo.id])}
                              onToggleExpand={() => toggleExpand(todo.id)}
                              isPriorityMenuOpen={priorityMenuId === todo.id}
                              onTogglePriorityMenu={() => setPriorityMenuId(priorityMenuId === todo.id ? null : todo.id)}
                            />
                          ))}

                          {colTodos.length === 0 && (
                            <div style={{
                              padding: 24,
                              textAlign: 'center',
                              color: 'var(--text-muted)',
                              fontSize: 13,
                              border: '1px dashed rgba(255, 255, 255, 0.08)',
                              borderRadius: 10,
                              marginTop: 8,
                            }}>
                              Drop tasks here
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 📑 LIST VIEW */}
            {viewMode === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {todos.map((todo) => (
                  <TaskCard
                    key={todo.id}
                    todo={todo}
                    isSelected={selectedTaskId === todo.id}
                    onSelect={() => setSelectedTaskId(selectedTaskId === todo.id ? null : todo.id)}
                    isDragging={draggedTodoId === todo.id}
                    onDragStart={(e) => handleDragStart(e, todo.id)}
                    onDragEnd={handleDragEnd}
                    onDropOnCard={(e) => handleDropOnCard(e, todo.id, todo.status)}
                    onToggleStatus={() => handleStatusToggle(todo)}
                    onToggleSubItem={(subId) => handleToggleSubItem(todo.id, subId)}
                    onChangePriority={(p) => handleChangePriority(todo.id, p)}
                    onEdit={() => handleEdit(todo)}
                    onDelete={() => promptDelete(todo)}
                    onOpenLearnings={() => openLearningsModal(todo)}
                    isOverdue={Boolean(isOverdue(todo))}
                    isExpanded={Boolean(expandedItems[todo.id])}
                    onToggleExpand={() => toggleExpand(todo.id)}
                    isPriorityMenuOpen={priorityMenuId === todo.id}
                    onTogglePriorityMenu={() => setPriorityMenuId(priorityMenuId === todo.id ? null : todo.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: Notion-style Side Menu Detailed View */}
          {selectedTodo && (
            <div
              style={{
                width: 'min(500px, 44vw)',
                flexShrink: 0,
                position: 'sticky',
                top: 20,
                maxHeight: 'calc(100vh - 40px)',
                zIndex: 40,
              }}
            >
              <TaskDetailSideMenu
                todo={selectedTodo}
                onClose={() => setSelectedTaskId(null)}
                onToggleStatus={(newStatus) => handleUpdateTaskStatus(selectedTodo.id, newStatus)}
                onToggleSubItem={(subId) => handleToggleSubItem(selectedTodo.id, subId)}
                onChangePriority={(p) => handleChangePriority(selectedTodo.id, p)}
                onChangeDueDate={(date) => handleUpdateTaskDueDate(selectedTodo.id, date)}
                onAddSubItem={(text) => handleAddSubItemToTask(selectedTodo.id, text)}
                onAddComment={(text) => handleAddComment(selectedTodo.id, text)}
                onEdit={() => handleEdit(selectedTodo)}
                onDelete={() => promptDelete(selectedTodo)}
                onOpenLearnings={() => openLearningsModal(selectedTodo)}
              />
            </div>
          )}
        </div>
      )}

      {/* 🚀 Portaled Modals (Mount to document.body to prevent parent container transform clipping) */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <>
          {/* Create / Edit Modal */}
          {showForm && (
        <div style={overlayStyle} onClick={() => setShowForm(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20, fontWeight: 600, fontSize: 17 }}>
              {editId ? 'Edit Task & Topics' : 'New Task / Topic Module'}
            </h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Task Title *</label>
                <input
                  placeholder="e.g. JavaScript Core Concepts"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Topic Heading / Group (optional)</label>
                <input
                  placeholder="e.g. Topic 1: Communication & Storytelling"
                  value={form.topicHeading}
                  onChange={(e) => setForm({ ...form, topicHeading: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Detailed Items & Checklist (Sub-items will be auto-parsed into checkboxes!)
                </label>
                <textarea
                  placeholder={`a. What is AI to prompt
b. Basic prompt structure (task + context)
c. Using AI for:
i. Concept explanation
ii. Simple logic understanding
d. Observing incorrect outputs`}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Todo['priority'] })}
                    style={inputStyle}
                  >
                    <option value="low">🟢 Low</option>
                    <option value="medium">🔵 Medium</option>
                    <option value="high">🟡 High</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Todo['status'] })}
                    style={inputStyle}
                  >
                    <option value="todo">📌 To Do</option>
                    <option value="in_progress">⏳ In Progress</option>
                    <option value="done">✅ Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Due Date (optional)</label>
                <CustomDatePicker
                  value={form.dueDate}
                  onChange={(d) => setForm({ ...form, dueDate: d })}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={cancelBtnStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnStyle}>
                  {saving ? 'Saving…' : editId ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🗑️ Premium Custom Delete Confirmation Modal */}
      {deleteConfirmTodo && (
        <div style={overlayStyle} onClick={() => !deleting && setDeleteConfirmTodo(null)}>
          <div
            style={deleteModalCardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Glowing Red Accent Strip */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '10%',
                right: '10%',
                height: 2,
                background: 'linear-gradient(90deg, transparent, #ef4444, #f87171, transparent)',
                boxShadow: '0 0 16px rgba(239, 68, 68, 0.8)',
              }}
            />

            {/* Warning Aura Badge */}
            <div style={deleteBadgeWrapStyle}>
              <div style={deleteBadgeAuraStyle} />
              <div style={deleteBadgeIconStyle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6" />
                </svg>
              </div>
            </div>

            <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 6px', textAlign: 'center', letterSpacing: '-0.3px' }}>
              Delete Task & Sub-topics?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.5 }}>
              Are you sure you want to delete this task? All sub-topic checklist progress will be permanently removed.
            </p>

            {/* Target Card Preview */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              borderLeft: '4px solid #ef4444',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 22,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 22, marginTop: 1 }}>📌</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deleteConfirmTodo.title}
                  </div>
                  {deleteConfirmTodo.topicHeading && (
                    <div style={{ fontSize: 11.5, color: 'var(--accent, #a78bfa)', fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {deleteConfirmTodo.topicHeading}
                    </div>
                  )}

                  {/* Checklist & Priority Badges */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {deleteConfirmTodo.subItems && deleteConfirmTodo.subItems.length > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(124, 58, 237, 0.18)',
                          color: '#c4b5fd',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                        }}
                      >
                        ✓ {deleteConfirmTodo.subItems.length} sub-topics
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: PRIORITY_CONFIG[deleteConfirmTodo.priority]?.bg || 'rgba(255,255,255,0.06)',
                        color: PRIORITY_CONFIG[deleteConfirmTodo.priority]?.color || '#cbd5e1',
                      }}
                    >
                      {PRIORITY_CONFIG[deleteConfirmTodo.priority]?.label || 'Medium'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmTodo(null)}
                disabled={deleting}
                style={cancelBtnStyle}
              >
                <span>Cancel</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-muted)',
                    marginLeft: 6,
                  }}
                >
                  Esc
                </span>
              </button>
              <button
                type="button"
                onClick={() => executeDelete(deleteConfirmTodo)}
                disabled={deleting}
                style={dangerBtnStyle}
              >
                {deleting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    Deleting…
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🗑️ Delete Task</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(0, 0, 0, 0.25)',
                        color: '#fecaca',
                      }}
                    >
                      ↵
                    </span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🗑️ Premium 2-Step "Delete All" Confirmation Modal */}
      {showDeleteAllModal && (
        <div style={overlayStyle} onClick={() => { if (!deletingAll) { setShowDeleteAllModal(false); setDeleteAllStep(1); } }}>
          <div
            style={deleteModalCardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Glowing Red Accent Strip */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '10%',
                right: '10%',
                height: 2,
                background: 'linear-gradient(90deg, transparent, #ef4444, #f87171, transparent)',
                boxShadow: '0 0 16px rgba(239, 68, 68, 0.8)',
              }}
            />

            {/* Warning Aura Badge */}
            <div style={deleteBadgeWrapStyle}>
              <div style={deleteBadgeAuraStyle} />
              <div style={deleteBadgeIconStyle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6" />
                </svg>
              </div>
            </div>

            {deleteAllStep === 1 ? (
              <>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 6px', textAlign: 'center', letterSpacing: '-0.3px' }}>
                  Delete All Tasks?
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.5 }}>
                  This will permanently remove <strong style={{ color: '#f87171' }}>{todos.length}</strong> task{todos.length !== 1 ? 's' : ''} and all associated sub-topic progress from your workspace.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteAllModal(false); setDeleteAllStep(1); }}
                    style={cancelBtnStyle}
                  >
                    <span>Cancel</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', marginLeft: 6 }}>Esc</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteAllStep(2)}
                    style={dangerBtnStyle}
                  >
                    ⚠️ Yes, Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fca5a5', margin: '0 0 6px', textAlign: 'center', letterSpacing: '-0.3px' }}>
                  ⚠️ Final Confirmation
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.5 }}>
                  This action <strong style={{ color: '#ef4444' }}>cannot be undone</strong>. Are you absolutely sure you want to delete everything?
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteAllModal(false); setDeleteAllStep(1); }}
                    disabled={deletingAll}
                    style={cancelBtnStyle}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => executeDeleteAll()}
                    disabled={deletingAll}
                    style={{ ...dangerBtnStyle, background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}
                  >
                    {deletingAll ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                        Deleting All…
                      </span>
                    ) : (
                      '🗑️ Delete All Permanently'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

          {/* 🧠 What I Learned Modal */}
          {learningModalTodo && (
            <div style={overlayStyle} onClick={() => !savingLearnings && !creatingPage && setLearningModalTodo(null)}>
              <div style={{ ...modalStyle, maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(59, 130, 246, 0.25) 100%)',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      🧠
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#fff' }}>
                        What I Learned
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {learningModalTodo.title}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLearningModalTodo(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ ...labelStyle, margin: 0 }}>Quick Reflections & Notes</label>
                    <button
                      type="button"
                      disabled={isGeneratingAiNotes}
                      onClick={async () => {
                        if (!learningModalTodo) return;
                        setIsGeneratingAiNotes(true);
                        try {
                          const aiGenerated = await generateLearningNotesForTask(
                            learningModalTodo.title,
                            learningModalTodo.description || learningModalTodo.subItems?.map(s => s.text).join(', ')
                          );
                          setLearningNotesDraft(prev => prev ? `${prev}\n\n${aiGenerated}` : aiGenerated);
                        } catch (err: any) {
                          alert('AI generation failed: ' + (err.message || 'Please check API connection'));
                        } finally {
                          setIsGeneratingAiNotes(false);
                        }
                      }}
                      style={{
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        color: '#c7d2fe',
                        padding: '3px 9px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: isGeneratingAiNotes ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {isGeneratingAiNotes ? '✨ Generating...' : '✨ Draft with AI'}
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={learningNotesDraft}
                    onChange={(e) => setLearningNotesDraft(e.target.value)}
                    placeholder="Write what you understood, key concepts, technical insights, or code patterns you learned from this task..."
                    style={{
                      ...inputStyle,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      lineHeight: 1.55,
                    }}
                  />
                </div>

                {/* Checklist topics overview */}
                {learningModalTodo.subItems && learningModalTodo.subItems.length > 0 && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 16,
                    fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>
                      Checklist Topics:
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {learningModalTodo.subItems.map((s) => s.prefix).join(', ')} ({learningModalTodo.subItems.filter((s) => s.completed).length}/{learningModalTodo.subItems.length} completed)
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
                  <button
                    type="button"
                    onClick={handleCreateLearningsPage}
                    disabled={creatingPage || savingLearnings}
                    style={{
                      background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(59, 130, 246, 0.25) 100%)',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      color: '#c4b5fd',
                      borderRadius: 8,
                      padding: '9px 14px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>📄</span>
                    <span>{creatingPage ? 'Creating Notion Page…' : 'Create & Open Full Page'}</span>
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setLearningModalTodo(null)}
                      style={cancelBtnStyle}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveLearnings}
                      disabled={savingLearnings}
                      style={btnStyle}
                    >
                      {savingLearnings ? 'Saving…' : 'Save Notes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}

      {/* Brototype Login Modal */}
      <BrototypeModal
        isOpen={isBrototypeModalOpen}
        onClose={() => setIsBrototypeModalOpen(false)}
        onSuccess={() => handleLoadBrototypeTasks()}
      />
    </div>
  );
}

// 📅 Modern Custom Date Picker Component with Quick Presets & Calendar
interface CustomDatePickerProps {
  value?: string;
  onChange: (dateStr: string) => void;
}

function CustomDatePicker({ value, onChange }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getDisplayLabel = () => {
    if (!value) return 'Set due date…';
    const selected = new Date(value + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = selected.toDateString() === today.toDateString();
    const isTomorrow = selected.toDateString() === tomorrow.toDateString();

    const formatted = selected.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: selected.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });

    if (isToday) return `⚡ Today (${formatted})`;
    if (isTomorrow) return `🌅 Tomorrow (${formatted})`;
    return `📅 ${formatted}`;
  };

  const setPreset = (daysFromNow: number | null) => {
    if (daysFromNow === null) {
      onChange('');
    } else {
      const d = new Date();
      d.setDate(d.getDate() + daysFromNow);
      onChange(formatDateStr(d));
    }
    setIsOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const todayStr = formatDateStr(new Date());

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-tertiary, #161622)',
          border: isOpen ? '1px solid var(--accent, #7c3aed)' : '1px solid var(--border)',
          borderRadius: 8,
          padding: '9px 12px',
          cursor: 'pointer',
          color: value ? 'var(--text-primary, #fff)' : 'var(--text-muted, #94a3b8)',
          fontSize: 13,
          transition: 'all 0.15s ease',
          boxShadow: isOpen ? '0 0 0 2px rgba(124, 58, 237, 0.2)' : 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{value ? '📅' : '🗓️'}</span>
          <span style={{ fontWeight: value ? 600 : 400 }}>{getDisplayLabel()}</span>
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            title="Clear date"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: 11,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Popover Calendar */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100005,
            background: '#1a1a26',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            borderRadius: 12,
            padding: 14,
            width: 290,
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.75), 0 0 20px rgba(124, 58, 237, 0.15)',
            animation: 'modalPop 0.15s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Quick Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              type="button"
              onClick={() => setPreset(0)}
              style={presetBtnStyle}
            >
              ⚡ Today
            </button>
            <button
              type="button"
              onClick={() => setPreset(1)}
              style={presetBtnStyle}
            >
              🌅 Tomorrow
            </button>
            <button
              type="button"
              onClick={() => setPreset(7)}
              style={presetBtnStyle}
            >
              📆 +1 Week
            </button>
            {value && (
              <button
                type="button"
                onClick={() => setPreset(null)}
                style={{ ...presetBtnStyle, color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                🚫 Clear
              </button>
            )}
          </div>

          {/* Month Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button
              type="button"
              onClick={prevMonth}
              style={navArrowBtnStyle}
            >
              ‹
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {monthName}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              style={navArrowBtnStyle}
            >
              ›
            </button>
          </div>

          {/* Day of week labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: 4 }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d} style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', fontWeight: 600, padding: '4px 0' }}>
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const cellDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = cellDateStr === value;
              const isToday = cellDateStr === todayStr;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => {
                    onChange(cellDateStr);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '7px 0',
                    border: 'none',
                    borderRadius: 6,
                    background: isSelected
                      ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)'
                      : isToday
                      ? 'rgba(124, 58, 237, 0.15)'
                      : 'transparent',
                    color: isSelected ? '#fff' : isToday ? '#a78bfa' : 'var(--text-secondary, #e2e8f0)',
                    fontWeight: isSelected || isToday ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    boxShadow: isSelected ? '0 2px 8px rgba(124, 58, 237, 0.4)' : 'none',
                    outline: isToday && !isSelected ? '1px solid rgba(139, 92, 246, 0.5)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = isToday ? 'rgba(124, 58, 237, 0.15)' : 'transparent';
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const presetBtnStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 6,
  padding: '4px 8px',
  color: 'var(--text-secondary, #e2e8f0)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const navArrowBtnStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.08)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  cursor: 'pointer',
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
};

// Sub-component for individual Task Card with Sub-Items Checklist & Drag and Drop
interface TaskCardProps {
  todo: Todo;
  isDragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDropOnCard: (e: DragEvent) => void;
  onToggleStatus: () => void;
  onToggleSubItem: (id: string) => void;
  onChangePriority: (p: Todo['priority']) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLearnings: () => void;
  isOverdue: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isPriorityMenuOpen: boolean;
  onTogglePriorityMenu: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

function TaskCard({
  todo,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropOnCard,
  onToggleStatus,
  onToggleSubItem,
  onChangePriority,
  onEdit,
  onDelete,
  onOpenLearnings,
  isOverdue,
  isExpanded,
  onToggleExpand,
  isPriorityMenuOpen,
  onTogglePriorityMenu,
  isSelected = false,
  onSelect,
}: TaskCardProps) {
  const pConf = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.medium;
  const subItems = todo.subItems || [];
  const completedCount = subItems.filter((s) => s.completed).length;
  const progressPercent = subItems.length > 0 ? Math.round((completedCount / subItems.length) * 100) : 0;

  const visibleSubItems = isExpanded ? subItems : subItems.slice(0, 4);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnCard}
      onClick={onSelect}
      style={{
        background: 'var(--bg-tertiary, #1a1a24)',
        border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
        cursor: 'pointer',
        opacity: isDragging ? 0.35 : 1,
        transition: 'all 0.15s ease',
        boxShadow: isSelected ? '0 0 0 3px rgba(59, 130, 246, 0.25), 0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
      }}
    >
      {/* Top Meta: Topic Heading & Priority Customizer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        {todo.topicHeading ? (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {todo.topicHeading}
          </span>
        ) : (
          <span />
        )}

        {/* Priority Badge with Click-to-Customize Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePriorityMenu();
            }}
            title="Click to change priority"
            style={{
              background: pConf.bg,
              color: pConf.color,
              border: `1px solid ${pConf.color}40`,
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <span>{pConf.label}</span>
            <span style={{ fontSize: 9 }}>▾</span>
          </button>

          {isPriorityMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 4,
                zIndex: 50,
                boxShadow: 'var(--shadow-lg)',
                minWidth: 100,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {(['low', 'medium', 'high', 'urgent'] as const).map((pr) => (
                <button
                  key={pr}
                  onClick={() => onChangePriority(pr)}
                  style={{
                    width: '100%',
                    background: todo.priority === pr ? 'var(--bg-tertiary)' : 'transparent',
                    border: 'none',
                    color: PRIORITY_CONFIG[pr].color,
                    padding: '6px 10px',
                    fontSize: 12,
                    textAlign: 'left',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {PRIORITY_CONFIG[pr].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Task Title & Status Toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus();
          }}
          title={todo.status === 'done' ? 'Mark Incomplete' : 'Mark Completed'}
          style={{
            width: 19,
            height: 19,
            borderRadius: 5,
            marginTop: 2,
            flexShrink: 0,
            cursor: 'pointer',
            border: todo.status === 'done' ? 'none' : '2px solid var(--border-light)',
            background: todo.status === 'done' ? 'var(--accent)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 12,
            transition: 'all 0.15s ease',
          }}
        >
          {todo.status === 'done' && '✓'}
        </button>

        <h4 style={{
          fontSize: 14,
          fontWeight: 600,
          margin: 0,
          lineHeight: 1.4,
          flex: 1,
          color: todo.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: todo.status === 'done' ? 'line-through' : 'none',
        }}>
          {todo.title}
        </h4>
      </div>

      {/* Sub-Items Progress Bar */}
      {subItems.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Checklist ({completedCount}/{subItems.length})</span>
            <span>{progressPercent}%</span>
          </div>
          <div style={{ width: '100%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: progressPercent === 100 ? '#22c55e' : 'linear-gradient(90deg, #7c3aed, #3b82f6)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Beautiful Custom Checkbox Sub-Items Checklist */}
      {subItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {visibleSubItems.map((sub) => {
            const isNested = (sub.indent || 0) > 0;
            return (
              <div
                key={sub.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubItem(sub.id);
                }}
                className="subitem-row"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '7px 10px',
                  borderRadius: 8,
                  background: sub.completed
                    ? 'rgba(16, 185, 129, 0.05)'
                    : isNested
                    ? 'rgba(56, 189, 248, 0.03)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: sub.completed
                    ? '1px solid rgba(16, 185, 129, 0.22)'
                    : isNested
                    ? '1px solid rgba(56, 189, 248, 0.15)'
                    : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  marginLeft: isNested ? 16 : 0,
                  position: 'relative',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {/* Visual Branch Line for nested sub-topics */}
                {isNested && (
                  <div
                    style={{
                      position: 'absolute',
                      left: -11,
                      top: 14,
                      width: 8,
                      height: 8,
                      borderLeft: '2px solid rgba(56, 189, 248, 0.4)',
                      borderBottom: '2px solid rgba(56, 189, 248, 0.4)',
                      borderBottomLeftRadius: 4,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Custom Modern Animated Checkbox */}
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    marginTop: 1.5,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: sub.completed ? 'none' : '1.5px solid rgba(255, 255, 255, 0.28)',
                    background: sub.completed
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    boxShadow: sub.completed
                      ? '0 2px 8px rgba(16, 185, 129, 0.45)'
                      : 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: sub.completed ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {sub.completed && (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                {/* Sub-topic Prefix Badge */}
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    padding: '2px 6px',
                    borderRadius: 5,
                    background: sub.completed
                      ? 'rgba(16, 185, 129, 0.15)'
                      : isNested
                      ? 'rgba(56, 189, 248, 0.15)'
                      : 'rgba(124, 58, 237, 0.18)',
                    color: sub.completed
                      ? '#34d399'
                      : isNested
                      ? '#38bdf8'
                      : '#c4b5fd',
                    border: sub.completed
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : isNested
                      ? '1px solid rgba(56, 189, 248, 0.3)'
                      : '1px solid rgba(124, 58, 237, 0.32)',
                    flexShrink: 0,
                    marginTop: 0.5,
                    letterSpacing: '0.2px',
                  }}
                >
                  {sub.prefix}
                </span>

                {/* Sub-item Content Text */}
                <span
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.48,
                    color: sub.completed ? 'var(--text-muted, #64748b)' : 'var(--text-secondary, #e2e8f0)',
                    textDecoration: sub.completed ? 'line-through' : 'none',
                    textDecorationColor: 'rgba(52, 211, 153, 0.5)',
                    opacity: sub.completed ? 0.72 : 1,
                    flex: 1,
                    transition: 'all 0.18s ease',
                  }}
                >
                  {sub.text}
                </span>
              </div>
            );
          })}

          {subItems.length > 4 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'left',
                padding: '2px 6px',
                fontWeight: 500,
              }}
            >
              {isExpanded ? '▴ Show fewer items' : `▾ Show all ${subItems.length} items`}
            </button>
          )}
        </div>
      )}

      {/* Tags & Due Date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {todo.tags?.slice(0, 3).map((tag) => (
            <span key={tag} style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: tag.toLowerCase().includes('brototype') ? 'rgba(124, 58, 237, 0.2)' : 'var(--bg-secondary)',
              color: tag.toLowerCase().includes('brototype') ? '#a78bfa' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
              {tag}
            </span>
          ))}
          {todo.dueDate && (
            <span style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}>
              📅 {new Date(todo.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {/* 🧠 What I Learned Button / Badge */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLearnings();
            }}
            title={todo.pageId ? 'Open Connected Notion Learnings Page' : 'Add Notes or Create Page about What You Learned'}
            style={{
              background: todo.pageId ? 'rgba(124, 58, 237, 0.22)' : 'rgba(255, 255, 255, 0.05)',
              border: todo.pageId ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid var(--border)',
              borderRadius: 6,
              padding: '3px 8px',
              color: todo.pageId ? '#c4b5fd' : 'var(--text-secondary, #cbd5e1)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            <span>🧠</span>
            <span>{todo.pageId ? 'Learnings Page ↗' : 'Learnings'}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit Task"
            className="task-action-btn"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '3px 6px', borderRadius: 5, fontSize: 13, transition: 'all 0.15s' }}
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete Task"
            className="task-delete-btn"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '3px 6px', borderRadius: 5, fontSize: 13, transition: 'all 0.15s' }}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)',
};

const brototypeBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
  color: '#c4b5fd',
  border: '1px solid rgba(139, 92, 246, 0.4)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'all 0.15s',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  marginBottom: 4,
  display: 'block',
  fontWeight: 500,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  animation: 'overlayFadeIn 0.15s ease-out',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-secondary, #1a1a24)',
  border: '1px solid var(--border-light, #2e2e3e)',
  borderRadius: 16,
  padding: '28px',
  width: '100%',
  maxWidth: 540,
  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
  position: 'relative',
  zIndex: 100000,
  color: 'var(--text-primary, #fff)',
  animation: 'modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
};

const deleteModalCardStyle: React.CSSProperties = {
  background: '#161622',
  border: '1.5px solid rgba(239, 68, 68, 0.45)',
  borderRadius: 18,
  padding: '30px 28px 24px',
  width: '100%',
  maxWidth: 440,
  boxShadow: '0 25px 65px -12px rgba(0, 0, 0, 0.95), 0 0 35px rgba(239, 68, 68, 0.25)',
  position: 'relative',
  overflow: 'hidden',
  color: '#ffffff',
  zIndex: 100000,
  animation: 'modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
};

const deleteBadgeWrapStyle: React.CSSProperties = {
  position: 'relative',
  width: 58,
  height: 58,
  margin: '0 auto 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const deleteBadgeAuraStyle: React.CSSProperties = {
  position: 'absolute',
  inset: -4,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, rgba(239, 68, 68, 0) 70%)',
  animation: 'pulseAura 2s ease-in-out infinite',
};

const deleteBadgeIconStyle: React.CSSProperties = {
  position: 'relative',
  width: 50,
  height: 50,
  borderRadius: '50%',
  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.1) 100%)',
  border: '1.5px solid rgba(239, 68, 68, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.25)',
};
