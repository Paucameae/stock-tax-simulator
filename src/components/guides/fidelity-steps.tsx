import type { BrokerGuide } from './types';

const NBSP = '\u00a0';

export const fidelityGuide: BrokerGuide = {
  brokerId: 'fidelity',
  brokerName: 'Fidelity NetBenefits',
  steps: [
    {
      title: 'Connexion',
      description: (
        <>
          Connectez-vous à votre compte <strong>Fidelity NetBenefits</strong> avec vos identifiants.
        </>
      ),
      image: '/tutorial/fidelity/step-1-login.png',
      imageAlt: 'Page de connexion Fidelity NetBenefits',
    },
    {
      title: 'Compte de plan',
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
      title: 'Détails des actions',
      description: (
        <>
          Dans la section <em>Vos actifs</em>, cliquez sur{' '}
          <strong>«{NBSP}Visualiser les détails des actions{NBSP}»</strong> pour MICROSOFT CORP (MSFT).
        </>
      ),
      image: '/tutorial/fidelity/step-3-login.png',
      imageAlt: "Compte de plan d'actionnariat — lien Visualiser les détails",
    },
    {
      title: 'Devise USD',
      description: (
        <>
          En haut à droite de la page, cliquez sur <strong>«{NBSP}Devise des actifs{NBSP}»</strong> et
          sélectionnez <strong>USD</strong>. Le fichier CSV doit impérativement être en dollars.
        </>
      ),
      image: '/tutorial/fidelity/step-4-login.png',
      imageAlt: 'Bouton Devise des actifs en haut à droite',
    },
    {
      title: 'Onglet',
      description: "Sélectionnez l'onglet correspondant à votre besoin.",
      image: '/tutorial/fidelity/step-4-login.png',
      imageAlt: 'Onglets Actions actuellement détenues / précédemment détenues',
      importModeHint: {
        positions: (
          <>
            → <strong>«{NBSP}Actions actuellement détenues{NBSP}»</strong> pour simuler une vente future.
          </>
        ),
        sales: (
          <>
            → <strong>«{NBSP}Actions précédemment détenues{NBSP}»</strong> pour déclarer des ventes déjà
            effectuées.
          </>
        ),
      },
    },
    {
      title: 'Export',
      description: (
        <>
          Cliquez sur le bouton <strong>«{NBSP}Exporter{NBSP}»</strong> en haut à droite pour télécharger
          le fichier CSV.
        </>
      ),
      image: '/tutorial/fidelity/step-4-login.png',
      imageAlt: 'Bouton Exporter',
    },
  ],
};
