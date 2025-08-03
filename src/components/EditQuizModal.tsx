
import React, { useState } from 'react';
import { Quiz, QuizQuestion } from '@/types';
import { XMarkIcon, PencilIcon, TrashIcon, PlusCircleIcon, SpinnerIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';
import { EditQuizQuestionModal } from './EditQuizQuestionModal';

interface EditQuizModalProps {
  quiz: Quiz | null;
  chapterId: string;
  onSave: (quizData: Quiz, chapterId: string) => Promise<void>;
  onClose: () => void;
  openModal: (modalState: any) => void;
  onSaveQuizQuestion: (questionData: QuizQuestion, quizId: string, chapterId: string) => Promise<void>;
}

const emptyQuiz: Omit<Quiz, 'id'> = {
  title: '',
  questions: [],
};

export const EditQuizModal: React.FC<EditQuizModalProps> = ({ quiz, chapterId, onSave, onClose, openModal, onSaveQuizQuestion }) => {
  const [formData, setFormData] = useState({ title: quiz?.title || '' });
  const [localQuestions, setLocalQuestions] = useState<QuizQuestion[]>(quiz?.questions || []);
  const [editingQuestion, setEditingQuestion] = useState<{ question: QuizQuestion | null; index: number | null } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreating = !quiz;
  const modalTitle = isCreating ? "Ajouter un nouveau quiz" : "Modifier le quiz";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDeleteQuestion = (index: number) => {
    setLocalQuestions(prev => prev.filter((_, i) => i !== index));
  };


  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.title.trim()) {
      setError("Le titre du quiz est obligatoire.");
      return;
    }

    setIsSaving(true);
    try {
        const finalQuiz: Quiz = {
          id: quiz?.id || `quiz-${Date.now()}`,
          title: formData.title.trim(),
          questions: localQuestions,
        };
        await onSave(finalQuiz, chapterId);
    } catch (err) {
        console.error("Save failed:", err);
        setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-quiz-title"
        onClick={isSaving ? undefined : onClose}
      >
        <div
          className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
            <h2 id="edit-quiz-title" className="text-xl font-bold text-brand-blue-300">{modalTitle}</h2>
            <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" disabled={isSaving}>
              <XMarkIcon className="w-6 h-6" />
            </button>
          </header>

          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            <form onSubmit={handleSave} id="edit-quiz-form" className="space-y-4">
              <fieldset disabled={isSaving}>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Titre du Quiz</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 disabled:opacity-50"
                  />
              </fieldset>
            </form>
            
            <fieldset disabled={isSaving}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-300">Questions</h3>
                    <button
                        onClick={() => setEditingQuestion({ question: null, index: null })}
                        disabled={isCreating}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 bg-green-600/50 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Ajouter une question"
                    >
                        <PlusCircleIcon className="w-4 h-4" />
                        Ajouter une question
                    </button>
                </div>
                 {isCreating ? (
                    <p className="text-center text-gray-500 py-4">Veuillez d'abord enregistrer le quiz avant d'ajouter des questions.</p>
                ) : (
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                        {localQuestions.length > 0 ? localQuestions.map((q, index) => (
                            <div key={q.id || index} className="group flex items-center justify-between gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                               <div className="flex-grow text-gray-300 text-sm">
                                    <span className="font-bold">{index + 1}.</span> <MathJaxRenderer content={q.question} />
                               </div>
                               <div className="flex items-center opacity-50 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => setEditingQuestion({ question: q, index })}
                                        className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" aria-label="Modifier la question">
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                    <button 
                                         onClick={() => handleDeleteQuestion(index)}
                                        className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-red-400" aria-label="Supprimer la question">
                                        <TrashIcon className="w-4 h-4"/>
                                    </button>
                               </div>
                            </div>
                        )) : (
                            <p className="text-center text-gray-500 py-4">Ce quiz ne contient aucune question.</p>
                        )}
                    </div>
                )}
            </fieldset>
          </div>

          <footer className="flex-col items-stretch p-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
            {error && (
              <div className="mb-3 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-center">
                  <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="edit-quiz-form"
                disabled={isSaving}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                {isSaving ? 'Sauvegarde...' : 'Enregistrer le Quiz'}
              </button>
            </div>
          </footer>
        </div>
      </div>
      
      {editingQuestion && quiz?.id && (
        <EditQuizQuestionModal
            question={editingQuestion.question}
            quizId={quiz.id}
            chapterId={chapterId}
            onSave={onSaveQuizQuestion}
            onClose={() => setEditingQuestion(null)}
        />
      )}
    </>
  );
};