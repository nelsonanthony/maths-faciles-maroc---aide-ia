

import React, { useState } from 'react';
import { ArrowDownTrayIcon, UserCircleIcon, ArrowRightOnRectangleIcon, SpinnerIcon, CheckCircleIcon } from './icons';
import { useAuth } from '../contexts/AuthContext';
import { View } from '@/types';

interface HeaderProps {
    onNavigate: (view: View) => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigate }) => {
    const { user, isAdmin, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        setIsMenuOpen(false);
        onNavigate('home');
    };

    const handleLogoClick = () => {
        const destination = user ? 'dashboard' : 'home';
        onNavigate(destination);
    };

    const handleCoursesClick = () => {
        if (user) {
            onNavigate('courses');
        } else {
            onNavigate('login');
        }
    };

    return (
        <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-20">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <button onClick={handleLogoClick} className="text-xl md:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 animate-gradient">
                        Maths Faciles Maroc
                    </button>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleCoursesClick}
                            className="hidden sm:block px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 text-slate-300 hover:bg-slate-700/50"
                        >
                            Cours
                        </button>
                        
                        {!user ? (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onNavigate('login')}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300"
                                >
                                    Connexion
                                </button>
                                 <button
                                    onClick={() => onNavigate('register')}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-blue-600 border-2 border-blue-500 text-white hover:bg-blue-700 hover:border-blue-600"
                                >
                                    S'inscrire
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <button onClick={() => setIsMenuOpen(prev => !prev)} className="flex items-center gap-2 text-slate-300 hover:text-white">
                                    <UserCircleIcon className="w-8 h-8 text-blue-400"/>
                                    <span className="hidden md:inline">{user.email}</span>
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-md shadow-lg py-1 border border-slate-700">
                                        <button 
                                            onClick={() => { onNavigate('dashboard'); setIsMenuOpen(false); }} 
                                            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
                                            Tableau de bord
                                        </button>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
                                        >
                                            <ArrowRightOnRectangleIcon className="w-5 h-5" />
                                            Déconnexion
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
