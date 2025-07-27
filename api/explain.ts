
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIResponse, VideoChunk } from "../src/types.js";
import { checkUsageLimit, logAiCall } from "./ai-usage-limiter.js";
import { getExerciseById } from "./data-access.js";

// This function runs on Vercel's servers (Node.js environment)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'Access-control-allow-headers',
        'authorization, x-csrf-token, x-requested-with, accept, accept-version, content-length, content-md5, content-type, date, x-api-version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const apiKey = process.env.GEMINI_API_KEY; 
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: "La configuration du serveur est incomplète. Veuillez vérifier les variables d'environnement." });
    }

    try {
        // --- User Authentication & Rate Limiting ---
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'L\'authentification est requise.' });
        }
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Jeton d\'authentification invalide ou expiré.' });
        }

        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'EXPLANATION');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} demandes d'explication par jour.` });
        }
        
        // --- Body Validation ---
        const { prompt, chapterId, requestType } = req.body as { prompt?: string, chapterId?: string, requestType?: 'plan' | 'detail' };

        if (!prompt || typeof prompt !== 'string' || !chapterId || typeof chapterId !== 'string' || !requestType) {
            return res.status(400).json({ error: "Les champs 'prompt', 'chapterId', et 'requestType' sont requis et doivent être valides." });
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const finalResponse: AIResponse = {};

        // --- Find relevant video chunk function (to be run in parallel) ---
        const findRelevantVideoChunk = async (): Promise<VideoChunk | undefined> => {
            const questionMatch = prompt.match(/---QUESTION ÉLÈVE---\s*([\s\S]*)/);
            const userQuestion = questionMatch ? questionMatch[1].trim() : '';
            if (!userQuestion) return undefined;

            try {
                const embeddingResult = await ai.models.embedContent({
                    model: 'text-embedding-004',
                    contents: userQuestion
                });
                if (embeddingResult.embeddings && embeddingResult.embeddings.length > 0) {
                    const embedding = embeddingResult.embeddings[0].values;
                    const { data: chunkData } = await supabase.rpc('match_video_chunk', {
                        query_embedding: embedding,
                        target_chapter_id: chapterId
                    });
                    return chunkData as unknown as VideoChunk;
                }
            } catch (e) {
                console.error("Error during video chunk search (non-blocking):", e);
            }
            return undefined;
        };
        
        // --- Generate AI explanation function (to be run in parallel) ---
        const generateExplanation = async () => {
            if (requestType === 'plan') {
                const planSchema = {
                    type: Type.OBJECT,
                    properties: {
                        steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                        key_concepts: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                };
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash', contents: prompt,
                    config: { responseMimeType: "application/json", responseSchema: planSchema }
                });
                finalResponse.plan = JSON.parse(response.text?.trim() ?? '{}');
            } else { // 'detail'
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
                finalResponse.explanation = response.text ?? '';
            }
        };

        // --- Run tasks in parallel ---
        const [_, videoChunkResult] = await Promise.all([
            generateExplanation(),
            findRelevantVideoChunk()
        ]);

        if (videoChunkResult) {
            finalResponse.videoChunk = videoChunkResult;
        }

        // Log successful AI call
        await logAiCall(supabase, user.id, 'EXPLANATION');

        return res.status(200).json(finalResponse);

    } catch (e: any) {
        console.error("Critical error in 'explain' function:", e);
        let message = "An internal server error occurred.";
        if (e.message?.includes("JSON")) {
            message = "The AI returned an invalid response format.";
        }
        return res.status(500).json({ error: message });
    }
}
