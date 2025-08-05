
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import aiUsageLimiter from './_lib/ai-usage-limiter.js';
import { cleanLatex } from "./_lib/math-validator.js";


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

    const missingVars = [];
    if (!apiKey) missingVars.push('GEMINI_API_KEY');
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');

    if (missingVars.length > 0) {
        const errorMsg = `Configuration du serveur incomplète. Variables d'environnement manquantes: ${missingVars.join(', ')}`;
        return res.status(500).json({ error: errorMsg });
    }

    try {
        // --- User Authentication & Rate Limiting ---
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
        
        // --- Body validation ---
        const { images } = req.body as { images?: ImagePayload[] };
        if (!Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: "Le champ 'images' (un tableau d'objets image) est requis." });
        }
        
        // --- Check usage limit before processing ---
        const { usageCount, limit } = await aiUsageLimiter.checkUsageLimit(supabase, user.id, 'OCR');
        const callsLeft = limit - usageCount;
        if (images.length > callsLeft) {
            return res.status(429).json({ error: `Vous essayez de téléverser ${images.length} images, mais il ne vous reste que ${callsLeft} analyses d'image pour aujourd'hui.` });
        }

        const ai = new GoogleGenAI({ apiKey: apiKey! });

        const ocrPromptText = `[INSTRUCTIONS STRICTES - Transcription en LaTeX Pur]
1.  **Mission**: Transcris l'écriture manuscrite mathématique de l'image en une seule chaîne de caractères LaTeX. La sortie doit être directement insérable dans un environnement mathématique LaTeX (comme \`gathered\` ou \`align*\`).
2.  **Format de Sortie**: La sortie doit être du LaTeX pur, SANS les délimiteurs externes comme \`$$...$$ \` ou \`$..$\`.
3.  **Gestion du Texte vs. Mathématiques (RÈGLE CRUCIALE)**:
    -   Tout texte en langage naturel (français) DOIT être encapsulé dans une commande \`\\text{...}\`. Exemple: \`\\text{Soit f une application}\`.
    -   Les formules et symboles mathématiques doivent être écrits en LaTeX standard. Exemple: \`f(x) = x^2 - 4x + 1\`.
4.  **Sauts de Ligne**: Utilise \`\\\\\` pour représenter un saut de ligne, correspondant à ce qui est vu dans l'image. C'est essentiel pour la mise en forme des calculs.
5.  **Exemple Complet**:
    -   **Image montre**:
        Soit f une application tel que :
        f(x) = x^2 - 4x + 13
        a) Montrer que f(x) = f(4-x)
    -   **Ta sortie DOIT être**: \`\\text{Soit f une application tel que :} \\\\ f(x) = x^2 - 4x + 13 \\\\ \\text{a) Montrer que } f(x) = f(4-x)\`
6.  **Règle Capitale**: N'ajoute pas de formatage Markdown ou d'autres délimiteurs. La sortie est du contenu LaTeX brut.

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
        const logPromises = images.map(() => aiUsageLimiter.logAiCall(supabase, user.id, 'OCR'));
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
        
        // Remove the page markers and combine into a single LaTeX string with newlines
        const finalCombinedText = ocrResults.map(res => res.text?.trim() ?? '').join(' \\\\ ');


        const finalCleanedText = cleanLatex(finalCombinedText);

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
