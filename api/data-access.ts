import { Level, Exercise } from '../src/types.js';
import fs from 'fs/promises';
import path from 'path';

// Simple in-memory cache for the serverless function instance.
let cachedCurriculum: Level[] | null = null;

/**
 * Fetches the curriculum from the local data.json file, using an in-memory cache.
 * This is much faster than fetching from the database on every call.
 */
async function getCurriculumFromFile(): Promise<Level[]> {
    if (cachedCurriculum) {
        return cachedCurriculum;
    }

    // On Vercel, process.cwd() is the root of the deployment.
    // The `public` directory is available at the root.
    const filePath = path.join((process as any).cwd(), 'public', 'data.json');
    
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        
        if (!data?.levels || !Array.isArray(data.levels)) {
            console.error("Local data.json is malformed or 'levels' array is missing.");
            throw new Error("Local data.json is malformed.");
        }

        cachedCurriculum = data.levels as Level[];
        return cachedCurriculum;
    } catch (error) {
        console.error("Critical Error: Could not read or parse local data.json from path:", filePath, error);
        // Fallback or throw an error
        throw new Error("Impossible de charger le contenu pédagogique depuis le serveur.");
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
export async function getAllExercisesMap(): Promise<Map<string, Exercise>> {
    const levels = await getCurriculumFromFile();
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
export async function getExerciseById(exerciseId: string): Promise<Exercise | undefined> {
    const curriculum = await getCurriculumFromFile();
    return findExerciseInCurriculum(curriculum, exerciseId);
}
