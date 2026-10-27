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
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
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
      const timeoutSignal = AbortSignal.timeout(15000);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: combinedSignal,
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
      if (err.name === 'AbortError' && signal?.aborted) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('All AI models are currently busy. Please try again.');
}

/**
 * Dedicated AI query for quiz generation — uses its OWN system prompt (not the Notiq assistant one).
 * This prevents the model from getting confused between being a productivity assistant and a quiz generator.
 */
async function queryAIForQuiz(quizPrompt: string): Promise<string> {
  const quizSystemPrompt = `You are an expert quiz generator. You ONLY output valid JSON arrays of quiz questions. You NEVER output explanatory text, greetings, markdown fences, or anything except a raw JSON array. Follow the user's formatting instructions exactly.`;

  const payload = {
    systemInstruction: { parts: [{ text: quizSystemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: quizPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 4096,
    },
  };

  let lastError: Error | null = null;

  for (const model of FAST_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        if ([503, 429, 404, 500].includes(res.status)) {
          lastError = new Error(`Quiz model ${model} returned ${res.status}`);
          continue;
        }
        throw new Error(`Gemini quiz API error ${res.status}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n') || '';
      if (text.trim()) return text.trim();
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('All quiz models busy');
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
 * Determine if a task topic is actually quiz-worthy (study/technical/academic).
 * Simple daily tasks like "go home", "buy groceries", "call mom" should NOT be quizzed.
 */
export function isQuizzableTopic(title: string, subtopics: string[] | string = []): boolean {
  const combined = `${title} ${Array.isArray(subtopics) ? subtopics.join(' ') : subtopics}`.toLowerCase();

  // Explicit study / technical signals — if present, ALWAYS quizzable
  const studySignals = [
    'learn', 'study', 'review', 'read', 'understand', 'practice', 'master',
    'chapter', 'tutorial', 'course', 'lecture', 'exam', 'test', 'dsa', 'leetcode',
    'function', 'method', 'class', 'array', 'object', 'loop', 'variable',
    'api', 'database', 'server', 'client', 'component', 'module', 'hook',
    'state', 'prop', 'render', 'route', 'query', 'mutation', 'schema',
    'algorithm', 'data structure', 'pattern', 'protocol', 'framework',
    'library', 'package', 'dependency', 'css', 'html', 'javascript', 'js', 'ts',
    'typescript', 'python', 'java', 'react', 'node', 'express', 'next',
    'mongodb', 'sql', 'git', 'docker', 'aws', 'firebase', 'hosting',
    'authentication', 'auth', 'middleware', 'redux', 'context',
    'promise', 'async', 'await', 'callback', 'event', 'dom', 'rest',
    'graphql', 'websocket', 'testing', 'debugging', 'deploy', 'ci/cd',
    'oop', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction',
    'closure', 'scope', 'hoisting', 'prototype', 'this', 'bind', 'apply',
    'map', 'filter', 'reduce', 'spread', 'destructuring', 'template',
    'interface', 'type', 'generic', 'enum', 'decorator', 'annotation',
    'frontend', 'backend', 'fullstack', 'specificity', 'flexbox', 'grid',
    'cascade', 'selector', 'pseudoclass', 'element', 'attribute', 'semantic'
  ];

  if (studySignals.some((s) => combined.includes(s))) return true;

  // Non-study patterns indicating personal/daily/routine actions
  const nonStudyPatterns = [
    /^go\s+(home|out|to|back|shopping)/i,
    /^(buy|purchase|order|pick\s*up|get)\s/i,
    /^(call|text|message|email|reply|respond|contact)\s/i,
    /^(clean|wash|cook|eat|sleep|wake|rest|nap|shower|brush)/i,
    /^(pay|submit|send|deliver|drop\s*off)\s/i,
    /^(meet|visit|attend|hang\s*out)/i,
    /^(exercise|gym|walk|run|jog|yoga|workout)/i,
    /^(watch|listen|relax|chill|play|break)/i,
    /^(organize|tidy|arrange|pack|unpack)/i,
    /^(book|schedule|cancel|reschedule)\s+(appointment|meeting|cab|ticket|flight|doctor)/i,
    /^(remind|remember|don'?t\s+forget)/i,
    /^(doctor|dentist|grocery|groceries|laundry|dishes|dinner|lunch|breakfast|haircut)$/i,
    /^go\s*home$/i,
  ];

  for (const pattern of nonStudyPatterns) {
    if (pattern.test(title.trim())) return false;
  }

  // Short casual tasks with common personal words
  const personalWords = ['home', 'food', 'shop', 'store', 'market', 'laundry', 'dishes', 'trash', 'bed', 'lunch', 'dinner', 'breakfast', 'gym', 'workout'];
  const words = title.trim().split(/\s+/);
  if (words.length <= 3 && personalWords.some((w) => combined.includes(w))) {
    return false;
  }

  return true;
}

/**
 * Generate 10 multiple choice questions to test understanding of a topic and its subtopics.
 * Returns empty array for non-study tasks (e.g. "go home", "buy milk").
 */
export async function generateQuizForTopic(
  title: string,
  subtopics: string[] | string = []
): Promise<QuizQuestion[]> {
  // Skip quiz for non-study / non-technical tasks
  if (!isQuizzableTopic(title, subtopics)) {
    return [];
  }

  const subsList = Array.isArray(subtopics)
    ? subtopics.join('\n- ')
    : subtopics;

  const prompt = `You are a senior software engineering interviewer creating a mastery quiz.

TOPIC: "${title}"
SUBTOPICS/CHECKLIST:
- ${subsList || 'General core concepts of ' + title}

Generate exactly 10 multiple-choice questions (MCQs). Follow ALL these rules strictly:

## QUESTION QUALITY RULES:
1. Each question MUST test a SPECIFIC, DISTINCT concept — NO two questions should test the same thing.
2. At least 4 questions MUST include a short code snippet or code output scenario. Use real code examples with actual syntax.
3. Questions must be TRICKY but FAIR — they should require understanding, not just memorization.
4. Each question must be self-contained and make sense on its own.
5. NEVER ask vague questions like "which statement best describes X?" — ask about specific behavior, output, or scenarios.

## OPTION QUALITY RULES:
6. All 4 options MUST be plausible and distinct from each other. NEVER use obviously wrong fillers like "causes a syntax error in all versions" or "is deprecated and should never be used".
7. Options should be roughly similar in length and style — don't make the correct answer obviously longer or more detailed.
8. NO two questions may share the same set of options.

## ANSWER DISTRIBUTION RULES:
9. The correct answers MUST be distributed across indices 0, 1, 2, and 3. 
   - Use this distribution: at least 2 questions with correctAnswer=0, at least 2 with correctAnswer=1, at least 2 with correctAnswer=2, at least 2 with correctAnswer=3.
   - NEVER make all or most correct answers the same index.

## FORMAT:
Return ONLY a valid JSON array, no markdown fences, no explanation text before or after:
[
  {
    "id": "q1",
    "question": "What will be the output of the following code?\\n\\nconst x = [1, 2, 3];\\nconsole.log(x.map(n => n * 2));",
    "options": ["[2, 4, 6]", "[1, 2, 3]", "undefined", "TypeError"],
    "correctAnswer": 0,
    "explanation": "Array.map() creates a new array by applying the callback to each element. n * 2 doubles each value, producing [2, 4, 6].",
    "subtopic": "Array.map()"
  }
]

IMPORTANT: Return ONLY the JSON array. No other text.`;

  // Try up to 2 attempts
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await queryAIForQuiz(prompt);
      
      // Extract JSON array — handle both raw JSON and markdown-fenced responses
      let jsonStr = text;
      const fencedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fencedMatch) {
        jsonStr = fencedMatch[1].trim();
      }
      
      const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated: QuizQuestion[] = parsed.map((item, idx) => ({
            id: item.id || `q-${idx + 1}`,
            question: String(item.question || ''),
            options: Array.isArray(item.options) && item.options.length === 4
              ? item.options.map(String)
              : [],
            correctAnswer: typeof item.correctAnswer === 'number' && item.correctAnswer >= 0 && item.correctAnswer <= 3
              ? item.correctAnswer
              : 0,
            explanation: String(item.explanation || 'Review the topic concepts to understand this.'),
            subtopic: item.subtopic ? String(item.subtopic) : title,
          })).filter(q => q.question.length > 10 && q.options.length === 4);

          if (validated.length >= 5) {
            // Post-processing: fix answer distribution if all answers cluster on one index
            const finalQuestions = fixAnswerDistribution(validated);
            
            // Deduplicate questions with identical text
            const seen = new Set<string>();
            const unique = finalQuestions.filter(q => {
              const key = q.question.toLowerCase().trim();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            
            return unique.slice(0, 10);
          }
        }
      }
    } catch (err) {
      console.warn(`AI Quiz generation attempt ${attempt + 1} failed:`, err);
    }
  }

  // Return empty — the modal will show retry option
  return [];
}

/**
 * Fix answer distribution: if too many correct answers are the same index,
 * shuffle some by rotating options and updating correctAnswer.
 */
function fixAnswerDistribution(questions: QuizQuestion[]): QuizQuestion[] {
  // Count how many times each correctAnswer index appears
  const counts = [0, 0, 0, 0];
  questions.forEach(q => counts[q.correctAnswer]++);
  
  // If any single index has more than 4 out of 10, redistribute
  const maxAllowed = Math.ceil(questions.length / 2.5); // ~4
  const overloaded = counts.findIndex(c => c > maxAllowed);
  
  if (overloaded === -1) return questions; // distribution is fine
  
  // Find which questions to redistribute
  const targetIndices = [0, 1, 2, 3].filter(i => counts[i] < 2);
  if (targetIndices.length === 0) return questions;
  
  let targetIdx = 0;
  return questions.map((q, i) => {
    if (q.correctAnswer !== overloaded || counts[overloaded] <= maxAllowed) return q;
    
    const newCorrectIdx = targetIndices[targetIdx % targetIndices.length];
    targetIdx++;
    
    // Swap the options: put current correct answer at new position
    const newOptions = [...q.options];
    const correctOption = newOptions[q.correctAnswer];
    newOptions[q.correctAnswer] = newOptions[newCorrectIdx];
    newOptions[newCorrectIdx] = correctOption;
    
    counts[overloaded]--;
    counts[newCorrectIdx]++;
    
    return {
      ...q,
      options: newOptions,
      correctAnswer: newCorrectIdx,
    };
  });
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

