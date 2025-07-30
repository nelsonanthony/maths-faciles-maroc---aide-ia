



import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIResponse, VideoChunk } from "../src/types.js";
import { checkUsageLimit, logAiCall } from "./_lib/ai-usage-limiter.js";

// This function runs on Vercel's servers (Node.js environment)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'access-control-allow-headers',
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
        const { prompt, chapterId, requestType } = req.body as { prompt?: string, chapterId?: string, requestType?: 'socratic' | 'direct' };

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
        
        // --- System instruction ---
        const systemInstruction = "CONTEXTE: Tu es un tuteur de mathématiques expert et bienveillant pour des lycéens marocains. RÈGLE DE FORMATAGE STRICTE: TOUTES les expressions mathématiques DOIVENT être formatées en LaTeX. Utilise \\(...\\) pour les maths en ligne (inline) et $$...$$ pour les blocs d'équations. N'utilise JAMAIS un seul signe dollar ($). Tu dois toujours te conformer au format JSON demandé. Si la question de l'élève est hors-sujet ou inappropriée, tu DOIS le signaler en mettant 'is_on_topic' à false.";

        // --- Main AI Generation Logic ---
        const generateResponse = async () => {
            let responseSchema;
            let finalPrompt = prompt;

            if (requestType === 'socratic') {
                responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        is_on_topic: { type: Type.BOOLEAN, description: "True if the student's question is about the math exercise." },
                        path: {
                            type: Type.ARRAY,
                            description: "The Socratic path to guide the student.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    ia_question: { type: Type.STRING, description: "The guiding question you ask the student." },
                                    student_response_prompt: { type: Type.STRING, description: "A short prompt for the student's input field." },
                                    expected_answer_keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Keywords to check in the student's answer." },
                                    positive_feedback: { type: Type.STRING, description: "Encouraging feedback if the answer is correct." },
                                    hint_for_wrong_answer: { type: Type.STRING, description: "A hint if the student's answer is incorrect." },
                                },
                                required: ["ia_question", "student_response_prompt", "expected_answer_keywords", "positive_feedback", "hint_for_wrong_answer"]
                            }
                        }
                    },
                    required: ["is_on_topic"]
                };
            } else { // 'direct'
                 responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                         is_on_topic: { type: Type.BOOLEAN, description: "True if the student's question is about the math exercise." },
                         explanation: { type: Type.STRING, description: "The direct, full explanation for the student's question." }
                    },
                    required: ["is_on_topic"]
                };
            }
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: finalPrompt,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema
                }
            });

            const parsedJson = JSON.parse(response.text?.trim() ?? '{}');
            
            if (parsedJson.is_on_topic === false) {
                 const error = new Error("Je ne peux répondre qu'à des questions concernant cet exercice de mathématiques.");
                 (error as any).status = 403; // Forbidden
                 throw error;
            }

            if(requestType === 'socratic') {
                finalResponse.socraticPath = parsedJson.path;
            } else {
                finalResponse.explanation = parsedJson.explanation;
            }
        };

        // --- Run tasks in parallel ---
        const [_, videoChunkResult] = await Promise.all([
            generateResponse(),
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
        if (e.status === 403) {
            return res.status(403).json({ error: e.message });
        }
        let message = "An internal server error occurred.";
        if (e.message?.includes("JSON")) {
            message = "The AI returned an invalid response format.";
        }
        return res.status(500).json({ error: message });
    }
}