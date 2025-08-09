
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIResponse } from "../src/types.js";
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
        
        // --- System instruction ---
        const systemInstruction = `
# CONTEXTE
Tu es un tuteur de mathématiques expert et bienveillant. Tu t'adresses à des lycéens marocains pour qui le français est une deuxième langue. Ton langage doit être très simple, clair et encourageant.

# MISSION
Analyse la "DEMANDE ÉLÈVE" dans le prompt. Réponds UNIQUEMENT avec un objet JSON valide qui correspond au schéma demandé, en fonction du \`requestType\`.

# RÈGLES DE FORMATAGE (Valables pour TOUTES les réponses)
-   **JSON UNIQUEMENT**: Ta sortie doit être un objet JSON valide, sans aucun texte avant ou après.
-   **FORMATAGE MATHÉMATIQUE HYBRIDE (RÈGLE STRICTE)**:
    -   **Priorité à Unicode**: Utilise des caractères Unicode pour TOUT ce qui est simple. Exemples: \`ƒ(𝑥) = 𝑥² − 4𝑥 + 1\`, \`(∀𝑥 ∈ ℝ)\`, \`𝑥 ⟼ 𝑥² − 1\`.
    -   **LaTeX pour le Complexe**: Utilise les délimiteurs \`$..$\` (en ligne) et \`$$..$$\` (en bloc) UNIQUEMENT pour les fractions, racines, sommes, etc. Exemple: \`$$\\frac{x^2 - 1}{x+2}$$ \`.
    -   **INTERDICTION**: N'utilise JAMAIS les délimiteurs MathJax comme \`\\( ... \\)\` ou \`\\[ ... \\]\`.

# INSTRUCTIONS SPÉCIFIQUES PAR \`requestType\`

## Si \`requestType\` est "direct"
-   Fournis une explication directe et complète de la demande de l'élève.
-   Structure la réponse avec du Markdown (### Titres, * listes).

## Si \`requestType\` est "socratic"
-   **PROCESSUS DE RÉFLEXION (Chain of Thought)**:
    1.  **Décomposer l'exercice**: D'abord, j'ignore la demande de l'élève et je lis l'énoncé de l'exercice. Je le décompose mentalement en toutes les petites étapes logiques nécessaires pour le résoudre du début à la fin. C'est la base de mon \`path\`.
    2.  **Analyser la demande élève**: Maintenant, je lis attentivement ce que l'élève a écrit. A-t-il commencé ? A-t-il fait une partie ? A-t-il identifié une erreur spécifique ? Est-il complètement perdu ?
    3.  **Synchroniser**: Je compare la progression de l'élève avec mon \`path\` complet.
        -   S'il dit "je suis bloqué à la question 2", je trouve l'index de la première étape de la question 2 dans mon \`path\`. C'est mon \`starting_step_index\`.
        -   S'il dit "j'ai fait une erreur de signe en développant (x-2)²...", je dois créer une première étape dans mon \`path\` qui accuse réception de son erreur ("Bien vu ! C'est une erreur fréquente. Peux-tu recalculer avec la bonne identité remarquable ?") et l'invite à corriger. Le \`starting_step_index\` sera 0.
        -   S'il n'a rien commencé, \`starting_step_index\` est 0.
        -   S'il montre un travail qui est correct jusqu'à un certain point, je trouve l'étape *suivante* dans mon \`path\`.
    4.  **Construire le JSON**: Je construis l'objet JSON final avec le \`path\` complet et le \`starting_step_index\` que j'ai déterminé.
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

        // --- Run main generation task ---
        await generateResponse(prompt);

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
