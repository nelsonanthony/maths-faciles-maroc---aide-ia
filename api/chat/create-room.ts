
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Database configuration is missing' });
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
        console.error('Error creating chat room:', error);
        return res.status(500).json({ error: 'Failed to create chat room' });
    }

    return res.status(201).json(data);
}
