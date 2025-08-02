
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURATION SERVER (BACKEND) ---
// Cette fonction s'exécute sur les serveurs de Vercel.
// Elle utilise les variables d'environnement `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` et `GEMINI_API_KEY`
// que vous devez configurer dans les paramètres de votre projet Vercel.
// La `SUPABASE_SERVICE_KEY` est une clé secrète qui a tous les droits.
// N'UTILISEZ PAS les préfixes `VITE_` ici.

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
    
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
        const apiKey = process.env.GEMINI_API_KEY; 

        const missingVars = [];
        if (!supabaseUrl) missingVars.push('SUPABASE_URL');
        if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');
        if (!apiKey) missingVars.push('GEMINI_API_KEY');

        if (missingVars.length > 0) {
            const errorMsg = `Configuration du serveur incomplète. Variables d'environnement manquantes: ${missingVars.join(', ')}`;
            return res.status(500).json({ error: errorMsg });
        }
        
        const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
        const ai = new GoogleGenAI({ apiKey: apiKey! });

        const { room_id, content } = req.body;
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header is missing' });
        }

        if (!room_id || !content) {
            return res.status(400).json({ error: 'room_id and content are required' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // --- AI Moderation ---
        const moderationPrompt = `
            Analyze the following message from a student chat about a math exercise.
            The message should be on-topic (math, studying, the exercise) and respectful.
            Respond ONLY with a valid JSON object: {"is_safe": boolean, "reason": "on_topic" | "off_topic" | "inappropriate"}

            Message: "${content}"
        `;
        
        const moderationResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: moderationPrompt,
            config: { 
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        const moderationText = moderationResponse.text;
        if (moderationText) {
            try {
                const moderationResult = JSON.parse(moderationText.trim());
                if (moderationResult.is_safe === false) {
                    return res.status(403).json({ error: "Message rejeté car jugé inapproprié ou hors-sujet." });
                }
            } catch (e) {
                console.error("Failed to parse moderation JSON from AI. Raw response:", moderationText);
                // Fail closed: if moderation response is unparsable, block the message.
                return res.status(500).json({ error: "Le service de modération a rencontré un problème. Veuillez réessayer." });
            }
        } else {
             // If moderation is completely empty, it could be a model issue. We should still log it, but failing open might be acceptable here.
             console.warn("AI moderation returned an empty response. Allowing message to pass as a fail-safe measure.");
        }
        
        // --- Insert Message ---
        const { data, error } = await (supabase
            .from('chat_messages') as any)
            .insert({
                room_id,
                content,
                user_id: user.id,
                user_email: user.email // Store email for easy display on the frontend
            })
            .select()
            .single();

        if (error) {
            console.error('Supabase error sending message:', error);
            if (error.code === '42P01') { // undefined_table
                return res.status(500).json({ error: "Configuration de la base de données incomplète : la table 'chat_messages' est manquante." });
            }
            return res.status(500).json({ error: `Erreur base de données : ${error.message}` });
        }

        return res.status(201).json(data);

    } catch (e: any) {
        console.error('Catastrophic error in send-message handler:', e);
        return res.status(500).json({ error: `Erreur interne du serveur : ${e.message}` });
    }
}