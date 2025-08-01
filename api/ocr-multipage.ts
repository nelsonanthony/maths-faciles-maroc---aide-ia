

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter.js';
import { cleanLatex } from '../src/utils/math-format.js';


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
        
        // --- Body validation ---
        const { images } = req.body as { images?: ImagePayload[] };
        if (!Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: "Le champ 'images' (un tableau d'objets image) est requis." });
        }
        
        // --- Check usage limit before processing ---
        const { usageCount, limit } = await checkUsageLimit(supabase, user.id, 'OCR');
        const callsLeft = limit - usageCount;
        if (images.length > callsLeft) {
            return res.status(429).json({ error: `Vous essayez de téléverser ${images.length} images, mais il ne vous reste que ${callsLeft} analyses d'image pour aujourd'hui.` });
        }

        const ai = new GoogleGenAI({ apiKey });

        const ocrPromptText = `Tu es un système de transcription mathématique pour lycéens marocains. 

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

        // --- STEP 1: OCR on all images in parallel ---
        const ocrPromises = images.map(imagePayload => {
            const ocrImagePart = { inlineData: { data: imagePayload.image, mimeType: imagePayload.mimeType } };
            const ocrTextPart = { text: ocrPromptText };
            
            return ai.models.generateContent({
               model: 'gemini-2.5-flash',
               contents: { parts: [ocrImagePart, ocrTextPart] },
               config: {
                   thinkingConfig: { thinkingBudget: 0 }
               }
            });
        });

        const ocrResults = await Promise.all(ocrPromises);

        // --- Log successful calls ---
        const logPromises = images.map(() => logAiCall(supabase, user.id, 'OCR'));
        await Promise.all(logPromises);

        // --- Combine results ---
        const combinedOcrText = ocrResults.map((ocrResponse, index) => {
            const ocrText = ocrResponse.text?.trim() ?? '';
            const cleanedText = cleanLatex(ocrText);
            return `--- Photo ${index + 1} ---\n${cleanedText}`;
        }).join('\n\n');
        
        if (!combinedOcrText.trim()) {
            return res.status(400).json({ error: "L'IA n'a pas pu extraire de texte des images fournies. Essayez des photos plus nettes." });
        }

        return res.status(200).json({ text: combinedOcrText.trim() });

    } catch (error: any) {
        console.error("Error in ocr-multipage:", error);
        let message = "Une erreur serveur est survenue lors du traitement de la ou des image(s).";
        if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}