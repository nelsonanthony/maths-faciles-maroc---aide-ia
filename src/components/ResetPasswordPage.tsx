
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SpinnerIcon } from '@/components/icons';

interface ResetPasswordPageProps {
    onResetSuccess: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onResetSuccess }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { resetPassword } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }
        if (newPassword.length < 6) {
            setError("Le mot de passe doit contenir au moins 6 caractères.");
            return;
        }

        setError(null);
        setIsLoading(true);
        try {
            await resetPassword(newPassword);
            alert("Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.");
            onResetSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Une erreur inconnue est survenue.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-lg p-8">
                <h2 className="text-2xl font-bold text-center text-brand-blue-300 mb-6">Réinitialiser le mot de passe</h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-1">Nouveau mot de passe</label>
                        <input
                            type="password"
                            id="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                        />
                    </div>
                     <div>
                        <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-300 mb-1">Confirmer le nouveau mot de passe</label>
                        <input
                            type="password"
                            id="confirm-new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
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
                            {isLoading ? 'Enregistrement...' : 'Réinitialiser le mot de passe'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
