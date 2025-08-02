import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter.js';
import { getExerciseById } from "./_lib/data-access.js";
import { validateMathResponse } from "./_lib/math-validator.js";
import { cleanLatex } from "../src/utils/math-format.js";

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
             const error: any = new Error(`Vous avez atteint votre limite de ${limit} validations de réponse par jour.`);
             error.status = 429;
             throw error;
        }
        
        // --- Main Logic ---
        let { studentAnswer, exerciseId } = req.body;
        if (!studentAnswer || !exerciseId) {
            return res.status(400).json({ error: "Les champs 'studentAnswer' et 'exerciseId' sont requis." });
        }

        // Clean the student's answer to ensure it uses standard LaTeX delimiters
        studentAnswer = cleanLatex(studentAnswer);
        
        // --- Fetch Exercise using the new optimized method ---
        const exercise = await getExerciseById(exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: "Exercice non trouvé." });
        }

        // Truncate the correction context to avoid overly long prompts
        const correctionContext = exercise.fullCorrection || exercise.correctionSnippet;
        const truncatedCorrection = correctionContext.length > 2500 ? (correctionContext.substring(0, 2500) + "\n...") : correctionContext;

        const prompt = `
            CONTEXTE: Tu es un assistant IA correcteur de mathématiques pour des lycéens marocains. Tu dois être rigoureux, encourageant et très clair.

            MISSION: Évaluer la réponse d'un élève à un exercice de mathématiques et fournir un feedback structuré en JSON.

            INSTRUCTIONS DÉTAILLÉES:
            1.  **Analyse Comparative**: Compare la "RÉPONSE DE L'ÉLÈVE" avec la "CORRECTION DE RÉFÉRENCE" et "l'ÉNONCÉ".
            2.  **Décomposition Logique**: Sépare la réponse de l'élève en parties distinctes et logiques (ex: "Question 1a", "Calcul de la dérivée", "Étude du signe", etc.).
            3.  **Évaluation par Partie**: Pour chaque partie, détermine si elle est 'correct', 'incorrect', ou 'partial'.
                -   'correct': L'élève a entièrement raison.
                -   'incorrect': L'élève a commis une erreur majeure de raisonnement ou de calcul.
                -   'partial': L'élève a la bonne idée mais a fait une petite erreur, ou sa réponse est incomplète.
            4.  **Feedback Constructif**: Pour chaque partie, rédige une "explanation" claire qui valide la bonne réponse, explique l'erreur, ou suggère une amélioration.
            5.  **Synthèse Globale**: Rédige un "summary" global qui résume la performance de l'élève.
            6.  **Statut Final**: Détermine "is_globally_correct". Mets "true" SEULEMENT si toutes les parties sont évaluées comme 'correct'. Sinon, mets "false".

            RÈGLES DE FORMATAGE JSON (ABSOLUMENT OBLIGATOIRES):
            -   **SORTIE EXCLUSIVE**: Ta réponse DOIT être UNIQUEMENT un objet JSON valide, sans AUCUN texte, commentaire ou formatage Markdown en dehors de l'objet JSON lui-même.
            -   **CHAMP 'evaluation'**: La valeur de ce champ doit OBLIGATOIREMENT être l'une des trois chaînes suivantes : "correct", "incorrect", "partial".
            -   **CHAMPS 'explanation' et 'summary'**:
                -   Utilise le Markdown pour la structure (listes à puces *, titres ###).
                -   **Formatage Mathématique Hybride**:
                    -   **Unicode (par défaut)**: Utilise les caractères Unicode pour le simple : \`ƒ(𝑥) = 𝑥² − 4𝑥 + 1\`, \`∀𝑥 ∈ ℝ\`.
                    -   **LaTeX (pour le complexe)**: Utilise \`$..$\` ou \`$$..$$\` SEULEMENT pour les fractions, racines, intégrales, etc.
                    -   **INTERDICTION**: Ne JAMAIS utiliser \`\\(\` ou \`\\[\`.

            ---
            ÉNONCÉ DE L'EXERCICE:
            ${exercise.statement}
            ---
            CORRECTION DE RÉFÉRENCE (pour guider ton jugement):
            ${truncatedCorrection}
            ---
            RÉPONSE DE L'ÉLÈVE À ÉVALUER:
            ${studentAnswer}
            ---
            GÉNÈRE MAINTENANT L'OBJET JSON D'ÉVALUATION STRUCTURÉ.
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
                responseSchema: answerSchema
            }
        });
        
        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("L'IA a retourné une réponse vide. Le modèle est peut-être surchargé, veuillez réessayer.");
        }
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse JSON from AI in check-answer. Raw response:", jsonText);
            throw new Error("La réponse de l'IA était mal formatée. Veuillez réessayer.");
        }
        
        // Appliquer le nettoyage et la validation à toute la réponse JSON
        const finalResponse = validateMathResponse(parsedJson);

        // Log successful AI call
        await logAiCall(supabase, user.id, 'ANSWER_VALIDATION');
        
        return res.status(200).json(finalResponse);

    } catch (error: any) {
        console.error("Error in check-answer:", error);
        const status = error.status || 500;
        const message = error.message || "Une erreur interne est survenue.";
        return res.status(status).json({ error: message });
    }
}