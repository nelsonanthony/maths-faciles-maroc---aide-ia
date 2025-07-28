
import { getSupabase } from '@/services/authService';
import { Level } from '@/types';

// This file implements a persistent data layer using Supabase.
// IMPORTANT: You must create a table named 'curriculum' in your Supabase project.
// Go to your project's SQL Editor and run the following commands for a robust setup.

/*
-- 1. Create the table for the curriculum data.
-- We use a single row identified by ID=1 to store the entire curriculum JSONB object.
CREATE TABLE public.curriculum (
  id BIGINT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Create a function that will be triggered on updates to automatically set updated_at.
CREATE OR REPLACE FUNCTION public.handle_curriculum_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create a trigger that calls the function whenever the 'data' column is updated.
CREATE TRIGGER on_curriculum_update
BEFORE UPDATE ON public.curriculum
FOR EACH ROW
EXECUTE FUNCTION public.handle_curriculum_update();

-- 4. Enable Row Level Security (RLS) on the table. This is crucial for security.
ALTER TABLE public.curriculum ENABLE ROW LEVEL SECURITY;

-- 5. Create a security policy for public read access.
-- This allows anyone to read the curriculum data.
CREATE POLICY "Allow public read access" ON public.curriculum
FOR SELECT USING (true);

-- 6. Create a security policy to allow authenticated users to UPDATE the data.
-- This prevents anonymous users from modifying the curriculum.
CREATE POLICY "Allow authenticated update" ON public.curriculum
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- 7. Create a security policy to allow authenticated users to INSERT the initial data.
-- This is needed for the app's "self-healing" feature, which seeds the database
-- if the initial row (id=1) is missing. Anonymous users cannot perform this action.
CREATE POLICY "Allow authenticated insert" ON public.curriculum
FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

-- 8. Insert the initial placeholder row. (RECOMMENDED)
-- Running this step manually is the best practice. It ensures the row exists
-- and avoids the self-healing logic being triggered by users.
INSERT INTO public.curriculum (id, data) VALUES (1, '[]'::jsonb);

*/

const TABLE_NAME = 'curriculum';
const ROW_ID = 1; // We'll use a single row to store the entire curriculum JSON

/**
 * Fetches the entire curriculum from the database.
 * If the database data is invalid or empty, it seeds it with the local data.json.
 */
export const getCurriculum = async (): Promise<Level[]> => {
    const supabase = getSupabase();

    const { data, error } = await (supabase
        .from(TABLE_NAME) as any)
        .select('data')
        .eq('id', ROW_ID)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = "single row not found"
        console.error('Erreur lors de la récupération du programme depuis Supabase:', error);
        throw new Error('Impossible de charger les données depuis la base de données.');
    }

    // --- SELF-HEALING LOGIC ---
    // An empty array is considered valid (it means no levels created yet).
    // We only re-seed if the row doesn't exist, or its data is not a valid array.
    if (data?.data && Array.isArray(data.data)) {
        return data.data as Level[];
    } else {
        console.warn("Programme invalide ou vide dans la BDD. Initialisation depuis data.json...");
        try {
            const response = await fetch('/data.json');
            if (!response.ok) throw new Error("Impossible de charger data.json pour l'initialisation.");
            
            const localData = await response.json();
            const levelsToSeed = localData.levels || [];

            if (!Array.isArray(levelsToSeed)) {
                 throw new Error("Le fichier data.json local est mal formé (le champ 'levels' n'est pas un tableau).");
            }
            
            const payload = { id: ROW_ID, data: levelsToSeed };
            // Use upsert to be safe. It will INSERT if the row is missing (requires authenticated user)
            // or UPDATE if the row exists but data is invalid. `upsert` expects an array.
            const { error: upsertError } = await (supabase
                .from(TABLE_NAME) as any)
                .upsert([payload]);

            if (upsertError) {
                console.error("Erreur lors de l'initialisation de la base de données:", upsertError);
                throw new Error("Impossible de sauvegarder les données initiales. Si vous n'êtes pas connecté en tant qu'administrateur, cela peut être la cause.");
            }
            
            console.log("Initialisation de la base de données réussie.");
            return levelsToSeed as Level[];
        } catch (seedError) {
            console.error("Le processus d'initialisation a échoué:", seedError);
            throw seedError;
        }
    }
};
