import React, { useMemo } from 'react';
import { Level, Chapter } from '@/types';
import { ArrowLeftIcon, PlusCircleIcon, PencilIcon, TrashIcon, SpinnerIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { CircularProgressBar } from '@/components/CircularProgressBar';

interface ChapterListPageProps {
    level: Level;
    onSelectChapter: (chapterId: string) => void;
    onBack: () => void;
    onAddChapter: () => void;
    onEditChapter: (chapter: Chapter) => void;
    onDeleteChapter: (chapterId: string, chapterTitle: string) => void;
}

const ChapterListItem: React.FC<{
    chapter: Chapter;
    onSelectChapter: (id: string) => void;
    onEditChapter: (ch: Chapter) => void;
    onDeleteChapter: (id: string, title: string) => void;
}> = ({ chapter, onSelectChapter, onEditChapter, onDeleteChapter }) => {
    const { user, isAdmin } = useAuth();

    // The mastery calculation logic remains the same, it's robust.
    const { mastery, isLoading } = useMemo(() => {
        if (!user || isAdmin) {
            return { mastery: null, isLoading: false };
        }
        
        const allExerciseIdsInChapter = chapter.series.flatMap(s => s.exercises.map(e => e.id));
        const totalExercises = allExerciseIdsInChapter.length;

        const completedExercises = allExerciseIdsInChapter
            .filter(id => user.completed_exercises.includes(id)).length;
        const exerciseScore = totalExercises > 0 ? (completedExercises / totalExercises) : 1;

        const quizIds = chapter.quizzes.map(q => q.id);
        const chapterQuizAttempts = user.quiz_attempts.filter(attempt => attempt.chapter_id === chapter.id);
        
        let avgQuizScore = 1;
        if (quizIds.length > 0) {
            if (chapterQuizAttempts.length > 0) {
                const totalScore = chapterQuizAttempts.reduce((acc, attempt) => acc + (attempt.score / attempt.total_questions), 0);
                avgQuizScore = totalScore / chapterQuizAttempts.length;
            } else {
                 avgQuizScore = 0;
            }
        }
        
        const exerciseWeight = totalExercises > 0 ? 0.7 : 0;
        const quizWeight = quizIds.length > 0 ? 0.3 : 0;
        const totalWeight = exerciseWeight + quizWeight;

        if (totalWeight === 0) {
            return { mastery: 100, isLoading: false };
        }

        const finalMastery = ((exerciseScore * exerciseWeight) + (avgQuizScore * quizWeight)) / totalWeight;
        const masteryPercentage = Math.round(finalMastery * 100);
        
        return { mastery: masteryPercentage, isLoading: false };

    }, [chapter, user, isAdmin]);

    return (
        <div
            role="link"
            tabIndex={0}
            aria-label={`Ouvrir le chapitre ${chapter.title}`}
            className="relative group w-full text-left bg-slate-900 hover:border-blue-500/60 transition-all duration-300 rounded-2xl p-6 border border-slate-800 focus:outline-none focus-within:ring-2 focus-within:ring-blue-500 cursor-pointer"
            onClick={() => onSelectChapter(chapter.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectChapter(chapter.id); }}
        >
            <div className="flex justify-between items-center gap-6">
                <div className="flex-grow">
                    <h3 className="text-xl font-bold text-slate-100">{chapter.title}</h3>
                    <p className="mt-2 text-slate-400 text-sm line-clamp-2">{chapter.summary || "Résumé non disponible."}</p>
                </div>
                <div className="flex-shrink-0">
                    {isAdmin ? (
                        <div className="flex items-center gap-1 opacity-25 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button 
                                onClick={() => onEditChapter(chapter)} 
                                className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
                                aria-label="Modifier le chapitre"
                            >
                                <PencilIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => onDeleteChapter(chapter.id, chapter.title)} 
                                className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-red-400"
                                aria-label="Supprimer le chapitre"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    ) : isLoading ? (
                        <div className="w-[60px] h-[60px] flex items-center justify-center">
                            <SpinnerIcon className="w-6 h-6 animate-spin text-slate-500" />
                        </div>
                    ) : mastery !== null ? (
                         <CircularProgressBar percentage={mastery} />
                    ) : null}
                </div>
            </div>
        </div>
    );
};


export const ChapterListPage: React.FC<ChapterListPageProps> = ({ 
    level, 
    onSelectChapter, 
    onBack,
    onAddChapter,
    onEditChapter,
    onDeleteChapter
}) => {
    const { isAdmin } = useAuth();
    
    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors mb-4 font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour
                </button>
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-4xl font-extrabold text-slate-100">{level.levelName}</h2>
                        <p className="mt-2 text-lg text-slate-400">Choisissez une leçon à explorer.</p>
                    </div>
                     {isAdmin && (
                        <button
                            onClick={onAddChapter}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                        >
                            <PlusCircleIcon className="w-5 h-5" />
                            Ajouter un chapitre
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                {level.chapters.length > 0 ? (
                    level.chapters.map(chapter => (
                        <ChapterListItem 
                            key={chapter.id}
                            chapter={chapter}
                            onSelectChapter={onSelectChapter}
                            onEditChapter={onEditChapter}
                            onDeleteChapter={onDeleteChapter}
                        />
                    ))
                ) : (
                    <div className="text-center py-16 bg-slate-900 rounded-2xl border border-slate-800">
                        <h3 className="text-lg font-semibold text-slate-300">Aucun chapitre pour l'instant</h3>
                        <p className="text-slate-500 mt-2">
                            {isAdmin ? "Cliquez sur 'Ajouter un chapitre' pour commencer." : "Le contenu sera bientôt disponible."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};