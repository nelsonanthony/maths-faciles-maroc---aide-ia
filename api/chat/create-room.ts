


import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- CONFIGURATION SERVER (BACKEND) ---
// Cette fonction s'exécute sur les serveurs de Vercel.
// Elle utilise les variables d'environnement `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`
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

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set in Vercel environment variables.');
            return res.status(500).json({ error: 'La configuration de la base de données sur le serveur est incomplète. L\'administrateur doit définir les variables d\'environnement.' });
        }
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const { name, exercise_id } = req.body;
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header is missing' });
        }

        if (!name || !exercise_id) {
            return res.status(400).json({ error: 'Room name and exercise_id are required' });
        }
        
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const { data, error } = await (supabase
            .from('chat_rooms') as any)
            .insert({ name, exercise_id, created_by: user.id })
            .select()
            .single();

        if (error) {
            console.error('Supabase error creating chat room:', error);
            if (error.code === '42P01') { // undefined_table
                return res.status(500).json({ error: "Configuration de la base de données incomplète : la table 'chat_rooms' est manquante." });
            }
            return res.status(500).json({ error: `Erreur base de données : ${error.message}` });
        }

        return res.status(201).json(data);
    } catch (e: any) {
        console.error('Catastrophic error in create-room handler:', e);
        return res.status(500).json({ error: `Erreur interne du serveur : ${e.message}` });
    }
}