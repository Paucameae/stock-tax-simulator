import * as React from 'react';
import { cn } from '../../lib/utils';
import { AlertTriangle, Info } from 'lucide-react';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'warning' | 'destructive';
}

export function Alert({ className, variant = 'default', children, ...props }: AlertProps) {
  const variants: Record<string, string> = {
    default: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    destructive: 'bg-red-50 border-red-200 text-red-800',
  };
  const icons: Record<string, React.ReactNode> = {
    default: <Info className="h-4 w-4 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
    destructive: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn('flex gap-2 rounded-md border p-3 text-sm', variants[variant], className)}
      {...props}
    >
      {icons[variant]}
      <div>{children}</div>
    </div>
  );
}
