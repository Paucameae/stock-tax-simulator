import React from 'react';
import { Dialog, DialogHeader, DialogFooter } from './ui/dialog';

/** Disclaimer, credits and the legal-notice dialog, which nothing else needs. */
export function AppFooter({ extraBottomMargin }: { extraBottomMargin: boolean }) {
  const [legalOpen, setLegalOpen] = React.useState(false);

  return (
    <>
      <footer className={`border-t bg-white mt-12 ${extraBottomMargin ? 'mb-20' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-400 space-y-1">
          <div>
            ⚠️ Cet outil est un simulateur indicatif. Il ne constitue pas un conseil fiscal. Les calculs sont basés sur la législation fiscale française en vigueur et peuvent évoluer. Pour votre déclaration officielle, consultez un conseiller fiscal ou référez-vous aux instructions de KPMG Avocats fournies par votre employeur.
          </div>
          <div className="text-gray-300">
            Édité par Romain Eon-Ollio
            {' · '}
            <button
              type="button"
              onClick={() => setLegalOpen(true)}
              className="underline hover:text-gray-500 transition-colors"
            >
              Mentions légales
            </button>
            {' · '}
            <a
              href="https://github.com/Paucameae/stock-tax-simulator/issues/new?template=user-feedback.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-500 transition-colors"
            >
              Donner mon avis / signaler un bug
            </a>
          </div>
        </div>
      </footer>

      <Dialog open={legalOpen} onClose={() => setLegalOpen(false)} label="Mentions légales">
        <DialogHeader>Mentions légales</DialogHeader>
        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <div className="font-semibold text-gray-900">Éditeur</div>
            <div>Romain Eon-Ollio</div>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Contact</div>
            <div className="text-gray-500 italic">À compléter</div>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Hébergement</div>
            <div>Microsoft Azure Static Web Apps</div>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Données personnelles</div>
            <div>
              Cette application ne collecte aucune donnée personnelle. Toutes les informations saisies (positions, ventes, paramètres fiscaux) sont stockées localement dans votre navigateur et ne sont jamais transmises à un serveur.
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setLegalOpen(false)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
          >
            Fermer
          </button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
