import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import aiUsageLimiter from './_lib/ai-usage-limiter.js';

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
        
        const promptText = `
# MISSION
Transcrire l'écriture manuscrite de l'image en texte brut.

# RÈGLES DE FORMATAGE (TRÈS IMPORTANTES)
1.  **Texte Brut Uniquement**: Ne produis AUCUN formatage spécial comme Markdown ou LaTeX. La sortie doit être du texte pur.
2.  **Symboles Mathématiques**: Utilise les caractères UNICODE pour tous les symboles mathématiques.
    -   BON: \`ƒ(𝑥) = 𝑥² − 4𝑥 + 1\`, \`∀𝑥 ∈ ℝ\`, \`𝑥 ⟼ 𝑥²\`
    -   MAUVAIS: \`f(x) = x^2 - 4x + 1\`, \`$\\forall x \\in \\mathbb{R}$\`
3.  **MISE EN PAGE FIDÈLE (RÈGLE CRITIQUE)**: Tu dois reproduire **EXACTEMENT** les sauts de ligne et les espacements de l'image. Chaque ligne de ta sortie doit correspondre à une ligne de l'image. Utilise un retour à la ligne standard (\`\\n\`) pour les sauts de ligne.
4.  **ESPACES CRUCIAUX**: Ne fusionne JAMAIS les mots. Les espaces entre les mots sont la règle. L'absence d'espaces rend le texte inutilisable. Reproduis les espaces tels que tu les vois.
5.  **Exemple**:
    -   Si l'image montre:
        Soit f une application tel que :
        f(x) = x² - 4x + 1
    -   Ta sortie DOIT être EXACTEMENT:
        Soit ƒ une application tel que :
        ƒ(𝑥) = 𝑥² − 4𝑥 + 1

# INSTRUCTION FINALE
Transcris le contenu de l'image en suivant ces règles à la lettre. La sortie doit être du texte brut et lisible.`;


        const textPart = { text: promptText };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        // Log successful AI call
        await aiUsageLimiter.logAiCall(supabase, user.id, 'OCR');
        
        const extractedText = response.text?.trim() ?? '';
        if (!extractedText) {
             throw new Error("L'IA n'a pas pu extraire de texte de l'image. Assurez-vous que l'image est claire et lisible.");
        }
        
        return res.status(200).json({ text: extractedText });

    } catch (error: any) {
        console.error("Error in ocr-with-gemini:", error);
        let message = "An error occurred while communicating with the AI service.";
        if (error.message) {
            message = `Erreur du service IA: ${error.message}`;
        }
        return res.status(500).json({ error: message });
    }
}