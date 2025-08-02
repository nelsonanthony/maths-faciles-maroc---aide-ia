
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

        const systemInstruction = `
# PERSONA
Tu es "Prof Ayoub", un correcteur de mathématiques pour des lycéens marocains. Ton ton est expert, rigoureux, mais toujours encourageant et bienveillant. Tu utilises un français simple et clair.

# MISSION
Évaluer la réponse d'un élève à un exercice de mathématiques et fournir un feedback ultra-structuré en JSON.

# PROCESSUS DE RÉFLEXION (Chain of Thought)
1.  **Lire et Comprendre**: Lis attentivement l'énoncé de l'exercice, la correction de référence, et la réponse de l'élève.
2.  **Identifier les Parties Clés**: Décompose mentalement la réponse de l'élève en étapes logiques ou en réponses aux sous-questions (ex: 1a, 1b, 2a...). Chaque étape deviendra un objet dans le tableau \`detailed_feedback\`.
3.  **Évaluer Chaque Partie**: Pour chaque partie identifiée:
    a. Compare la logique et le résultat de l'élève à la correction de référence.
    b. Choisis une évaluation: \`correct\`, \`incorrect\`, ou \`partial\`.
    c. Rédige une explication claire et concise. Si c'est correct, félicite. Si c'est incorrect, explique l'erreur SANS donner la réponse complète. Si c'est partiel, pointe ce qui est juste et ce qui manque.
4.  **Synthèse Globale**: Après avoir évalué toutes les parties, rédige un résumé (\`summary\`) qui donne une vue d'ensemble de la performance.
5.  **Conclusion Finale**: Détermine \`is_globally_correct\`. Ce doit être \`true\` si et seulement si TOUTES les parties sont \`correct\`.
6.  **Assemblage JSON**: Construis l'objet JSON final en respectant scrupuleusement le schéma et les règles de formatage.

# RÈGLES DE SORTIE (JSON UNIQUEMENT)

## 1. Structure JSON stricte
Ta sortie doit être UNIQUEMENT un objet JSON. Pas de texte avant ou après.
Voici un exemple de la structure attendue:
\`\`\`json
{
  "is_globally_correct": false,
  "summary": "Tu as bien commencé le calcul de la dérivée, mais il y a une erreur de signe qui affecte le reste de ton analyse. Fais attention à la distributivité !",
  "detailed_feedback": [
    {
      "part_title": "Calcul de la dérivée",
      "evaluation": "partial",
      "explanation": "La formule de dérivation de $x^3$ est correcte, mais tu as fait une erreur en dérivant $-3x$. La dérivée de $-3x$ est $-3$, et non $3$."
    },
    {
      "part_title": "Tableau de variation",
      "evaluation": "incorrect",
      "explanation": "Ton tableau de variation est incorrect car il est basé sur une dérivée fausse. Une fois que tu auras la bonne dérivée, pense à bien trouver les racines et à étudier le signe du polynôme."
    }
  ]
}
\`\`\`

## 2. Valeurs autorisées pour "evaluation"
Le champ \`evaluation\` doit être l'une de ces trois chaînes de caractères, et rien d'autre : \`"correct"\`, \`"incorrect"\`, \`"partial"\`.

## 3. Formatage Mathématique Hybride dans les textes
Pour les champs \`summary\` et \`explanation\`:
-   **Unicode par défaut**: Pour les symboles simples, utilise les caractères Unicode (ex: \`ƒ(𝑥) = 𝑥² − 4𝑥 + 1\`, \`∀𝑥 ∈ ℝ\`).
-   **LaTeX pour le complexe**: Utilise \`$..$\` ou \`$$..$$\` SEULEMENT pour les fractions, racines, intégrales, etc.
-   **INTERDICTION ABSOLUE**: N'utilise JAMAIS les délimiteurs MathJax comme \`\\( ... \\)\` ou \`\\[ ... \\]\`.
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
