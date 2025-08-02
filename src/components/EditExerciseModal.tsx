





import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Exercise } from '@/types';
import { DesmosGraph } from '@/components/DesmosGraph';
import { XMarkIcon, SpinnerIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';

interface EditExerciseModalProps {
  exercise: Exercise | null; // Null for creation
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


// Helper function to recursively parse complex correction objects
const formatCorrectionObject = (obj: any, level: number): string => {
    let result = '';
    if (!obj || typeof obj !== 'object') return '';

    // Sort keys to try to maintain a logical order (e.g., etape_1, etape_2)
    const sortedKeys = Object.keys(obj).sort();

    for (const key of sortedKeys) {
        const value = obj[key];
        const formattedKey = key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

        if (typeof value === 'string') {
             result += `**${formattedKey}:**\n${value}\n\n`;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
             if (value.description) {
                result += `${'#'.repeat(level + 2)} ${formattedKey}: ${value.description}\n\n`;
            } else {
                 result += `${'#'.repeat(level + 2)} ${formattedKey}\n\n`;
            }
            const nestedContent = Object.keys(value)
                .filter(k => k !== 'description')
                .reduce((acc, k) => ({ ...acc, [k]: value[k] }), {});
            result += formatCorrectionObject(nestedContent, level + 1);
        }
    }
    return result;
};


const formatNewCorrectionJson = (correction: any, adaptation: any): string => {
    let markdown = '';

    if (correction?.bilan) {
        markdown += `### Bilan\n\n`;
        for (const [key, value] of Object.entries(correction.bilan)) {
            markdown += `*   **${key.charAt(0).toUpperCase() + key.slice(1)}:** ${value}\n`;
        }
        markdown += `\n---\n`;
    }

    if (correction?.détails) {
        markdown += `## Correction Détaillée\n\n`;
        for (const detail of correction.détails) {
            markdown += `### Partie ${detail.partie}\n\n`;
            if (detail.étapes) {
                for (const etape of detail.étapes) {
                    if (etape.action) markdown += `**Action :** ${etape.action}\n`;
                    if (etape.calcul) markdown += `> **Calcul :**\n> $$${etape.calcul}$$\n`;
                    if (etape.explication) markdown += `*Explication :* ${etape.explication}\n`;
                     if (etape.piège) markdown += `*Piège à éviter :* ${etape.piège}\n\n`;
                     if (etape.exemple) markdown += `*Exemple :* ${etape.exemple}\n\n`;
                     if (etape.argument) markdown += `*Argument :* ${etape.argument}\n\n`;
                }
            }
            if (detail.conclusion) markdown += `**Conclusion :** ${detail.conclusion}\n\n`;
            if (detail.astuce) markdown += `**Astuce :** ${detail.astuce}\n\n`;
        }
        markdown += `\n---\n`;
    }

    if (correction?.méthodologie) {
        markdown += `## Méthodologie\n\n`;
        const meth = correction.méthodologie;
        if (meth.difficulté) markdown += `*   **Difficulté :** ${meth.difficulté}\n`;
        if (meth.points_clés) markdown += `*   **Points Clés :**\n    *   ${meth.points_clés.join('\n    *   ')}\n`;
        if (meth.erreurs_fréquentes) markdown += `*   **Erreurs fréquentes :**\n    *   ${meth.erreurs_fréquentes.join('\n    *   ')}\n`;
        markdown += `\n---\n`;
    }
    
    if (adaptation?.analogies) {
        markdown += `## Analogies pour mieux comprendre\n\n`;
        for (const [key, value] of Object.entries(adaptation.analogies)) {
            markdown += `*   **${key.charAt(0).toUpperCase() + key.slice(1)} :** ${value}\n`;
        }
    }

    return markdown;
};

// Helper function for the "structured analysis" format
const formatStructuredAnalysisCorrection = (data: any): string => {
    let markdown = '';

    // Pistes de réflexion
    if (data['sous-questions_préalables'] && Array.isArray(data['sous-questions_préalables'])) {
        markdown += `## Pistes de réflexion\n\n`;
        markdown += data['sous-questions_préalables'].map((q: string) => `*   ${q}`).join('\n');
        markdown += `\n\n---\n\n`;
    }

    // Correction détaillée
    if (data.correction && typeof data.correction === 'object') {
        markdown += `## Correction Détaillée\n\n`;
        const sortedParties = Object.keys(data.correction).sort();

        for (const partie of sortedParties) {
            markdown += `### Partie ${partie}\n\n`;
            const details = data.correction[partie];
            if (typeof details === 'object') {
                for (const key in details) {
                    const value = details[key];
                    const formattedKey = key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
                    if (key === 'calcul') {
                         markdown += `> **${formattedKey}:**\n> $$${value}$$\n\n`;
                    } else {
                        markdown += `*   **${formattedKey}:** ${value}\n`;
                    }
                }
            }
             markdown += `\n`;
        }
        markdown += `\n---\n\n`;
    }
    
    // Conclusion
    if (data.conclusion && typeof data.conclusion === 'object') {
        markdown += `## Conclusion\n\n`;
        if (data.conclusion.résumé) {
            markdown += `### Résumé\n\n`;
            const resumeLines = data.conclusion.résumé.split('\n').map((line: string) => `*   ${line}`);
            markdown += resumeLines.join('\n') + `\n\n`;
        }
        if (data.conclusion.astuce_générale) {
             markdown += `### Astuce Générale\n\n`;
             const astuceLines = data.conclusion.astuce_générale.split('\n').map((line: string) => `*   ${line}`);
             markdown += astuceLines.join('\n') + `\n`;
        }
    }

    return markdown.trim();
};


// Helper function for the "propositions" format
const formatPropositionsCorrection = (correction: any): string => {
    let markdown = '';

    if (correction?.solutions && Array.isArray(correction.solutions)) {
        markdown += `## Solutions Détaillées\n\n`;
        for (const sol of correction.solutions) {
            markdown += `### Proposition ${sol.proposition}\n`;
            markdown += `*   **Réponse :** ${sol.reponse}\n`;
            markdown += `*   **Explication :** ${sol.explication}\n`;
            if (sol.methode) {
                markdown += `*   **Méthode :** ${sol.methode}\n`;
            }
            markdown += '\n';
        }
        markdown += '---\n\n';
    }

    if (correction?.astuces && typeof correction.astuces === 'object') {
        markdown += `## Astuces Générales\n\n`;
        for (const [key, value] of Object.entries(correction.astuces)) {
            const formattedKey = key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
            markdown += `*   **${formattedKey} :** ${value}\n`;
        }
        markdown += '\n---\n\n';
    }

    if (correction?.erreurs_frequentes && Array.isArray(correction.erreurs_frequentes)) {
        markdown += `## Erreurs Fréquentes à Éviter\n\n`;
        for (const err of correction.erreurs_frequentes) {
            markdown += `*   ${err}\n`;
        }
        markdown += '\n';
    }

    return markdown.trim();
};


export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ exercise, seriesId, onSave, onClose }) => {
  const [formData, setFormData] = useState<Omit<Exercise, 'id'> & { id?: string }>(exercise || emptyExercise);
  const [jsonInput, setJsonInput] = useState('');
  const [isJsonImporterOpen, setIsJsonImporterOpen] = useState(false);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isCreating = !exercise;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleJsonImport = () => {
    if (!jsonInput.trim()) {
        alert("Veuillez coller le contenu JSON dans la zone de texte.");
        return;
    }
    try {
        const parsedJson = JSON.parse(jsonInput);
        
        let statement = '';
        let fullCorrection = '';
        let latexFormula = '';

        // --- Handle structured analysis format (most complex) ---
        if (parsedJson.énoncé?.texte && parsedJson.correction && parsedJson.conclusion) {
             statement = parsedJson.énoncé.texte;
             fullCorrection = formatStructuredAnalysisCorrection(parsedJson);

        // --- Handle detailed function analysis format ---
        } else if (parsedJson.énoncé && parsedJson.correction) {
            const { énoncé, correction, adaptation } = parsedJson;
            if (énoncé.fonction) {
                statement += `Soit la fonction ${énoncé.fonction}.\n\n`;
                latexFormula = énoncé.fonction.split(' = ')[1] || '';
            }
            if (énoncé.questions && Array.isArray(énoncé.questions)) {
                statement += énoncé.questions
                    .map((q: any) => `*   **${q.partie}** ${q.énoncé}`)
                    .join('\n');
            }
            fullCorrection = formatNewCorrectionJson(correction, adaptation);
        
        // --- Handle propositions/solutions format ---
        } else if (parsedJson.exercice?.propositions && parsedJson.correction?.solutions) {
            const ex = parsedJson.exercice;
            const corr = parsedJson.correction;
            
            let statementBuilder = '';
            if (ex.titre) {
                statementBuilder += `**${ex.titre}**\n\n`;
            }
            if (Array.isArray(ex.propositions)) {
                 statementBuilder += ex.propositions
                    .map((p: any) => `*   **${p.numero})** ${p.enonce}`)
                    .join('\n');
            }
            statement = statementBuilder;

            fullCorrection = formatPropositionsCorrection(corr);

        // --- Handle first format (xriadiat.e-monsite.com) ---
        } else if (parsedJson.exercice && typeof parsedJson.exercice === 'object') {
            const ex = parsedJson.exercice;
            if (ex.titre) statement += `**${ex.titre}**\n\n`;
            if (ex.enonce) statement += `${ex.enonce}\n\n`;
            if (ex.implication && ex.implication.hypothese && ex.implication.conclusion) {
                statement += `Montrer que ${ex.implication.hypothese} $$\\implies$$ ${ex.implication.conclusion}`;
            }

            if (ex.details) {
                if (ex.details.methode) fullCorrection += `### Méthode\n\n${ex.details.methode}\n\n`;
                if (ex.details.astuce) fullCorrection += `### Astuce\n\n${ex.details.astuce}\n\n`;
            }
            if (ex.exemple) {
                fullCorrection += `### Exemples\n\n`;
                const formatExample = (text: string) => text.replace(/\n/g, '\n  ');
                if (ex.exemple.cas_particulier_1) fullCorrection += `* **Cas 1:** ${formatExample(ex.exemple.cas_particulier_1)}\n\n`;
                if (ex.exemple.cas_particulier_2) fullCorrection += `* **Cas 2:** ${formatExample(ex.exemple.cas_particulier_2)}\n\n`;
            }
            if (ex.source) fullCorrection += `**Source :** ${ex.source}\n`;
        
        // --- Handle second format (nested correction steps) ---
        } else if (typeof parsedJson.exercice === 'string' && typeof parsedJson.correction === 'object') {
            statement = parsedJson.exercice;
            fullCorrection = formatCorrectionObject(parsedJson.correction, 1);
        } else {
             throw new Error("Format JSON non reconnu. Assurez-vous que la structure est correcte.");
        }

        setFormData(prev => ({
            ...prev,
            statement: statement.trim(),
            fullCorrection: fullCorrection.trim(),
            latexFormula: latexFormula.trim(),
        }));

        setJsonInput('');
        setIsJsonImporterOpen(false);
        alert("Champs remplis avec succès depuis le JSON !");

    } catch (error) {
        console.error("Erreur d'importation JSON:", error);
        alert(`L'importation a échoué. Assurez-vous que le JSON est valide.\nErreur: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    }
  };

  useEffect(() => {
    const formula = formData.latexFormula?.trim() ?? '';
    if (formula && !/^(y=|x=)/.test(formula)) {
      setFormulaError('La formule doit commencer par "y=" ou "x=" pour être valide.');
    } else {
      setFormulaError(null);
    }
  }, [formData.latexFormula]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formulaError) {
      alert(`Veuillez corriger l'erreur : ${formulaError}`);
      return;
    }
    
    setIsSaving(true);
    try {
        const fullCorrectionText = formData.fullCorrection?.trim() || '';
        let snippet = fullCorrectionText.split('\n')[0] || '';
        if (snippet.length > 250) {
            snippet = snippet.substring(0, 250) + '...';
        }

        const finalExercise: Exercise = {
          id: formData.id || `ex-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          statement: formData.statement.trim(),
          correctionSnippet: snippet,
          fullCorrection: fullCorrectionText || undefined,
          imageUrl: formData.imageUrl?.trim() || undefined,
          latexFormula: formData.latexFormula?.trim() || undefined,
        };
        
        await onSave(finalExercise, seriesId);
        onClose();
    } catch (error) {
        console.error("Save failed:", error);
        alert(`Erreur lors de la sauvegarde: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        setIsSaving(false);
    }
  };
  
  const getPreviewContent = (text: string | undefined, fallback: string) => {
      const content = text || fallback;
      const parsed = marked.parse(content, { breaks: true });
      return DOMPurify.sanitize(parsed as string);
  };


  return (
    <>
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-exercise-title"
        onClick={isSaving ? undefined : onClose}
      >
        <div 
          className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
            <h2 id="edit-exercise-title" className="text-xl font-bold text-brand-blue-300">
              {isCreating ? "Ajouter un Exercice" : "Modifier l'Exercice"}
            </h2>
            <button onClick={onClose} aria-label="Fermer la modale" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" disabled={isSaving}>
              <XMarkIcon className="w-6 h-6" />
            </button>
          </header>

          <form onSubmit={handleSave} id="edit-exercise-form" className="flex-grow overflow-y-auto p-6 space-y-6">
            <fieldset disabled={isSaving} className="space-y-6">
              
              <div className="bg-gray-900/50 rounded-lg border border-gray-700">
                <button
                    type="button"
                    onClick={() => setIsJsonImporterOpen(!isJsonImporterOpen)}
                    className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-300"
                    aria-expanded={isJsonImporterOpen}
                >
                    <span>Importer un exercice depuis JSON</span>
                    <span className={`transition-transform transform ${isJsonImporterOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {isJsonImporterOpen && (
                    <div className="p-4 border-t border-gray-700 space-y-3">
                        <label htmlFor="json-importer" className="text-sm text-gray-400">Collez un objet JSON structuré pour pré-remplir les champs.</label>
                        <textarea
                            id="json-importer"
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            rows={8}
                            placeholder='Collez ici le JSON de l`exercice...'
                            className="w-full p-2 bg-gray-950 border border-gray-600 rounded-md text-sm font-mono text-gray-300"
                        />
                        <button
                            type="button"
                            onClick={handleJsonImport}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                            Importer et Remplir les Champs
                        </button>
                    </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Input */}
                <div className="space-y-6">
                  <div>
                    <label htmlFor="statement" className="block text-sm font-medium text-gray-300 mb-1">Énoncé (MathJax/LaTeX &amp; Markdown activé)</label>
                    <textarea
                      id="statement"
                      name="statement"
                      value={formData.statement}
                      onChange={handleInputChange}
                      rows={8}
                      placeholder="Saisissez l'énoncé ici. Utilisez $$...$$ pour les formules et Entrée pour les sauts de ligne."
                      className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 font-mono disabled:opacity-50"
                    />
                  </div>
                   <div>
                    <label htmlFor="fullCorrection" className="block text-sm font-medium text-gray-300 mb-1">Correction Détaillée (optionnel)</label>
                    <textarea
                      id="fullCorrection"
                      name="fullCorrection"
                      value={formData.fullCorrection || ''}
                      onChange={handleInputChange}
                      rows={10}
                      placeholder="Saisissez la correction détaillée ici. La première ligne servira d'aperçu pour l'IA."
                      className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 font-mono disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Right Column: Previews */}
                <div className="space-y-6">
                   <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Prévisualisation de l'énoncé</h4>
                      <div className="prose prose-invert max-w-none p-4 min-h-[10rem] bg-slate-900/50 rounded-lg border border-slate-700">
                          <MathJaxRenderer content={getPreviewContent(formData.statement, "Aucun énoncé saisi...")} />
                      </div>
                   </div>
                   <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Prévisualisation de la correction</h4>
                      <div className="prose prose-invert max-w-none p-4 min-h-[12rem] bg-slate-900/50 rounded-lg border border-slate-700">
                          <MathJaxRenderer content={getPreviewContent(formData.fullCorrection, "Aucune correction saisie...")} />
                      </div>
                   </div>
                </div>
              </div>
               {/* Other fields below the grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-gray-700/50">
                 <div>
                    <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-300 mb-1">URL de l'image (optionnel)</label>
                    <input
                      type="text" id="imageUrl" name="imageUrl" value={formData.imageUrl || ''} onChange={handleInputChange} placeholder="https://..."
                      className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="latexFormula" className="block text-sm font-medium text-gray-300 mb-1">Formule du graphique Desmos (optionnel)</label>
                    <input
                      type="text" id="latexFormula" name="latexFormula" value={formData.latexFormula || ''} onChange={handleInputChange} placeholder="Ex: y = x^2 + 1"
                      className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 disabled:opacity-50"
                    />
                    {formulaError && <p className="text-sm text-red-400 mt-1">{formulaError}</p>}
                  </div>
              </div>
            </fieldset>

             {(formData.latexFormula?.trim() && !formulaError) ? (
                <div className="pt-6 border-t border-gray-700/50">
                     <h4 className="text-sm font-medium text-gray-400 mb-2">Prévisualisation du graphique Desmos</h4>
                    <DesmosGraph latexFormula={formData.latexFormula} />
                </div>
            ) : null}
          </form>
          
          <footer className="flex justify-end gap-4 p-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
            <button
              type="button" onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300 disabled:opacity-50"
            > Annuler </button>
            <button
              type="submit" form="edit-exercise-form"
              disabled={!!formulaError || isSaving}
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700 disabled:opacity-50 flex items-center gap-2"
            > 
                {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                {isSaving ? 'Sauvegarde...' : (isCreating ? 'Ajouter' : 'Enregistrer')}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
};