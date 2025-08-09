
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DialogueMessage } from '../src/types.js';
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
        
        let { studentAnswer, currentIaQuestion, expectedAnswerKeywords, exerciseStatement, exerciseCorrection, dialogueHistory } = req.body as { 
            studentAnswer?: string, 
            currentIaQuestion?: string, 
            expectedAnswerKeywords?: string[],
            exerciseStatement?: string,
            exerciseCorrection?: string,
            dialogueHistory?: DialogueMessage[]
        };
        
        if (studentAnswer === undefined) {
             return res.status(400).json({ error: "Le champ 'studentAnswer' est requis (peut être vide)." });
        }
        if (!currentIaQuestion || !Array.isArray(expectedAnswerKeywords) || !exerciseStatement || !exerciseCorrection || !Array.isArray(dialogueHistory)) {
            return res.status(400).json({ error: "Les champs 'currentIaQuestion', 'expectedAnswerKeywords', 'exerciseStatement', 'exerciseCorrection' et 'dialogueHistory' sont requis." });
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
                feedback_message: {
                    type: Type.STRING,
                    description: "Si correct, un feedback positif. Si incorrect, un indice contextuel basé sur l'erreur de l'élève. Doit être encourageant et en français simple."
                }
            },
            required: ["is_correct", "feedback_message"],
        };

        const formattedHistory = (dialogueHistory || [])
            .slice(-10) // Take last 10 messages to avoid overly long prompts
            .map(msg => `${msg.role === 'ai' ? 'Tuteur' : 'Élève'}: ${msg.content}`)
            .join('\n\n');

        const promptText = `
# CONTEXTE GLOBAL
Tu es un tuteur de mathématiques expert. Ton rôle est d'évaluer la réponse d'un élève à TA DERNIÈRE question, en te basant sur l'HISTORIQUE COMPLET de la conversation pour être le plus pertinent possible.

## Infos sur l'exercice
- **Énoncé**: ${exerciseStatement}
- **Correction (pour info)**: ${exerciseCorrection}

# PROCESSUS DE RÉFLEXION (Chain of Thought)
1.  **Relire ma dernière question**: Je regarde la toute dernière chose que J'AI dite dans l'historique ci-dessous. C'est la question à laquelle l'élève est censé répondre.
2.  **Analyser la réponse de l'élève**: Je lis la réponse de l'élève. Est-ce qu'elle répond à ma question ? Est-elle correcte mathématiquement ? Est-elle à côté de la plaque ?
3.  **Comparer aux attentes**: Je compare sa réponse aux \`expected_answer_keywords\`. Est-ce que les concepts y sont ?
4.  **Décider de la validité**: Je décide si \`is_correct\` est \`true\` ou \`false\`. Même si la réponse est formulée différemment, si le concept est bon, c'est \`true\`.
5.  **Rédiger le feedback**:
    -   **Si correcte**: Je rédige un message positif. Je peux même anticiper très brièvement la suite pour que la transition soit fluide.
    -   **Si incorrecte**: J'analyse PRÉCISÉMENT l'erreur. Est-ce un simple oubli ? Une erreur de calcul ? Une incompréhension totale du concept ? Mon indice doit être directement lié à CETTE erreur spécifique. Je ne dois PAS donner un indice générique. Je dois me baser sur ce que l'élève a écrit.
6.  **Construire le JSON**: J'assemble l'objet JSON final en respectant les règles.

# HISTORIQUE DE LA CONVERSATION (le plus récent est en bas)
${formattedHistory}

# MISSION
Évalue la **dernière** réponse de l'élève (fournie ci-dessous) en tenant compte de tout l'historique. Fournis une réponse JSON structurée.

## Évaluation
- **Dernière question posée à l'élève**: "${currentIaQuestion}"
- **Concepts clés attendus dans la réponse**: "${expectedAnswerKeywords.join(', ')}"
- **Réponse fournie par l'élève**: "${studentAnswer || "L'élève n'a rien répondu."}"

# FORMAT DE SORTIE
Réponds UNIQUEMENT avec un objet JSON valide suivant ce schéma : \`{ "is_correct": boolean, "feedback_message": "Ton message ici..." }\`.
Utilise le formatage mathématique hybride (Unicode simple, LaTeX complexe avec $..$ ou $$..$$) dans ton \`feedback_message\`.
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
