import { SupabaseClient } from "@supabase/supabase-js";
import { Level, Exercise } from '../src/types';

// Simple in-memory cache for the serverless function instance
let cachedCurriculum: Level[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // Cache for 5 minutes

/**
 * Fetches the curriculum from the database, using an in-memory cache to reduce reads.
 */
async function getCachedCurriculum(supabase: SupabaseClient): Promise<Level[]> {
    const now = Date.now();
    if (cachedCurriculum && (now - cacheTimestamp < CACHE_DURATION_MS)) {
        return cachedCurriculum;
    }

    const { data, error } = await (supabase
        .from('curriculum') as any)
        .select('data')
        .eq('id', 1)
        .single();
    
    if (error || !data?.data || !Array.isArray(data.data)) {
        console.error("Could not fetch or parse curriculum from DB:", error?.message);
        // Clear cache in case of error and throw
        cachedCurriculum = null;
        cacheTimestamp = 0;
        throw new Error("Impossible de charger le contenu pédagogique depuis le serveur.");
    }

    cachedCurriculum = data.data as Level[];
    cacheTimestamp = now;
    return cachedCurriculum;
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
 * @param supabase The Supabase client.
 * @returns A Map of exerciseId to Exercise object.
 */
export async function getAllExercisesMap(supabase: SupabaseClient): Promise<Map<string, Exercise>> {
    const levels = await getCachedCurriculum(supabase);
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
 * @param supabase The Supabase client.
 * @param exerciseId The ID of the exercise to retrieve.
 * @returns The Exercise object or undefined if not found.
 */
export async function getExerciseById(supabase: SupabaseClient, exerciseId: string): Promise<Exercise | undefined> {
    const curriculum = await getCachedCurriculum(supabase);
    return findExerciseInCurriculum(curriculum, exerciseId);
}