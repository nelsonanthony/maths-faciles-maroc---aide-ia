
import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import { User, AuthContextType } from '@/types';
import * as authService from '@/services/authService';
import { SpinnerIcon } from '@/components/icons';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [adminEmailForDebug, setAdminEmailForDebug] = useState<string | undefined>();

    useEffect(() => {
        let isMounted = true;

        const initialize = async () => {
            try {
                const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
                const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
                const adminEmailFromEnv = import.meta.env?.VITE_ADMIN_EMAIL;

                if (!supabaseUrl || !supabaseAnonKey) {
                    console.error("Erreur de configuration : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont nécessaires.");
                    throw new Error("Configuration de l'application incomplète. Assurez-vous que les variables d'environnement VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies.");
                }

                const config: authService.AuthConfig = { supabaseUrl, supabaseAnonKey, adminEmail: adminEmailFromEnv };
                
                authService.initializeSupabase(config);
                setAdminEmailForDebug(config.adminEmail);

                const supabase = authService.getSupabase();
                const { data: { session } } = await supabase.auth.getSession();
                if (isMounted) {
                    const userProfile = await authService.getUserFromSession(session);
                    setUser(userProfile);
                }

                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
                    if (isMounted) {
                        const userProfile = await authService.getUserFromSession(session);
                        setUser(userProfile);
                    }
                });

                return () => {
                    subscription?.unsubscribe();
                };

            } catch (err) {
                if (isMounted) {
                    console.error("Erreur d'initialisation de l'authentification:", err);
                    setError(err instanceof Error ? err.message : "Une erreur inconnue est survenue lors de l'initialisation.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };
        
        const cleanupPromise = initialize();

        return () => {
            isMounted = false;
            cleanupPromise.then(cleanup => cleanup && cleanup());
        };
    }, []);

    const updateUser = useCallback((data: Partial<User>) => {
        setUser(prevUser => {
            if (!prevUser) return null;
            return { ...prevUser, ...data };
        });
    }, []);

    const registerWrapper = async (email: string, password: string) => {
        await authService.register(email, password);
        alert("Inscription réussie ! Si la confirmation par email est activée pour ce site, veuillez vérifier votre boîte de réception pour continuer.");
    };

    const resetPasswordWrapper = async (newPassword: string): Promise<void> => {
        await authService.resetPassword(newPassword);
    };

    const requestPasswordResetWrapper = async (email: string): Promise<string> => {
        await authService.requestPasswordReset(email);
        return "reset-request-sent"; 
    };
    
    const isAdmin = useMemo(() => user?.is_admin || false, [user]);
    
    const value: AuthContextType = {
        user,
        isAdmin,
        isLoading,
        updateUser,
        login: authService.login,
        register: registerWrapper,
        loginWithGoogle: authService.loginWithGoogle,
        logout: authService.logout,
        requestPasswordReset: requestPasswordResetWrapper,
        resetPassword: resetPasswordWrapper,
        adminEmailForDebug: adminEmailForDebug,
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <SpinnerIcon className="w-12 h-12 animate-spin text-brand-blue-500 mx-auto" />
                    <p className="mt-4 text-lg text-gray-300">Initialisation de l'application...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center text-red-400 p-8 bg-red-900/20 rounded-lg max-w-lg">
                    <h2 className="text-2xl font-bold mb-2">Erreur Critique</h2>
                    <p className="mb-4">Impossible d'initialiser l'application.</p>
                    <p className="text-sm bg-gray-800 p-3 rounded-md border border-gray-700">{error}</p>
                    <p className="text-xs text-gray-500 mt-4">Veuillez vérifier vos variables d'environnement (sur Vercel ou dans .env.local) et rafraîchissez la page.</p>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
