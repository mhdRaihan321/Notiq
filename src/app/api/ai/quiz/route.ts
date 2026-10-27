import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

const FAST_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
];

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  subtopic?: string;
}

function fixAnswerDistribution(questions: QuizQuestion[]): QuizQuestion[] {
  const counts = [0, 0, 0, 0];
  questions.forEach((q) => counts[q.correctAnswer]++);

  const maxAllowed = Math.ceil(questions.length / 2.5);
  const overloaded = counts.findIndex((c) => c > maxAllowed);
  if (overloaded === -1) return questions;

  const targetIndices = [0, 1, 2, 3].filter((i) => counts[i] < 2);
  if (targetIndices.length === 0) return questions;

  let targetIdx = 0;
  return questions.map((q) => {
    if (q.correctAnswer !== overloaded || counts[overloaded] <= maxAllowed) return q;

    const newCorrectIdx = targetIndices[targetIdx % targetIndices.length];
    targetIdx++;

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

export async function POST(req: NextRequest) {
  try {
    const { title, subtopics = [] } = await req.json();

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const subsList = Array.isArray(subtopics)
      ? subtopics.join('\n- ')
      : String(subtopics);

    const quizSystemPrompt = `You are an expert quiz generator. You ONLY output valid JSON arrays of quiz questions. You NEVER output explanatory text, greetings, markdown fences, or anything except a raw JSON array. Follow the user's formatting instructions exactly.`;

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

## CODE FORMATTING RULES (CRITICAL):
6. Whenever a question contains code (HTML, CSS, JavaScript, etc.), ALWAYS format the code inside a fenced markdown code block with language identifier (\`\`\`html, \`\`\`css, \`\`\`javascript, etc.), with clean indentation and newlines.
   Example:
   "question": "Examine the following HTML form snippet:\\n\\n\`\`\`html\\n<form>\\n  <label for=\\"username\\">Username</label>\\n  <input type=\\"text\\" id=\\"username\\" name=\\"user\\">\\n</form>\\n\`\`\`\\n\\nWhat is the browser behavior when a user clicks directly on the text label \\"Username\\"?"
   NEVER merge code snippets into a single unformatted run-on sentence.
7. If an option contains code, HTML tags, attributes, CSS properties, or JS methods (e.g. \`<label>\`, \`<input type="text">\`, \`display: flex;\`, \`e.preventDefault()\`), wrap the code in backticks (\`code\`) so it renders cleanly as code.
8. In explanations, always wrap referenced tags, variables, and code in backticks.

## OPTION QUALITY RULES:
9. All 4 options MUST be plausible and distinct from each other. NEVER use obviously wrong fillers.
10. Options should be roughly similar in length and style — don't make the correct answer obviously longer or more detailed.
11. NO two questions may share the same set of options.

## ANSWER DISTRIBUTION RULES:
12. The correct answers MUST be distributed across indices 0, 1, 2, and 3.
   - At least 2 questions with correctAnswer=0, at least 2 with correctAnswer=1, at least 2 with correctAnswer=2, at least 2 with correctAnswer=3.
   - NEVER make all or most correct answers the same index.

## FORMAT:
Return ONLY a valid JSON array, no markdown fences around the JSON itself, no explanation text before or after:
[
  {
    "id": "q1",
    "question": "What will be the output of the following code?\\n\\n\`\`\`javascript\\nconst x = [1, 2, 3];\\nconsole.log(x.map(n => n * 2));\\n\`\`\`",
    "options": ["\`[2, 4, 6]\`", "\`[1, 2, 3]\`", "\`undefined\`", "\`TypeError\`"],
    "correctAnswer": 0,
    "explanation": "Array.map() creates a new array by applying the callback to each element. \`n * 2\` doubles each value, producing \`[2, 4, 6]\`.",
    "subtopic": "Array.map()"
  }
]

IMPORTANT: Return ONLY the JSON array. No other text.`;

    const payload = {
      systemInstruction: { parts: [{ text: quizSystemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 4096,
      },
    };

    let lastError = 'All AI models failed';

    for (const model of FAST_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          lastError = `Model ${model} returned ${response.status}`;
          continue;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n') || '';

        let jsonStr = text.trim();
        const fencedMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
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
            })).filter((q) => q.question.length > 10 && q.options.length === 4);

            if (validated.length >= 5) {
              const finalQuestions = fixAnswerDistribution(validated);
              const seen = new Set<string>();
              const unique = finalQuestions.filter((q) => {
                const key = q.question.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });

              return NextResponse.json({
                questions: unique.slice(0, 10),
                model,
              });
            }
          }
        }
      } catch (err: any) {
        lastError = err.message || 'Fetch failed';
      }
    }

    return NextResponse.json({ error: lastError, questions: [] }, { status: 502 });
  } catch (error: any) {
    console.error('API quiz route error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error while generating quiz', questions: [] },
      { status: 500 }
    );
  }
}
