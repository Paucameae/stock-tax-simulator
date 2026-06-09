import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// --- Simple in-memory rate limiter (per client IP) ---
// Mirrors msft-quote.ts. Protects the Azure OpenAI quota (and your bill) from
// abuse. For multi-instance deploys, replace with Azure API Management or a
// distributed store (Redis).
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 12; // requests per window per IP (LLM calls are costly)
const RATE_LIMIT_MAX_ENTRIES = 5000; // cap memory usage
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Input guards — the front sends pre-computed facts, never raw portfolios.
const MAX_QUESTION_CHARS = 500;
const MAX_FACTS_CHARS = 8000;
const MAX_TOPIC_CHARS = 120;

function getClientIp(req: HttpRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-client-ip') || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateBuckets.get(ip);

  if (!entry || entry.resetAt <= now) {
    // Opportunistic eviction to bound memory
    if (rateBuckets.size >= RATE_LIMIT_MAX_ENTRIES) {
      for (const [key, val] of rateBuckets) {
        if (val.resetAt <= now) rateBuckets.delete(key);
      }
      if (rateBuckets.size >= RATE_LIMIT_MAX_ENTRIES) {
        const firstKey = rateBuckets.keys().next().value;
        if (firstKey) rateBuckets.delete(firstKey);
      }
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}

// Grounding instruction. The model must NEVER recompute taxes — it explains the
// numbers already produced by the app's engine. This is the core guard against
// hallucinating rates, boxes or pivot dates in a fiscal domain.
const SYSTEM_PROMPT = `Tu es un assistant pédagogique intégré à un simulateur d'impôt français sur les actions Microsoft (RSU/AGA, ESPP, dividendes, plus-values).

Ton rôle : EXPLIQUER en français, de façon claire et concise, des calculs et des montants qui ont DÉJÀ été calculés par l'application. Tu reçois ces chiffres dans un bloc "Données calculées".

Règles strictes :
- Utilise UNIQUEMENT les chiffres et faits fournis dans "Données calculées". Ne recalcule jamais l'impôt toi-même et n'invente aucun taux, aucune case de formulaire, aucune date.
- Si une information manque pour répondre, dis-le clairement plutôt que de deviner.
- Sois pédagogique : explique le "pourquoi" (ex. pourquoi un abattement, pourquoi des prélèvements sociaux) en t'appuyant sur les montants fournis.
- Reste concis (quelques phrases ou une courte liste à puces).
- Rappelle, si le sujet est sensible, qu'il s'agit d'une aide à la compréhension et non d'un conseil fiscal personnalisé.
- N'invente jamais d'informations sur la situation personnelle de l'utilisateur au-delà des données fournies.`;

interface AiRequestBody {
  topic?: unknown;
  facts?: unknown;
  question?: unknown;
}

export async function aiAssistant(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec) },
      jsonBody: { error: 'Trop de requêtes. Réessayez dans un instant.' },
    };
  }

  let body: AiRequestBody;
  try {
    body = (await req.json()) as AiRequestBody;
  } catch {
    return { status: 400, jsonBody: { error: 'Corps de requête invalide.' } };
  }

  const topic = typeof body.topic === 'string' ? body.topic.slice(0, MAX_TOPIC_CHARS) : '';
  const question =
    typeof body.question === 'string' ? body.question.slice(0, MAX_QUESTION_CHARS).trim() : '';
  // facts is an arbitrary JSON of pre-computed numbers/labels — serialise it.
  let factsStr = '';
  try {
    factsStr = body.facts ? JSON.stringify(body.facts) : '';
  } catch {
    factsStr = '';
  }
  if (factsStr.length > MAX_FACTS_CHARS) {
    return { status: 413, jsonBody: { error: 'Contexte trop volumineux.' } };
  }
  if (!topic && !question) {
    return { status: 400, jsonBody: { error: 'Aucune question ni sujet fourni.' } };
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  if (!endpoint || !apiKey || !deployment) {
    context.error('Azure OpenAI not configured (endpoint/key/deployment).');
    return { status: 503, jsonBody: { error: 'Assistant temporairement indisponible.' } };
  }

  const userContent = [
    topic ? `Sujet : ${topic}` : '',
    factsStr ? `Données calculées (JSON) :\n${factsStr}` : '',
    question
      ? `Question de l'utilisateur : ${question}`
      : "Explique ce calcul de manière simple et pédagogique.",
  ]
    .filter(Boolean)
    .join('\n\n');

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(
    deployment
  )}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      context.error(`Azure OpenAI error ${res.status}`);
      return { status: 502, jsonBody: { error: "L'assistant n'a pas pu répondre." } };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return { status: 502, jsonBody: { error: 'Réponse vide de l\'assistant.' } };
    }
    return { status: 200, jsonBody: { answer } };
  } catch (err) {
    context.error('Failed to reach Azure OpenAI:', err);
    return { status: 502, jsonBody: { error: "Impossible de joindre l'assistant." } };
  }
}

app.http('ai-assistant', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: aiAssistant,
});
