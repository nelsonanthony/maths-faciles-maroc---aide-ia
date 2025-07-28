
import React, { useState, useEffect } from 'react';
import { Exercise } from '@/types';
import { DesmosGraph } from '@/components/DesmosGraph';
import { XMarkIcon } from '@/components/icons';

interface EditExerciseModalProps {
  exercise: Exercise | null; // Null for creation
  seriesId: string;
  onSave: (exerciseData: Exercise, seriesId: string) => void;
  onClose: () => void;
}

const emptyExercise: Omit<Exercise, 'id'> = {
  statement: '',
  correctionSnippet: '',
  fullCorrection: '',
  imageUrl: '',
  latexFormula: ''
};

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ exercise, seriesId, onSave, onClose }) => {
  const [formData, setFormData] = useState<Omit<Exercise, 'id'> & { id?: string }>(exercise || emptyExercise);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  const isCreating = !exercise;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const formula = formData.latexFormula?.trim() ?? '';
    if (formula && !/^(y=|x=)/.test(formula)) {
      setFormulaError('La formule doit commencer par "y=" ou "x=" pour être valide.');
    } else {
      setFormulaError(null);
    }
  }, [formData.latexFormula]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (formulaError) {
      alert(`Veuillez corriger l'erreur : ${formulaError}`);
      return;
    }

    const fullCorrectionText = formData.fullCorrection?.trim() || '';
    const snippet = fullCorrectionText.split('\n')[0] || '';

    const finalExercise: Exercise = {
      id: formData.id || `ex-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      statement: formData.statement.trim(),
      correctionSnippet: snippet,
      fullCorrection: fullCorrectionText || undefined,
      imageUrl: formData.imageUrl?.trim() || undefined,
      latexFormula: formData.latexFormula?.trim() || undefined,
    };
    
    onSave(finalExercise, seriesId);
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-exercise-title"
        onClick={onClose}
      >
        <div 
          className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
            <h2 id="edit-exercise-title" className="text-xl font-bold text-brand-blue-300">
              {isCreating ? "Ajouter un Exercice" : "Modifier l'Exercice"}
            </h2>
            <button onClick={onClose} aria-label="Fermer la modale" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </header>

          <form onSubmit={handleSave} id="edit-exercise-form" className="flex-grow overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="statement" className="block text-sm font-medium text-gray-300 mb-1">Énoncé</label>
                  <textarea
                    id="statement"
                    name="statement"
                    value={formData.statement}
                    onChange={handleInputChange}
                    rows={8}
                    placeholder="Saisissez l'énoncé ici. Utilisez la syntaxe LaTeX comme $$...$$ ou \(...\) pour les formules."
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 font-mono"
                  />
                </div>
                 <div>
                  <label htmlFor="fullCorrection" className="block text-sm font-medium text-gray-300 mb-1">Correction Détaillée (optionnel)</label>
                  <textarea
                    id="fullCorrection"
                    name="fullCorrection"
                    value={formData.fullCorrection || ''}
                    onChange={handleInputChange}
                    rows={8}
                    placeholder="Saisissez la correction détaillée ici. La première ligne servira d'aperçu."
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-300 mb-1">URL de l'image (optionnel)</label>
                  <input
                    type="text" id="imageUrl" name="imageUrl" value={formData.imageUrl || ''} onChange={handleInputChange} placeholder="https://..."
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="latexFormula" className="block text-sm font-medium text-gray-300 mb-1">Formule du graphique (optionnel)</label>
                  <input
                    type="text" id="latexFormula" name="latexFormula" value={formData.latexFormula || ''} onChange={handleInputChange} placeholder="Ex: y = x^2 + 1"
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                  />
                  {formulaError && <p className="text-sm text-red-400 mt-1">{formulaError}</p>}
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Prévisualisation du graphique</h4>
                  {(formData.latexFormula?.trim() && !formulaError) ? (
                    <DesmosGraph latexFormula={formData.latexFormula} />
                  ) : (
                    <div className="w-full h-[300px] flex items-center justify-center rounded-lg border-2 border-dashed border-gray-600 bg-gray-900/50">
                      <p className="text-gray-500 text-center text-sm px-4">
                        {formulaError ? "Formule invalide pour la prévisualisation" : "Saisissez une formule valide pour voir un aperçu"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
          
          <footer className="flex justify-end gap-4 p-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300"
            > Annuler </button>
            <button
              type="submit" form="edit-exercise-form"
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700 disabled:opacity-50"
              disabled={!!formulaError}
            > {isCreating ? 'Ajouter l\'exercice' : 'Enregistrer les modifications'} </button>
          </footer>
        </div>
      </div>
    </>
  );
};
