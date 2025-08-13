import React, { useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Exercise } from '@/types';
import { DesmosGraph } from '@/components/DesmosGraph';
import { XMarkIcon, SpinnerIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';

const processMathExpressions = (content: string): string => {
  // Convertir $$...$$ en \[...\] et $...$ en \(...\)
  return content
    .replace(/\$\$(.*?)\$\$/gs, '\\[$1\\]')
    .replace(/\$([^$]*?)\$/g, '\\($1\\)');
};

const getPreviewContent = (text: string | undefined, fallback: string): string => {
  const content = text?.trim() ? text : fallback;
  const processed = processMathExpressions(content);
  const html = marked.parse(processed, { breaks: true }) as string;
  return DOMPurify.sanitize(html);
};

const generateCorrectionContent = (data: any): string => {
  let content = '';

  if (Array.isArray(data['Sous-questions préalables'])) {
    content += `## Pistes pédagogiques\n`;
    content += data['Sous-questions préalables']
      .map((p: string) => `- ${processMathExpressions(p)}`)
      .join('\n') + '\n\n';
  }

  if (data.Correction && typeof data.Correction === 'object') {
    Object.entries(data.Correction)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(([qName, qData]) => {
        const q = qData as any;
        content += `### ${qName}\n`;
        
        if (q['Énoncé']) {
          content += `**Énoncé:** ${processMathExpressions(q['Énoncé'])}\n\n`;
        }

        Object.entries(q)
          .filter(([key]) => key.startsWith('Étape'))
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .forEach(([stepName, stepData]) => {
            const step = stepData as any;
            content += `#### ${stepName}\n`;
            if (step.Action) content += `**Méthode:** ${processMathExpressions(step.Action)}\n\n`;
            if (step.Calcul) content += `**Formule:**\n${processMathExpressions(step.Calcul)}\n\n`;
            if (step.Explication) content += `${processMathExpressions(step.Explication)}\n\n`;
          });

        if (q.Conclusion) {
          content += `**Conclusion:** ${processMathExpressions(q.Conclusion)}\n\n`;
        }
      });
  }

  if (data.Astuce) {
    content += `## Astuce\n${processMathExpressions(data.Astuce)}\n`;
  }

  return content;
};

// ... [le reste du composant EditExerciseModal reste identique] ...

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ 
  exercise, 
  seriesId, 
  onSave, 
  onClose 
}) => {
  // ... [le reste de l'implémentation reste identique] ...

  const handleJsonImport = () => {
    if (!jsonInput.trim()) {
      setError("Veuillez coller le contenu JSON");
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      
      const statementContent = parsed.Correction 
        ? Object.entries(parsed.Correction)
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([qName, qData]) => {
              const q = qData as any;
              return `**${qName}:** ${processMathExpressions(q['Énoncé'] || '')}`;
            })
            .join('\n\n')
        : '';

      setFormData({
        ...formData,
        statement: statementContent,
        fullCorrection: generateCorrectionContent(parsed),
        correctionSnippet: '',
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

  // ... [le reste de l'implémentation reste identique] ...
};