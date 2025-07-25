
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const apiKey = process.env.GEMINI_API_KEY; // Correction ici

    if (!supabaseUrl || !supabaseServiceKey || !apiKey) {
        return res.status(500).json({ error: 'Server configuration is missing' });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ai = new GoogleGenAI({ apiKey: apiKey });

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

    try {
        const moderationResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: moderationPrompt,
            config: { responseMimeType: "application/json" }
        });

        const moderationResult = JSON.parse(moderationResponse.text);

        if (!moderationResult.is_safe) {
            return res.status(403).json({ error: `Message rejected: ${moderationResult.reason}` });
        }

    } catch (e) {
        console.error("AI Moderation failed:", e);
        // Fail-safe: if moderation fails, we allow the message to pass but log the error.
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
        console.error('Error sending message:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }

    return res.status(201).json(data);
}
