import { X, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import React from 'react';
import { getTaxConfig, resolveTaxYear, TAX_RATE_SOURCES } from '../lib/tax-rates';
import { formatRate, formatEURWhole, formatDate } from '../lib/utils';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 text-sm text-gray-700 space-y-3">{children}</div>}
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

/** "250 001 € → 500 000 €" / "Au-delà de 500 000 €" for a CEHR bracket. */
function cehrBracketLabel(bracket: { from: number; to: number }): string {
  if (!Number.isFinite(bracket.to)) return `Au-delà de ${formatEURWhole(bracket.from - 1)}`;
  return `${formatEURWhole(bracket.from)} → ${formatEURWhole(bracket.to)}`;
}

/** "Jusqu'à 11 600 €" / "11 600 € → 29 579 €" / "Au-delà de 181 917 €". */
function irBracketLabel(brackets: { limit: number }[], index: number): string {
  const previous = index > 0 ? brackets[index - 1].limit : null;
  if (previous === null) return `Jusqu'à ${formatEURWhole(brackets[index].limit)}`;
  if (!Number.isFinite(brackets[index].limit)) return `Au-delà de ${formatEURWhole(previous)}`;
  return `${formatEURWhole(previous)} → ${formatEURWhole(brackets[index].limit)}`;
}

/**
 * Flat 30 % election open to AGA granted before 28/09/2012 (CGI art. 200 A, 6
 * bis in its pre-2012 wording). Not in `TaxConfig`: the engine does not
 * implement this election yet, so it has no rate to expose.
 */
const FLAT_RATE_PRE_2012 = 0.30;
const FLAT_RATE_PRE_2012_LABEL = formatRate(FLAT_RATE_PRE_2012);

/** Sources sorted oldest-verification-first: what needs re-checking comes up top. */
const sources = Object.values(TAX_RATE_SOURCES).sort(
  (a, b) => a.verifiedOn.localeCompare(b.verifiedOn) || a.label.localeCompare(b.label, 'fr')
);

/** "2026-09-22" → "22/09/2026", parsed as local time so the day never shifts. */
function formatVerificationDate(iso: string): string {
  return formatDate(new Date(`${iso}T00:00:00`));
}

export function TaxRulesPanel({ onClose, fiscalYear }: { onClose: () => void; fiscalYear: number }) {
  const cfg = React.useMemo(() => getTaxConfig(fiscalYear), [fiscalYear]);
  const taxYear = React.useMemo(() => resolveTaxYear(fiscalYear), [fiscalYear]);

  // Every rate below comes from `cfg`: this panel used to hard-code them and
  // had drifted from the engine on five figures at once (CSG déductible, PS
  // activité, PS dividendes and the IR brackets).
  const irTopRate = formatRate(cfg.brackets[cfg.brackets.length - 1].rate);
  const irRange = `0 → ${irTopRate}`;
  const psPatrimoine = formatRate(cfg.psPatrimoine);
  const psActivite = formatRate(cfg.psActivite);
  const csgDeductible = formatRate(cfg.csgDeductible);
  const salaryContribution = formatRate(cfg.salaryContributionRate);
  const abatementShort = formatRate(cfg.agaAbatementRateShort);
  const abatementLong = formatRate(cfg.agaAbatementRateLong);
  const agaThreshold = formatEURWhole(cfg.agaThreshold);
  const pfuIr = formatRate(cfg.pfuIrRate);
  const pfuTotal = formatRate(cfg.pfuTotalRate);
  const psDividends = formatRate(cfg.psDividends);
  const pfuDividendsTotal = formatRate(cfg.pfuDividendsTotalRate);
  const csgDeductibleDividends = formatRate(cfg.csgDeductibleDividends);
  const cehrRates = `${formatRate(cfg.cehrSingle[0].rate)} / ${formatRate(cfg.cehrSingle[1].rate)}`;
  const cehrTopRate = formatRate(cfg.cehrSingle[cfg.cehrSingle.length - 1].rate);
  const topBracketRate = cfg.brackets[cfg.brackets.length - 1].rate;
  const topCehrRate = cfg.cehrSingle[cfg.cehrSingle.length - 1].rate;

  // Worst-case aggregate rates, recomputed from `cfg` rather than stated as a
  // constant: the "~66 %" that used to be hard-coded here had been obtained
  // with an erroneous 11,1 % PS activité.
  const maxRatePreMacron2012 = formatRate(
    topBracketRate + cfg.psActivite + cfg.salaryContributionRate + topCehrRate
  );
  const maxRatePre2012 = formatRate(
    FLAT_RATE_PRE_2012 + cfg.psPatrimoine + cfg.salaryContributionRate + topCehrRate
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Règles fiscales — Aide-mémoire</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Taux applicables aux revenus {taxYear.appliedYear}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {!taxYear.covered && (
            <div
              className="flex items-start gap-3 p-4 rounded-lg border-2 border-red-300 bg-red-50 text-red-900"
              role="alert"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold">
                  Aucun barème vérifié pour {fiscalYear} — taux affichés : ceux de {taxYear.appliedYear}
                </p>
                <p className="mt-1">
                  Tant que les chiffres {fiscalYear} ne sont pas intégrés, traitez ce mémo comme un ordre de
                  grandeur et vérifiez les taux sur impots.gouv.fr.
                </p>
              </div>
            </div>
          )}
          {/* ---- ESPP ---- */}
          <Section title="ESPP — Plan d'achat d'actions avec rabais">
            <p>
              Le rabais (typiquement 10 %) est un <strong>gain d'acquisition</strong> imposé comme du <strong>salaire</strong> l'année de l'achat, prélevé à la source.
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label={`Barème progressif (${irRange})`} value="salaire" />
              <Rate label="Cotisations sociales" value="incluses en paie" />
              <Rate label="CEHR (si applicable)" value={cehrRates} />
            </div>
            <p className="text-xs text-gray-500">
              Déclaration : 2042 — cases 1AJ/1BJ (prérempli). PAS en 8HV/8IV.
            </p>
          </Section>

          {/* ---- Non-qualifiés ---- */}
          <Section title="Stock Awards non qualifiés — Imposition au vesting">
            <p>
              Le gain d'acquisition (= valeur au vesting) est imposé comme du <strong>salaire</strong> l'année du vesting, prélevé à la source via le mécanisme <em>Sell-to-cover</em>.
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label={`Barème progressif (${irRange})`} value="salaire" />
              <Rate label="Cotisations sociales" value="incluses en paie" />
              <Rate label="CEHR (si applicable)" value={cehrRates} />
            </div>
            <p className="text-xs text-gray-500">
              Déclaration : 2042 — cases 1AJ/1BJ (prérempli). PAS en 8HV/8IV.
            </p>
            <p>
              À la <strong>cession</strong>, seule la <strong>plus/moins-value</strong> (prix de vente − valeur au vesting) est imposée (voir section PV de cession).
            </p>
          </Section>

          {/* ---- Qualifiés Macron I ---- */}
          <Section title="Stock Awards qualifiés — Régime Macron I (attribution ≥ 01/01/2018)">
            <p>
              Le gain d'acquisition est imposé <strong>à la cession</strong> (pas au vesting). Deux fractions :
            </p>
            <div className="rounded bg-blue-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-blue-900">Fraction ≤ {agaThreshold}</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif après abattement" value={irRange} />
                <Rate label="Abattement fixe (sans condition de durée)" value={abatementShort} />
                <Rate label="PS (sur montant brut, sans abattement)" value={psPatrimoine} />
              </div>
            </div>
            <div className="rounded bg-amber-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-amber-900">Fraction &gt; {agaThreshold}</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif (pas d'abattement)" value={irRange} />
                <Rate label="Cotisations sociales (activité)" value={psActivite} />
                <Rate label="Contribution salariale" value={salaryContribution} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Si la MV de cession est supérieure au prix de vente, elle s'impute sur le gain d'acquisition.
            </p>
            <p className="text-xs text-gray-500">
              Déclaration : 2042-C — cases 1TZ (≤ 300k après abattement), 1UZ (abattement), 1TT (&gt; 300k).
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          {/* ---- Qualifiés pré-Macron ---- */}
          {/* ---- Qualifiés transitoire 31/12/2016 → 31/12/2017 ---- */}
          <Section title="Stock Awards qualifiés — Transitoire (31/12/2016 → 31/12/2017)">
            <p>
              Le gain d'acquisition est imposé <strong>à la cession</strong>. Deux fractions avec abattement pour durée de détention :
            </p>
            <div className="rounded bg-blue-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-blue-900">Fraction ≤ {agaThreshold}</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif après abattement" value={irRange} />
                <Rate label="Abattement (détention 2–8 ans depuis vesting)" value={abatementShort} />
                <Rate label="Abattement (détention > 8 ans)" value={abatementLong} />
                <Rate label="PS (patrimoine, sur montant brut)" value={psPatrimoine} />
              </div>
            </div>
            <div className="rounded bg-amber-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-amber-900">Fraction &gt; {agaThreshold}</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif (pas d'abattement)" value={irRange} />
                <Rate label="Cotisations sociales (activité)" value={psActivite} />
                <Rate label="Contribution salariale" value={salaryContribution} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              La durée de détention est appréciée entre la date d'acquisition définitive et la date de cession.
            </p>
            <p className="text-xs text-gray-500">
              Déclaration : 2042-C — cases 1TZ (≤ 300k après abattement), 1UZ (abattement), 1TT (&gt; 300k).
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          {/* ---- Qualifiés 08/08/2015 → 30/12/2016 ---- */}
          <Section title="Stock Awards qualifiés — Pré-Macron (08/08/2015 → 30/12/2016)">
            <p>
              Le gain d'acquisition bénéficie des abattements pour durée de détention (comme les plus-values mobilières).
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="IR : barème progressif après abattement" value={irRange} />
              <Rate label="Abattement (détention 2–8 ans depuis vesting)" value={abatementShort} />
              <Rate label="Abattement (détention > 8 ans)" value={abatementLong} />
              <Rate label="PS (patrimoine, sur montant brut)" value={psPatrimoine} />
            </div>
            <p className="text-xs text-gray-500">
              Pas de contribution salariale. Déclaration : 2042-C — mêmes cases que les plus-values mobilières.
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          {/* ---- Qualifiés 28/09/2012 → 07/08/2015 ---- */}
          <Section title="Stock Awards qualifiés — Pré-Macron (28/09/2012 → 07/08/2015)">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Barème progressif (traitements & salaires, sans abattement)" value={irRange} />
              <Rate label="PS (activité)" value={psActivite} />
              <Rate label="Contribution salariale" value={salaryContribution} />
              <Rate label="CEHR (si applicable)" value={cehrRates} />
            </div>
            <p className="text-xs text-gray-500">
              Taux maximum global : ~{maxRatePreMacron2012} ({irTopRate} IR + {psActivite} PS + {salaryContribution} contribution
              salariale + {cehrTopRate} CEHR). Déclaration : 2042-C — cases 1TT/1UT.
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          <Section title="Stock Awards qualifiés — Avant le 28/09/2012">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Option 1 : taux forfaitaire" value={FLAT_RATE_PRE_2012_LABEL} />
              <Rate label="Option 2 : barème progressif" value={irRange} />
              <Rate label="PS (patrimoine)" value={psPatrimoine} />
              <Rate label="Contribution salariale (si attribué après 16/10/2007)" value={salaryContribution} />
              <Rate label="CEHR (si applicable)" value={cehrRates} />
            </div>
            <p className="text-xs text-gray-500">
              Taux maximum global : ~{maxRatePre2012} ({FLAT_RATE_PRE_2012_LABEL} forfaitaire + {psPatrimoine} PS +{' '}
              {salaryContribution} contribution salariale + {cehrTopRate} CEHR). Déclaration : 2042-C — cases 3VI / 3VJ-VK / 3VN.
            </p>
          </Section>

          {/* ---- PV de cession ---- */}
          <Section title="Plus/moins-values de cession">
            <p>
              PV = prix de cession − prix d'acquisition (= valeur au vesting, converti en EUR au taux BCE du jour).
            </p>
            <div className="rounded bg-green-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-green-900">Option PFU (Flat Tax)</p>
              <div className="space-y-1">
                <Rate label="IR forfaitaire" value={pfuIr} />
                <Rate label="PS" value={psPatrimoine} />
                <Rate label="Total" value={pfuTotal} />
              </div>
              <p className="text-xs text-green-700">Pas d'abattement pour durée de détention. Pas de CSG déductible.</p>
            </div>
            <div className="rounded bg-indigo-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-indigo-900">Option barème progressif (case 2OP)</p>
              <div className="space-y-1">
                <Rate label="IR barème progressif" value={irRange} />
                <Rate label="PS (sur PV avant abattement)" value={psPatrimoine} />
                <Rate label="CSG déductible l'année suivante" value={csgDeductible} />
              </div>
              <p className="text-xs text-indigo-700">
                Abattement durée de détention (titres acquis avant 01/01/2018 uniquement) : {abatementShort} (2–8 ans), {abatementLong} (&gt; 8 ans).
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Les moins-values sont reportables pendant 10 ans et imputables sur les plus-values futures.
            </p>
            <p className="text-xs text-gray-500">
              Déclaration : annexe 2074, puis 2042 — cases 3VG (PV) / 3VH (MV), 3SG (abattement).
            </p>
          </Section>

          {/* ---- Dividendes ---- */}
          <Section title="Dividendes (actions conservées à l'étranger)">
            <p>
              Dividendes trimestriels imposables en France. Retenue à la source US : 15 % (crédit d'impôt via convention).
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-2 text-sm">
              <p className="font-semibold">PFU : {pfuIr} IR + {psDividends} PS = {pfuDividendsTotal}</p>
              <p className="font-semibold">Barème (option) : abattement 40 % sur IR, PS {psDividends} sans abattement, CSG déductible {csgDeductibleDividends}</p>
            </div>
            <p className="text-xs text-gray-500">
              Si le broker ne prélève pas : formulaire <strong>2778-DIV</strong> + paiement au plus tard le 15 du mois suivant la perception.
            </p>
            <p className="text-xs text-gray-500">
              Dispense possible si RFR N-2 &lt; 50k€ (célibataire) / 75k€ (couple).
            </p>
            <p className="text-xs text-gray-500">
              Déclaration annuelle : annexe 2047, puis 2042 — 2DC (brut), 2CG (si PFU) ou 2BH (si barème), 2AB (retenue US 15 %), 2CK (PFNL trimestriel déjà versé), 8VL/8PL (crédit d'impôt), 2OP si barème.
            </p>
          </Section>

          {/* ---- CEHR ---- */}
          <Section title="CEHR — Contribution Exceptionnelle sur les Hauts Revenus">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <p className="font-semibold text-sm mb-2">Célibataire</p>
              {cfg.cehrSingle.map((b) => (
                <Rate key={b.from} label={cehrBracketLabel(b)} value={formatRate(b.rate)} />
              ))}
            </div>
            <div className="rounded bg-gray-50 p-3 space-y-1 mt-2">
              <p className="font-semibold text-sm mb-2">Couple (imposition commune)</p>
              {cfg.cehrCouple.map((b) => (
                <Rate key={b.from} label={cehrBracketLabel(b)} value={formatRate(b.rate)} />
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Assise sur le Revenu Fiscal de Référence (RFR). S'applique sans abattement.
            </p>
          </Section>

          {/* ---- Obligations déclaratives ---- */}
          <Section title="Obligations déclaratives — Récapitulatif">
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">①</span>
                <span><strong>Vesting non qualifié / ESPP</strong> → 2042 (1AJ/1BJ) + PAS (8HV/8IV) — prérempli, à vérifier.</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">②</span>
                <span><strong>Dividendes</strong> → 2778-DIV chaque trimestre (si broker ne prélève pas) + 2047 + 2042 (2DC/2CG, 2CK, 2OP si barème).</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">③</span>
                <span><strong>Cession d'actions</strong> → annexe 2074 + 2042 (3VG/3VH, 3SG) + 2042-C (1TZ/1UZ/1TT si qualifié Macron).</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">④</span>
                <span><strong>Compte à l'étranger</strong> → annexe 3916 + case 8UU. Amende : 1 500 € / 10 000 € par compte omis.</span>
              </div>
            </div>
          </Section>

          {/* ---- Barème IR ---- */}
          <Section title={`Barème progressif de l'IR (revenus ${taxYear.appliedYear})`}>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              {cfg.brackets.map((bracket, i) => (
                <Rate
                  key={bracket.limit}
                  label={irBracketLabel(cfg.brackets, i)}
                  value={formatRate(bracket.rate)}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Le barème est appliqué par part de quotient familial : impôt = (revenu ÷ parts) × barème × parts, plafonné.
            </p>
          </Section>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
            <strong>⚠️ Rappel important :</strong> ce résumé est indicatif et basé sur la législation en vigueur (source : présentation KPMG Avocats). Il ne constitue pas un conseil fiscal. Consultez un professionnel pour votre situation personnelle.
          </div>

          {/* ---- Sources ---- */}
          <Section title="Sources et dates de vérification">
            <p className="text-xs text-gray-500">
              Chaque taux utilisé par le simulateur est rattaché au texte dont il provient et à la date de
              son dernier recoupement. Un lien signifie que le texte consolidé a été lu à cette date.
            </p>
            <div className="space-y-2">
              {sources.map((source) => (
                <div key={source.label} className="border-b border-gray-100 pb-2 last:border-0">
                  <p className="font-medium text-gray-900 text-sm">{source.label}</p>
                  <p className="text-xs text-gray-600">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-600 hover:text-blue-800"
                      >
                        {source.reference}
                      </a>
                    ) : (
                      source.reference
                    )}
                    {' — vérifié le '}
                    {formatVerificationDate(source.verifiedOn)}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
