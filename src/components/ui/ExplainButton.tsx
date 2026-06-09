import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Sparkles, Loader2, AlertTriangle, X } from 'lucide-react';
import { Button } from './button';
import { Dialog } from './dialog';
import { useAiExplain } from '../../hooks/useAiExplain';

interface ExplainButtonProps {
  /** Short label of what is being explained. */
  topic: string;
  /** Pre-computed numbers/labels passed to the assistant as grounding. */
  facts: Record<string, unknown>;
  /** Optional override of the button label. */
  label?: string;
  className?: string;
}

/**
 * "Expliquer ce calcul" button. Opens a dialog and asks the server-side AI
 * assistant to explain pre-computed figures. The assistant only explains —
 * it never recomputes the tax (grounding handled server-side).
 */
export function ExplainButton({ topic, facts, label = 'Expliquer ce calcul', className }: ExplainButtonProps) {
  const [open, setOpen] = useState(false);
  const { answer, loading, error, explain, reset } = useAiExplain();

  const handleOpen = useCallback(() => {
    setOpen(true);
    void explain({ topic, facts });
  }, [explain, topic, facts]);

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className={className}
        aria-label={label}
      >
        <Sparkles className="h-4 w-4 mr-1.5 text-primary" aria-hidden="true" />
        {label}
      </Button>

      <Dialog open={open} onClose={handleClose} className="max-w-lg">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            {topic}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[4rem] text-sm text-gray-700">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              L'assistant rédige une explication…
            </div>
          )}
          {!loading && error && (
            <div className="flex items-start gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && answer && (
            <MarkdownLite text={answer} />
          )}
        </div>

        <p className="mt-4 border-t pt-3 text-xs text-gray-400">
          Aide à la compréhension générée par IA, fondée sur vos chiffres calculés. Ce n'est pas un
          conseil fiscal personnalisé.
        </p>
      </Dialog>
    </>
  );
}

/**
 * Minimal, dependency-free Markdown renderer for the assistant's answers.
 * Supports paragraphs, `- `/`* ` bullet lists and inline `**bold**`.
 * Renders to React elements (no dangerouslySetInnerHTML) to stay XSS-safe.
 */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="leading-relaxed">
          {renderInline(paragraph.join(' '))}
        </p>
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1">
          {list.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else if (line === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}

/** Render inline `**bold**` segments; everything else stays plain text. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    return bold ? (
      <strong key={i} className="font-semibold text-gray-900">
        {bold[1]}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}
