import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Exercise } from '@/types';
import { DesmosGraph } from '@/components/DesmosGraph';
import { XMarkIcon, SpinnerIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';

interface EditExerciseModalProps {
  exercise: Exercise | null;
  seriesId: string;
  onSave: (exerciseData: Exercise, seriesId: string) => Promise<void>;
  onClose: () => void;
}

const emptyExercise: Omit<Exercise, 'id'> = {
  statement: '',
  correctionSnippet: '',
  fullCorrection: '',
  imageUrl: '',
  latexFormula: ''
};

// This function remains the same, it's for the simplified student-facing statement.
const transformForStudentView = (text: string): string => {
  if (!text) return '';

  return text
    // Transformation des indices
    .replace(/([a-zA-Zα-ω])_(\d+)/g, '$1-$2')  // x_1 → x-1
    .replace(/(\\[a-zA-Z]+)_(\d+)/g, '$1-$2')  // \alpha_2 → \alpha-2
    
    // Gestion des fonctions réciproques
    .replace(/f\^\{-1\}/g, 'f⁻¹')
    
    // Nettoyage des délimiteurs LaTeX
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\$/g, '')
    
    // Formules spéciales
    .replace(/\\pm/g, '±')
    .replace(/\\sqrt\{([^}]+)\}/g, '√$1');
};

const generateCorrectionContent = (data: any): string => {
  let content = '';

  if (data['Sous-questions préalables']) {
    content += `## Pistes pédagogiques\n${data['Sous-questions préalables'].join('\n')}\n\n`;
  }

  if (data.Correction) {
    Object.entries(data.Correction)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach(([qName, qData]) => {
      const q = qData as any;
      // Use the text directly from JSON
      content += `### ${qName}\n**Énoncé:** ${q['Énoncé'] || ''}\n\n`;

      Object.entries(q)
        .filter(([key]) => key.startsWith('Étape'))
        .forEach(([stepName, stepData]) => {
          const step = stepData as any;
          content += `#### ${stepName}\n`;
          if (step.Action) content += `**Méthode:** ${step.Action}\n`;
          // Use the text directly from JSON
          if (step.Calcul) content += `> **Formule:**\n> ${step.Calcul}\n`;
          // Use the text directly from JSON
          if (step.Explication) content += `${step.Explication}\n\n`;
        });
        
      // Use the text directly from JSON
      if (q.Conclusion) {
        content += `**Conclusion:** ${q.Conclusion}\n\n`;
      }
    });
  }
  
  // Use the text directly from JSON
  if (data.Astuce) {
    content += `## Astuce\n${data.Astuce}\n`;
  }

  return content;
};


export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ 
  exercise, 
  seriesId, 
  onSave, 
  onClose 
}) => {
  const [formData, setFormData] = useState<Omit<Exercise, 'id'> & { id?: string }>(exercise || emptyExercise);
  const [jsonInput, setJsonInput] = useState('');
  const [isJsonImporterOpen, setIsJsonImporterOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreating = !exercise;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleJsonImport = () => {
    if (!jsonInput.trim()) {
      setError("Veuillez coller le contenu JSON");
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      
      setFormData({
        statement: parsed.Correction ? 
          Object.entries(parsed.Correction)
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([q, data]) => `**${q}:** ${transformForStudentView((data as any)['Énoncé'])}`)
            .join('\n\n')
          : '',
        fullCorrection: generateCorrectionContent(parsed),
        latexFormula: '',
        imageUrl: ''
      });

      setJsonInput('');
      setIsJsonImporterOpen(false);
      setError(null);
    } catch (err) {
      setError("Format JSON invalide");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      await onSave({
        id: formData.id || `ex-${Date.now()}`,
        statement: formData.statement.trim(),
        correctionSnippet: formData.fullCorrection?.split('\n')[0]?.substring(0, 250) || '',
        fullCorrection: formData.fullCorrection?.trim() || undefined,
        imageUrl: formData.imageUrl?.trim() || undefined,
        latexFormula: formData.latexFormula?.trim() || undefined
      }, seriesId);
    } catch (err) {
      setError("Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  };

  const getPreviewContent = (text: string | undefined, fallback: string) => {
    const content = text || fallback;
    const parsed = marked.parse(content, { breaks: true });
    return DOMPurify.sanitize(parsed as string);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-brand-blue-300">
            {isCreating ? "Ajouter un Exercice" : "Modifier l'Exercice"}
          </h2>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"
            disabled={isSaving}
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSave} className="flex-grow overflow-y-auto p-6 space-y-6">
          <fieldset disabled={isSaving} className="space-y-6">
            <div className="bg-gray-900/50 rounded-lg border border-gray-700">
              <button
                type="button"
                onClick={() => setIsJsonImporterOpen(!isJsonImporterOpen)}
                className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-300"
              >
                <span>Importer depuis JSON</span>
                <span className={`transition-transform ${isJsonImporterOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {isJsonImporterOpen && (
                <div className="p-4 border-t border-gray-700 space-y-3">
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    rows={8}
                    placeholder='Collez votre JSON ici...'
                    className="w-full p-2 bg-gray-950 border border-gray-600 rounded-md text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleJsonImport}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    Importer
                  </button>
                  {error && <p className="text-red-400 text-sm">{error}</p>}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Énoncé (version élève)
                  </label>
                  <textarea
                    name="statement"
                    value={formData.statement}
                    onChange={handleInputChange}
                    rows={8}
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300"
                    placeholder="L'énoncé apparaîtra ici après importation..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Correction détaillée (version professeur)
                  </label>
                  <textarea
                    name="fullCorrection"
                    value={formData.fullCorrection || ''}
                    onChange={handleInputChange}
                    rows={10}
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Prévisualisation élève
                  </h4>
                  <div className="prose prose-invert max-w-none p-4 min-h-[10rem] bg-slate-900/50 rounded-lg border border-slate-700">
                    <MathJaxRenderer content={getPreviewContent(formData.statement, "Aucun énoncé")} />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Prévisualisation correction
                  </h4>
                  <div className="prose prose-invert max-w-none p-4 min-h-[12rem] bg-slate-900/50 rounded-lg border border-slate-700">
                    <MathJaxRenderer content={getPreviewContent(formData.fullCorrection, "Aucune correction")} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-gray-700/50">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  URL de l'image (optionnel)
                </label>
                <input
                  type="text"
                  name="imageUrl"
                  value={formData.imageUrl || ''}
                  onChange={handleInputChange}
                  className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Formule Desmos (optionnel)
                </label>
                <input
                  type="text"
                  name="latexFormula"
                  value={formData.latexFormula || ''}
                  onChange={handleInputChange}
                  placeholder="y = x^2"
                  className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300"
                />
              </div>
            </div>
          </fieldset>

          {formData.latexFormula && (
            <div className="pt-6 border-t border-gray-700/50">
              <h4 className="text-sm font-medium text-gray-400 mb-2">
                Prévisualisation graphique
              </h4>
              <DesmosGraph latexFormula={formData.latexFormula} />
            </div>
          )}
        </form>

        <footer className="p-4 border-t border-gray-700 bg-gray-800/50">
          {error && (
            <div className="mb-3 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700/50 border-2 border-gray-600 text-gray-300"
            >
              Annuler
            </button>
            <button
              type="submit"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-blue-600 border-2 border-brand-blue-500 text-white flex items-center gap-2"
            >
              {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
              {isCreating ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};