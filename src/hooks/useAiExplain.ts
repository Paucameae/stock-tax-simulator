import { useState, useCallback, useEffect, useRef } from 'react';
import {
  fetchWithTimeout,
  httpErrorMessage,
  parseRetryAfter,
  apiErrorMessage,
  isAbortError,
} from '../lib/api-client';

interface ExplainRequest {
  /** Short label of what is being explained, e.g. "Détail du calcul fiscal". */
  topic: string;
  /** Pre-computed numbers/labels from the engine. NEVER raw PII. */
  facts: Record<string, unknown>;
  /** Optional free-text follow-up question. */
  question?: string;
}

interface UseAiExplainResult {
  answer: string | null;
  loading: boolean;
  error: string | null;
  explain: (req: ExplainRequest) => Promise<void>;
  reset: () => void;
}

/**
 * Calls the server-side AI assistant (Azure OpenAI behind /api/ai-assistant).
 * The server holds the key and rate-limits. We only ever send numbers/labels
 * already computed by the app — never raw portfolio data or identities.
 */
export function useAiExplain(): UseAiExplainResult {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const explain = useCallback(async (req: ExplainRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetchWithTimeout('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The API returns its own French message; fall back to the status wording.
        throw new Error(
          typeof data?.error === 'string' ? data.error : httpErrorMessage(res.status, parseRetryAfter(res))
        );
      }
      if (typeof data?.answer !== 'string') {
        throw new Error('Réponse inattendue de l\'assistant.');
      }
      setAnswer(data.answer);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(apiErrorMessage(e, "L'assistant est indisponible."));
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setAnswer(null);
    setError(null);
    setLoading(false);
  }, []);

  return { answer, loading, error, explain, reset };
}
