
import React, { useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { AIInteraction } from '@/components/AIInteraction';
import { ArrowLeftIcon, PencilIcon, BookOpenIcon } from '@/components/icons';
import { Exercise, Chapter, ExerciseContext } from '@/types';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';
import { DesmosGraph } from '@/components/DesmosGraph';
import { useAuth } from '@/contexts/AuthContext';
import { RelatedExercises } from '@/components/RelatedExercises';
import { ChatLauncher } from '@/components/ChatLauncher';
import { CompletionButton } from '@/components/CompletionButton';

interface ExercisePageProps {
    exercise: Exercise;
    chapter: Chapter;
    seriesId: string;
    levelId: string;
    onBack: () => void;
    onEdit: () => void;
    onNavigateToTimestamp: (levelId: string, chapterId: string, videoId: string, time: number) => void;
    onSelectExercise: (exerciseId: string) => void;
    onNavigateToChat: (context: ExerciseContext) => void;
}

export const ExercisePage: React.FC<ExercisePageProps> = ({ exercise, chapter, seriesId, levelId, onBack, onEdit, onNavigateToTimestamp, onSelectExercise, onNavigateToChat }) => {
    const { isAdmin } = useAuth();
    const aiInteractionRef = useRef<HTMLDivElement>(null);
    const [showOfficialCorrection, setShowOfficialCorrection] = useState(false);
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="mb-2">
                <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour à la liste des exercices
                </button>
            </div>

            <div className="relative bg-gray-800/30 rounded-xl p-6 border border-gray-700/30">
                 {isAdmin && (
                    <div className="absolute top-4 right-4 z-10">
                        <button
                            onClick={onEdit}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/80 border border-gray-600 hover:bg-gray-600 text-gray-300 shadow-lg"
                            aria-label="Modifier l'exercice"
                        >
                            <PencilIcon className="w-4 h-4" />
                            <span>Modifier</span>
                        </button>
                    </div>
                )}
                <h2 className="text-2xl font-bold text-brand-blue-300 mb-4">{chapter.title}</h2>
                
                {exercise.imageUrl && (
                    <div className="mb-6 bg-gray-900 p-4 rounded-lg flex justify-center">
                        <img 
                          src={exercise.imageUrl} 
                          alt={`Graphique pour l'exercice sur ${chapter.title}`}
                          className="max-w-full h-auto rounded-md shadow-lg"
                        />
                    </div>
                )}

                {exercise.latexFormula && (
                    <div className="mt-6 mb-6">
                        <h4 className="font-semibold text-gray-400 uppercase tracking-wider text-sm mb-4">Graphique Interactif</h4>
                        <DesmosGraph latexFormula={exercise.latexFormula} />
                    </div>
                )}
                
                <div className="text-gray-300">
                    <h3 className="font-semibold text-gray-400 uppercase tracking-wider text-sm mb-2">Énoncé de l'exercice</h3>
                     <div className="prose prose-invert max-w-none">
                        <MathJaxRenderer content={DOMPurify.sanitize(marked.parse(exercise.statement) as string)} />
                    </div>
                </div>


                <CompletionButton exercise={exercise} />
            </div>

            {/* Official Correction Section */}
            {exercise.fullCorrection && (
                 <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30">
                    <button 
                        onClick={() => setShowOfficialCorrection(!showOfficialCorrection)}
                        className="w-full flex justify-between items-center text-left"
                        aria-expanded={showOfficialCorrection}
                    >
                        <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3">
                           <BookOpenIcon className="w-6 h-6" />
                            Correction Officielle
                        </h3>
                         <span className="text-sm font-semibold text-brand-blue-400 hover:text-brand-blue-300">
                             {showOfficialCorrection ? 'Masquer' : 'Afficher'}
                         </span>
                    </button>
                    
                    {showOfficialCorrection && (
                        <div className="mt-4 pt-4 border-t border-gray-700/50">
                             <div className="prose prose-invert max-w-none">
                                <MathJaxRenderer content={DOMPurify.sanitize(marked.parse(exercise.fullCorrection) as string)} />
                            </div>
                        </div>
                    )}
                 </div>
            )}

            <div ref={aiInteractionRef}>
                <AIInteraction 
                    exerciseStatement={exercise.statement}
                    correctionSnippet={exercise.correctionSnippet}
                    chapterId={chapter.id}
                    levelId={levelId}
                    onNavigateToTimestamp={onNavigateToTimestamp}
                />
            </div>

            <ChatLauncher onClick={() => onNavigateToChat({ levelId, chapterId: chapter.id, seriesId, exerciseId: exercise.id })} />

            <RelatedExercises 
                currentExerciseId={exercise.id}
                levelId={levelId}
                onSelectExercise={onSelectExercise}
            />
        </div>
    );
};
