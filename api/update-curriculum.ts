

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Level, Chapter, Series, Exercise, Quiz, QuizQuestion, DeletionInfo } from "../src/types.js";

// This function runs on Vercel's servers (Node.js environment)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Standard CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'access-control-allow-headers',
        'authorization, x-csrf-token, x-requested-with, accept, accept-version, content-length, content-md5, content-type, date, x-api-version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        // --- Environment Variable Validation ---
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
        const adminEmail = process.env.ADMIN_EMAIL;

        if (!supabaseUrl || !supabaseServiceKey || !adminEmail) {
            const missingVars = [];
            if (!supabaseUrl) missingVars.push('SUPABASE_URL');
            if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');
            if (!adminEmail) missingVars.push('ADMIN_EMAIL');
            throw new Error(`Configuration du serveur incomplète: ${missingVars.join(', ')} manquant(es).`);
        }

        // --- Authentication & Authorization ---
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authentification requise.' });
        
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
        if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) return res.status(403).json({ error: 'Action non autorisée.' });

        // --- Action Dispatching ---
        const { action, payload } = req.body;
        if (!action || !payload) return res.status(400).json({ error: "L'action et le payload sont requis." });

        let rpcError;
        
        switch (action) {
            case 'ADD_OR_UPDATE_LEVEL': {
                const levelData = payload.level as Level;
                ({ error: rpcError } = await supabase.rpc('upsert_level', { p_level_data: levelData as any }));
                break;
            }
            case 'ADD_OR_UPDATE_CHAPTER': {
                const { levelId, chapter } = payload as { levelId: string, chapter: Chapter };
                // Using the specific 'upsert_chapter' function as defined in the provided SQL v3 script.
                ({ error: rpcError } = await supabase.rpc('upsert_chapter', { p_level_id: levelId, p_chapter_data: chapter as any }));
                break;
            }
             case 'ADD_OR_UPDATE_SERIES': {
                const { levelId, chapterId, series } = payload as { levelId: string, chapterId: string, series: Series };
                const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                if (levelIdx === null) throw new Error(`Niveau ${levelId} non trouvé.`);
                const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                if (chapterIdx === null) throw new Error(`Chapitre ${chapterId} non trouvé.`);
                
                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'series'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: series as any }));
                break;
            }
             case 'ADD_OR_UPDATE_EXERCISE': {
                const { levelId, chapterId, seriesId, exercise } = payload as { levelId: string, chapterId: string, seriesId: string, exercise: Exercise };
                const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                if (levelIdx === null) throw new Error(`Niveau ${levelId} non trouvé.`);
                const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                if (chapterIdx === null) throw new Error(`Chapitre ${chapterId} non trouvé.`);
                const { data: seriesIdx } = await supabase.rpc('find_series_idx', { p_level_id: levelId, p_chapter_id: chapterId, p_series_id: seriesId });
                if (seriesIdx === null) throw new Error(`Série ${seriesId} non trouvée.`);
                
                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'series', seriesIdx.toString(), 'exercises'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: exercise as any }));
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ': {
                const { levelId, chapterId, quiz } = payload as { levelId: string, chapterId: string, quiz: Quiz };
                const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                if (levelIdx === null) throw new Error(`Niveau ${levelId} non trouvé.`);
                const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                if (chapterIdx === null) throw new Error(`Chapitre ${chapterId} non trouvé.`);

                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'quizzes'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: quiz as any }));
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ_QUESTION': {
                const { levelId, chapterId, quizId, question } = payload as { levelId: string, chapterId: string, quizId: string, question: QuizQuestion };
                const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                if (levelIdx === null) throw new Error(`Niveau ${levelId} non trouvé.`);
                const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                if (chapterIdx === null) throw new Error(`Chapitre ${chapterId} non trouvé.`);
                const { data: quizIdx } = await supabase.rpc('find_quiz_idx', { p_level_id: levelId, p_chapter_id: chapterId, p_quiz_id: quizId });
                if (quizIdx === null) throw new Error(`Quiz ${quizId} non trouvé.`);

                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'quizzes', quizIdx.toString(), 'questions'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: question as any }));
                break;
            }
            case 'DELETE_ITEM': {
                const { type, ids } = payload as DeletionInfo;
                const { levelId, chapterId, seriesId, exerciseId, quizId, questionId } = ids;
                
                switch(type) {
                    case 'level':
                        ({ error: rpcError } = await supabase.rpc('delete_level', { p_level_id: levelId }));
                        break;
                    case 'chapter':
                        ({ error: rpcError } = await supabase.rpc('delete_chapter', { p_level_id: levelId, p_chapter_id: chapterId }));
                        break;
                    case 'series': {
                        const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                        if (levelIdx === null) break;
                        const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                        if (chapterIdx === null) break;
                        const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'series'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path, p_item_id: seriesId }));
                        break;
                    }
                    case 'exercise': {
                        const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                        if (levelIdx === null) break;
                        const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                        if (chapterIdx === null) break;
                        const { data: seriesIdx } = await supabase.rpc('find_series_idx', { p_level_id: levelId, p_chapter_id: chapterId, p_series_id: seriesId });
                        if (seriesIdx === null) break;
                        const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'series', seriesIdx.toString(), 'exercises'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path, p_item_id: exerciseId }));
                        break;
                    }
                     case 'quiz': {
                        const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                        if (levelIdx === null) break;
                        const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                        if (chapterIdx === null) break;
                        const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'quizzes'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path, p_item_id: quizId }));
                        break;
                    }
                    case 'quizQuestion': {
                        const { data: levelIdx } = await supabase.rpc('find_level_idx', { p_level_id: levelId });
                        if (levelIdx === null) break;
                        const { data: chapterIdx } = await supabase.rpc('find_chapter_idx', { p_level_id: levelId, p_chapter_id: chapterId });
                        if (chapterIdx === null) break;
                        const { data: quizIdx } = await supabase.rpc('find_quiz_idx', { p_level_id: levelId, p_chapter_id: chapterId, p_quiz_id: quizId });
                        if (quizIdx === null) break;
                        const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'quizzes', quizIdx.toString(), 'questions'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path, p_item_id: questionId }));
                        break;
                    }
                }
                break;
            }
            default:
                return res.status(400).json({ error: `Action inconnue: ${action}` });
        }
        
        if (rpcError) {
            console.error(`Erreur RPC pour l'action '${action}':`, rpcError);
            throw new Error(`Échec de l'opération: ${rpcError.message}`);
        }
        
        return res.status(200).json({ success: true });

    } catch (e: any) {
        console.error(`Erreur critique dans 'update-curriculum' pour l'action '${req.body.action}':`, e);
        return res.status(500).json({ error: e.message || "Une erreur interne est survenue." });
    }
}