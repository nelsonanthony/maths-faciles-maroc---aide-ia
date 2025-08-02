
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter';
import { cleanLatex } from "../src/utils/math-format";

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

        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'SOCRATIC_VALIDATION');
        if (limitExceeded) {
            const error: any = new Error(`Vous avez atteint votre limite de ${limit} vérifications par jour.`);
            error.status = 429;
            throw error;
        }
        
        let { studentAnswer, currentIaQuestion, expectedAnswerKeywords } = req.body as { studentAnswer?: string, currentIaQuestion?: string, expectedAnswerKeywords?: string[] };
        
        if (studentAnswer === undefined) {
             return res.status(400).json({ error: "Le champ 'studentAnswer' est requis (peut être vide)." });
        }
        if (!currentIaQuestion || !Array.isArray(expectedAnswerKeywords)) {
            return res.status(400).json({ error: "Les champs 'currentIaQuestion' et 'expectedAnswerKeywords' sont requis." });
        }

        // Clean student answer to ensure consistent LaTeX format
        studentAnswer = cleanLatex(studentAnswer);
        
        const ai = new GoogleGenAI({ apiKey: apiKey });
        
        const answerSchema = {
            type: Type.OBJECT,
            properties: {
                is_correct: {
                    type: Type.BOOLEAN,
                    description: "True si la réponse de l'élève est conceptuellement correcte, sinon false."
                },
            },
            required: ["is_correct"],
        };

        const promptText = `
            CONTEXTE: Tu es un tuteur de mathématiques qui évalue la réponse d'un élève (qui peut provenir d'une transcription d'image).
            MISSION: Détermine si la réponse de l'élève est correcte. La réponse n'a pas besoin d'être parfaitement formulée, mais elle doit être conceptuellement juste. Sois flexible avec la formulation.
            
            QUESTION POSÉE À L'ÉLÈVE: "${currentIaQuestion}"
            
            CONCEPTS/MOTS-CLÉS ATTENDUS DANS LA RÉPONSE: "${expectedAnswerKeywords.join(', ')}"
            
            RÉPONSE DE L'ÉLÈVE: "${studentAnswer}"

            FORMAT DE SORTIE: Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, avec la structure suivante :
            { "is_correct": boolean }
        `;
        
        const requestPayload = {
            model: 'gemini-2.5-flash',
            contents: promptText,
            config: { 
                responseMimeType: "application/json", 
                responseSchema: answerSchema
            }
        };
        

        const response = await ai.models.generateContent(requestPayload);
        
        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("L'IA a retourné une réponse vide. Veuillez réessayer.");
        }
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse JSON from AI in validate-socratic-answer. Raw response:", jsonText);
            throw new Error("La réponse de l'IA était mal formatée. Veuillez réessayer.");
        }
        
        await logAiCall(supabase, user.id, 'SOCRATIC_VALIDATION');
        
        return res.status(200).json(parsedJson);

    } catch (error: any) {
        console.error("Error in validate-socratic-answer:", error);
        const status = error.status || 500;
        const message = error.message || "Une erreur interne est survenue.";
        return res.status(status).json({ error: message });
    }
}