
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
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
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
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
        // --- User Authentication ---
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authentication is required.' });
        }
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }

        // --- Rate Limiting ---
        const { limitExceeded, limit } = await aiUsageLimiter.checkUsageLimit(supabase, user.id, 'OCR');
        if (limitExceeded) {
            return res.status(429).json({ error: `Vous avez atteint votre limite de ${limit} analyses d'image par jour.` });
        }
        
        // --- Main Logic ---
        const { image, mimeType } = req.body;
        if (!image || !mimeType) {
            return res.status(400).json({ error: "Les champs 'image' (base64) et 'mimeType' sont requis." });
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKey! });
        const imagePart = {
            inlineData: {
                data: image,
                mimeType: mimeType
            },
        };
        
        const promptText = `[INSTRUCTIONS STRICTES - Transcription en LaTeX Pur]
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

Transcris maintenant le contenu de l'image en suivant ces règles à la lettre.`;

        const textPart = { text: promptText };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] }
        });

        // Log successful AI call
        await aiUsageLimiter.logAiCall(supabase, user.id, 'OCR');
        
        const extractedText = response.text;
        if (extractedText === undefined) {
             throw new Error("L'IA n'a pas pu extraire de texte de l'image.");
        }
        
        // Gemini might return standard newlines (\n) instead of LaTeX newlines (\\).
        // We convert them here to ensure consistent formatting for MathJax rendering.
        const textWithLatexNewlines = extractedText.replace(/\n/g, ' \\\\ ');
        
        const cleanedText = cleanLatex(textWithLatexNewlines);

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