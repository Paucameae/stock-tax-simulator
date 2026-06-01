import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { applySwUpdate, subscribeSwUpdate } from '../lib/sw-update';

/**
 * Fixed banner shown when a new app version has been downloaded and is waiting
 * to activate. Clicking "Recharger" applies the update (SKIP_WAITING) and the
 * page reloads once, switching atomically from the old to the new version.
 */
export function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => subscribeSwUpdate(setUpdateReady), []);

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3 shadow-lg text-sm text-gray-700"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>Une nouvelle version de l{'\u2019'}application est disponible.</span>
        <button
          type="button"
          onClick={() => {
            setApplying(true);
            applySwUpdate();
          }}
          disabled={applying}
          className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {applying && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Recharger
        </button>
      </div>
    </div>
  );
}
