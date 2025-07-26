
import React from 'react';
import { Level } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { PlusCircleIcon, PencilIcon, TrashIcon } from '@/components/icons';

interface HomePageProps {
    levels: Level[];
    onSelectLevel: (levelId: string) => void;
    onAddLevel: () => void;
    onEditLevel: (level: Level) => void;
    onDeleteLevel: (levelId: string, levelName: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ levels, onSelectLevel, onAddLevel, onEditLevel, onDeleteLevel }) => {
    const { isAdmin } = useAuth();
    
    return (
        <div className="max-w-5xl mx-auto">
             {isAdmin && (
                <div className="mb-8 p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-center">
                   <p className="font-semibold">Mode Administrateur Activé</p>
                   <p className="text-sm mt-1">Vous pouvez ajouter, modifier et supprimer du contenu. N'oubliez pas de sauvegarder vos changements.</p>
                </div>
            )}
            <div className="text-center mb-12">
                 <div className="max-w-2xl mx-auto">
                    <div className="text-5xl font-bold tracking-tight text-white sm:text-7xl">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue-400 via-blue-300 to-green-300 animate-gradient">Maîtrisez</span> les Maths,
                        <br/>
                        Réussissez votre Bac.
                    </div>
                    <p className="mt-6 text-lg leading-8 text-gray-400">
                        Votre plateforme tout-en-un pour les Sciences Mathématiques au Maroc. Leçons, quiz interactifs, et exercices corrigés avec l'aide de l'IA.
                    </p>
                </div>
            </div>

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-semibold text-brand-blue-300">Choisissez votre niveau pour commencer</h2>
                 {isAdmin && (
                    <button
                        onClick={onAddLevel}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-green-600/80 border-2 border-green-500 hover:bg-green-600 text-white"
                    >
                        <PlusCircleIcon className="w-5 h-5" />
                        Ajouter un niveau
                    </button>
                )}
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
                {levels.map(level => (
                    <div
                        key={level.id}
                        role="link"
                        aria-label={`Choisir le niveau ${level.levelName}`}
                        tabIndex={0}
                        className="relative group bg-gray-800/50 hover:bg-gray-700/60 transition-all duration-300 rounded-xl p-8 border border-gray-700/50 text-left focus:outline-none focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900"
                        onClick={() => onSelectLevel(level.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLevel(level.id); }}
                    >
                         {isAdmin && (
                            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                <button
                                    onClick={() => onEditLevel(level)}
                                    className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white"
                                    aria-label="Modifier le niveau"
                                >
                                    <PencilIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => onDeleteLevel(level.id, level.levelName)}
                                    className="p-2 rounded-full text-gray-400 hover:bg-gray-600 hover:text-red-400"
                                    aria-label="Supprimer le niveau"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                        <div className="cursor-pointer">
                            <h3 className="text-2xl font-bold text-brand-blue-300 group-hover:text-brand-blue-200 transition-colors">{level.levelName}</h3>
                            <p className="mt-2 text-gray-400">{level.description}</p>
                            <div className="mt-4 text-brand-blue-400 group-hover:text-white transition-colors font-semibold">
                                Commencer →
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
