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

const transformForStudentView = (text: string): string => {
  if (!text) return '';

  return text
    // Transformation spécifique des indices
    .replace(/([a-zA-Zα-ω])_(\d+)/g, '$1-$2')  // x_1 → x-1
    .replace(/(\\[a-zA-Z]+)_(\d+)/g, '$1-$2') // \alpha_2 → \alpha-2
    
    // Gestion des fonctions réciproques
    .replace(/f\^\{-1\}/g, 'f⁻¹')
    .replace(/\\\(f\^\{-1\\\}\)/g, 'f⁻¹')
    .replace(/\$f\^\{-1\}\$/g, 'f⁻¹')
    
    // Nettoyage des délimiteurs LaTeX
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\$/g, '')
    
    // Autres transformations
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\sqrt\{([^}]+)\}/g, '√$1');
};

const formatTeacherCorrection = (text: string): string => {
  return text
    // Correction des formules en bloc
    .replace(/\\\(([^$]+?)\\\)/g, '$$$1$$')
    .replace(/\$([^$]+?)\$/g, '$$$1$$');
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
        content += `### ${qName}\n**Énoncé:** ${q['Énoncé']}\n\n`;

        Object.entries(q)
          .filter(([key]) => key.startsWith('Étape'))
          .forEach(([stepName, stepData]) => {
            const step = stepData as any;
            content += `#### ${stepName}\n`;
            if (step.Action) content += `**Méthode:** ${step.Action}\n`;
            if (step.Calcul) content += `> **Formule:**\n> ${formatTeacherCorrection(step.Calcul)}\n`;
            if (step.Explication) content += `${step.Explication}\n\n`;
          });

        if (q.Conclusion) content += `**Conclusion:** ${q.Conclusion}\n\n`;
      });
  }

  if (data.Astuce) content += `## Astuce\n${data.Astuce}\n`;

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

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      
      setFormData({
        statement: parsed.Correction ? 
          Object.entries(parsed.Correction)
            .map(([q, data]) => `**${q}:** ${transformForStudentView((data as any)['Énoncé'])}`)
            .join('\n\n')
          : '',
        fullCorrection: generateCorrectionContent(parsed),
        latexFormula: '',
        imageUrl: ''
      });

      setError(null);
    } catch (err) {
      setError("Format JSON invalide");
    }
  };

  /* ... (le reste du composant reste identique) ... */

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* ... (header identique) ... */}
        
        <form onSubmit={handleSave} className="flex-grow overflow-y-auto p-6 space-y-6">
          {/* ... (champs de formulaire identiques) ... */}
          
          {formData.latexFormula && (
            <div className="pt-6 border-t border-gray-700/50">
              <DesmosGraph latexFormula={formData.latexFormula} />
            </div>
          )}
        </form>

        {/* ... (footer identique) ... */}
      </div>
    </div>
  );
};