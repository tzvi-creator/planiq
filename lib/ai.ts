import OpenAI from 'openai';

let _client: OpenAI | null = null;
export function usingOpenRouter() {
  return !!(process.env.OPEN_ROUTER || process.env.OPENROUTER_API_KEY);
}

export function aiClient(): OpenAI {
  if (_client) return _client;
  const orKey = process.env.OPEN_ROUTER || process.env.OPENROUTER_API_KEY;
  if (orKey) {
    _client = new OpenAI({
      apiKey: orKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'X-Title': 'PlanIQ' },
    });
  } else if (process.env.OPENAI_API_KEY) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else {
    throw new Error('לא הוגדר מפתח AI (OPEN_ROUTER או OPENAI_API_KEY)');
  }
  return _client;
}

export function aiModel() {
  return process.env.AI_MODEL || (usingOpenRouter() ? 'openai/gpt-4o' : 'gpt-4o');
}

export function parseJsonLoose(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('תשובת ה-AI אינה JSON תקין');
}
