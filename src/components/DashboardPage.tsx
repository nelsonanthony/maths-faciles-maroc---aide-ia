
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpenIcon, StarIcon, CheckCircleIcon, SpinnerIcon, QuestionMarkCircleIcon } from '@/components/icons';
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
                <span className="text-sm font-bold text-blue-300">Niveau {level}</span>
                <span className="text-xs text-slate-400">{xp.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3">
                <div 
                    className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-500" 
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
                <h2 className="text-3xl font-bold text-blue-300">Tableau de Bord Administrateur</h2>
                <p className="text-lg text-slate-400 mt-1">Supervision des élèves et gestion du contenu.</p>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                <h3 className="text-xl font-semibold text-white mb-4">Gestion du Contenu</h3>
                <p className="text-slate-400 mb-4">Accéder à l'interface pour ajouter, modifier ou supprimer des niveaux, chapitres, exercices et quiz.</p>
                <button
                    onClick={onNavigateToCourses}
                    className="inline-flex items-center gap-3 px-5 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                >
                    <BookOpenIcon className="w-6 h-6" />
                    Gérer les cours
                </button>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                <h3 className="text-xl font-semibold text-white mb-4">Liste des Élèves</h3>
                {isLoading && <SpinnerIcon className="w-8 h-8 animate-spin text-blue-500 mx-auto" />}
                {error && <p className="text-red-400 text-center">{error}</p>}
                {!isLoading && !error && (
                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b-2 border-slate-600">
                                <tr>
                                    <th className="p-3 text-sm font-semibold text-slate-400">Email</th>
                                    <th className="p-3 text-sm font-semibold text-slate-400">Niveau</th>
                                    <th className="p-3 text-sm font-semibold text-slate-400">XP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profiles.sort((a,b) => b.xp - a.xp).map(profile => (
                                    <tr key={profile.id} className="border-b border-slate-700/50">
                                        <td className="p-3 text-slate-300">{profile.email}</td>
                                        <td className="p-3 text-slate-300 font-bold">{profile.level}</td>
                                        <td className="p-3 text-slate-300">{profile.xp.toLocaleString()}</td>
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

    const statCards = [
        { icon: StarIcon, label: "Points d'XP", value: user.xp.toLocaleString(), color: "text-yellow-400", gradient: "from-yellow-500/20 to-slate-900" },
        { icon: CheckCircleIcon, label: "Exercices terminés", value: user.completed_exercises.length, color: "text-green-400", gradient: "from-green-500/20 to-slate-900" },
        { icon: QuestionMarkCircleIcon, label: "Quiz tentés", value: user.quiz_attempts.length, color: "text-purple-400", gradient: "from-purple-500/20 to-slate-900" },
    ]

    return (
        <div className="max-w-5xl mx-auto space-y-10">
             <div>
                <h2 className="text-4xl font-bold text-slate-100">Tableau de Bord</h2>
                <p className="text-lg text-slate-400 mt-1">
                   Bienvenue, {user.email}. Voici votre progression.
                </p>
            </div>
            
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                <h3 className="font-semibold text-slate-200 mb-4">Votre Progression</h3>
                <XPProgressBar xp={user.xp} level={user.level} />
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {statCards.map(card => (
                    <div key={card.label} className={`relative bg-slate-900 p-6 rounded-2xl border border-slate-800 overflow-hidden`}>
                       <div className={`absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r ${card.gradient} opacity-50 blur-2xl`}/>
                       <div className="relative flex items-center gap-4">
                            <card.icon className={`w-10 h-10 ${card.color}`}/>
                            <div>
                                <p className="text-sm text-slate-400">{card.label}</p>
                                <p className="text-2xl font-bold text-white">{card.value}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="relative bg-gradient-to-br from-blue-600/50 via-purple-600/50 to-slate-900/50 p-8 rounded-2xl border border-slate-700 text-center">
                 <h3 className="text-2xl font-bold text-white">Prêt à continuer ?</h3>
                 <p className="text-slate-300 mt-2 mb-6 max-w-md mx-auto">Plongez dans les leçons et continuez à accumuler de l'expérience.</p>
                 <button onClick={onNavigateToCourses} className="bg-white text-slate-900 font-semibold px-8 py-3 rounded-lg hover:bg-slate-200 transition-colors shadow-lg shadow-blue-500/10">
                    Accéder aux cours
                 </button>
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
        return <div className="text-center"><SpinnerIcon className="w-8 h-8 animate-spin mx-auto text-blue-500" /></div>;
    }

    return isAdmin 
        ? <AdminDashboard onNavigateToCourses={onNavigateToCourses} /> 
        : <StudentDashboard onNavigateToCourses={onNavigateToCourses} />;
};