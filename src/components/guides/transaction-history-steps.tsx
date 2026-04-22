import type { BrokerGuide } from './types';

const NBSP = '\u00a0';

export const transactionHistoryGuide: BrokerGuide = {
  brokerId: 'fidelity-transactions',
  brokerName: 'Historique Fidelity',
  steps: [
    {
      title: 'Connexion',
      description: (
        <>
          Connectez-vous à votre compte <strong>Fidelity NetBenefits</strong> puis accédez au
          <strong> Compte de plan d'actionnariat</strong> Microsoft (voir le guide <em>Fidelity</em> si besoin).
        </>
      ),
      image: '/tutorial/fidelity/step-2-login.png',
      imageAlt: "Page Plans d'actionnariat — lien Compte de plan",
    },
    {
      title: 'Historique des transactions',
      description: (
        <>
          Dans le menu, ouvrez l'onglet <strong>«{NBSP}Historique des transactions{NBSP}»</strong>.
        </>
      ),
      image: '/tutorial/fidelity/step-3-login.png',
      imageAlt: "Menu latéral — Historique des transactions",
    },
    {
      title: 'Période',
      description: (
        <>
          Sélectionnez <strong>l'année civile complète</strong> que vous souhaitez déclarer
          (par exemple <em>01/01/2025 au 31/12/2025</em> pour la déclaration faite en 2026).
          Un export partiel produirait des totaux incomplets.
        </>
      ),
      image: '/tutorial/fidelity/step-4-login.png',
      imageAlt: "Sélecteur de période",
    },
    {
      title: 'Export CSV',
      description: (
        <>
          Cliquez sur <strong>«{NBSP}Exporter{NBSP}»</strong> en haut à droite et choisissez le format CSV.
          Importez ensuite le fichier téléchargé dans le simulateur.
        </>
      ),
      image: '/tutorial/fidelity/step-4-login.png',
      imageAlt: 'Bouton Exporter',
    },
  ],
};
