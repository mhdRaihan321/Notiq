import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

const FAST_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
];

const SYSTEM_INSTRUCTION = `You are Notiq AI, an intelligent, helpful workspace and productivity assistant integrated directly into Notiq (a modern Notion-like productivity platform).
Your capabilities include:
1. Helping users organize tasks, topics, projects, and learning notes.
2. Generating structured notes, brainstorming, drafting content, and breaking down complex topics into actionable steps.
3. Providing clear, concise, well-formatted markdown responses (use headings, bullet points, checklists, bold text, and code snippets where appropriate).
4. Assisting with Brototype learning progress, coding tasks, study plans, and reflections.

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

export async function POST(req: NextRequest) {
  try {
    const { prompt, history = [], context = {} } = await req.json();

    if (!prompt && (!history || history.length === 0)) {
      return NextResponse.json({ error: 'Prompt or conversation history is required' }, { status: 400 });
    }

    const apiKey = GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    // Format contents array for Gemini API
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Append history
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history) {
        if (msg.content) {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          });
        }
      }
    }

    // Append current prompt if provided separately from history
    if (prompt && (!history.length || history[history.length - 1]?.content !== prompt)) {
      let augmentedPrompt = prompt;
      if (context && Object.keys(context).length > 0) {
        augmentedPrompt = `[Workspace Context: ${JSON.stringify(context)}]\n\n${prompt}`;
      }
      contents.push({
        role: 'user',
        parts: [{ text: augmentedPrompt }],
      });
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    };

    let lastError = 'All AI models failed';
    let lastStatus = 500;

    for (const model of FAST_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          if (response.status === 503 || response.status === 429 || response.status === 404 || response.status === 500) {
            lastStatus = response.status;
            continue;
          }
          const errText = await response.text();
          let parsedErr: any;
          try { parsedErr = JSON.parse(errText); } catch {}
          lastError = parsedErr?.error?.message || `Gemini API returned status ${response.status}`;
          lastStatus = response.status;
          continue;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n') || '';

        return NextResponse.json({
          text,
          usage: data.usageMetadata,
          model,
        });
      } catch (err: any) {
        lastError = err.message || 'Fetch failed';
      }
    }

    return NextResponse.json({ error: lastError }, { status: lastStatus });
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error while contacting AI service' },
      { status: 500 }
    );
  }
}
