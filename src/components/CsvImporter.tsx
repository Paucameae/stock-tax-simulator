import React, { useCallback } from 'react';
import { Upload, FileText, RefreshCw, ShoppingCart, DollarSign } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { parseCsvFile, parseSalesCsvFile } from '../lib/csv-parser';
import { useEcbConversion } from '../hooks/useEcbConversion';
import type { StockLot, SoldLot } from '../lib/types';

type ImportMode = 'positions' | 'sales';

interface CsvImporterProps {
  onImport: (lots: StockLot[]) => void;
  onImportSales?: (soldLots: SoldLot[]) => void;
}

export const CsvImporter = React.memo(function CsvImporter({ onImport, onImportSales }: CsvImporterProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [importMode, setImportMode] = React.useState<ImportMode>('positions');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { convertLots, convertSoldLots, loading, error: ecbError } = useEcbConversion();

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;

          if (importMode === 'sales') {
            const soldLots = parseSalesCsvFile(text);
            if (soldLots.length === 0) {
              setError('Aucune vente trouvée dans le fichier. Vérifiez le format CSV.');
              return;
            }
            const { converted } = await convertSoldLots(soldLots);
            onImportSales?.(converted);
          } else {
            const lots = parseCsvFile(text);
            if (lots.length === 0) {
              setError('Aucun lot valide trouvé dans le fichier. Vérifiez le format CSV.');
              return;
            }
            const { converted } = await convertLots(lots);
            onImport(converted);
          }
        } catch (err) {
          setError('Erreur lors de la lecture du fichier : ' + (err as Error).message);
        }
      };
      reader.onerror = () => setError('Erreur lors de la lecture du fichier.');
      reader.readAsText(file, 'utf-8');
    },
    [onImport, onImportSales, importMode, convertLots, convertSoldLots]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Importer le fichier CSV Fidelity
        </CardTitle>
        <CardDescription>
          Glissez-déposez votre fichier d'export CSV du broker Fidelity ou cliquez pour sélectionner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Import mode selector */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Type d'import :</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                importMode === 'positions'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => { setImportMode('positions'); setFileName(null); setError(null); }}
            >
              <FileText className="h-3.5 w-3.5" />
              Positions ouvertes
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                importMode === 'sales'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => { setImportMode('sales'); setFileName(null); setError(null); }}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Ventes effectuées
            </button>
          </div>
        </div>

        {importMode === 'sales' ? (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Importez l'export CSV des « lots de transactions fermées » depuis votre broker.
            Les ventes seront automatiquement traitées pour le calcul d'impôt et la déclaration.
          </div>
        ) : null}

        {/* USD requirement info */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <DollarSign className="h-4 w-4 shrink-0" />
          <span>
            Le fichier CSV doit être en <strong>dollars (USD)</strong>.
            Les taux de change BCE seront récupérés automatiquement pour chaque date.
            Exportez votre fichier depuis Fidelity avec l'option «&nbsp;USD&nbsp;».
          </span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Récupération des taux de change BCE en cours…
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-primary bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-600 mb-2">
            {fileName ? (
              <>Fichier chargé : <strong>{fileName}</strong></>
            ) : (
              'Glissez votre fichier CSV ici ou cliquez pour parcourir'
            )}
          </p>
          <Button variant="outline" size="sm" type="button">
            Choisir un fichier
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
        {(error || ecbError) && (
          <p className="mt-3 text-sm text-red-600">{error || ecbError}</p>
        )}
      </CardContent>
    </Card>
  );
});
