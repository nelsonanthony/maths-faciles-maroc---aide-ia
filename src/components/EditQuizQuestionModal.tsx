
import React, { useState } from 'react';
import { QuizQuestion } from '@/types';
import { XMarkIcon, PlusCircleIcon, TrashIcon, SpinnerIcon } from '@/components/icons';

interface EditQuizQuestionModalProps {
  question: QuizQuestion | null;
  quizId: string;
  chapterId: string;
  onSave: (questionData: QuizQuestion, quizId: string, chapterId: string) => Promise<void>;
  onClose: () => void;
}

const emptyQuestion: Omit<QuizQuestion, 'id'> = {
  question: '',
  options: ['', '', '', ''],
  correctAnswerIndex: 0,
};

export const EditQuizQuestionModal: React.FC<EditQuizQuestionModalProps> = ({ question, quizId, chapterId, onSave, onClose }) => {
  const [formData, setFormData] = useState(question || emptyQuestion);
  const [isSaving, setIsSaving] = useState(false);

  const isCreating = !question;
  const modalTitle = isCreating ? "Ajouter une question" : "Modifier la question";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleOptionChange = (index: number, value: string) => {
      const newOptions = [...(formData.options || [])];
      newOptions[index] = value;
      setFormData(prev => ({ ...prev, options: newOptions }));
  };

  const handleCorrectAnswerChange = (index: number) => {
    setFormData(prev => ({ ...prev, correctAnswerIndex: index }));
  }

  const handleAddOption = () => {
      setFormData(prev => ({ ...prev, options: [...(prev.options || []), ''] }));
  };

  const handleRemoveOption = (index: number) => {
      if ((formData.options?.length || 0) <= 2) {
          alert("Une question doit avoir au moins 2 options.");
          return;
      }
      const newOptions = formData.options?.filter((_, i) => i !== index) || [];
      // Adjust correct answer index if needed
      const correctIndex = formData.correctAnswerIndex || 0;
      let newCorrectIndex = correctIndex;
      if (index === correctIndex) {
        newCorrectIndex = 0;
      } else if (index < correctIndex) {
        newCorrectIndex = correctIndex - 1;
      }
      setFormData(prev => ({ ...prev, options: newOptions, correctAnswerIndex: newCorrectIndex }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question.trim() || (formData.options || []).some(opt => !opt.trim())) {
        alert("La question et toutes les options doivent être remplies.");
        return;
    }

    setIsSaving(true);
    try {
        const finalQuestion: QuizQuestion = {
            id: question?.id || `q-${Date.now()}`,
            question: formData.question.trim(),
            options: formData.options?.map(opt => opt.trim()),
            correctAnswerIndex: formData.correctAnswerIndex
        };

        await onSave(finalQuestion, quizId, chapterId);
    } catch (error) {
        console.error("Save failed:", error);
        alert(`Erreur lors de la sauvegarde: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-question-title"
      onClick={isSaving ? undefined : onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="edit-question-title" className="text-xl font-bold text-brand-blue-300">{modalTitle}</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" disabled={isSaving}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSave} id="edit-question-form" className="flex-grow overflow-y-auto p-6 space-y-4">
          <fieldset disabled={isSaving}>
              <div>
                <label htmlFor="question" className="block text-sm font-medium text-gray-300 mb-1">Texte de la question</label>
                <textarea
                  id="question"
                  name="question"
                  value={formData.question}
                  onChange={handleChange}
                  rows={3}
                  required
                  className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Options de réponse (cochez la bonne réponse)</label>
                <div className="space-y-3">
                    {(formData.options || []).map((option, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <input 
                                type="radio" 
                                name="correctAnswer" 
                                id={`option-radio-${index}`}
                                checked={formData.correctAnswerIndex === index}
                                onChange={() => handleCorrectAnswerChange(index)}
                                className="h-5 w-5 shrink-0 text-brand-blue-600 bg-gray-700 border-gray-500 focus:ring-brand-blue-500"
                            />
                            <input
                                type="text"
                                value={option}
                                onChange={(e) => handleOptionChange(index, e.target.value)}
                                required
                                className="w-full p-2 bg-gray-900 border-2 border-gray-600 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                            />
                            <button 
                                type="button"
                                onClick={() => handleRemoveOption(index)} 
                                className="p-2 text-gray-500 hover:text-red-400" aria-label="Supprimer l'option">
                                <TrashIcon className="w-5 h-5"/>
                            </button>
                        </div>
                    ))}
                </div>
                 <button
                    type="button"
                    onClick={handleAddOption}
                    className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 text-brand-blue-300 hover:bg-brand-blue-500/10"
                >
                    <PlusCircleIcon className="w-4 h-4" />
                    Ajouter une option
                </button>
              </div>
          </fieldset>
        </form>

        <footer className="flex justify-end gap-4 p-4 border-t border-gray-700 bg-gray-800/50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300" disabled={isSaving}>
            Annuler
          </button>
          <button type="submit" form="edit-question-form" className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700 disabled:opacity-50 flex items-center gap-2" disabled={isSaving}>
            {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Sauvegarde...' : (isCreating ? 'Ajouter' : 'Enregistrer')}
          </button>
        </footer>
      </div>
    </div>
  );
};
