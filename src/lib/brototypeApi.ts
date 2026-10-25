/**
 * Client-side integration for Brototype Student API
 * Calls https://v3-api.brototype.com/student-api directly with CORS support
 */

import axios from 'axios';
import { todoApi } from './api';

const BROTOTYPE_API_BASE = 'https://v3-api.brototype.com/student-api';

export interface BrototypeUser {
  studentId: string;
  name: string;
  mobile: string;
  email: string;
  domainName: string;
  batchName: string;
  courseName: string;
  isActive: boolean;
}

export interface BrototypeTaskTopic {
  taskAssignmentTopicId: number;
  taskAssignmentTopicIdentifier: string;
  topicName: string;
  description: string;
  resources: any[];
}



export interface BrototypeTask {
  taskAssignmentId: number;
  taskAssignmentIdentifier: string;
  masterTaskId: number;
  taskname: string;
  tasktype: string;
  description: string;
  taskStatus: string;
  remarks: string | null;
  assignedAt: string;
  topicsCount: number;
  topics?: BrototypeTaskTopic[];
  semesterName: string;
  paperName: string;
  moduleName: string;
  semesterNumber: number;
  paperNumber: number;
}

export interface BrototypeDashboard {
  domainName: string;
  stats: {
    totalSemesters: number;
    papersCleared: number;
    papersAttended: number;
    pendingPaperExams: number;
    avgFinalScore: number;
    relearnRequestsCount: number;
    relearnPaymentAmount: number;
    pendingRelearnPaymentAmount: number;
    isCourseExpired: boolean;
  };
  semesters: Array<{
    semesterTemplateId: number;
    semesterName: string;
    semesterNumber: number;
    progressPercent: number;
    subtitle: string;
  }>;
}

export const getSavedBrototypeToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('brototype_token');
};

export const getSavedBrototypeUser = (): BrototypeUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('brototype_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const disconnectBrototype = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('brototype_token');
    localStorage.removeItem('brototype_user');
    window.dispatchEvent(new Event('brototype_auth_changed'));
  }
};

const createBrototypeClient = () => {
  const token = getSavedBrototypeToken();
  return axios.create({
    baseURL: BROTOTYPE_API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 20000,
  });
};

export const brototypeLogin = async (mobile: string, password: string) => {
  const res = await axios.post(`${BROTOTYPE_API_BASE}/auth/signIn`, {
    mobile: mobile.trim(),
    password: password.trim(),
  });

  if (res.data?.success && res.data?.token) {
    const token = res.data.token;
    const user = res.data.data?.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem('brototype_token', token);
      localStorage.setItem('brototype_user', JSON.stringify(user));
      window.dispatchEvent(new Event('brototype_auth_changed'));
    }
    return { token, user };
  }
  throw new Error('Login failed: Token not received.');
};

export const fetchBrototypeDashboard = async (): Promise<BrototypeDashboard> => {
  const client = createBrototypeClient();
  const res = await client.get('/student/dashboard');
  return res.data.data;
};

export const fetchBrototypeTasks = async (): Promise<BrototypeTask[]> => {
  const client = createBrototypeClient();
  const res = await client.get('/student/tasks');
  return res.data.data || [];
};

export const fetchBrototypeTaskDetail = async (taskAssignmentIdentifier: string): Promise<BrototypeTask> => {
  const client = createBrototypeClient();
  const cleanId = taskAssignmentIdentifier.replace(/^id/i, '').trim();
  const res = await client.get(`/student/tasks/${cleanId}`);
  return res.data.data;
};

export interface SubItem {
  id: string;
  prefix: string;
  text: string;
  completed: boolean;
  indent?: number;
}

export const parseTopicSubItems = (description: string): SubItem[] => {
  if (!description) return [];
  const lines = description.split('\n');
  const items: SubItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect indentation/sub-bullets like i., ii., a., 1., etc.
    const isRoman = /^[ivxlcdm]+\.\s*(.+)/i.exec(line);
    const isAlpha = /^([a-zA-Z]\.|\([a-zA-Z]\))\s*(.+)/i.exec(line);
    const isNum = /^(\d+[.)]|\(\d+\))\s*(.+)/i.exec(line);
    const isBullet = /^([-*•►▪▫])\s*(.+)/.exec(line);

    if (isRoman) {
      items.push({
        id: `sub-${Math.random().toString(36).substring(2, 9)}`,
        prefix: line.split(/\s+/)[0],
        text: isRoman[1].trim(),
        completed: false,
        indent: 1,
      });
    } else if (isAlpha) {
      items.push({
        id: `sub-${Math.random().toString(36).substring(2, 9)}`,
        prefix: isAlpha[1],
        text: isAlpha[2].trim(),
        completed: false,
        indent: 0,
      });
    } else if (isNum) {
      items.push({
        id: `sub-${Math.random().toString(36).substring(2, 9)}`,
        prefix: isNum[1],
        text: isNum[2].trim(),
        completed: false,
        indent: 0,
      });
    } else if (isBullet) {
      items.push({
        id: `sub-${Math.random().toString(36).substring(2, 9)}`,
        prefix: isBullet[1],
        text: isBullet[2].trim(),
        completed: false,
        indent: 0,
      });
    } else if (line.length > 2 && line.length < 180 && !line.startsWith('http') && !line.startsWith('//')) {
      items.push({
        id: `sub-${Math.random().toString(36).substring(2, 9)}`,
        prefix: '•',
        text: line,
        completed: false,
        indent: 0,
      });
    }
  }

  return items;
};

export const syncTaskToNotiqTodos = async (task: BrototypeTask, workspaceId?: string): Promise<any[]> => {
  if (task.tasktype && task.tasktype.trim().toLowerCase() !== 'technical') {
    throw new Error('Only Technical tasks can be synced.');
  }

  // 1. Fetch full details if topics are not already loaded
  let fullTask: BrototypeTask = task;
  if (!fullTask.topics || fullTask.topics.length === 0) {
    try {
      fullTask = await fetchBrototypeTaskDetail(task.taskAssignmentIdentifier);
    } catch {
      fullTask = task;
    }
  }

  const topics = fullTask.topics || [];
  const generatedTodos: any[] = [];

  if (topics.length > 0) {
    for (const top of topics) {
      const subItems = parseTopicSubItems(top.description || '');
      generatedTodos.push({
        id: `bt-top-${top.taskAssignmentTopicIdentifier || top.taskAssignmentTopicId || Math.random().toString(36).substring(2, 9)}`,
        title: top.topicName || fullTask.taskname,
        topicHeading: `${fullTask.paperName || 'Paper'} • ${top.topicName || 'Topic'}`,
        description: top.description || '',
        status: fullTask.taskStatus?.toLowerCase() === 'completed' ? 'done' : 'todo',
        priority: 'high',
        dueDate: fullTask.assignedAt ? fullTask.assignedAt.split('T')[0] : '',
        assignedAt: fullTask.assignedAt,
        tags: ['Brototype', 'Technical', fullTask.semesterName || 'Sem 1', fullTask.paperName || 'Paper 1'].filter(Boolean),
        subItems,
        createdAt: fullTask.assignedAt || new Date().toISOString(),
      });
    }
  } else {
    const subItems = parseTopicSubItems(fullTask.description || '');
    generatedTodos.push({
      id: `bt-${fullTask.taskAssignmentIdentifier}`,
      title: fullTask.taskname,
      topicHeading: `${fullTask.semesterName} • ${fullTask.paperName}`,
      description: fullTask.description || '',
      status: fullTask.taskStatus?.toLowerCase() === 'completed' ? 'done' : 'todo',
      priority: 'high',
      dueDate: fullTask.assignedAt ? fullTask.assignedAt.split('T')[0] : '',
      assignedAt: fullTask.assignedAt,
      tags: ['Brototype', 'Technical', fullTask.semesterName || 'Sem 1', fullTask.paperName || 'Paper 1'].filter(Boolean),
      subItems,
      createdAt: fullTask.assignedAt || new Date().toISOString(),
    });
  }

  // 2. Persist to localStorage 'notiq_todos' with sub-items checklist
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('notiq_todos');
      let existing: any[] = raw ? JSON.parse(raw) : [];
      const normalize = (s?: string) =>
        (s || '').toLowerCase().replace(/^\[brototype\]\s*/i, '').replace(/[^a-z0-9]/g, '').trim();

      // Remove any existing placeholder for this task that had empty subItems
      const parentNorm = normalize(task.taskname);
      existing = existing.filter((e) => {
        const matchesParent = normalize(e.title) === parentNorm || e.id === `bt-${task.taskAssignmentIdentifier}`;
        const hasNoSubs = !e.subItems || e.subItems.length === 0;
        return !(matchesParent && hasNoSubs);
      });

      const existingTitles = new Set(existing.map((e) => normalize(e.title)));
      const existingIds = new Set(existing.map((e) => e.id));

      const newToSave = generatedTodos.filter((g) => !existingTitles.has(normalize(g.title)) && !existingIds.has(g.id));
      if (newToSave.length > 0) {
        const merged = [...newToSave, ...existing];
        localStorage.setItem('notiq_todos', JSON.stringify(merged));
        window.dispatchEvent(new Event('notiq_todos_updated'));
      }
    } catch {
      // Ignore storage errors
    }
  }

  // 3. Persist to backend if workspaceId is provided
  if (workspaceId) {
    for (const g of generatedTodos) {
      todoApi.create({
        title: g.title,
        description: g.description,
        workspaceId,
        priority: g.priority,
        dueDate: g.dueDate || null,
        status: g.status,
        tags: g.tags,
      }).catch(() => {});
    }
  }

  return generatedTodos;
};
