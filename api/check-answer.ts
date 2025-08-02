
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import aiUsageLimiter from './_lib/ai-usage-limiter';
import dataAccess from "./_lib/data-access";
import mathValidator from "./_lib/math-validator";
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
        const { limitExceeded, limit } = await aiUsageLimiter.checkUsageLimit(supabase, user.id, 'ANSWER_VALIDATION');
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
        const exercise = await dataAccess.getExerciseById(exerciseId);
        if (!exercise) {
            return res.status(404).json({ error: "Exercice non trouvé." });
        }

        // Truncate the correction context to avoid overly long prompts
        const correctionContext = exercise.fullCorrection || exercise.correctionSnippet;
        const truncatedCorrection = correctionContext.length > 2500 ? (correctionContext.substring(0, 2500) + "\n...") : correctionContext;

        const systemInstruction = `
# PERSONA
Tu es "Prof Ayoub", un correcteur de mathématiques pour lycéens marocains. Ton ton est expert, rigoureux et encourageant. Tu utilises un français simple et clair.

# MISSION
Évaluer la réponse d'un élève et fournir un feedback JSON ultra-structuré et fiable.

# PROCESSUS DE RÉFLEXION (Chain of Thought)
1.  **Analyse de l'Énoncé**: Je décompose l'exercice en sous-questions ou étapes logiques (ex: 1a, 1b, 2a).
2.  **Analyse de la Réponse Élève**: Je lis la réponse de l'élève et la segmente pour la faire correspondre aux étapes de l'énoncé.
3.  **Comparaison et Évaluation par Partie**: Pour chaque partie, je compare la réponse de l'élève à la correction de référence.
    -   Je détermine l'évaluation: \`correct\`, \`incorrect\`, ou \`partial\`.
    -   Je rédige une explication concise : félicitations si c'est juste, explication de l'erreur (sans donner la solution) si c'est faux.
4.  **Synthèse Globale**: Je rédige un résumé (\`summary\`) global.
5.  **Conclusion Finale**: Je détermine \`is_globally_correct\` (doit être \`true\` si et seulement si TOUTES les parties sont \`correct\`).
6.  **Assemblage JSON Final**: Je construis l'objet JSON en respectant à la lettre la structure et les règles de formatage. Si l'élève n'a rien écrit ou a écrit quelque chose d'incohérent, je le considère comme 'incorrect' avec une explication appropriée.

# RÈGLES DE SORTIE (JSON STRICT)

## 1. Format JSON OBLIGATOIRE
Ta sortie DOIT être un objet JSON valide, et RIEN D'AUTRE.

## 2. Structure et Exemple Concret
Utilise EXACTEMENT cette structure.
\`\`\`json
{
  "is_globally_correct": false,
  "summary": "Tu as bien identifié la méthode pour la question 1a, c'est un bon début ! Cependant, il y a une erreur de calcul dans ton développement qui a rendu la question 1b incorrecte. Fais bien attention à la distributivité.",
  "detailed_feedback": [
    {
      "part_title": "Question 1) a) - Montrer que f(x) = f(4-x)",
      "evaluation": "partial",
      "explanation": "L'idée de partir de $f(4-x)$ est excellente. Tu as bien remplacé $x$ par $(4-x)$ dans l'expression. Ton développement de $(4-x)^2$ est juste, mais tu as fait une petite erreur de signe en développant $-4(4-x)$. Recalcule bien cette partie et tu y es presque !"
    },
    {
      "part_title": "Question 1) b) - Déduire que f n'est pas injective",
      "evaluation": "incorrect",
      "explanation": "Ton raisonnement est correct : pour montrer la non-injectivité, il suffit de trouver deux valeurs différentes qui ont la même image. Cependant, l'exemple que tu as utilisé est basé sur la conclusion de la question précédente. Comme ton calcul en 1a était erroné, cette partie est aussi incorrecte."
    }
  ]
}
\`\`\`

## 3. Règles pour le champ \`evaluation\`
Le champ \`evaluation\` doit être l'une des trois valeurs suivantes, sans exception : \`"correct"\`, \`"incorrect"\`, \`"partial"\`.

## 4. Formatage Mathématique
Dans les chaînes de caractères (\`summary\`, \`explanation\`), utilise impérativement le formatage hybride suivant :
-   **Priorité à Unicode**: Pour les symboles simples, utilise les caractères Unicode (ex: \`ƒ(𝑥) = 𝑥² − 4𝑥 + 1\`, \`∀𝑥 ∈ ℝ\`).
-   **LaTeX pour le Complexe**: Utilise les délimiteurs \`$..$\` (en ligne) et \`$$..$$\` (en bloc) UNIQUEMENT pour les fractions, racines, sommes, etc.
-   **INTERDICTION**: N'utilise JAMAIS les délimiteurs MathJax comme \`\\( ... \\)\` ou \`\\[ ... \\]\`.
`;

        const userPrompt = `
L'élève a soumis sa réponse à l'exercice suivant. Évalue-la en suivant scrupuleusement tes instructions.

--- ÉNONCÉ DE L'EXERCICE ---
${exercise.statement}
--- CORRECTION DE RÉFÉRENCE ---
${truncatedCorrection}
--- RÉPONSE DE L'ÉLÈVE ---
${studentAnswer}
---

GÉNÈRE L'OBJET JSON MAINTENANT.
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
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: answerSchema
            }
        });
        
        const jsonText = response.text;
        if (!jsonText) {
            throw new Error("L'IA a retourné une réponse vide. Le modèle est peut-être surchargé, veuillez réessayer.");
        }
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonText.trim());
        } catch (e) {
            console.error("Failed to parse JSON from AI in check-answer. Raw response:", jsonText);
            throw new Error("La réponse de l'IA était mal formatée. Veuillez réessayer.");
        }
        
        // Appliquer le nettoyage et la validation à toute la réponse JSON
        const finalResponse = mathValidator.validateMathResponse(parsedJson);

        // Log successful AI call
        await aiUsageLimiter.logAiCall(supabase, user.id, 'ANSWER_VALIDATION');
        
        return res.status(200).json(finalResponse);

    } catch (error: any) {
        console.error("Error in check-answer:", error);
        const status = error.status || 500;
        const message = error.message || "Une erreur interne est survenue.";
        return res.status(status).json({ error: message });
    }
}
