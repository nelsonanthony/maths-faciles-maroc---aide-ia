

import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIResponse, VideoChunk } from "../src/types.js";
import aiUsageLimiter from "./_lib/ai-usage-limiter.js";
import { cleanLatex, validateMathResponse } from "./_lib/math-validator.js";

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

    const missingVars = [];
    if (!apiKey) missingVars.push('GEMINI_API_KEY');
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');

    if (missingVars.length > 0) {
        const errorMsg = `Configuration du serveur incomplète. Variables d'environnement manquantes: ${missingVars.join(', ')}`;
        return res.status(500).json({ error: errorMsg });
    }

    try {
        // --- User Authentication & Rate Limiting ---
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'L\'authentification est requise.' });
        }
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Jeton d\'authentification invalide ou expiré.' });
        }

        const { limitExceeded, limit } = await aiUsageLimiter.checkUsageLimit(supabase, user.id, 'EXPLANATION');
        if (limitExceeded) {
             const error: any = new Error(`Vous avez atteint votre limite de ${limit} demandes d'explication par jour.`);
             error.status = 429;
             throw error;
        }
        
        // --- Body Validation ---
        const { prompt: rawPrompt, chapterId, requestType } = req.body as { prompt?: string, chapterId?: string, requestType?: 'socratic' | 'direct' };

        if (!rawPrompt || typeof rawPrompt !== 'string' || !chapterId || typeof chapterId !== 'string' || !requestType) {
            return res.status(400).json({ error: "Les champs 'prompt', 'chapterId', et 'requestType' sont requis et doivent être valides." });
        }

        // Clean prompt and ensure it has a definite string type
        const prompt: string = cleanLatex(rawPrompt);
        
        const ai = new GoogleGenAI({ apiKey: apiKey! });
        const finalResponse: AIResponse = {};

        // --- Find relevant video chunk function (to be run in parallel) ---
        const findRelevantVideoChunk = async (promptForSearch: string): Promise<VideoChunk | undefined> => {
            const questionMatch = promptForSearch.match(/---DEMANDE ÉLÈVE---\s*([\s\S]*)/);
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
# CONTEXTE
Tu es un tuteur de mathématiques expert et bienveillant. Tu t'adresses à des lycéens marocains pour qui le français est une deuxième langue. Ton langage doit être très simple, clair et encourageant.

# MISSION
Analyse la "DEMANDE ÉLÈVE" dans le prompt. Réponds UNIQUEMENT avec un objet JSON valide qui correspond au schéma demandé, en fonction du \`requestType\`.

# RÈGLES DE FORMATAGE (Valables pour TOUTES les réponses)
-   **JSON UNIQUEMENT**: Ta sortie doit être un objet JSON valide, sans aucun texte avant ou après.
-   **FORMATAGE MATHÉMATIQUE HYBRIDE**:
    -   Utilise des caractères **Unicode** pour les symboles simples (ex: \`ƒ(𝑥) = 𝑥² − 4𝑥 + 1\`).
    -   Utilise **LaTeX** (\`$..$\` ou \`$$..$$\`) SEULEMENT pour les structures complexes (fractions, racines, etc.).
    -   **INTERDICTION**: N'utilise JAMAIS \`\\( ... \\)\` ou \`\\[ ... \\]\`.

# INSTRUCTIONS SPÉCIFIQUES PAR \`requestType\`

## Si \`requestType\` est "direct"
-   Fournis une explication directe et complète de la demande de l'élève.
-   Structure la réponse avec du Markdown (### Titres, * listes).

## Si \`requestType\` est "socratic"
-   Crée un parcours pédagogique complet (\`path\`) pour résoudre l'exercice, étape par étape.
-   Compare le travail de l'élève (dans "DEMANDE ÉLÈVE") avec ton parcours pour déterminer le \`starting_step_index\`. C'est l'index de la PREMIÈRE étape que l'élève n'a pas encore (correctement) complétée.
    -   Si l'élève n'a rien commencé, \`starting_step_index\` est 0.
    -   Si l'élève a tout résolu, \`starting_step_index\` est égal à la longueur du \`path\`.
-   **EXEMPLE DE STRUCTURE POUR LE PATH SOCRATIQUE**:
    \`\`\`json
    {
        "is_on_topic": true,
        "starting_step_index": 0,
        "path": [
            {
                "ia_question": "Très bien ! Pour commencer, quelle est la toute première chose à faire pour étudier les variations d'une fonction comme ƒ(𝑥) = 𝑥³ − 3𝑥 + 2 ?",
                "student_response_prompt": "Quelle est la première étape ?",
                "expected_answer_keywords": ["dérivée", "calculer f'(x)", "dériver"],
                "positive_feedback": "Exactement ! Il faut calculer la dérivée ƒ'(𝑥). Faisons ça.",
                "hint_for_wrong_answer": "Pas tout à fait. Pense à l'outil mathématique qui nous donne la pente de la fonction en tout point. Comment s'appelle-t-il ?"
            },
            {
                "ia_question": "Parfait. Maintenant, calcule la dérivée de ƒ(𝑥) = 𝑥³ − 3𝑥 + 2. Quelle est l'expression de ƒ'(𝑥) ?",
                "student_response_prompt": "ƒ'(𝑥) = ...",
                "expected_answer_keywords": ["3x^2 - 3", "3x²-3"],
                "positive_feedback": "C'est la bonne dérivée ! Excellent.",
                "hint_for_wrong_answer": "Presque ! N'oublie pas la formule de dérivation pour $x^n$ qui est $nx^{n-1}$. Applique-la à chaque terme."
            },
            {
                "ia_question": "Maintenant que nous avons ƒ'(𝑥) = 3𝑥² - 3, que doit-on faire pour trouver les points où la variation change ?",
                "student_response_prompt": "Que faire avec ƒ'(𝑥) ?",
                "expected_answer_keywords": ["résoudre f'(x)=0", "trouver les racines", "annuler la dérivée", "signe"],
                "positive_feedback": "Oui, il faut étudier le signe de la dérivée, et pour ça, on commence par chercher quand elle s'annule. Résous l'équation ƒ'(𝑥) = 0.",
                "hint_for_wrong_answer": "On cherche les points 'plats' de la courbe. Que vaut la dérivée à ces endroits ? Que doit-on résoudre ?"
            }
        ]
    }
    \`\`\`
`;

        // --- Main AI Generation Logic ---
        const generateResponse = async (promptForAI: string) => {
            let responseSchema;
            
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
                contents: promptForAI,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema
                }
            });

            const jsonText = response.text;
            if (!jsonText) {
                throw new Error("L'IA a retourné une réponse vide. Veuillez réessayer.");
            }
            
            let parsedJson;
            try {
                parsedJson = JSON.parse(jsonText.trim());
            } catch (e) {
                console.error("Failed to parse JSON from AI in explain. Raw response:", jsonText);
                throw new Error("La réponse de l'IA était mal formatée. Veuillez réessayer.");
            }
            
            if (parsedJson.is_on_topic === false) {
                 const error: any = new Error("Je ne peux répondre qu'à des questions concernant cet exercice de mathématiques.");
                 error.status = 403; // Forbidden
                 throw error;
            }

            // Nettoyage et validation de la réponse JSON avant de la traiter.
            const cleanedJson = validateMathResponse(parsedJson);

            if(requestType === 'socratic') {
                finalResponse.socraticPath = cleanedJson.path;
                finalResponse.startingStepIndex = cleanedJson.starting_step_index;
            } else {
                finalResponse.explanation = cleanedJson.explanation;
            }
        };

        // --- Run tasks in parallel ---
        const [_, videoChunkResult] = await Promise.all([
            generateResponse(prompt),
            findRelevantVideoChunk(prompt)
        ]);

        if (videoChunkResult) {
            finalResponse.videoChunk = videoChunkResult;
        }

        // Log successful AI call
        await aiUsageLimiter.logAiCall(supabase, user.id, 'EXPLANATION');

        return res.status(200).json(finalResponse);

    } catch (e: any) {
        console.error("Critical error in 'explain' function:", e);
        const status = e.status || 500;
        const message = e.message || "Une erreur interne est survenue.";
        return res.status(status).json({ error: message });
    }
}