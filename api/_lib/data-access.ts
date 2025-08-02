
import { Level, Exercise } from '../../src/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define a type alias to help TypeScript's compiler with potentially deep types.
type Curriculum = Level[];

// Simple in-memory cache for the serverless function instance.
let cachedCurriculum: Curriculum | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 1 * 60 * 1000; // 1 minute cache

function getSupabaseAdminClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Configuration du serveur incomplète: SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis.");
    }
    return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Manually invalidates the server-side cache.
 */
function invalidateCache() {
    cachedCurriculum = null;
    cacheTimestamp = null;
    console.log("Curriculum cache invalidated.");
}

/**
 * Fetches the curriculum from Supabase, using an in-memory cache.
 */
async function getCurriculumFromSupabase(): Promise<Curriculum> {
    const now = Date.now();
    if (cachedCurriculum && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION_MS)) {
        return cachedCurriculum;
    }

    try {
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase
            .from('curriculum')
            .select('data')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116: "single row not found"
            console.error("Error fetching curriculum from Supabase:", error);
            throw error;
        }
        
        const curriculumData = data?.data;
        if (!curriculumData || !Array.isArray(curriculumData)) {
            cachedCurriculum = [];
        } else {
            cachedCurriculum = curriculumData as Curriculum;
        }
        
        cacheTimestamp = now;
        return cachedCurriculum;
    } catch (error) {
        console.error("Critical Error: Could not fetch curriculum from Supabase.", error);
        throw new Error("Could not load curriculum from the server.");
    }
}

/**
 * Finds a specific exercise within the curriculum structure.
 */
function findExerciseInCurriculum(levels: Curriculum, exerciseId: string): Exercise | undefined {
    for (const level of levels) {
        for (const chapter of level.chapters ?? []) {
            for (const series of chapter.series ?? []) {
                for (const exercise of series.exercises ?? []) {
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
 * Fetches all exercises and returns them in a Map for quick lookups.
 */
const getAllExercisesMap = async (): Promise<Map<string, Exercise>> => {
    const levels = await getCurriculumFromSupabase();
    const allExercisesMap = new Map<string, Exercise>();
    for (const level of levels) {
        for (const chapter of level.chapters ?? []) {
            for (const series of chapter.series ?? []) {
                for (const exercise of series.exercises ?? []) {
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
 * Retrieves a single exercise by its ID.
 */
const getExerciseById = async (exerciseId: string): Promise<Exercise | undefined> => {
    const curriculum = await getCurriculumFromSupabase();
    return findExerciseInCurriculum(curriculum, exerciseId);
}

export default {
    getCurriculumFromSupabase,
    getExerciseById,
    getAllExercisesMap,
    invalidateCache
};