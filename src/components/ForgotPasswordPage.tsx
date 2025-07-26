
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SpinnerIcon } from '@/components/icons';

interface ForgotPasswordPageProps {
    onBackToLogin: () => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onBackToLogin }) => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { requestPasswordReset } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setIsLoading(true);
        try {
            await requestPasswordReset(email);
            // The user must now check their email and click the link.
            // The app will detect the link's token upon reloading.
            setSuccessMessage("Si un compte avec cet email existe, un lien de réinitialisation a été envoyé. Veuillez consulter votre boîte de réception.");

        } catch (err) {
            const friendlyError = (err instanceof Error && err.message.includes("rate limit"))
                ? "Vous avez fait trop de demandes. Veuillez réessayer plus tard."
                : err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setError(friendlyError);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-lg p-8">
                <h2 className="text-2xl font-bold text-center text-brand-blue-300 mb-2">Mot de passe oublié</h2>
                <p className="text-center text-gray-400 mb-6 text-sm">
                    Saisissez votre email pour recevoir un lien de réinitialisation.
                </p>
                
                {successMessage ? (
                     <div className="text-center p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
                         <p className="text-green-300">{successMessage}</p>
                     </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="email-forgot" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                            <input
                                type="email"
                                id="email-forgot"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
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
                                {isLoading ? 'Envoi...' : 'Envoyer le lien'}
                            </button>
                        </div>
                    </form>
                )}

                <div className="text-center mt-6">
                    <button onClick={onBackToLogin} className="text-sm text-brand-blue-400 hover:text-brand-blue-300">
                        Retour à la connexion
                    </button>
                </div>
            </div>
        </div>
    );
};
