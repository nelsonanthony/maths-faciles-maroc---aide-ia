
import React, { useState, useEffect } from 'react';
import { Level, Chapter, Series, Exercise } from '@/types';

interface NavigationSidebarProps {
    isOpen: boolean;
    curriculum: Level[];
    selectedLevelId: string | null;
    selectedChapterId: string | null;
    selectedSeriesId: string | null;
    selectedExerciseId: string | null;
    onSelectLevel: (id: string) => void;
    onSelectChapter: (id: string) => void;
    onSelectSeries: (id: string) => void;
    onSelectExercise: (id: string) => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
    isOpen,
    curriculum,
    selectedLevelId,
    selectedChapterId,
    selectedSeriesId,
    selectedExerciseId,
    onSelectLevel,
    onSelectChapter,
    onSelectSeries,
    onSelectExercise,
}) => {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    useEffect(() => {
        const newExpanded = new Set<string>();
        if (selectedLevelId) newExpanded.add(selectedLevelId);
        if (selectedChapterId) newExpanded.add(selectedChapterId);
        if (selectedSeriesId) newExpanded.add(selectedSeriesId);
        setExpandedItems(newExpanded);
    }, [selectedLevelId, selectedChapterId, selectedSeriesId]);

    const toggleItem = (id: string) => {
        setExpandedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const isExpanded = (id: string) => expandedItems.has(id);

    const getNavItemClasses = (isSelected: boolean) => 
        `flex justify-between items-center w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
            isSelected 
            ? 'bg-brand-blue-600/30 text-brand-blue-300 font-semibold' 
            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
        }`;

    return (
        <aside
            className={`
                bg-slate-900 border-r border-slate-800 flex-shrink-0
                transition-all duration-300 ease-in-out
                ${isOpen ? 'w-72 p-4' : 'w-0 p-0'}
                overflow-hidden
            `}
        >
            <div className="h-full overflow-y-auto space-y-4">
                <h3 className="text-lg font-bold text-slate-200 px-2">Navigation</h3>
                {curriculum.map(level => (
                    <div key={level.id}>
                        <button onClick={() => { onSelectLevel(level.id); toggleItem(level.id); }} className={getNavItemClasses(level.id === selectedLevelId)}>
                            <span>{level.levelName}</span>
                            <span className={`transform transition-transform ${isExpanded(level.id) ? 'rotate-90' : 'rotate-0'}`}>&gt;</span>
                        </button>
                        {isExpanded(level.id) && (
                            <div className="pl-3 mt-1 space-y-1 border-l-2 border-slate-800">
                                {level.chapters.map(chapter => (
                                    <div key={chapter.id}>
                                        <button onClick={() => { onSelectChapter(chapter.id); toggleItem(chapter.id); }} className={getNavItemClasses(chapter.id === selectedChapterId)}>
                                            <span>{chapter.title}</span>
                                             {chapter.series.length > 0 && <span className={`transform transition-transform ${isExpanded(chapter.id) ? 'rotate-90' : 'rotate-0'}`}>&gt;</span>}
                                        </button>
                                        {isExpanded(chapter.id) && (
                                            <div className="pl-3 mt-1 space-y-1 border-l-2 border-slate-700">
                                                {chapter.series.map(series => (
                                                    <div key={series.id}>
                                                        <button onClick={() => { onSelectSeries(series.id); toggleItem(series.id); }} className={getNavItemClasses(series.id === selectedSeriesId)}>
                                                            <span>{series.title}</span>
                                                            <span className={`transform transition-transform ${isExpanded(series.id) ? 'rotate-90' : 'rotate-0'}`}>&gt;</span>
                                                        </button>
                                                        {isExpanded(series.id) && (
                                                            <div className="pl-3 mt-1 space-y-1 border-l-2 border-slate-600">
                                                                {series.exercises.map((exercise, index) => (
                                                                    <button key={exercise.id} onClick={() => onSelectExercise(exercise.id)} className={getNavItemClasses(exercise.id === selectedExerciseId)}>
                                                                        <span>Exercice {index + 1}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </aside>
    );
};
