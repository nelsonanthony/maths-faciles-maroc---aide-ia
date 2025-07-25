import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Level, Exercise } from '../src/types';
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
        const levels: Level[] = Array.isArray(curriculumDB.data) ? curriculumDB.data : [];
        
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
            return res.status(404).json({ error: "Exercice non trouvé." });
        }

        const prompt = `
            CONTEXTE: Tu es un professeur de mathématiques expert et exigeant qui évalue la réponse d'un élève à un exercice.
            MISSION: Compare la "Réponse de l'élève" à l' "Énoncé de l'exercice" et à la "Correction". Détermine si la réponse de l'élève est substantiellement correcte. Une petite faute de frappe ou une formulation légèrement différente est acceptable, mais le raisonnement mathématique et le résultat final doivent être justes.
            FORMAT DE SORTIE OBLIGATOIRE: Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après. L'objet JSON doit suivre cette structure :
            {
              "is_correct": boolean,
              "feedback": "string (Fournis un court feedback à l'élève, expliquant pourquoi sa réponse est correcte ou ce qui ne va pas s'il y a une erreur. Sois encourageant.)"
            }

            ---
            ÉNONCÉ DE L'EXERCICE:
            ${exercise.statement}
            ---
            CORRECTION (sert de référence pour la validité):
            ${exercise.fullCorrection || exercise.correctionSnippet}
            ---
            RÉPONSE DE L'ÉLÈVE:
            ${studentAnswer}
            ---
            MAINTENANT, FOURNIS L'ÉVALUATION EN JSON:
        `;

        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        // Log successful AI call
        await logAiCall(supabase, user.id, 'ANSWER_VALIDATION');
        
        const jsonText = response.text;
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