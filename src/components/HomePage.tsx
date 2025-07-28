
import React from 'react';
import { Level } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { PlusCircleIcon, PencilIcon, TrashIcon, BookOpenIcon } from '@/components/icons';

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
        <div className="max-w-7xl mx-auto">
            <div className="relative text-center py-20 md:py-32 overflow-hidden">
                <div 
                    className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950 to-slate-900" 
                    aria-hidden="true"
                />
                <div 
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-gradient-radial from-purple-500/20 to-transparent blur-3xl animate-float"
                    aria-hidden="true"
                />
                
                 <div className="max-w-4xl mx-auto px-4">
                    <h1 className="text-5xl font-extrabold tracking-tight text-slate-100 sm:text-7xl">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 animate-gradient">Maîtrisez</span> les Maths,
                        <br/>
                        Réussissez votre Bac.
                    </h1>
                    <p className="mt-6 text-lg max-w-2xl mx-auto leading-8 text-slate-400">
                        Votre plateforme tout-en-un pour les Sciences Mathématiques au Maroc. Leçons, quiz interactifs, et exercices corrigés avec l'aide de l'IA.
                    </p>
                </div>
            </div>
            
            {isAdmin && (
                <div className="mb-12 p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-center">
                   <p className="font-semibold">Mode Administrateur Activé</p>
                   <p className="text-sm mt-1">Vous pouvez ajouter, modifier et supprimer du contenu. N'oubliez pas de sauvegarder vos changements.</p>
                </div>
            )}


            <div className="flex justify-between items-center mb-8 px-4">
                <h2 className="text-2xl font-semibold text-slate-100">Choisissez votre niveau pour commencer</h2>
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
            
            <div className="grid md:grid-cols-2 gap-6 px-4">
                {levels.map(level => (
                    <div
                        key={level.id}
                        role="button"
                        aria-label={`Choisir le niveau ${level.levelName}`}
                        tabIndex={0}
                        className="relative group bg-slate-900 p-8 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-all duration-300 overflow-hidden cursor-pointer"
                        onClick={() => onSelectLevel(level.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLevel(level.id); }}
                    >
                        <div className="absolute -inset-px bg-gradient-to-r from-blue-500/50 to-purple-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true" />
                        <div className="relative">
                            {isAdmin && (
                                <div className="absolute top-0 right-0 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => onEditLevel(level)}
                                        className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
                                        aria-label="Modifier le niveau"
                                    >
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => onDeleteLevel(level.id, level.levelName)}
                                        className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-red-400"
                                        aria-label="Supprimer le niveau"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center gap-4 mb-4">
                               <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                                   <BookOpenIcon className="w-6 h-6 text-blue-400"/>
                               </div>
                               <h3 className="text-2xl font-bold text-slate-100">{level.levelName}</h3>
                            </div>
                            <p className="mt-2 text-slate-400">{level.description}</p>
                            <div className="mt-6 text-blue-400 group-hover:text-white transition-colors font-semibold">
                                Commencer l'apprentissage →
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};