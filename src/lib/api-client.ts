/**
 * Shared HTTP helpers for the two server-side endpoints (/api/msft-quote,
 * /api/ai-assistant). Both are rate-limited and can be slow or unreachable,
 * so every call gets an abort deadline and a user-readable failure message.
 */

export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * `fetch` with an abort deadline. Honours a caller-provided `signal` in
 * addition to the deadline, so callers can cancel on unmount.
 * Rejects with a `TimeoutError` DOMException when the deadline elapses.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Délai dépassé', 'TimeoutError'));
  }, timeoutMs);

  const external = init.signal;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) forwardAbort();
    else external.addEventListener('abort', forwardAbort);
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forwardAbort);
  }
}

/** Seconds advertised by a `Retry-After` header, when present and numeric. */
export function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers?.get?.('Retry-After');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

/** Turn an HTTP status into an actionable French message. */
export function httpErrorMessage(status: number, retryAfterSeconds?: number): string {
  if (status === 429) {
    return retryAfterSeconds
      ? `Trop de requêtes — réessayez dans ${retryAfterSeconds} s.`
      : 'Trop de requêtes — réessayez dans un instant.';
  }
  if (status === 503) return 'Service temporairement indisponible — réessayez dans un instant.';
  if (status >= 500) return 'Le service a rencontré une erreur — réessayez plus tard.';
  if (status === 413) return 'Requête trop volumineuse pour le service.';
  if (status === 404) return 'Service introuvable — l’application est peut-être en cours de mise à jour.';
  if (status >= 400) return 'Requête refusée par le service.';
  return 'Réponse inattendue du service.';
}

/** True when the error is an abort we triggered ourselves (unmount, retry). */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Turn a thrown value into an actionable French message. Messages already
 * produced by `httpErrorMessage` (or by the API itself) are passed through.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'Délai dépassé — le service ne répond pas. Réessayez.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Vous êtes hors ligne — une connexion est nécessaire pour cette donnée.';
  }
  if (err instanceof TypeError) {
    return 'Connexion impossible au service — vérifiez votre réseau.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
