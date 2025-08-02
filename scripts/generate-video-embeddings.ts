// To run this script:
// 1. Make sure you have a .env file with API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY
// 2. Run `npm install`
// 3. Run `npx ts-node scripts/generate-video-embeddings.ts`
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { YoutubeTranscript } from 'youtube-transcript';
import curriculumData from '../public/data.json';
import { Level } from '../src/types';

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

// --- Helper Function to Chunk Transcript ---
interface TranscriptChunk {
    text: string;
    startTime: number;
}

function chunkTranscript(transcript: { text: string; offset: number; duration: number }[]): TranscriptChunk[] {
    const chunks: TranscriptChunk[] = [];
    let currentChunk = "";
    let startTime = 0;
    const MIN_CHUNK_LENGTH = 150; // Aim for chunks of at least this many characters

    for (let i = 0; i < transcript.length; i++) {
        const item = transcript[i];
        if (currentChunk.length === 0) {
            startTime = Math.floor(item.offset / 1000);
        }
        currentChunk += item.text + " ";

        if (currentChunk.length >= MIN_CHUNK_LENGTH || i === transcript.length - 1) {
            chunks.push({
                text: currentChunk.trim(),
                startTime: startTime,
            });
            currentChunk = "";
        }
    }
    return chunks;
}


async function generateAndStoreEmbeddings() {
    console.log("🚀 Starting video transcript embedding generation...");

    const allChaptersWithVideos = (curriculumData.levels as Level[]).flatMap(level =>
        level.chapters.filter(chapter => chapter.videoLinks && chapter.videoLinks.length > 0)
    );

    console.log(`Found ${allChaptersWithVideos.length} chapters with videos to process.`);
    
    // Clear all existing video chunks before starting to ensure a clean slate
    console.log("🔥 Clearing all existing video chunks from the database...");
    const { error: deleteAllError } = await supabase.from('video_transcript_chunks').delete().gt('id', 0); // Hack to delete all rows
    if(deleteAllError) {
        console.error("🚨 CRITICAL: Could not clear old video chunks. Aborting.", deleteAllError.message);
        return;
    }
    console.log("✅ Database cleared.");


    for (const chapter of allChaptersWithVideos) {
        if (!chapter.videoLinks) continue;
        
        console.log(`\n🎬 Processing chapter '${chapter.title}'...`);
        
        for (const videoLink of chapter.videoLinks) {
            try {
                console.log(`   - Processing video '${videoLink.title}' (ID: ${videoLink.id})`);

                // 1. Fetch transcript
                const transcript = await YoutubeTranscript.fetchTranscript(videoLink.id);
                if (!transcript || transcript.length === 0) {
                    console.warn(`   ⚠️ No transcript found for video ${videoLink.id}. Skipping.`);
                    continue;
                }

                // 2. Chunk transcript
                const chunks = chunkTranscript(transcript);
                console.log(`   - Transcript split into ${chunks.length} chunks.`);
                
                // 3. Generate embeddings and prepare for bulk insert
                const rowsToInsert = [];
                for (const chunk of chunks) {
                    console.log(`      - Generating embedding for chunk starting at ${chunk.startTime}s...`);
                    
                    const result = await ai.models.embedContent({
                        model: embeddingModelName,
                        contents: chunk.text
                    });
                    
                    if (result.embeddings && result.embeddings.length > 0) {
                        const embedding = result.embeddings[0].values;

                        rowsToInsert.push({
                            chapter_id: chapter.id,
                            video_id: videoLink.id, // Include the specific video ID
                            chunk_text: chunk.text,
                            start_time_seconds: chunk.startTime,
                            embedding: embedding,
                        });
                    } else {
                        console.warn(`      ⚠️ No embedding generated for chunk at ${chunk.startTime}s. Skipping.`);
                    }

                    
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
                
                // 4. Bulk insert chunks for this video
                if (rowsToInsert.length > 0) {
                    const { error: insertError } = await supabase
                        .from('video_transcript_chunks')
                        .insert(rowsToInsert as any);

                    if (insertError) {
                        console.error(`      ❌ Error bulk saving chunks for video ${videoLink.id}:`, insertError.message);
                    } else {
                        console.log(`      ✅ Successfully saved ${rowsToInsert.length} chunks for video '${videoLink.title}'.`);
                    }
                }

            } catch (e: any) {
                console.error(`🚨 Failed to process video '${videoLink.title}' (ID: ${videoLink.id}):`, e.message || e);
            }
        }
    }

    console.log("\n✅ Video embedding generation finished!");
}

generateAndStoreEmbeddings().catch(console.error);