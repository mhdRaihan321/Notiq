export interface AIMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
}

export interface AIOptions {
  prompt?: string;
  history?: Array<{ role: 'user' | 'model'; content: string }>;
  context?: Record<string, any>;
  signal?: AbortSignal;
}

export interface AIResponse {
  text: string;
  error?: string;
}

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

// Fast models ordered by low latency and high availability
const FAST_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
];

const SYSTEM_PROMPT = `You are Notiq AI, an intelligent, helpful workspace and productivity assistant integrated into Notiq (a modern Notion-like productivity platform).
Your capabilities:
1. Organizing tasks, topics, projects, and learning notes.
2. Generating structured notes, brainstorming, drafting content, breaking down complex topics.
3. Providing clear, concise, well-formatted markdown responses (headings, bullets, checklists, bold, code).
4. Assisting with Brototype learning progress, coding tasks, study plans, reflections.

CRITICAL TASK & CHECKLIST CREATION RULES:
When the user asks you to add, create, or schedule a task, or provides a title with topics/subtopics (e.g. "Pending Topic: Array slice vs Array splice, forEach, map... add this to the todo"):
1. Always FIRST answer the user's question, explain the concepts, or provide helpful guidance conversationally in markdown.
2. TASK TITLE:
   - Use the EXACT title the user specified (e.g. if the user says "Pending Topic", the title MUST be "Pending Topic"). NEVER invent or rewrite it with unwanted extra adjectives.
3. SUB-TOPICS & CHECKLIST ITEMS (CRITICAL):
   - Whenever the user gives a list of topics, questions, or sub-items:
     a) Include an array "subItems" with EACH item as a separate string.
     b) In "description", format EVERY item on its own bullet line prefixed with "- " (e.g. "- Array slice vs Array splice\\n- need better understanding of forEach\\n..."). NEVER condense subtopics into a single prose paragraph!
   - This ensures Notiq creates interactive checkboxes for each subtopic so the user can check them off one by one!
4. At the very end of your response, output the task definition in this exact format:
\`\`\`notiq-task
{
  "title": "Exact Title (e.g. Pending Topic)",
  "subItems": [
    "Subtopic 1",
    "Subtopic 2",
    "Subtopic 3"
  ],
  "description": "- Subtopic 1\\n- Subtopic 2\\n- Subtopic 3",
  "priority": "low" | "medium" | "high" | "urgent",
  "dueDate": "YYYY-MM-DD" or null,
  "tags": ["tag1", "tag2"]
}
\`\`\`
Only output the notiq-task block when a task or action item is requested or relevant. Keep responses polite, focused, and actionable.`;

function buildContents(prompt?: string, history: Array<{ role: string; content: string }> = [], context: Record<string, any> = {}) {
  const contents: any[] = [];

  for (const msg of history) {
    if (msg.content) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }
  }

  if (prompt && (!history.length || history[history.length - 1]?.content !== prompt)) {
    const today = new Date().toISOString().split('T')[0];
    const fullContext = {
      currentDate: today,
      ...context,
    };
    const prefix = `[Context: ${JSON.stringify(fullContext)}]\n\n`;
    contents.push({
      role: 'user',
      parts: [{ text: `${prefix}${prompt}` }],
    });
  }

  return contents;
}

function buildPayload(contents: any[]) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  };
}

/**
 * Stream AI response — streams tokens via Server-Sent Events.
 * Automatically cascades through fast models if one is busy or overloaded (503/429).
 */
export async function streamAI(
  opts: AIOptions & { onChunk: (chunk: string, accumulated: string) => void }
): Promise<string> {
  const { prompt, history = [], context = {}, signal, onChunk } = opts;
  const contents = buildContents(prompt, history, context);
  const payload = buildPayload(contents);

  let lastError: Error | null = null;

  for (const model of FAST_MODELS) {
    if (signal?.aborted) throw new Error('Aborted');

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${API_KEY}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        // If busy, rate limited, or not found, try next fast model immediately
        if (res.status === 503 || res.status === 429 || res.status === 404 || res.status === 500) {
          lastError = new Error(`Model ${model} returned ${res.status}`);
          continue;
        }
        const errBody = await res.text();
        let msg = `Gemini API error ${res.status}`;
        try { msg = JSON.parse(errBody).error?.message || msg; } catch {}
        throw new Error(msg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const parts = json.candidates?.[0]?.content?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.text) {
                    accumulated += part.text;
                    onChunk(part.text, accumulated);
                  }
                }
              }
            } catch {
              // skip malformed chunk
            }
          }
        }
      }

      if (accumulated.trim().length > 0) {
        return accumulated;
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) throw err;
      lastError = err;
      // Try next model on failure
    }
  }

  throw lastError || new Error('All AI models are currently busy. Please try again in a moment.');
}

/**
 * Non-streaming query with auto-fallback across fast models.
 */
export async function queryAI({ prompt, history = [], context = {}, signal }: AIOptions): Promise<AIResponse> {
  const contents = buildContents(prompt, history, context);
  const payload = buildPayload(contents);

  let lastError: Error | null = null;

  for (const model of FAST_MODELS) {
    if (signal?.aborted) throw new Error('Aborted');

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        if (res.status === 503 || res.status === 429 || res.status === 404 || res.status === 500) {
          lastError = new Error(`Model ${model} returned ${res.status}`);
          continue;
        }
        const errBody = await res.text();
        let msg = `Gemini API error ${res.status}`;
        try { msg = JSON.parse(errBody).error?.message || msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n') || '';
      if (text) {
        return { text };
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('All AI models are currently busy. Please try again.');
}

/**
 * Convenience: generate learning notes for a task
 */
export async function generateLearningNotesForTask(title: string, description?: string): Promise<string> {
  const prompt = `I am learning and working on the following task: "${title}".
${description ? `Details: ${description}` : ''}

Please generate a high-yield study and reflection summary with:
1. Core Key Concepts learned
2. Practical Code / Implementation Steps or takeaways
3. Common Pitfalls & Best Practices
4. A quick 3-bullet checklist of next mastery goals.
Keep it structured, clean, and inspiring!`;

  const response = await queryAI({ prompt });
  return response.text;
}
