
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIResponse, VideoChunk } from "../src/types.js";
import { checkUsageLimit, logAiCall } from "./ai-usage-limiter.js";

// Cette fonction s'exécute sur les serveurs de Vercel (environnement Node.js)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
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
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Use Service Key for auth checks

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: "La configuration du serveur est incomplète. Veuillez vérifier les variables d'environnement." });
    }

    try {
        // --- User Authentication ---
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

        // --- Rate Limiting ---
        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'EXPLANATION');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} demandes d'explication par jour.` });
        }
        
        // --- Main Logic ---
        const { prompt, chapterId } = req.body as { prompt?: string, chapterId?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
            return res.status(400).json({ error: "Le 'prompt' est manquant, vide ou invalide." });
        }
        if (!chapterId || typeof chapterId !== 'string') {
            return res.status(400).json({ error: "Le 'chapterId' est manquant ou invalide." });
        }

        const ai = new GoogleGenAI({ apiKey: apiKey });

        // --- 1. Get Text Explanation from Gemini ---
        const explanationResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        const explanationText = explanationResponse.text ?? '';
        
        // --- 2. Find Relevant Video Chunk ---
        let relevantVideoChunk: VideoChunk | undefined = undefined;
        const questionMatch = prompt.match(/QUESTION DE L'ÉLÈVE :\s*([\s\S]*)/);
        const userQuestion = questionMatch ? questionMatch[1].trim() : prompt;
        
        if (userQuestion) {
            const embeddingResult = await ai.models.embedContent({
                model: 'text-embedding-004',
                contents: userQuestion
            });
            
            if (embeddingResult.embeddings && embeddingResult.embeddings.length > 0) {
                const queryEmbedding = embeddingResult.embeddings[0].values;

                const { data: chunkData, error: rpcError } = await (supabase.rpc as any)('match_video_chunk', {
                    query_embedding: queryEmbedding,
                    target_chapter_id: chapterId,
                });

                if (rpcError) {
                    console.error("Error calling Supabase RPC 'match_video_chunk':", rpcError.message);
                } else if (chunkData && Array.isArray(chunkData) && chunkData.length > 0) {
                    relevantVideoChunk = chunkData[0] as VideoChunk;
                }
            }
        }

        // --- Log successful AI call ---
        await logAiCall(supabase, user.id, 'EXPLANATION');
        
        const finalResponse: AIResponse = {
            explanation: explanationText,
            videoChunk: relevantVideoChunk,
        };
        
        return res.status(200).json(finalResponse);

    } catch (error) {
        console.error("Error in 'explain' serverless function:", error);
        const errorMessage = error instanceof Error ? error.message : "Une erreur inconnue est survenue.";
        return res.status(500).json({ error: `Erreur du service IA: ${errorMessage}` });
    }
}
