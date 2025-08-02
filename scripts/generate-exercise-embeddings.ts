// To run this script:
// 1. Make sure you have a .env file with API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY
// 2. Run `npm install`
// 3. Run `npx ts-node scripts/generate-exercise-embeddings.ts`
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import curriculumData from '../public/data.json';
import { Level } from '../src/types.js';

// --- Load Environment Variables ---
const API_KEY = process.env.API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing environment variables. Make sure API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY are set in your .env file.");
}

// --- Initialize Clients ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
const ai = new GoogleGenAI({ apiKey: API_KEY });
const embeddingModelName = 'text-embedding-004';

async function generateAndStoreEmbeddings() {
    console.log("🚀 Starting exercise embedding generation...");

    const allExercises = (curriculumData.levels as Level[]).flatMap(level =>
        level.chapters.flatMap(chapter =>
            chapter.series.flatMap(series =>
                series.exercises.map(exercise => ({
                    id: exercise.id,
                    content: exercise.statement
                }))
            )
        )
    );

    console.log(`Found ${allExercises.length} exercises to process.`);

    for (const exercise of allExercises) {
        try {
            console.log(`   - Processing exercise ID: ${exercise.id}`);

            // 1. Generate embedding
            const result = await ai.models.embedContent({
                model: embeddingModelName,
                contents: exercise.content
            });
            
            if (result.embeddings && result.embeddings.length > 0) {
                const embedding = result.embeddings[0].values;

                // 2. Upsert into Supabase
                // Use 'upsert' to avoid duplicates. It will update if the exercise_id already exists.
                const { error } = await supabase
                    .from('exercise_embeddings')
                    .upsert({
                        exercise_id: exercise.id,
                        content: exercise.content,
                        embedding: embedding,
                    } as any);

                if (error) {
                    console.error(`❌ Error saving embedding for ID ${exercise.id}:`, error.message);
                } else {
                    console.log(`   ✅ Successfully saved embedding for ID ${exercise.id}`);
                }
            } else {
                console.warn(`   ⚠️ No embedding generated for exercise ID: ${exercise.id}. Skipping.`);
            }


            // Simple rate limiting to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 250));

        } catch (e) {
            console.error(`🚨 Failed to generate embedding for exercise ${exercise.id}:`, e);
        }
    }

    console.log("✅ Embedding generation finished!");
}

generateAndStoreEmbeddings().catch(console.error);