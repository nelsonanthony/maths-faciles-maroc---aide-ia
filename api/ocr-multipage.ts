
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkUsageLimit, logAiCall } from './_lib/ai-usage-limiter';
import { cleanLatex } from "../src/utils/math-format";


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

        const ocrPromptText = `[INSTRUCTIONS STRICTES - Transcription Mathématique Marocaine]
1.  **Mission**: Transcris le texte mathématique de l'image.
2.  **Formatage Hybride OBLIGATOIRE**:
    -   **Unicode (Priorité 1)**: Utilise les caractères Unicode pour TOUT ce qui est simple.
        -   **Exemples**: \`ƒ: ℝ → ℝ\`, \`𝑥 ⟼ 𝑥² − 4𝑥 + 1\`, \`∀𝑥 ∈ ℝ\`, \`(𝑥−2)² ≥ 0\`.
        -   Utilise \`²\`, \`³\`, \`→\`, \`ℝ\`, \`ƒ\`, \`𝑥\`, etc.
    -   **LaTeX (Priorité 2)**: Utilise LaTeX **uniquement** pour les structures complexes qui n'ont pas d'équivalent Unicode simple.
        -   **Exemples**: Fractions \`$$\\frac{a}{b}$$\`, racines \`$$\\sqrt{x}$$\`, sommes \`$$\\sum_{k=1}^{n} k$$ \`, etc.
        -   Délimiteurs: en ligne \`$..$\`, en bloc \`$$..$$\`.
3.  **Règle Capitale**: N'utilise **JAMAIS** les délimiteurs MathJax comme \`\\( ... \\)\` ou \`\\[ ... \\]\`.
Transcris maintenant le contenu de l'image ou des images fournies en suivant ces règles à la lettre.`;

        // --- STEP 1: OCR on all images in parallel ---
        const ocrPromises = images.map(imagePayload => {
            const ocrImagePart = { inlineData: { data: imagePayload.image, mimeType: imagePayload.mimeType } };
            const ocrTextPart = { text: ocrPromptText };
            
            return ai.models.generateContent({
               model: 'gemini-2.5-flash',
               contents: { parts: [ocrImagePart, ocrTextPart] }
            });
        });

        const ocrResults = await Promise.all(ocrPromises);

        // --- Log successful calls ---
        const logPromises = images.map(() => logAiCall(supabase, user.id, 'OCR'));
        await Promise.all(logPromises);

        // --- Combine results ---
        const combinedOcrText = ocrResults.map((ocrResponse, index) => {
            const ocrText = ocrResponse.text?.trim() ?? '';
            // Le nettoyage est appliqué ici, mais une seconde passe est faite sur le texte combiné pour plus de sûreté
            return `--- Photo ${index + 1} ---\n${ocrText}`;
        }).join('\n\n');
        
        if (!combinedOcrText.trim()) {
            return res.status(400).json({ error: "L'IA n'a pas pu extraire de texte des images fournies. Essayez des photos plus nettes." });
        }

        const finalCleanedText = cleanLatex(combinedOcrText);

        return res.status(200).json({ text: finalCleanedText.trim() });

    } catch (error: any) {
        console.error("Error in ocr-multipage:", error);
        let message = "Une erreur serveur est survenue lors du traitement de la ou des image(s).";
        if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}