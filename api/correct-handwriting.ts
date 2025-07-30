
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HandwrittenCorrectionResponse } from "../src/types.js";
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
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: "Server configuration is incomplete." });
    }

    try {
        // --- User Authentication ---
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authentication is required.' });
        }
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }

        // --- Rate Limiting ---
        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'HANDWRITING_CORRECTION');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} corrections de copie par jour.` });
        }
        
        // --- Main Logic ---
        const { ocrText, exerciseId } = req.body;
        if (!ocrText || !exerciseId) {
            return res.status(400).json({ error: "ocrText and exerciseId are required." });
        }
        
        // --- Fetch Exercise using the new optimized method ---
        const exercise = await getExerciseById(exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: "Exercise not found." });
        }

        const correctionSchema = {
            type: Type.OBJECT,
            properties: {
                score: {
                    type: Type.NUMBER,
                    description: "A score from 0 to 100 for the student's answer based on its relevance and correctness for the specific exercise."
                },
                lines: {
                    type: Type.ARRAY,
                    description: "An array of objects, one for each line of the student's answer.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            line: {
                                type: Type.INTEGER,
                                description: "The line number, starting from 1."
                            },
                            student_text: {
                                type: Type.STRING,
                                description: "The original text from the student for this line."
                            },
                            status: {
                                type: Type.STRING,
                                enum: ["correct", "error"],
                                description: "The status of the line: 'correct' if it's a valid and relevant step, 'error' if it's mathematically wrong, irrelevant, or an unnecessary step."
                            },
                            explanation: {
                                type: Type.STRING,
                                description: "A brief explanation if the status is 'error'."
                            }
                        },
                        required: ["line", "student_text", "status"]
                    }
                },
                global_feedback: {
                    type: Type.STRING,
                    description: "A global, encouraging feedback summary for the student about their work on this specific exercise."
                }
            },
            required: ["score", "lines", "global_feedback"]
        };

        const correctionContext = exercise.fullCorrection || exercise.correctionSnippet;

        const prompt = `
            CONTEXTE : Tu es un professeur de mathématiques expert et rigoureux qui corrige la copie d'un élève pour un exercice bien précis.

            MISSION : Évalue la réponse manuscrite de l'élève. Ton analyse doit être STRICTEMENT basée sur sa pertinence par rapport à l'exercice fourni.

            1.  **Compare** la réponse de l'élève avec l'énoncé et la correction de référence.
            2.  **Identifie** chaque ligne de calcul ou de raisonnement de l'élève.
            3.  **Note** chaque ligne comme "correcte" si elle est une étape valide et pertinente pour résoudre l'exercice, ou "erreur" si elle est mathématiquement fausse, hors-sujet, ou une étape inutile.
            4.  **Calcule** un score global sur 100, qui reflète la proportion de la solution correcte que l'élève a fournie. Si la réponse est complètement hors-sujet, le score doit être 0.
            5.  **Fournis** un commentaire global qui résume les points forts et les points à améliorer.

            FORMAT DE SORTIE OBLIGATOIRE : Réponds UNIQUEMENT avec un objet JSON valide respectant le schéma fourni. Ne fournis aucun texte en dehors de l'objet JSON.

            ---
            ÉNONCÉ DE L'EXERCICE SPÉCIFIQUE:
            ${exercise.statement}
            ---
            CORRECTION DE RÉFÉRENCE:
            ${correctionContext}
            ---
            RÉPONSE MANUSCRITE DE L'ÉLÈVE (transcrite par OCR):
            ${ocrText}
            ---
            MAINTENANT, FOURNIS L'ÉVALUATION STRUCTURÉE EN JSON :
        `;

        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: correctionSchema
            }
        });

        // Log successful AI call
        await logAiCall(supabase, user.id, 'HANDWRITING_CORRECTION');
        
        const jsonText = response.text;
        if (jsonText === undefined) {
            throw new Error("La réponse de l'IA est vide ou invalide.");
        }
        const parsedJson = JSON.parse(jsonText) as HandwrittenCorrectionResponse;
        return res.status(200).json(parsedJson);

    } catch (error: any) {
        console.error("Error in correct-handwriting:", error);
        let message = "An error occurred while communicating with the AI service.";
        if (error.message?.includes("JSON")) {
            message = "The AI returned an invalid response format.";
        } else if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}
