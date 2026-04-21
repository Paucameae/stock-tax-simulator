import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorFallbackProps {
  /** Main error message (string or rich content). */
  message: ReactNode;
  /** Optional secondary line with hints for the user. */
  hint?: ReactNode;
  /** If provided, a "Retry" button is rendered that calls this handler. */
  onRetry?: () => void;
  /** Variant influences colours and severity. */
  variant?: 'warning' | 'error';
  /** Optional className appended to the wrapper. */
  className?: string;
}

/**
 * Reusable inline error/warning panel with optional retry action.
 * Use this when an async operation fails (price fetch, ECB rates, etc.)
 * instead of just showing a text message.
 */
export function ErrorFallback({ message, hint, onRetry, variant = 'error', className = '' }: ErrorFallbackProps) {
  const colorClasses =
    variant === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-red-300 bg-red-50 text-red-900';

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-3 rounded-lg border-2 ${colorClasses} ${className}`}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-medium">{message}</p>
        {hint && <p className="mt-1 text-xs opacity-80">{hint}</p>}
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="shrink-0 gap-1"
          aria-label="Réessayer"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Réessayer
        </Button>
      )}
    </div>
  );
}
