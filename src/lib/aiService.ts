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

CRITICAL PAGE & DOCUMENT CREATION RULES:
When the user asks you to "make a page", "create a page", "draft a document", or write learning notes on a topic (e.g. "make a page and in that write about Js hoisting in simple English"):
1. First, explain the topic clearly and conversationally in your response.
2. At the end of your response, output a structured page definition in this exact format:
\`\`\`notiq-page
{
  "title": "Clear and Clean Title (e.g. JavaScript Hoisting in Simple English)",
  "icon": "⚡",
  "content": "# JavaScript Hoisting in Simple English\\n\\nFull markdown formatted content with headings, examples, code snippets, tables, and takeaways..."
}
\`\`\`
This allows the user to click one button to instantly save it as a new Page inside their Notiq workspace!

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
Only output the notiq-task or notiq-page block when requested or relevant. Keep responses polite, focused, and actionable.`;

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

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // 0, 1, 2, or 3
  explanation: string;
  subtopic?: string;
}

export interface WrongQuestionDetail {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  subtopic?: string;
}

/**
 * Generate 10 multiple choice questions to test understanding of a topic and its subtopics
 */
export async function generateQuizForTopic(
  title: string,
  subtopics: string[] | string = []
): Promise<QuizQuestion[]> {
  const subsList = Array.isArray(subtopics)
    ? subtopics.join('\n- ')
    : subtopics;

  const prompt = `You are a senior technical interviewer and teacher.
Generate exactly 10 comprehensive multiple-choice questions (MCQs) to evaluate a student on this topic:
Topic: "${title}"
Subtopics & Checklist Items:
- ${subsList || 'General core concepts of ' + title}

Requirements:
1. Provide exactly 10 questions covering both theoretical understanding, code/syntax quirks, and real-world scenarios.
2. Each question MUST have exactly 4 options.
3. "correctAnswer" MUST be the 0-based integer index (0, 1, 2, or 3) of the correct choice.
4. "explanation" MUST clearly explain why the correct option is right and the key takeaway.
5. "subtopic" MUST be the relevant subtopic or concept name tested.

Return ONLY a valid JSON array in this exact format:
[
  {
    "id": "q1",
    "question": "What happens when ...?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Because...",
    "subtopic": "..."
  }
]`;

  try {
    const res = await queryAI({ prompt });
    const text = res.text.trim();
    
    // Extract JSON array
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validated: QuizQuestion[] = parsed.map((item, idx) => ({
          id: item.id || `q-${idx + 1}`,
          question: String(item.question || `Question ${idx + 1} on ${title}`),
          options: Array.isArray(item.options) && item.options.length === 4
            ? item.options.map(String)
            : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: typeof item.correctAnswer === 'number' && item.correctAnswer >= 0 && item.correctAnswer <= 3
            ? item.correctAnswer
            : 0,
          explanation: String(item.explanation || 'Review the topic concepts to understand this.'),
          subtopic: item.subtopic ? String(item.subtopic) : title,
        }));

        if (validated.length >= 10) {
          return validated.slice(0, 10);
        }
        // If between 1 and 9, pad with fallback questions to reach 10
        return padQuizQuestions(validated, title, subtopics);
      }
    }
  } catch (err) {
    console.warn('AI Quiz generation failed, generating fallback quiz:', err);
  }

  return padQuizQuestions([], title, subtopics);
}

function padQuizQuestions(
  existing: QuizQuestion[],
  title: string,
  subtopics: string[] | string
): QuizQuestion[] {
  const subs = Array.isArray(subtopics)
    ? subtopics.filter(Boolean)
    : String(subtopics).split('\n').map(s => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);

  const needed = 10 - existing.length;
  const generated: QuizQuestion[] = [...existing];

  const genericConcepts = subs.length > 0 ? subs : [
    'Core Fundamentals',
    'Syntax & Execution Behavior',
    'Best Practices',
    'Common Pitfalls & Edge Cases',
    'Practical Application',
    'Performance & Optimization',
    'Debugging & Troubleshooting',
    'Integration & Patterns',
    'Limitations & Gotchas',
    'Standard Conventions',
  ];

  for (let i = 0; i < needed; i++) {
    const concept = genericConcepts[i % genericConcepts.length] || `Concept ${i + 1}`;
    generated.push({
      id: `fallback-q-${existing.length + i + 1}`,
      question: `In the context of ${title}, which statement best describes ${concept}?`,
      options: [
        `It is a fundamental principle in ${title} that should be understood thoroughly.`,
        `It is deprecated and should never be used in modern development.`,
        `It only works in browser environments and not in server runtimes.`,
        `It causes a runtime syntax error in all modern versions.`,
      ],
      correctAnswer: 0,
      explanation: `${concept} is a core aspect of ${title} and essential for writing clean, reliable code.`,
      subtopic: concept,
    });
  }

  return generated.slice(0, 10);
}

/**
 * Generate a personalized Relearn / Revision plan for failed quiz attempts
 */
export async function generateRelearnPlan(
  topicTitle: string,
  wrongQuestions: WrongQuestionDetail[]
): Promise<string> {
  const wrongSummary = wrongQuestions.map((w, idx) => `
${idx + 1}. Question: ${w.question}
- Subtopic tested: ${w.subtopic || topicTitle}
- Your Answer: ${w.userAnswer} (Incorrect)
- Correct Answer: ${w.correctAnswer}
- Why: ${w.explanation}
`).join('\n');

  const prompt = `A student just attempted the 10-question mastery quiz for "${topicTitle}" and scored below the 70% passing threshold (7/10 required).
They missed the following ${wrongQuestions.length} questions:

${wrongSummary}

Please write a highly encouraging, targeted, and comprehensive "Relearn & Revision Guide" in markdown.
Include:
1. 🎯 **Root Cause Analysis**: Where their conceptual gaps appear to be based on the questions they missed.
2. 📖 **Targeted Revision Notes**: For each missed concept/subtopic, explain the concept simply, provide a concise code snippet or concrete example, and explain the key distinction to remember.
3. ⚠️ **Common Trap to Avoid**: The common pitfall that tricked them in these questions.
4. 🚀 **3-Minute Action Plan**: What exact steps they should take before retrying the quiz to pass with 100%.

Use clear formatting with bolding, code blocks, and bullet points.`;

  try {
    const res = await queryAI({ prompt });
    return res.text;
  } catch {
    return `### 📚 Relearn & Revision Guide for ${topicTitle}\n\nYou missed ${wrongQuestions.length} questions on: ${wrongQuestions.map(w => w.subtopic || w.question).join(', ')}.\n\n**Next Steps:**\n1. Review your notes and documentation for the subtopics above.\n2. Practice writing small code snippets verifying how each concept behaves.\n3. Retake the quiz when you are ready to score 7/10 or higher!`;
  }
}

