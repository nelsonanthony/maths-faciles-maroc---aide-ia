import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import aiUsageLimiter from './_lib/ai-usage-limiter.js';
import { cleanLatex } from "./_lib/math-validator.js";

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

    const missingVars = [];
    if (!apiKey) missingVars.push('GEMINI_API_KEY');
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');

    if (missingVars.length > 0) {
        const errorMsg = `Configuration du serveur incomplète. Variables d'environnement manquantes: ${missingVars.join(', ')}`;
        return res.status(500).json({ error: errorMsg });
    }

    try {
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

        const { limitExceeded, limit } = await aiUsageLimiter.checkUsageLimit(supabase, user.id, 'SOCRATIC_VALIDATION');
        if (limitExceeded) {
            const error: any = new Error(`Vous avez atteint votre limite de ${limit} vérifications par jour.`);
            error.status = 429;
            throw error;
        }
        
        let { studentAnswer, currentIaQuestion, expectedAnswerKeywords, exerciseStatement, exerciseCorrection } = req.body as { 
            studentAnswer?: string, 
            currentIaQuestion?: string, 
            expectedAnswerKeywords?: string[],
            exerciseStatement?: string,
            exerciseCorrection?: string 
        };
        
        if (studentAnswer === undefined) {
             return res.status(400).json({ error: "Le champ 'studentAnswer' est requis (peut être vide)." });
        }
        if (!currentIaQuestion || !Array.isArray(expectedAnswerKeywords) || !exerciseStatement || !exerciseCorrection) {
            return res.status(400).json({ error: "Les champs 'currentIaQuestion', 'expectedAnswerKeywords', 'exerciseStatement', et 'exerciseCorrection' sont requis." });
        }

        // Clean student answer to ensure consistent LaTeX format
        studentAnswer = cleanLatex(studentAnswer);
        
        const ai = new GoogleGenAI({ apiKey: apiKey! });
        
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
# CONTEXTE GLOBAL
Tu es un tuteur de mathématiques évaluant une étape de la résolution d'un exercice par un élève.

## ÉNONCÉ DE L'EXERCICE
${exerciseStatement}

## CORRECTION DE RÉFÉRENCE (pour ton information)
${exerciseCorrection}

# MISSION
Évalue la réponse de l'élève à la question spécifique qui lui a été posée.

## QUESTION POSÉE À L'ÉLÈVE
"${currentIaQuestion}"

## CONCEPTS CLÉS ATTENDUS DANS LA RÉPONSE
"${expectedAnswerKeywords.join(', ')}"

## RÉPONSE FOURNIE PAR L'ÉLÈVE
"${studentAnswer}"

# ANALYSE ET DÉCISION
La réponse de l'élève est-elle conceptuellement correcte par rapport à la question posée ? Ne te fie pas uniquement aux mots-clés. Analyse le sens mathématique. La formulation peut être imparfaite ou venir d'une photo. Sois flexible. Si la réponse est vide ou hors-sujet, elle est incorrecte.

# FORMAT DE SORTIE
Réponds UNIQUEMENT avec un objet JSON valide : \`{ "is_correct": boolean }\`.
`;
        
        const requestPayload = {
            model: 'gemini-2.5-flash',
            contents: promptText,
            config: { 
                responseMimeType: "application/json", 
                responseSchema: answerSchema,
                thinkingConfig: { thinkingBudget: 0 } // Optimization for low latency
            }
        };
        

        const response = await ai.models.generateContent(requestPayload);
        
        const jsonText = response.text;
        if (!jsonText) {
            throw new Error("L'IA a retourné une réponse vide. Veuillez réessayer.");
        }
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonText.trim());
        } catch (e) {
            console.error("Failed to parse JSON from AI in validate-socratic-answer. Raw response:", jsonText);
            throw new Error("La réponse de l'IA était mal formatée. Veuillez réessayer.");
        }
        
        await aiUsageLimiter.logAiCall(supabase, user.id, 'SOCRATIC_VALIDATION');
        
        return res.status(200).json(parsedJson);

    } catch (error: any) {
        console.error("Error in validate-socratic-answer:", error);
        const status = error.status || 500;
        const message = error.message || "Une erreur interne est survenue.";
        return res.status(status).json({ error: message });
    }
}