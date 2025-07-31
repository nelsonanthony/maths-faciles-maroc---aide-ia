
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter.js';
import { getExerciseById } from "./_lib/data-access.js";

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
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: "La configuration du serveur est incomplète." });
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
        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'ANSWER_VALIDATION');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} validations de réponse par jour.` });
        }
        
        // --- Main Logic ---
        const { studentAnswer, exerciseId } = req.body;
        if (!studentAnswer || !exerciseId) {
            return res.status(400).json({ error: "Les champs 'studentAnswer' et 'exerciseId' sont requis." });
        }
        
        // --- Fetch Exercise using the new optimized method ---
        const exercise = await getExerciseById(exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: "Exercice non trouvé." });
        }

        // Truncate the correction context to avoid overly long prompts
        const correctionContext = exercise.fullCorrection || exercise.correctionSnippet;
        const truncatedCorrection = correctionContext.length > 2500 ? (correctionContext.substring(0, 2500) + "\n...") : correctionContext;

        const prompt = `
            CONTEXTE: Tu es un correcteur de mathématiques pour des lycéens. Sois précis et bienveillant.
            MISSION: Évalue la réponse d'un élève en te basant sur l'énoncé et la correction de référence.
            1.  Décompose la réponse de l'élève en parties logiques (par question, ou par étape de calcul).
            2.  Pour chaque partie, crée un objet de feedback.
            3.  Rédige un bilan global (summary) court et clair.
            4.  Définis 'is_globally_correct' à true seulement si toutes les parties sont 'correct'.

            RÈGLES DE FORMATAGE STRICTES:
            -   Réponds UNIQUEMENT avec un objet JSON valide qui correspond au schéma demandé. Ne produit aucun texte en dehors de l'objet JSON.
            -   Dans les champs 'summary' et 'explanation', toutes les expressions mathématiques DOIVENT être en LaTeX standard.
                -   **Équations en bloc**: Utilise $$...$$. Exemple : "$$f'(x) = 2x - 4$$"
                -   **Formules en ligne**: Utilise $...$. Exemple : "La solution est $x=2$."
                -   **INTERDICTION D'UTILISER** les délimiteurs MathJax (\\(...\\) ou \\[...\\]).

            ---
            ÉNONCÉ DE L'EXERCICE:
            ${exercise.statement}
            ---
            CORRECTION (sert de référence pour la validité):
            ${truncatedCorrection}
            ---
            RÉPONSE DE L'ÉLÈVE:
            ${studentAnswer}
            ---
            MAINTENANT, FOURNIS L'ÉVALUATION DÉCOMPOSÉE EN JSON:
        `;
        
        const answerSchema = {
            type: Type.OBJECT,
            properties: {
                is_globally_correct: {
                    type: Type.BOOLEAN,
                    description: "True si la réponse globale de l'élève est majoritairement correcte."
                },
                summary: {
                    type: Type.STRING,
                    description: "Un court bilan général de la réponse de l'élève."
                },
                detailed_feedback: {
                    type: Type.ARRAY,
                    description: "Une liste de feedbacks détaillés pour chaque partie de la réponse.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            part_title: {
                                type: Type.STRING,
                                description: "Le titre de la partie évaluée (ex: 'Question 1a', 'Factorisation')."
                            },
                            evaluation: {
                                type: Type.STRING,
                                description: "L'évaluation de cette partie. Doit être une de ces valeurs : 'correct', 'incorrect', 'partial'."
                            },
                            explanation: {
                                type: Type.STRING,
                                description: "L'explication détaillée pour cette partie, en Markdown et LaTeX."
                            }
                        },
                        required: ["part_title", "evaluation", "explanation"]
                    }
                }
            },
            required: ["is_globally_correct", "summary", "detailed_feedback"]
        };


        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: answerSchema,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        
        // Log successful AI call
        await logAiCall(supabase, user.id, 'ANSWER_VALIDATION');
        
        const jsonText = response.text;
        if (jsonText === undefined) {
            throw new Error("La réponse de l'IA est vide ou invalide.");
        }
        const parsedJson = JSON.parse(jsonText);
        return res.status(200).json(parsedJson);

    } catch (error: any) {
        console.error("Error in check-answer:", error);
        let message = "Une erreur serveur est survenue lors du traitement de la réponse.";
        if (error.message?.includes("JSON")) {
            message = "Erreur du serveur : La réponse de l'IA n'était pas dans le format JSON attendu.";
        } else if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}
