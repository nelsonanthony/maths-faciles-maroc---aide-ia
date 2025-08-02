

import { Level, Exercise } from '../../src/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Simple in-memory cache for the serverless function instance.
let cachedCurriculum: Level[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 1 * 60 * 1000; // 1 minute cache

function getSupabaseAdminClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    const missingVars = [];
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');

    if (missingVars.length > 0) {
        const errorMsg = `Configuration du serveur incomplète. Variables d'environnement manquantes: ${missingVars.join(', ')}`;
        console.error(`Error in getSupabaseAdminClient: ${errorMsg}`);
        throw new Error(errorMsg);
    }
    return createClient(supabaseUrl, supabaseServiceKey);
}


/**
 * Fetches the curriculum from Supabase, using an in-memory cache.
 * This ensures data consistency between frontend and backend.
 */
async function getCurriculumFromSupabase(): Promise<Level[]> {
    const now = Date.now();
    if (cachedCurriculum && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION_MS)) {
        return cachedCurriculum;
    }

    try {
        const supabase = getSupabaseAdminClient();
        const { data, error } = await (supabase
            .from('curriculum') as any)
            .select('data')
            .eq('id', 1) // The main row ID
            .single();

        if (error) {
            // If the row doesn't exist, it's not a critical error, just means no data yet.
            if (error.code === 'PGRST116') {
                 console.warn("Curriculum row not found in Supabase. Returning empty array.");
                 cachedCurriculum = [];
                 cacheTimestamp = now;
                 return [];
            }
            console.error("Error fetching curriculum from Supabase:", error);
            throw new Error('Failed to fetch curriculum from database.');
        }
        
        if (!data?.data || !Array.isArray(data.data)) {
            // This is a valid state if no curriculum has been created yet. Return empty array.
            cachedCurriculum = [];
            cacheTimestamp = now;
            return [];
        }
        
        cachedCurriculum = data.data as Level[];
        cacheTimestamp = now;
        return cachedCurriculum;
    } catch (error) {
        console.error("Critical Error: Could not fetch curriculum from Supabase.", error);
        throw new Error("Could not load curriculum from the server.");
    }
}


/**
 * Finds a specific exercise within the curriculum structure.
 * @param levels The full curriculum data.
 * @param exerciseId The ID of the exercise to find.
 * @returns The Exercise object or undefined if not found.
 */
function findExerciseInCurriculum(levels: Level[], exerciseId: string): Exercise | undefined {
    for (const level of levels) {
        for (const chapter of level?.chapters ?? []) {
            for (const series of chapter?.series ?? []) {
                for (const exercise of series?.exercises ?? []) {
                    if (exercise.id === exerciseId) {
                        return exercise;
                    }
                }
            }
        }
    }
    return undefined;
}


/**
 * Fetches the full curriculum data, maps it, and returns all exercises in a Map.
 * This is useful for functions that need to look up multiple exercises.
 * @returns A Map of exerciseId to Exercise object.
 */
const getAllExercisesMap = async (): Promise<Map<string, Exercise>> => {
    const levels = await getCurriculumFromSupabase();
    const allExercisesMap = new Map<string, Exercise>();

    for (const level of levels) {
        for (const chapter of level?.chapters ?? []) {
            for (const series of chapter?.series ?? []) {
                for (const exercise of series?.exercises ?? []) {
                    if (exercise?.id) {
                        allExercisesMap.set(exercise.id, exercise);
                    }
                }
            }
        }
    }
    return allExercisesMap;
}


/**
 * Retrieves a single exercise by its ID, using a cached curriculum.
 * @param exerciseId The ID of the exercise to retrieve.
 * @returns The Exercise object or undefined if not found.
 */
const getExerciseById = async (exerciseId: string): Promise<Exercise | undefined> => {
    const curriculum = await getCurriculumFromSupabase();
    return findExerciseInCurriculum(curriculum, exerciseId);
}


/**
 * Saves the entire curriculum structure to the database.
 */
const saveCurriculumToSupabase = async (levels: Level[]): Promise<void> => {
    const supabase = getSupabaseAdminClient();
    
    const payload = { data: levels };
    const { error } = await (supabase
        .from('curriculum') as any)
        .update(payload)
        .eq('id', 1);

    if (error) {
        console.error('Erreur lors de la sauvegarde du programme sur Supabase:', error);
        throw new Error('La sauvegarde des modifications a échoué.');
    }
    
    // Invalidate cache after saving
    cachedCurriculum = null;
    cacheTimestamp = null;
}

export default {
    getCurriculumFromSupabase,
    saveCurriculumToSupabase,
    getExerciseById,
    getAllExercisesMap
};
