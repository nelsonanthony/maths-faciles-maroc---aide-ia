
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpenIcon, StarIcon, CheckCircleIcon, SpinnerIcon } from '@/components/icons';
import { Profile } from '@/types';
import * as userService from '@/services/userService';

const XPProgressBar: React.FC<{ xp: number; level: number }> = ({ xp, level }) => {
    const xpForCurrentLevel = userService.getXPForLevel(level);
    const xpForNextLevel = userService.getXPForLevel(level + 1);
    
    const levelXP = xpForNextLevel - xpForCurrentLevel;
    const currentXPInLevel = xp - xpForCurrentLevel;
    
    const percentage = levelXP > 0 ? (currentXPInLevel / levelXP) * 100 : 0;

    return (
        <div>
            <div className="flex justify-between items-end mb-1">
                <span className="text-sm font-bold text-brand-blue-300">Niveau {level}</span>
                <span className="text-xs text-gray-400">{xp.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
                <div 
                    className="bg-gradient-to-r from-green-400 to-brand-blue-500 h-3 rounded-full transition-all duration-500" 
                    style={{width: `${percentage}%`}}
                ></div>
            </div>
        </div>
    );
};

const AdminDashboard: React.FC<{ onNavigateToCourses: () => void }> = ({ onNavigateToCourses }) => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                const fetchedProfiles = await userService.getAllProfiles();
                setProfiles(fetchedProfiles);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load student data.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfiles();
    }, []);

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-brand-blue-300">Tableau de Bord Administrateur</h2>
                <p className="text-lg text-gray-400 mt-1">Supervision des élèves et gestion du contenu.</p>
            </div>

            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
                <h3 className="text-xl font-semibold text-white mb-4">Gestion du Contenu</h3>
                <p className="text-gray-400 mb-4">Accéder à l'interface pour ajouter, modifier ou supprimer des niveaux, chapitres, exercices et quiz.</p>
                <button
                    onClick={onNavigateToCourses}
                    className="inline-flex items-center gap-3 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 transition-colors"
                >
                    <BookOpenIcon className="w-6 h-6" />
                    Gérer les cours
                </button>
            </div>

            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
                <h3 className="text-xl font-semibold text-white mb-4">Liste des Élèves</h3>
                {isLoading && <SpinnerIcon className="w-8 h-8 animate-spin text-brand-blue-500 mx-auto" />}
                {error && <p className="text-red-400 text-center">{error}</p>}
                {!isLoading && !error && (
                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b-2 border-gray-600">
                                <tr>
                                    <th className="p-3 text-sm font-semibold text-gray-400">Email</th>
                                    <th className="p-3 text-sm font-semibold text-gray-400">Niveau</th>
                                    <th className="p-3 text-sm font-semibold text-gray-400">XP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profiles.sort((a,b) => b.xp - a.xp).map(profile => (
                                    <tr key={profile.id} className="border-b border-gray-700/50">
                                        <td className="p-3 text-gray-300">{profile.email}</td>
                                        <td className="p-3 text-gray-300 font-bold">{profile.level}</td>
                                        <td className="p-3 text-gray-300">{profile.xp.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

const StudentDashboard: React.FC<{ onNavigateToCourses: () => void; }> = ({ onNavigateToCourses }) => {
    const { user } = useAuth();
    
    if (!user) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-12">
             <div>
                <h2 className="text-4xl font-bold text-brand-blue-300">Mon Tableau de Bord</h2>
                <p className="text-lg text-gray-400 mt-1">
                   Bienvenue, {user.email}. Continuez sur cette belle lancée !
                </p>
            </div>
            
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
                <XPProgressBar xp={user.xp} level={user.level} />
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 flex items-center gap-4">
                    <StarIcon className="w-10 h-10 text-yellow-400"/>
                    <div>
                        <p className="text-sm text-gray-400">Points d'XP</p>
                        <p className="text-2xl font-bold text-white">{user.xp.toLocaleString()}</p>
                    </div>
                </div>
                 <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 flex items-center gap-4">
                    <CheckCircleIcon className="w-10 h-10 text-green-400"/>
                    <div>
                        <p className="text-sm text-gray-400">Exercices terminés</p>
                        <p className="text-2xl font-bold text-white">{user.completed_exercises.length}</p>
                    </div>
                </div>
                 <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 flex items-center gap-4">
                    <BookOpenIcon className="w-10 h-10 text-brand-blue-400"/>
                    <div>
                        <p className="text-sm text-gray-400">Leçons</p>
                        <button onClick={onNavigateToCourses} className="text-xl font-bold text-white bg-brand-blue-600 px-4 py-1 rounded-lg hover:bg-brand-blue-700 transition-colors">
                           Accéder aux cours
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface DashboardPageProps {
    onNavigateToCourses: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigateToCourses }) => {
    const { user, isAdmin } = useAuth();

    if (!user) {
        return <p>Chargement...</p>;
    }

    return isAdmin 
        ? <AdminDashboard onNavigateToCourses={onNavigateToCourses} /> 
        : <StudentDashboard onNavigateToCourses={onNavigateToCourses} />;
};
