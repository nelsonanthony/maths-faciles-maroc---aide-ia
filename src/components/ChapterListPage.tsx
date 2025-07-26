
import React, { useMemo } from 'react';
import { Level, Chapter } from '@/types';
import { ArrowLeftIcon, PlusCircleIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { ChapterProgress } from '@/components/ChapterProgress';

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

    // Memoize the calculation for exercise counts and completion
    const { totalExercises, completedExercises } = useMemo(() => {
        if (!user || isAdmin) return { totalExercises: 0, completedExercises: 0 };
        
        const exerciseIdsInChapter = chapter.series.flatMap(s => s.exercises.map(e => e.id));
        const completedCount = exerciseIdsInChapter.filter(id => user.completed_exercises.includes(id)).length;
        
        return {
            totalExercises: exerciseIdsInChapter.length,
            completedExercises: completedCount
        };
    }, [chapter, user, isAdmin]);

    return (
        <div
            role="link"
            tabIndex={0}
            aria-label={`Ouvrir le chapitre ${chapter.title}`}
            className="relative group w-full text-left bg-gray-800/50 hover:bg-gray-700/60 transition-all duration-300 rounded-xl p-6 border border-gray-700/50 focus:outline-none focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 cursor-pointer"
            onClick={() => onSelectChapter(chapter.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectChapter(chapter.id); }}
        >
            <div className="flex justify-between items-start gap-4">
                <div className="flex-grow">
                    <h3 className="text-xl font-semibold text-gray-200">{chapter.title}</h3>
                    <p className="mt-1 text-gray-400 text-sm line-clamp-2">{chapter.summary}</p>
                    {user && !isAdmin && totalExercises > 0 && (
                        <ChapterProgress completedCount={completedExercises} totalCount={totalExercises} />
                    )}
                </div>
                <div className="flex items-center flex-shrink-0">
                    {isAdmin && (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <button 
                                onClick={() => onEditChapter(chapter)} 
                                className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white"
                                aria-label="Modifier le chapitre"
                            >
                                <PencilIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => onDeleteChapter(chapter.id, chapter.title)} 
                                className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-red-400"
                                aria-label="Supprimer le chapitre"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
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
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour
                </button>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-brand-blue-300">{level.levelName}</h2>
                        <p className="mt-2 text-lg text-gray-400">Choisissez une leçon à explorer.</p>
                    </div>
                     {isAdmin && (
                        <button
                            onClick={onAddChapter}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-green-600/80 border-2 border-green-500 hover:bg-green-600 text-white"
                        >
                            <PlusCircleIcon className="w-5 h-5" />
                            Ajouter un chapitre
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                {level.chapters.map(chapter => (
                    <ChapterListItem 
                        key={chapter.id}
                        chapter={chapter}
                        onSelectChapter={onSelectChapter}
                        onEditChapter={onEditChapter}
                        onDeleteChapter={onDeleteChapter}
                    />
                ))}
            </div>
        </div>
    );
};
