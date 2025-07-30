import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter.js';
import { getExerciseById } from "./_lib/data-access.js";

interface ImagePayload {
    image: string; // base64 encoded
    mimeType: string;
}

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
        
        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'ANSWER_VALIDATION');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} validations de réponse par jour.` });
        }

        // --- Body validation ---
        const { images, exerciseId } = req.body as { images?: ImagePayload[], exerciseId?: string };
        if (!exerciseId || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: "Les champs 'images' (un tableau d'objets image) et 'exerciseId' sont requis." });
        }

        const ai = new GoogleGenAI({ apiKey });

        // --- STEP 1: OCR on all images ---
        let combinedOcrText = "";
        for (const [index, imagePayload] of images.entries()) {
             const ocrImagePart = { inlineData: { data: imagePayload.image, mimeType: imagePayload.mimeType } };
             const ocrTextPart = { text: "Transcris le texte mathématique manuscrit dans l'image. Ne renvoie que le texte." };
            
             const ocrResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [ocrImagePart, ocrTextPart] },
             });
             const ocrText = ocrResponse.text?.trim() ?? '';
             combinedOcrText += `--- PAGE ${index + 1} ---\n${ocrText}\n\n`;
        }
        
        if (!combinedOcrText.trim()) {
            return res.status(400).json({ error: "L'IA n'a pas pu extraire de texte des images fournies. Essayez des photos plus nettes." });
        }

        // --- STEP 2: Validate the combined text ---
        const exercise = await getExerciseById(exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: "Exercice non trouvé." });
        }
        
        const correctionContext = exercise.fullCorrection || exercise.correctionSnippet;
        const truncatedCorrection = correctionContext.length > 2500 ? (correctionContext.substring(0, 2500) + "\n...") : correctionContext;
        
        const checkPrompt = `
            CONTEXTE: Tu es un professeur de mathématiques expert et exigeant qui évalue la réponse d'un élève à un exercice.
            MISSION: Compare la "Réponse de l'élève" à l' "Énoncé de l'exercice" et à la "Correction". Détermine si la réponse de l'élève est substantiellement correcte. Une petite faute de frappe ou une formulation légèrement différente est acceptable, mais le raisonnement mathématique et le résultat final doivent être justes.
            FORMAT DE SORTIE OBLIGATOIRE: Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après. L'objet JSON doit suivre cette structure :
            {
              "is_correct": boolean,
              "feedback": "string (RÈGLE DE FORMATAGE: Utilise LaTeX avec \\(...\\) ou $$...$$. N'utilise jamais de $ seuls. Fournis un court feedback à l'élève, expliquant pourquoi sa réponse est correcte ou ce qui ne va pas s'il y a une erreur. Sois encourageant.)"
            }

            ---
            ÉNONCÉ DE L'EXERCICE:
            ${exercise.statement}
            ---
            CORRECTION (sert de référence pour la validité):
            ${truncatedCorrection}
            ---
            RÉPONSE DE L'ÉLÈVE (peut être sur plusieurs pages):
            ${combinedOcrText}
            ---
            MAINTENANT, FOURNIS L'ÉVALUATION EN JSON:
        `;

        const answerSchema = {
            type: Type.OBJECT,
            properties: {
                is_correct: {
                    type: Type.BOOLEAN,
                    description: "True if the student's answer is correct, false otherwise."
                },
                feedback: {
                    type: Type.STRING,
                    description: "A short, encouraging feedback message for the student, explaining why their answer is correct or what is wrong. IMPORTANT: All math expressions must be in LaTeX format using \\(...\\) for inline and $$...$$ for blocks. Never use single dollar signs."
                }
            },
            required: ["is_correct", "feedback"],
        };

        const checkResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: checkPrompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: answerSchema
            }
        });

        await logAiCall(supabase, user.id, 'ANSWER_VALIDATION');
        
        const jsonText = checkResponse.text;
        if (!jsonText) {
            throw new Error("La réponse de l'IA pour la vérification est vide.");
        }
        
        const parsedJson = JSON.parse(jsonText);
        return res.status(200).json(parsedJson);

    } catch (error: any) {
        console.error("Error in check-multipage-answer:", error);
        let message = "Une erreur serveur est survenue lors du traitement de la réponse.";
        if (error.message?.includes("JSON")) {
            message = "Erreur du serveur : La réponse de l'IA n'était pas dans le format JSON attendu.";
        } else if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}
