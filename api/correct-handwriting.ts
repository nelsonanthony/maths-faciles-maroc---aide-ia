
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Level, Exercise, HandwrittenCorrectionResponse } from '../src/types';
import { checkUsageLimit, logAiCall } from './ai-usage-limiter';

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
        
        // --- Fetch LIVE curriculum from Supabase ---
        const { data: curriculumDB, error: curriculumError } = await supabase
            .from('curriculum')
            .select('data')
            .eq('id', 1)
            .single();

        if (curriculumError || !curriculumDB?.data) {
            console.error('Erreur lors de la récupération du programme depuis Supabase:', curriculumError);
            return res.status(500).json({ error: "Impossible de charger le contenu pédagogique depuis le serveur." });
        }
        
        const allExercisesMap = new Map<string, Exercise>();
        const levels: Level[] = Array.isArray(curriculumDB.data) ? curriculumDB.data as Level[] : [];
        
        for (const level of levels) {
            for (const chapter of level?.chapters ?? []) {
                for (const series of chapter?.series ?? []) {
                    for (const exercise of series?.exercises ?? []) {
                        if (exercise?.id) {
                            allExercisesMap.set(exercise.id, exercise);
                        }
                    }
                }
            }
        }

        const exercise = allExercisesMap.get(exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: "Exercise not found." });
        }

        const prompt = `
            CONTEXTE : Tu es un professeur de mathématiques expert et bienveillant qui corrige la copie d'un élève marocain.
            MISSION : Analyse la réponse de l'élève ligne par ligne, compare-la à l'énoncé et à l'extrait de la correction, et fournis un feedback structuré.
            FORMAT DE SORTIE OBLIGATOIRE : Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après. L'objet JSON doit suivre cette structure :
            {
              "score": number, "lines": [ { "line": number, "student_text": string, "status": "correct" | "error", "explanation"?: string } ], "global_feedback": string
            }
            ÉNONCÉ : ${exercise.statement}
            CORRECTION ATTENDUE : ${exercise.correctionSnippet}
            RÉPONSE DE L'ÉLÈVE (OCR) : ${ocrText}
            MAINTENANT, FOURNIS LA CORRECTION EN JSON :
        `;

        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        // Log successful AI call
        await logAiCall(supabase, user.id, 'HANDWRITING_CORRECTION');
        
        const jsonText = response.text;
        const parsedJson = JSON.parse(jsonText) as HandwrittenCorrectionResponse;
        return res.status(200).json(parsedJson);

    } catch (error: any) {
        console.error("Error in correct-handwriting:", error);
        const message = error.message?.includes("JSON") ? "The AI returned an invalid response format." : "An error occurred while communicating with the AI service.";
        return res.status(500).json({ error: message });
    }
}