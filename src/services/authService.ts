

import { createClient, SupabaseClient, type Session, type User as SupabaseUser } from '@supabase/supabase-js';
import { User, UserQuizAttempt } from '@/types';
import { calculateLevel } from '@/services/userService';

let supabase: SupabaseClient | null = null;
let adminEmail: string | null = null;

export interface AuthConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    adminEmail?: string;
}

/**
 * Initializes the Supabase client. This must be called once at app startup.
 * @param config The configuration for Supabase.
 */
export const initializeSupabase = (config: AuthConfig) => {
    if (supabase) {
        return; // Prevent re-initialization
    }
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        console.error("Tentative d'initialisation de Supabase avec une configuration invalide.");
        return;
    }
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    adminEmail = config.adminEmail || null;
    console.log("Client Supabase initialisé.");
};

/**
 * Returns the Supabase client instance. Throws an error if not initialized.
 * @returns The Supabase client.
 */
export const getSupabase = (): SupabaseClient => {
    if (!supabase) {
        throw new Error("Le client Supabase a été appelé avant son initialisation.");
    }
    return supabase;
};

/*
    -- SQL à exécuter dans l'éditeur SQL de Supabase pour créer la table des profils --

    -- 1. Create the profiles table
    CREATE TABLE public.profiles (
        id uuid NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
        email character varying(255) NOT NULL,
        xp integer DEFAULT 0 NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    -- 2. Enable Row Level Security
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 3. Create policies
    CREATE POLICY "Public profiles are viewable by everyone."
        ON public.profiles FOR SELECT
        USING (true);

    CREATE POLICY "Users can insert their own profile."
        ON public.profiles FOR INSERT
        WITH CHECK (auth.uid() = id);

    CREATE POLICY "Users can update their own profile."
        ON public.profiles FOR UPDATE
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);

    -- 4. Create a trigger to update 'updated_at' timestamp
    CREATE OR REPLACE FUNCTION public.handle_profile_update()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      return NEW;
    END;
    $$ language plpgsql security definer;

    CREATE TRIGGER on_profile_update
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE PROCEDURE public.handle_profile_update();
*/


/**
 * Retrieves user profile from the database, creating it if it doesn't exist.
 * @param supabaseUser The user object from Supabase auth.
 * @returns The user profile from the 'profiles' table.
 */
const getOrCreateProfile = async (supabaseUser: SupabaseUser) => {
    const supabase = getSupabase();
    const { data: profile, error } = await (supabase
        .from('profiles') as any)
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

    if (error && error.code !== 'PGRST116') { // 'PGRST116' is "single row not found"
        throw error;
    }
    
    if (profile) {
        return profile;
    }

    // Profile not found, let's create it
    const { data: newProfile, error: insertError } = await (supabase
        .from('profiles') as any)
        .insert({ id: supabaseUser.id, email: supabaseUser.email })
        .select()
        .single();
    
    if (insertError) {
        throw insertError;
    }

    return newProfile;
}

/**
 * Adapts a Supabase session object to the application's User type, fetching profile data.
 * @param session The Supabase session.
 * @returns A fully populated User object or null.
 */
export const getUserFromSession = async (session: Session | null): Promise<User | null> => {
    if (!session?.user) return null;
    
    const { user: supabaseUser } = session;
    const supabase = getSupabase();
    
    try {
        const profile = await getOrCreateProfile(supabaseUser);

        // Fetch all user progress data at once for performance
        const [
            { data: completedExercisesData, error: exercisesError },
            { data: quizAttemptsData, error: quizAttemptsError }
        ] = await Promise.all([
            (supabase.from('user_exercise_progress') as any).select('exercise_id').eq('user_id', supabaseUser.id),
            (supabase.from('user_quiz_attempts') as any).select('*').eq('user_id', supabaseUser.id)
        ]);
        
        if (exercisesError) {
            console.error("Error fetching completed exercises:", exercisesError);
            throw exercisesError;
        }
        
        if (quizAttemptsError) {
            console.error("Error fetching quiz attempts:", quizAttemptsError);
            throw quizAttemptsError;
        }

        const is_admin = !!adminEmail && 
                         supabaseUser.email?.toLowerCase().trim() === adminEmail.toLowerCase().trim();
        
        return {
            id: supabaseUser.id,
            email: supabaseUser.email || '',
            is_admin,
            xp: profile.xp || 0,
            level: calculateLevel(profile.xp || 0),
            completed_exercises: completedExercisesData.map((ex: any) => ex.exercise_id) || [],
            quiz_attempts: (quizAttemptsData || []) as UserQuizAttempt[],
        };
    } catch(error) {
        console.error("Error building user from session:", error);
        return null; // Return null if profile fetching or creation fails
    }
};

export const register = async (email: string, password: string): Promise<void> => {
    const { error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
};

export const login = async (email: string, password: string): Promise<void> => {
    const { error } = await getSupabase().auth.signIn({ email, password });
    if (error) throw new Error(error.message);
};

export const loginWithGoogle = async (): Promise<void> => {
    const { error } = await getSupabase().auth.signIn({
        provider: 'google',
    }, {
        redirectTo: window.location.origin
    });
    if (error) throw new Error(error.message);
};

export const logout = async (): Promise<void> => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw new Error(error.message);
};

export const requestPasswordReset = async (email: string): Promise<void> => {
    const { error } = await (getSupabase().auth.api as any).resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
};

export const resetPassword = async (newPassword: string): Promise<void> => {
    // The access token is handled by the client library after the user clicks the magic link.
    // .update() will use the session's access token.
    const { error } = await getSupabase().auth.update({ password: newPassword });
    if (error) throw new Error(error.message);
};
