# Stock Tax Simulator — Simulateur fiscal français actions MSFT

Outil web pour calculer l'impôt français sur la vente d'actions Microsoft
acquises via **ESPP** (Employee Stock Purchase Plan) et **Stock Awards**
(DO / FM / FQ). Gère les deux régimes (PFU et barème), le seuil AGA de
300 000 €, la CEHR, les plus/moins-values, l'abattement pour durée de
détention, et la conversion USD→EUR au taux BCE historique.

> Application personnelle à visée pédagogique — ne se substitue pas à un
> conseiller fiscal.

## Stack

- **Front** : React 19, Vite 8, TypeScript 6, Tailwind v4
- **API** : Azure Functions v4 (Node 20) — endpoint `/api/msft-quote`
  (proxy vers Finnhub, cache 5 min, rate-limit 20 req/min/IP)
- **Tests** : Vitest + Testing Library (252 tests)
- **CI** : GitHub Actions (lint, type-check, tests, `npm audit`)
- **Déploiement** : Azure Static Web Apps
- **Stockage** : `localStorage` versionné (schéma v2)
- **PDF** : `pdfjs-dist` pour parser les avis d'imposition (N° fiscal, parts, RFR)
- **Taux de change** : API ECB Statistical Data Warehouse (données historiques)

## Démarrage

### Prérequis

- Node.js ≥ 20
- Azure Functions Core Tools v4 (`npm i -g azure-functions-core-tools@4`) pour
  l'API locale (optionnel — le front fonctionne sans)
- Une clé API Finnhub (gratuite sur <https://finnhub.io>)

### Installation

```pwsh
npm install
cd api ; npm install ; cd ..
```

### Configuration

Créer `api/local.settings.json` (ne **jamais** commiter ce fichier) :

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "",
    "FINNHUB_API_KEY": "VOTRE_CLE"
  }
}
```

### Lancer en local

Deux terminaux :

```pwsh
# Terminal 1 — front (port 5173)
npm run dev

# Terminal 2 — API (port 7071)
cd api ; func start
```

Vite proxifie `/api/*` vers `localhost:7071`.

### Scripts utiles

| Commande | Description |
|---|---|
| `npm run dev` | Dev server Vite avec HMR |
| `npm run build` | Build de production (`dist/`) |
| `npm run preview` | Servir le build de prod |
| `npm run lint` | ESLint flat config |
| `npm test` | Lancer les tests (Vitest run) |
| `npm run test:watch` | Vitest en mode watch |

## Structure

```
src/
  App.tsx                  Orchestrateur principal (onglets, state root)
  components/
    CsvImporter.tsx        Import CSV courtier (positions / ventes)
    SaleSimulator.tsx      Sélection de lots + simulation
    TaxCalculator.tsx      Résultat fiscal détaillé
    PfuVsBaremeComparator  Comparatif des 2 régimes
    Portfolio.tsx          Vue d'ensemble du portefeuille
    DeclarationGuide.tsx   Générateur de cases 2042 / 2074
    Settings.tsx           Paramètres + import PDF avis d'imposition
    BackupPanel.tsx        Export / import JSON de toutes les données
    TaxRulesPanel.tsx      Rappel des règles fiscales
    ErrorFallback.tsx      Alerte avec bouton "Réessayer"
    SoldLotsTable.tsx      Historique des ventes
    guides/                Tutoriels d'export par courtier
    ui/                    Primitives UI (button, card, dialog, etc.)
  hooks/
    useMsftPrice.ts        Fetch prix MSFT (API → Finnhub) + conversion EUR
    useEcbConversion.ts    Conversion EUR↔USD au taux BCE historique
  lib/
    tax-engine.ts          Orchestrateur de simulation (point d'entrée)
    acquisition-tax.ts     Gain d'acquisition (AGA Macron / pré-Macron)
    capital-gain-tax.ts    Plus/moins-value de cession (PFU / barème)
    tax-rates.ts           Barèmes IR / PS / AGA / CEHR par année
    thresholds.ts          Détection centralisée des seuils (300k, CEHR)
    lot-ranking.ts         Classement des lots par taux effectif
    declaration.ts         Génération des cases 2042 / 2074 / PS
    csv-parser.ts          Parsing CSV (papaparse) + garde-fous
    tax-notice-parser.ts   Extraction PDF avis d'imposition
    ecb-rates.ts           Client API BCE (taux historiques EUR/USD)
    backup.ts              Export/import JSON avec signature
    storage.ts             localStorage versionné (migration v1→v2)
    types.ts               Types partagés (StockLot, TaxSimulationResult…)
  __tests__/               Tests unitaires (252 au total)

api/
  src/functions/
    msft-quote.ts          Proxy Finnhub avec cache + rate-limit

public/
  tutorial/                Captures des tutoriels d'export courtier
  pdf.worker.min.mjs       Worker pdfjs (servi localement)
  sw.js                    Service worker (PWA)

.github/
  workflows/ci.yml         CI (lint + type-check + tests + audit)
  dependabot.yml           Mises à jour hebdomadaires groupées
```

## Références fiscales

- AGA : [CGI art. 80 quaterdecies](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037988008/)
- Abattement pour durée de détention : CGI art. 150-0 D
- CEHR : CGI art. 223 sexies
- Formulaire 2042 (déclaration principale) et 2074 (plus-values)
- Site officiel : <https://www.impots.gouv.fr>

## Tests

```pwsh
npm test                   # run all
npm test -- --run --coverage
```

Les fichiers `src/lib/__tests__/` couvrent toute la logique métier
(fiscal, parsing, stockage, backup). Les composants critiques
(`TaxCalculator`, `CsvImporter`, `Settings`, `BackupPanel`) ont
des tests de rendu via Testing Library.

## Déploiement

- Push sur `main` → Azure Static Web Apps déploie automatiquement (front + API).
- La CI GitHub Actions vérifie lint / types / tests / audit de dépendances à chaque push et PR.
- La policy CSP est définie dans [`staticwebapp.config.json`](./staticwebapp.config.json).

## Sécurité

- Les secrets (`FINNHUB_API_KEY`) ne vivent que côté serveur.
- `api/local.settings.json` est dans `.gitignore` ; ne jamais le commiter.
- `npm audit --audit-level=high` tourne en CI (front + api).
- Dependabot propose les mises à jour mineures/patch chaque semaine.
- Le rate-limit actuel de `/api/msft-quote` est en mémoire (par instance) :
  efficace en single-instance ; pour un scale-out, prévoir un cache partagé
  (Azure API Management / Redis).

## Contribution

1. Ajouter/modifier la logique dans `src/lib/` → ajouter les tests correspondants.
2. `npm run lint` et `npm test` avant chaque commit.
3. Utiliser des commits conventionnels (`feat`, `fix`, `test`, `docs`, `ci`).
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
