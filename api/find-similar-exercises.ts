

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Exercise } from "../src/types.js";
import { getAllExercisesMap } from "./_lib/data-access.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Standard CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    // Check for required environment variables for Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error("Server Config Error: Supabase URL or Service Key is missing.");
        return res.status(500).json({ error: "Database connection is not configured on the server." });
    }
    
    // Validate request body
    const { exerciseId, levelId } = req.body as { exerciseId?: string; levelId?: string };

    if (!exerciseId || !levelId) {
        return res.status(400).json({ error: "'exerciseId' and 'levelId' are required." });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Fetch the embedding for the current exercise from our embeddings table
        const { data: currentExerciseData, error: fetchError } = await (supabase
            .from('exercise_embeddings') as any)
            .select('embedding')
            .eq('exercise_id', exerciseId)
            .single();

        if (fetchError || !currentExerciseData?.embedding) {
            console.error(`Could not fetch embedding for exercise ${exerciseId}:`, fetchError?.message);
            // It's a non-critical feature, so we return an empty array instead of an error.
            return res.status(200).json([]);
        }

        const queryEmbedding = currentExerciseData.embedding;

        // 2. Call our database function to find vectors with high cosine similarity
        const { data: similarExercisesData, error: rpcError } = await (supabase.rpc as any)('match_exercises', {
            query_embedding: queryEmbedding as any,
            match_threshold: 0.75, // Similarity threshold (0 to 1). Adjust for best results.
            match_count: 3,        // Max number of similar exercises to return.
            exclude_id: exerciseId // Ensure we don't return the same exercise.
        });

        if (rpcError) {
            console.error(`Error calling Supabase RPC 'match_exercises':`, rpcError.message);
            return res.status(200).json([]);
        }

        if (!similarExercisesData || !Array.isArray(similarExercisesData) || similarExercisesData.length === 0) {
            return res.status(200).json([]);
        }

        // 3. The RPC function returns only IDs. We need to find the full exercise data from the live curriculum.
        const allExercisesMap = await getAllExercisesMap();
        
        // 4. Map the IDs from the RPC result to full Exercise objects.
        const rpcResult: { id: string }[] = similarExercisesData || [];
        const relatedExerciseIds = rpcResult.map((item) => item.id).filter(Boolean);

        const fullRelatedExercises = relatedExerciseIds
            .map(id => allExercisesMap.get(id))
            .filter((ex): ex is Exercise => !!ex); // Filter out any potential misses and type guard

        // 5. Return the full exercise objects to the client.
        return res.status(200).json(fullRelatedExercises);

    } catch (error) {
        console.error("Critical error in 'find-similar-exercises' function:", error);
        return res.status(500).json({ error: "An internal server error occurred." });
    }
}
