
import React from 'react';
import { Series, Exercise } from '@/types';
import { ArrowLeftIcon, PencilIcon, TrashIcon, PlusCircleIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { MathJaxRenderer, processMarkdownWithMath } from '@/components/MathJaxRenderer';

interface ExerciseListPageProps {
    series: Series;
    chapterTitle: string;
    onSelectExercise: (exerciseId: string) => void;
    onBack: () => void;
    onAddExercise: () => void;
    onEditExercise: (exercise: Exercise) => void;
    onDeleteExercise: (exerciseId: string, exerciseStatement: string) => void;
}

export const ExerciseListPage: React.FC<ExerciseListPageProps> = ({ 
    series, 
    chapterTitle, 
    onSelectExercise, 
    onBack,
    onAddExercise,
    onEditExercise,
    onDeleteExercise
}) => {
    const { isAdmin } = useAuth();
    
    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour aux séries
                </button>
                 <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-brand-blue-300">{chapterTitle}</h2>
                        <p className="mt-2 text-lg text-gray-400">{series.title} - Choisissez un exercice.</p>
                    </div>
                     {isAdmin && (
                        <button
                            onClick={onAddExercise}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-green-600/80 border-2 border-green-500 hover:bg-green-600 text-white"
                        >
                            <PlusCircleIcon className="w-5 h-5" />
                            Ajouter un exercice
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                {series.exercises.length > 0 ? (
                    series.exercises.map((exercise, index) => (
                        <div
                            key={exercise.id}
                            role="link"
                            tabIndex={0}
                            aria-label={`Ouvrir l'exercice ${index + 1}`}
                            className="relative group w-full text-left bg-gray-800/50 hover:bg-gray-700/60 transition-all duration-300 rounded-xl p-6 border border-gray-700/50 focus:outline-none focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 cursor-pointer"
                            onClick={() => onSelectExercise(exercise.id)}
                             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectExercise(exercise.id); }}
                        >
                           <div className="flex justify-between items-start gap-4">
                                <div className="flex-grow overflow-hidden">
                                    <h3 className="text-xl font-semibold text-gray-200">Exercice {index + 1}</h3>
                                    <div className="text-gray-400 mt-2 line-clamp-2">
                                        <MathJaxRenderer content={processMarkdownWithMath(exercise.statement)} />
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-0" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => onEditExercise(exercise)}
                                            className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white"
                                            aria-label="Modifier l'exercice"
                                        >
                                            <PencilIcon className="w-5 h-5" />
                                        </button>
                                        <button 
                                            onClick={() => onDeleteExercise(exercise.id, `Exercice ${index + 1}`)}
                                            className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-red-400"
                                            aria-label="Supprimer l'exercice"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                           </div>
                        </div>
                    ))
                ) : (
                     <p className="text-gray-400 text-center py-8">Aucun exercice dans cette série pour le moment.</p>
                )}
            </div>
        </div>
    );
};