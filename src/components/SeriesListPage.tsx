
import React from 'react';
import { Chapter, Series } from '@/types';
import { ArrowLeftIcon, PlusCircleIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';

interface SeriesListPageProps {
    chapter: Chapter;
    onSelectSeries: (seriesId: string) => void;
    onBack: () => void;
    onAddSeries: () => void;
    onEditSeries: (series: Series) => void;
    onDeleteSeries: (seriesId: string, seriesTitle: string) => void;
}

export const SeriesListPage: React.FC<SeriesListPageProps> = ({
    chapter,
    onSelectSeries,
    onBack,
    onAddSeries,
    onEditSeries,
    onDeleteSeries
}) => {
    const { isAdmin } = useAuth();

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour au chapitre
                </button>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-brand-blue-300">{chapter.title}</h2>
                        <p className="mt-2 text-lg text-gray-400">Choisissez une série d'exercices.</p>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={onAddSeries}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-green-600/80 border-2 border-green-500 hover:bg-green-600 text-white"
                        >
                            <PlusCircleIcon className="w-5 h-5" />
                            Ajouter une série
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                {chapter.series.length > 0 ? (
                    chapter.series.map(series => (
                        <div
                            key={series.id}
                            className="group relative bg-gray-800/50 hover:bg-gray-700/60 transition-all duration-300 rounded-xl border border-gray-700/50 focus:outline-none focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900"
                        >
                            <button
                                onClick={() => onSelectSeries(series.id)}
                                className="w-full text-left p-6"
                                aria-label={`Ouvrir la série ${series.title}`}
                            >
                                <h3 className="text-xl font-semibold text-gray-200">{series.title}</h3>
                            </button>
                            {isAdmin && (
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => onEditSeries(series)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white"
                                        aria-label={`Modifier la série ${series.title}`}
                                    >
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => onDeleteSeries(series.id, series.title)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-red-400"
                                        aria-label={`Supprimer la série ${series.title}`}
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="text-gray-400 text-center py-8">Aucune série d'exercices disponible pour ce chapitre pour le moment.</p>
                )}
            </div>
        </div>
    );
};
