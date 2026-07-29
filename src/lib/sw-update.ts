/**
 * Service worker registration + update orchestration.
 *
 * Strategy (see public/sw.js): a newly deployed SW installs but stays in the
 * `waiting` state while the current version still controls open tabs, so an
 * active user keeps running on the version they loaded (cache intact, no risk
 * of a missing lazy chunk mid-deploy). When an update is waiting we surface an
 * in-app banner; clicking it posts SKIP_WAITING to the waiting worker and the
 * page reloads exactly once on `controllerchange`.
 */

type Listener = (waiting: boolean) => void;

let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l(waitingWorker !== null);
}

/** Subscribe to update-availability changes. Returns an unsubscribe fn. */
export function subscribeSwUpdate(listener: Listener): () => void {
  listeners.add(listener);
  // Replay current state so late subscribers (e.g. a banner mounted after the
  // update was detected) still get notified.
  if (waitingWorker !== null) listener(true);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the waiting service worker to take over, then reload. */
export function applySwUpdate(): void {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
}

function trackInstalling(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // `installed` while a controller already exists means this is an update
    // (not the first-ever install), so it is now waiting for us to activate it.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waitingWorker = worker;
      notify();
    }
  });
}

/**
 * The SW serves every same-origin GET cache-first, which in dev freezes Vite's
 * module graph: stale `/src/*.tsx` modules get mixed with freshly optimized
 * deps, ending in two React copies and a null hook dispatcher. Tear it down.
 */
async function unregisterInDev(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  // A still-controlled page keeps its stale module graph. One reload drops it —
  // and does not loop, since the next load finds no registration.
  if (registrations.length > 0) window.location.reload();
}

/** Register the service worker and wire up update detection. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    void unregisterInDev();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // An update may already be waiting (installed before this page load).
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting;
          notify();
        }
        registration.addEventListener('updatefound', () => {
          trackInstalling(registration.installing);
        });
      })
      .catch(() => {
        // Registration failed — the app still works without offline support.
      });

    // When the activated SW changes (after SKIP_WAITING), reload once so the
    // page runs entirely on the new version.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
