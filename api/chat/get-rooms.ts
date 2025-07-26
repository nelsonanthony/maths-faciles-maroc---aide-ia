
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- SQL to run in Supabase Editor to create chat_rooms table ---
/*
-- 1. Create the table
CREATE TABLE public.chat_rooms (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  exercise_id text NOT NULL,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies for RLS
-- Allow anyone to view chat rooms
CREATE POLICY "Allow public read access to chat rooms"
  ON public.chat_rooms FOR SELECT
  USING (true);

-- Allow authenticated users to create chat rooms
CREATE POLICY "Allow authenticated users to create chat rooms"
  ON public.chat_rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);
*/

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Server configuration error: SUPABASE_URL or SUPABASE_ANON_KEY is not set in Vercel environment variables.');
            return res.status(500).json({ error: 'La configuration de la base de données sur le serveur est incomplète. L\'administrateur doit définir les variables d\'environnement.' });
        }

        const { exercise_id } = req.query;

        if (!exercise_id || typeof exercise_id !== 'string') {
            return res.status(400).json({ error: 'exercise_id is required' });
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data, error } = await (supabase
            .from('chat_rooms') as any)
            .select('*')
            .eq('exercise_id', exercise_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error fetching rooms:', error);
            if (error.code === '42P01') { // undefined_table
                return res.status(500).json({ error: "Configuration de la base de données incomplète : la table 'chat_rooms' est manquante. Veuillez exécuter le SQL de configuration." });
            }
            return res.status(500).json({ error: `Erreur base de données : ${error.message}` });
        }

        return res.status(200).json(data);
    } catch (e: any) {
        console.error('Catastrophic error in get-rooms handler:', e);
        return res.status(500).json({ error: `Erreur interne du serveur : ${e.message}` });
    }
}
