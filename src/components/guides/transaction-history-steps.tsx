import type { BrokerGuide } from './types';

const NBSP = '\u00a0';

/**
 * Guide for exporting the Fidelity Transaction History CSV.
 * Steps 1-2 reuse the Fidelity login screenshots (identical navigation path),
 * steps 3-5 use transaction-history–specific screenshots.
 */
export const transactionHistoryGuide: BrokerGuide = {
  brokerId: 'fidelity-transactions',
  brokerName: 'Historique Fidelity',
  steps: [
    {
      title: 'Connexion à Fidelity NetBenefits',
      description: (
        <>
          Connectez-vous à <strong>NetBenefits</strong> puis accédez à votre
          <strong> Compte de plan d'actionnariat</strong> Microsoft — mêmes étapes que pour l'export StockExport.
        </>
      ),
      image: '/tutorial/fidelity/step-2-login.png',
      imageAlt: "Page d'accueil NetBenefits",
    },
    {
      title: "Onglet Activité",
      description: (
        <>
          Sur la page du <strong>Compte de plan d'actionnariat</strong>, cliquez sur l'onglet
          <strong> «{NBSP}Activité{NBSP}»</strong> en haut de la page.
        </>
      ),
      image: '/tutorial/transactions/step-3-activity-tab.png',
      imageAlt: "Onglet Activité du Compte de plan d'actionnariat",
    },
    {
      title: 'Choisir la période',
      description: (
        <>
          Dans le menu déroulant <strong>«{NBSP}Date de transaction{NBSP}»</strong>, sélectionnez
          <strong> «{NBSP}Date choisie{NBSP}»</strong>. Les options trimestrielles ne couvrent pas
          une année civile complète.
        </>
      ),
      image: '/tutorial/transactions/step-4-date-dropdown.png',
      imageAlt: 'Menu déroulant Date de transaction',
    },
    {
      title: 'Année civile complète',
      description: (
        <>
          Renseignez la période <strong>du 1er janvier au 31 décembre</strong> de l'année à déclarer
          (par exemple <em>Jan-01-2025</em> → <em>Dec-31-2025</em> pour la déclaration faite en 2026),
          puis cliquez sur <strong>«{NBSP}Appliquer{NBSP}»</strong>. Un export partiel produirait
          des totaux incomplets.
        </>
      ),
      image: '/tutorial/transactions/step-5-date-range.png',
      imageAlt: 'Sélection de la période 1er janvier au 31 décembre',
    },
    {
      title: 'Exporter en CSV',
      description: (
        <>
          Cliquez sur <strong>«{NBSP}Exporter{NBSP}»</strong> en haut à droite de la liste.
          Fidelity télécharge un fichier <code>Transaction history.csv</code> que vous pourrez
          importer directement ici.
        </>
      ),
      image: '/tutorial/transactions/step-5-date-range.png',
      imageAlt: 'Bouton Exporter',
    },
  ],
};
