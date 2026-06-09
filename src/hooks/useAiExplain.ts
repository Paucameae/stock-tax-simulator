import { useState, useCallback } from 'react';

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

  const explain = useCallback(async (req: ExplainRequest) => {
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Erreur de l\'assistant');
      }
      if (typeof data?.answer !== 'string') {
        throw new Error('Réponse inattendue de l\'assistant.');
      }
      setAnswer(data.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'assistant est indisponible.");
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
