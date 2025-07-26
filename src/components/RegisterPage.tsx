
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SpinnerIcon, GoogleIcon } from '@/components/icons';

interface RegisterPageProps {
    onRegisterSuccess: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onRegisterSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { register, loginWithGoogle } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }
        setError(null);
        setIsLoading(true);
        try {
            await register(email, password);
            // L'alerte est maintenant gérée dans AuthContext
            onRegisterSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Une erreur inconnue est survenue.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError(null);
        setIsLoading(true);
        try {
            // Cette fonction va maintenant rediriger l'utilisateur vers la page de connexion de Google.
            await loginWithGoogle();
        } catch (err) {
            // Cette erreur ne s'affichera que si la redirection elle-même échoue.
            setError(err instanceof Error ? err.message : "Impossible d'initier l'inscription Google.");
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-lg p-8">
                <h2 className="text-2xl font-bold text-center text-brand-blue-300 mb-6">Créer un compte élève</h2>
                
                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="w-full mb-6 inline-flex items-center justify-center gap-3 px-5 py-3 font-semibold text-white bg-[#1a1f2c] rounded-lg shadow-md border-2 border-gray-600 hover:bg-gray-700 disabled:opacity-70 transition-colors"
                >
                    <GoogleIcon className="w-6 h-6" />
                    S'inscrire avec Google
                </button>

                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="bg-gray-800 px-2 text-gray-500">OU</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email-register" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                        <input
                            type="email"
                            id="email-register"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                        />
                    </div>
                     <div>
                        <label htmlFor="password-register" className="block text-sm font-medium text-gray-300 mb-1">Mot de passe</label>
                         <input
                            type="password"
                            id="password-register"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                        />
                    </div>
                     <div>
                        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-1">Confirmer le mot de passe</label>
                         <input
                            type="password"
                            id="confirm-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                        />
                    </div>
                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:bg-brand-blue-800 disabled:cursor-not-allowed"
                        >
                            {isLoading && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                            {isLoading ? 'Inscription...' : "S'inscrire"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
