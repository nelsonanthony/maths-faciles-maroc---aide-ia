
import React, { useState } from 'react';
import { Quiz, QuizQuestion } from '@/types';
import { XMarkIcon, PencilIcon, TrashIcon, PlusCircleIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';

interface EditQuizModalProps {
  quiz: Quiz | null;
  onSave: (quizData: Quiz) => void;
  onClose: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (question: QuizQuestion) => void;
  onDeleteQuestion: (questionId: string, questionText: string) => void;
}

const emptyQuiz: Omit<Quiz, 'id' | 'questions'> = {
  title: '',
};

export const EditQuizModal: React.FC<EditQuizModalProps> = ({ quiz, onSave, onClose, onAddQuestion, onEditQuestion, onDeleteQuestion }) => {
  const [formData, setFormData] = useState(quiz || emptyQuiz);

  const isCreating = !quiz;
  const modalTitle = isCreating ? "Ajouter un nouveau quiz" : "Modifier le quiz";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert("Le titre du quiz est obligatoire.");
      return;
    }

    const finalQuiz: Quiz = {
      id: quiz?.id || `quiz-${Date.now()}`,
      title: formData.title.trim(),
      questions: quiz?.questions || [],
    };
    
    onSave(finalQuiz);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-quiz-title"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 id="edit-quiz-title" className="text-xl font-bold text-brand-blue-300">{modalTitle}</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          <form onSubmit={handleSave} id="edit-quiz-form" className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Titre du Quiz</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
              />
            </div>
            {isCreating && (
                 <p className="text-sm text-yellow-400">Enregistrez le quiz pour pouvoir y ajouter des questions.</p>
            )}
          </form>

          {!isCreating && quiz && (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-300">Questions</h3>
                    <button
                        onClick={onAddQuestion}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 bg-green-600/50 hover:bg-green-600 text-white"
                        aria-label="Ajouter une question"
                    >
                        <PlusCircleIcon className="w-4 h-4" />
                        Ajouter une question
                    </button>
                </div>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                    {quiz.questions.length > 0 ? quiz.questions.map((q, index) => (
                        <div key={q.id} className="group flex items-center justify-between gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                           <div className="flex-grow text-gray-300 text-sm">
                                <span className="font-bold">{index + 1}.</span> <MathJaxRenderer content={q.question} />
                           </div>
                           <div className="flex items-center opacity-50 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => onEditQuestion(q)}
                                    className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" aria-label="Modifier la question">
                                    <PencilIcon className="w-4 h-4"/>
                                </button>
                                <button 
                                     onClick={() => onDeleteQuestion(q.id, `Question ${index + 1}`)}
                                    className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-red-400" aria-label="Supprimer la question">
                                    <TrashIcon className="w-4 h-4"/>
                                </button>
                           </div>
                        </div>
                    )) : (
                        <p className="text-center text-gray-500 py-4">Ce quiz ne contient aucune question.</p>
                    )}
                </div>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-4 p-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="edit-quiz-form"
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700"
          >
            Enregistrer
          </button>
        </footer>
      </div>
    </div>
  );
};
