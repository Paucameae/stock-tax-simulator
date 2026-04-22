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
          Connectez-vous à <strong>NetBenefits</strong> avec vos identifiants habituels.
        </>
      ),
      image: '/tutorial/fidelity/step-1-login.png',
      imageAlt: 'Page de connexion Fidelity NetBenefits',
    },
    {
      title: "Compte de plan d'actionnariat",
      description: (
        <>
          Sur la page <em>Plans d'actionnariat</em>, cliquez sur{' '}
          <strong>«{NBSP}COMPTE DE PLAN D'ACTIONNARIAT{NBSP}»</strong> dans la section{' '}
          <em>Actions disponibles et espèces</em>.
        </>
      ),
      image: '/tutorial/fidelity/step-2-login.png',
      imageAlt: "Page Plans d'actionnariat — lien Compte de plan",
    },
    {
      title: 'Onglet Activité',
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
      title: 'Sélectionner « Date choisie »',
      description: (
        <>
          Dans le menu déroulant <strong>«{NBSP}Date de transaction{NBSP}»</strong>, choisissez
          <strong> «{NBSP}Date choisie{NBSP}»</strong> tout en bas de la liste. Les options
          trimestrielles ne couvrent pas une année civile complète.
        </>
      ),
      image: '/tutorial/transactions/step-4-date-dropdown.png',
      imageAlt: 'Menu déroulant Date de transaction — option Date choisie',
    },
    {
      title: 'Période puis export CSV',
      description: (
        <>
          Renseignez la période <strong>du 1er janvier au 31 décembre</strong> de l'année à déclarer
          (par exemple <em>Jan-01-2025</em> → <em>Dec-31-2025</em> pour la déclaration faite en 2026),
          cliquez sur <strong>«{NBSP}Appliquer{NBSP}»</strong>, puis sur{' '}
          <strong>«{NBSP}Exporter{NBSP}»</strong> en haut à droite de la liste pour télécharger le
          fichier <code>Transaction history.csv</code> à importer ici.
        </>
      ),
      image: '/tutorial/transactions/step-5-date-range.png',
      imageAlt: 'Sélection des dates, bouton Appliquer et bouton Exporter',
    },
  ],
};
