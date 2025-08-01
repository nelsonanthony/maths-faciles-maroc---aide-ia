


import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter.js';
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
        const { limitExceeded, limit } = await checkUsageLimit(supabase, user.id, 'OCR');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} analyses d'image par jour.` });
        }
        
        // --- Main Logic ---
        const { image, mimeType } = req.body;
        if (!image || !mimeType) {
            return res.status(400).json({ error: "Les champs 'image' (base64) et 'mimeType' sont requis." });
        }
        
        const ai = new GoogleGenAI({ apiKey });
        const imagePart = {
            inlineData: {
                data: image,
                mimeType: mimeType
            },
        };
        
        const promptText = `Tu es un système de transcription mathématique pour lycéens marocains. 

RÈGLES ABSOLUES DE FORMATAGE:
1. MATHÉMATIQUES:
   - Formules dans le texte: $formule$ (ex: $f(x) = x^2$)
   - Équations centrées: $$équation$$ (ex: $$\\int_0^1 x dx = \\frac{1}{2}$$)
   - JAMAIS utiliser: \\(, \\), \\[, \\] (ces formats sont INTERDITS)

2. TRANSCRIPTION FIDÈLE:
   - Conserver EXACTEMENT le texte original (français/arabe)
   - Respecter la numérotation des questions
   - Préserver les espaces et sauts de ligne
   - Ne pas corriger les erreurs de l'élève

3. SYMBOLES MATHÉMATIQUES COURANTS AU MAROC:
   - Ensemble des réels: $\\mathbb{R}$
   - Dérivée: $f'(x)$ ou $\\frac{df}{dx}$
   - Limite: $\\lim_{x \\to a}$
   - Intégrale: $\\int_a^b f(x)dx$

EXEMPLE DE TRANSFORMATION:
[Manuscrit] "Soit f(x) = \\(2x + 1\\). Calculer \\[f'(x) = 2\\]"
[Transcription] "Soit f(x) = $2x + 1$. Calculer $$f'(x) = 2$$"

Transcris maintenant le contenu de l'image:`;

        const textPart = { text: promptText };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        // Log successful AI call
        await logAiCall(supabase, user.id, 'OCR');
        
        const extractedText = response.text;
        if (extractedText === undefined) {
             throw new Error("L'IA n'a pas pu extraire de texte de l'image.");
        }
        
        const cleanedText = cleanLatex(extractedText);

        return res.status(200).json({ text: cleanedText });

    } catch (error: any) {
        console.error("Error in ocr-with-gemini:", error);
        let message = "An error occurred while communicating with the AI service.";
        if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}