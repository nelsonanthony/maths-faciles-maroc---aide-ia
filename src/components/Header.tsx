


import React, { useState } from 'react';
import { ArrowDownTrayIcon, UserCircleIcon, ArrowRightOnRectangleIcon, SpinnerIcon, CheckCircleIcon } from './icons';
import { useAuth } from '../contexts/AuthContext';
import { View } from '@/types';

interface HeaderProps {
    onNavigate: (view: View) => void;
    onSaveChanges: () => void;
    isSaving: boolean;
    saveSuccess: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onNavigate, onSaveChanges, isSaving, saveSuccess }) => {
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
    
    const getSaveButtonClass = () => {
        if (isSaving) {
            return "bg-gray-500 border-gray-400 cursor-not-allowed";
        }
        if (saveSuccess) {
            return "bg-green-600 border-green-500";
        }
        return "bg-blue-600/80 border-blue-500 hover:bg-blue-600";
    };

    return (
        <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50 sticky top-0 z-20">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <button onClick={handleLogoClick} className="text-xl md:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-blue-400 via-blue-300 to-green-300 animate-gradient">
                        Maths Faciles Maroc
                    </button>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleCoursesClick}
                            className="hidden sm:block px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 text-gray-300 hover:bg-gray-700/50"
                        >
                            Cours
                        </button>
                        {isAdmin && (
                             <button
                                onClick={onSaveChanges}
                                disabled={isSaving || saveSuccess}
                                className={`hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 text-white disabled:cursor-not-allowed ${getSaveButtonClass()}`}
                            >
                                {isSaving 
                                    ? <SpinnerIcon className="w-5 h-5 animate-spin" /> 
                                    : saveSuccess 
                                        ? <CheckCircleIcon className="w-5 h-5" /> 
                                        : <ArrowDownTrayIcon className="w-5 h-5" />}
                                
                                {isSaving ? 'Sauvegarde...' : saveSuccess ? 'Sauvegardé !' : 'Sauvegarder'}
                            </button>
                        )}
                        
                        {!user ? (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onNavigate('login')}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300"
                                >
                                    Connexion
                                </button>
                                 <button
                                    onClick={() => onNavigate('register')}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700"
                                >
                                    S'inscrire
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <button onClick={() => setIsMenuOpen(prev => !prev)} className="flex items-center gap-2 text-gray-300 hover:text-white">
                                    <UserCircleIcon className="w-8 h-8 text-brand-blue-400"/>
                                    <span className="hidden md:inline">{user.email}</span>
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 border border-gray-700">
                                        <button 
                                            onClick={() => { onNavigate('dashboard'); setIsMenuOpen(false); }} 
                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">
                                            Tableau de bord
                                        </button>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
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
