/**
  * Sherin James, AI Projects backend
 * A single Cloudflare Worker that proxies Purrfect Match and Brainrot-O-Meter
 * to the Claude API, so the Anthropic API key never touches the browser.
 *
 * Deploy: see backend/README.md for the full step-by-step.
 *
 * Bindings this Worker expects (set in wrangler.toml / dashboard):
 *   - KV namespace  : RATE_LIMIT          (for per-IP rate limiting)
 *   - secret        : ANTHROPIC_API_KEY   (wrangler secret put ANTHROPIC_API_KEY)
 *   - var           : ALLOWED_ORIGIN      (e.g. "https://sherinjames-sj.github.io")
 *   - var           : ANTHROPIC_MODEL     (optional override, see README)
 */

const DEFAULT_MODEL = 'claude-haiku-4-5';
const ANTHROPIC_VERSION = '2023-06-01';

// Requests per IP per route, per rolling window.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

// Input size limits, in characters. Generous enough for a real CV / job post,
// small enough that nobody can use this endpoint to bill huge completions.
const MAX_LENGTHS = {
  cv: 9000,
  job: 9000,
  message: 2000,
  text: 4000,
};
const MAX_HISTORY_TURNS = 8; // Whiskers & Biscuit chat memory cap

const ROUTES = {
  'POST /purrfect-match/analyze': handleAnalyze,
  'POST /purrfect-match/chat': handleChat,
  'POST /purrfect-match/interview-questions': handleInterviewQuestions,
  'POST /purrfect-match/cover-letter': handleCoverLetter,
  'POST /brainrot/diagnose': handleBrainrotDiagnose,
  'POST /brainrot/translate': handleBrainrotTranslate,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const key = `${request.method} ${url.pathname}`;
    const handler = ROUTES[key];

    if (!handler) {
      return json({ error: 'Not found.' }, 404, origin);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Server is not configured yet (missing API key).' }, 500, origin);
    }

    // --- rate limiting, per IP per route ---
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(env, ip, url.pathname);
    if (!rl.allowed) {
      return json(
        { error: `This demo is rate-limited to keep it free for everyone. Try again in about ${rl.retryAfterMinutes} minute(s).` },
        429,
        origin
      );
    }

    // --- parse + validate body ---
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Expected a JSON request body.' }, 400, origin);
    }

    try {
      return await handler(body, env, origin);
    } catch (err) {
      console.error('Handler error:', err && err.stack ? err.stack : err);
      return json({ error: 'Something went wrong on the server. Please try again in a bit.' }, 500, origin);
    }
  },
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleAnalyze(body, env, origin) {
  const cv = requireString(body.cv, 'cv');
  const job = requireString(body.job, 'job');
  if (cv.error) return json({ error: cv.error }, 400, origin);
  if (job.error) return json({ error: job.error }, 400, origin);

  const system = `You are Purrfect Match, an honest CV-to-job-description matching assistant.
Your one hard rule: NEVER claim the candidate has a skill or experience that isn't genuinely
supported by their CV. It is better to be honest and a little disappointing than falsely encouraging.

Compare the CV against the job description and respond with ONLY valid JSON (no markdown fences,
no commentary before or after) matching exactly this shape:
{
  "matchScore": <integer 0-100, honest overall fit>,
  "overlappingSkills": [<strings: real skills/experience the CV already shows that the job wants>],
  "missingSkills": [<strings: things the job wants that the CV does not currently show>],
  "suggestions": [
    {"original": "<a real bullet or phrase from the CV>", "rewritten": "<the same true experience, reworded to better match the job's language, without inventing anything>"}
  ],
  "summary": "<2-3 honest sentences on overall fit, plain language>"
}
Include at most 6 items in overlappingSkills, 6 in missingSkills, and 4 in suggestions.`;

  const userMsg = `CV:\n${cv.value}\n\nJob description:\n${job.value}`;
  const data = await callClaudeJSON(env, system, userMsg, 1400);
  return json(data, 200, origin);
}

async function handleChat(body, env, origin) {
  const message = requireString(body.message, 'message');
  if (message.error) return json({ error: message.error }, 400, origin);
  const cv = optionalString(body.cv, MAX_LENGTHS.cv);
  const job = optionalString(body.job, MAX_LENGTHS.job);
  const history = sanitizeHistory(body.history);

  const system = `You are Whiskers & Biscuit, a warm, encouraging AI companion inside a job-hunting toolkit
called Purrfect Match. You help with wording, pep talks, and job-hunt questions. Keep replies
conversational and fairly short (usually under 120 words) unless the user clearly asks for something
longer. You may gently reference the user's CV/job context below if it's relevant, but never invent
facts about them that aren't there. A little cat-themed personality is welcome, but don't overdo it.
${cv ? `\nCandidate's CV (for context):\n${cv}` : ''}${job ? `\nJob description (for context):\n${job}` : ''}`;

  const messages = [...history, { role: 'user', content: message.value }];
  const reply = await callClaudeText(env, system, messages, 500);
  return json({ reply }, 200, origin);
}

async function handleInterviewQuestions(body, env, origin) {
  const job = requireString(body.job, 'job');
  if (job.error) return json({ error: job.error }, 400, origin);
  const cv = optionalString(body.cv, MAX_LENGTHS.cv);

  const system = `You generate realistic interview questions from a job description. Respond with ONLY
valid JSON (no markdown fences) matching exactly:
{ "questions": [ {"question": "<string>", "category": "<one of: Behavioural, Technical, Situational, About You, Culture Fit>"} ] }
Return 8-10 questions, grounded in the actual responsibilities/requirements in the job description.
${cv ? 'You may also lightly tailor 1-2 questions to gaps or highlights visible in the CV below.' : ''}`;

  const userMsg = `Job description:\n${job.value}${cv ? `\n\nCandidate's CV:\n${cv}` : ''}`;
  const data = await callClaudeJSON(env, system, userMsg, 1200);
  return json(data, 200, origin);
}

async function handleCoverLetter(body, env, origin) {
  const cv = requireString(body.cv, 'cv');
  const job = requireString(body.job, 'job');
  if (cv.error) return json({ error: cv.error }, 400, origin);
  if (job.error) return json({ error: job.error }, 400, origin);

  const system = `You write cover letter drafts grounded ONLY in the real experience present in the
candidate's CV. Never invent employers, achievements, or skills. The tone should be genuine and
specific rather than generic corporate filler, roughly 220-320 words, 3-4 paragraphs, no placeholder
brackets. Respond with ONLY valid JSON (no markdown fences) matching exactly:
{ "letter": "<the full cover letter draft as plain text with \\n\\n between paragraphs>" }`;

  const userMsg = `CV:\n${cv.value}\n\nJob description:\n${job.value}`;
  const data = await callClaudeJSON(env, system, userMsg, 900);
  return json(data, 200, origin);
}

async function handleBrainrotDiagnose(body, env, origin) {
  const text = requireString(body.text, 'text', MAX_LENGTHS.text);
  if (text.error) return json({ error: text.error }, 400, origin);

  const system = `You are the Brainrot-O-Meter: a deliberately ridiculous internet-culture diagnostic tool.
Given a piece of text, you judge how much "brainrot" (chaotic, unserious, overly-online internet slang
energy) it has. This is comedy, not cruelty: keep the roast playful and silly, never mean-spirited,
never about protected characteristics, appearance, or anything genuinely personal. Respond with ONLY
valid JSON (no markdown fences) matching exactly:
{
  "score": <integer 0-100>,
  "tier": "<a short, funny made-up tier name for this score, e.g. 'Certified Skibidi Scholar'>",
  "roast": "<1-3 playful sentences roasting the text itself, not the person>",
  "recoveryTip": "<one short, silly 'tip' for touching grass / recovering, in a light joking tone>"
}`;

  const data = await callClaudeJSON(env, system, text.value, 500);
  return json(data, 200, origin);
}

async function handleBrainrotTranslate(body, env, origin) {
  const text = requireString(body.text, 'text', MAX_LENGTHS.text);
  if (text.error) return json({ error: text.error }, 400, origin);

  const system = `Translate the user's text into maximum "Gen Alpha brainrot" slang: heavy, playful,
deliberately over-the-top internet slang (think "skibidi", "gyatt", "rizz", "no cap", "fanum tax",
"sigma", etc. used absurdly liberally). Keep the original meaning recognisable underneath the chaos.
Keep it to a similar length to the input, or a little longer. This is comedy/wordplay only, so do not
add anything hateful, sexual, or otherwise inappropriate. Respond with ONLY the translated text, no
preamble, no quotes around it, no explanation.`;

  const anthroRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: text.value }],
      stream: true,
    }),
  });

  if (!anthroRes.ok || !anthroRes.body) {
    const errText = await safeText(anthroRes);
    console.error('Anthropic stream error:', anthroRes.status, errText);
    return json({ error: 'The translator is having a moment. Please try again shortly.' }, 502, origin);
  }

  // Pipe Anthropic's SSE stream straight through; the frontend parses the
  // `content_block_delta` events itself. This keeps the Worker simple and
  // avoids buffering the whole response before the user sees anything.
  return new Response(anthroRes.body, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}

// ---------------------------------------------------------------------------
// Claude API helpers
// ---------------------------------------------------------------------------

async function callClaudeText(env, system, messages, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await safeText(res);
    console.error('Anthropic error:', res.status, errText);
    throw new Error(`Anthropic API error (${res.status})`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}

async function callClaudeJSON(env, system, userMsg, maxTokens) {
  const raw = await callClaudeText(env, system, [{ role: 'user', content: userMsg }], maxTokens);
  const cleaned = extractJson(raw);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('JSON parse failure. Raw model output:', raw);
    throw new Error('The AI returned something unexpected. Please try again.');
  }
}

function extractJson(raw) {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them anyway.
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  // Fall back to the first {...} block if there's stray text around it.
  if (!s.startsWith('{')) {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      s = s.slice(first, last + 1);
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requireString(value, fieldName, maxLen) {
  const max = maxLen || MAX_LENGTHS[fieldName] || 4000;
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `"${fieldName}" is required.` };
  }
  if (value.length > max) {
    return { error: `"${fieldName}" is too long (max ${max} characters).` };
  }
  return { value: value.trim() };
}

function optionalString(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LENGTHS.message) }));
}

// ---------------------------------------------------------------------------
// Rate limiting (Cloudflare KV, fixed-window counter per IP+route)
// ---------------------------------------------------------------------------

async function checkRateLimit(env, ip, pathname) {
  if (!env.RATE_LIMIT) {
    // No KV bound (e.g. local dev without --kv): fail open rather than 500.
    return { allowed: true };
  }
  const windowStart = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS);
  const key = `rl:${ip}:${pathname}:${windowStart}`;

  const current = parseInt((await env.RATE_LIMIT.get(key)) || '0', 10);
  if (current >= RATE_LIMIT_MAX) {
    const secondsIntoWindow = Math.floor(Date.now() / 1000) % RATE_LIMIT_WINDOW_SECONDS;
    const retryAfterMinutes = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_SECONDS - secondsIntoWindow) / 60));
    return { allowed: false, retryAfterMinutes };
  }

  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 60 });
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' },
  });
}

async function safeText(res) {
  try {
    return await res.text();
  } catch (e) {
    return '<no body>';
  }
}
