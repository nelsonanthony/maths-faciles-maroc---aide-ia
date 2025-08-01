

import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIResponse, VideoChunk } from "../src/types.js";
import { checkUsageLimit, logAiCall } from "./_lib/ai-usage-limiter.js";

const cleanLatex = (text: string): string => {
  if (!text) return '';
  // Replace MathJax delimiters with LaTeX delimiters
  let cleaned = text.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  cleaned = cleaned.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
  return cleaned;
};

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
             const error: any = new Error(`Vous avez atteint votre limite de ${limit} demandes d'explication par jour.`);
             error.status = 429;
             throw error;
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
            const questionMatch = prompt.match(/---DEMANDE ÉLÈVE---\s*([\s\S]*)/);
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
        const systemInstruction = `
            CONTEXTE: Tu es un tuteur de mathématiques expert et bienveillant. Tu t'adresses à des lycéens marocains pour qui le français est une deuxième langue. Ton langage doit être **très simple, clair et encourageant**.

            MISSION: Le prompt de l'utilisateur contient un contexte d'exercice et une demande d'élève.
            1.  Analyse la "DEMANDE ÉLÈVE".
            2.  Si la demande est pour un tutorat socratique (l'élève demande de l'aide pas à pas, ou présente son travail pour vérification):
                a. Crée un parcours pédagogique complet ("path") pour résoudre l'exercice, étape par étape, comme si tu partais de zéro.
                b. Compare le travail de l'élève (dans "DEMANDE ÉLÈVE") avec ton parcours. Détermine l'index de la PREMIÈRE étape que l'élève n'a PAS ENCORE (correctement) complétée. C'est le 'starting_step_index'.
                c. Si l'élève n'a rien commencé (ex: demande juste de l'aide), 'starting_step_index' est 0.
                d. Si l'élève a TOUT résolu, 'starting_step_index' doit être égal à la longueur du 'path'.
            3.  Si la demande est pour une réponse directe, fournis une explication complète.
            4.  Structure toutes tes longues explications avec des titres Markdown (###) et des listes à puces (*) pour une lecture facile.
            5.  Si la question de l'élève est hors-sujet ou inappropriée, signale-le en mettant 'is_on_topic' à false.

            RÈGLES DE FORMATAGE STRICTES:
            -   Réponds UNIQUEMENT avec un objet JSON valide qui correspond au schéma demandé. Ne produit aucun texte en dehors de l'objet JSON.
            -   Dans toutes les chaînes de caractères que tu génères ('ia_question', 'positive_feedback', 'hint_for_wrong_answer', 'explanation'), toutes les expressions mathématiques DOIVENT être en LaTeX standard.
                -   **Équations en bloc**: Utilise $$...$$. Exemple : "$$f'(x) = 2x - 4$$"
                -   **Formules en ligne**: Utilise $...$. Exemple : "La solution est $x=2$."
                -   **INTERDICTION D'UTILISER** les délimiteurs MathJax (\\(...\\) ou \\[...\\]).
        `;

        // --- Main AI Generation Logic ---
        const generateResponse = async () => {
            let responseSchema;
            let finalPrompt = prompt;

            if (requestType === 'socratic') {
                responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        is_on_topic: { type: Type.BOOLEAN, description: "True si la question de l'élève concerne l'exercice de maths." },
                        starting_step_index: {
                            type: Type.INTEGER,
                            description: "Basé sur le travail déjà fourni par l'élève, l'index de la prochaine question à poser. 0 si l'élève n'a rien commencé. Si l'élève a tout fini, renvoyer un nombre égal à la longueur du 'path'."
                        },
                        path: {
                            type: Type.ARRAY,
                            description: "Le parcours socratique pour guider l'élève.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    ia_question: { type: Type.STRING, description: "La question qui guide l'élève. Doit être en français simple." },
                                    student_response_prompt: { type: Type.STRING, description: "Un court message pour la zone de saisie de l'élève (ex: 'Ta réponse...')." },
                                    expected_answer_keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Mots-clés pour vérifier la réponse de l'élève." },
                                    positive_feedback: { type: Type.STRING, description: "Feedback encourageant si la réponse est juste. Doit être en français simple." },
                                    hint_for_wrong_answer: { type: Type.STRING, description: "Indice si la réponse est fausse. Doit être en français simple et ne pas donner la solution." },
                                },
                                required: ["ia_question", "student_response_prompt", "expected_answer_keywords", "positive_feedback", "hint_for_wrong_answer"]
                            }
                        }
                    },
                    required: ["is_on_topic", "starting_step_index", "path"]
                };
            } else { // 'direct'
                 responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                         is_on_topic: { type: Type.BOOLEAN, description: "True si la question de l'élève concerne l'exercice de maths." },
                         explanation: { type: Type.STRING, description: "L'explication directe et complète. Doit être en français simple, structurée avec Markdown (###, *)." }
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
                    responseSchema,
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const jsonText = response.text?.trim();
            if (!jsonText) {
                throw new Error("L'IA a retourné une réponse vide. Veuillez réessayer.");
            }
            
            let parsedJson;
            try {
                parsedJson = JSON.parse(jsonText);
            } catch (e) {
                console.error("Failed to parse JSON from AI in explain. Raw response:", jsonText);
                throw new Error("La réponse de l'IA était mal formatée. Veuillez réessayer.");
            }
            
            if (parsedJson.is_on_topic === false) {
                 const error: any = new Error("Je ne peux répondre qu'à des questions concernant cet exercice de mathématiques.");
                 error.status = 403; // Forbidden
                 throw error;
            }

            if(requestType === 'socratic') {
                 if (parsedJson.path && Array.isArray(parsedJson.path)) {
                    parsedJson.path.forEach((step: any) => {
                        if(step.ia_question) step.ia_question = cleanLatex(step.ia_question);
                        if(step.positive_feedback) step.positive_feedback = cleanLatex(step.positive_feedback);
                        if(step.hint_for_wrong_answer) step.hint_for_wrong_answer = cleanLatex(step.hint_for_wrong_answer);
                    });
                }
                finalResponse.socraticPath = parsedJson.path;
                finalResponse.startingStepIndex = parsedJson.starting_step_index;
            } else {
                 if (parsedJson.explanation) {
                    finalResponse.explanation = cleanLatex(parsedJson.explanation);
                }
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
        const status = e.status || 500;
        const message = e.message || "Une erreur interne est survenue.";
        return res.status(status).json({ error: message });
    }
}