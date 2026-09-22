import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/** Last-resort net for render crashes: offers a reload, never loses stored data. */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Une erreur est survenue</h2>
            <p className="text-sm text-gray-600">
              L'application a rencontré un problème inattendu. Vos données sont sauvegardées dans le navigateur.
            </p>
            <pre className="text-xs text-left bg-red-50 text-red-700 p-3 rounded-lg overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
