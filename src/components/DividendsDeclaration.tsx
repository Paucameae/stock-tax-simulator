import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Coins, Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
import type { DividendEvent } from '../lib/transaction-parser';
import {
  enrichDividendsWithEur,
  groupDividendsByYear,
  buildDeclarationLines,
} from '../lib/dividends';
import { fetchECBRates } from '../lib/ecb-rates';
import { formatEUR } from '../lib/utils';

interface DividendsDeclarationProps {
  dividends: DividendEvent[];
  fiscalYear: number;
}

export function DividendsDeclaration({ dividends, fiscalYear }: DividendsDeclarationProps) {
  const [rates, setRates] = React.useState<Record<string, number>>({});
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (dividends.length === 0) return;
    let cancelled = false;
    fetchECBRates(dividends.map((d) => d.date)).then((r) => {
      if (!cancelled) setRates(r);
    });
    return () => {
      cancelled = true;
    };
  }, [dividends]);

  const { enriched } = React.useMemo(
    () => enrichDividendsWithEur(dividends, rates),
    [dividends, rates],
  );

  const yearSummary = React.useMemo(() => {
    const groups = groupDividendsByYear(enriched);
    return groups.find((g) => g.year === fiscalYear) ?? null;
  }, [enriched, fiscalYear]);

  if (dividends.length === 0) return null;

  const copyValue = (key: string, value: number) => {
    navigator.clipboard.writeText(value.toFixed(2).replace('.', ',')).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!yearSummary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-5 w-5" />
            Dividendes US {fiscalYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Aucun dividende perçu en {fiscalYear} d'après votre historique importé.
          </p>
        </CardContent>
      </Card>
    );
  }

  const lines = buildDeclarationLines(yearSummary);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-5 w-5" />
          Dividendes US {fiscalYear}
        </CardTitle>
        <CardDescription>
          {yearSummary.count} versement{yearSummary.count > 1 ? 's' : ''} Microsoft · brut{' '}
          {formatEUR(yearSummary.grossEur)} · retenue US {formatEUR(yearSummary.taxWithheldEur)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <DeclarationLine
          code="2DC"
          label="Dividendes bruts (revenus de capitaux mobiliers)"
          amount={lines.box2DC}
          note="Formulaire 2042 — à reporter tel quel."
          copied={copied === '2DC'}
          onCopy={() => copyValue('2DC', lines.box2DC)}
        />
        <DeclarationLine
          code="2AB"
          label="Crédit d'impôt lié aux revenus de capitaux mobiliers"
          amount={lines.box2AB}
          note="Retenue à la source US (15% par la convention fiscale France–USA), récupérable en crédit d'impôt."
          copied={copied === '2AB'}
          onCopy={() => copyValue('2AB', lines.box2AB)}
        />
        <DeclarationLine
          code="2BH"
          label="Revenus éligibles à l'abattement de 40% (si option barème)"
          amount={lines.box2BH}
          note="À reporter uniquement si vous optez pour l'imposition au barème progressif. Sinon, PFU à 30% sur 2DC."
          copied={copied === '2BH'}
          onCopy={() => copyValue('2BH', lines.box2BH)}
        />
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
          Conversion en euros au taux BCE du jour de chaque versement (méthode officielle DGFiP).
        </p>
      </CardContent>
    </Card>
  );
}

function DeclarationLine({
  code,
  label,
  amount,
  note,
  copied,
  onCopy,
}: {
  code: string;
  label: string;
  amount: number;
  note: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
      <div className="shrink-0 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono font-semibold">
        {code}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{note}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <span className="font-semibold tabular-nums">{formatEUR(amount)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCopy}
          aria-label={`Copier la valeur de la case ${code}`}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
