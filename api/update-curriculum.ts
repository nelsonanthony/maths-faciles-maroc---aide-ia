

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Level, Chapter, Series, Exercise, Quiz, QuizQuestion, DeletionInfo } from "../src/types.js";

// Helper to find the index of a level. Needed to construct JSONB paths.
const findLevelIndex = (curriculum: Level[], levelId: string): number => {
    const index = curriculum.findIndex(l => l.id === levelId);
    if (index === -1) throw new Error(`Niveau non trouvé: ${levelId}`);
    return index;
};

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
                 ({ error: rpcError } = await supabase.rpc('upsert_chapter', { p_level_id: levelId, p_chapter_data: chapter as any }));
                break;
            }
             case 'ADD_OR_UPDATE_SERIES': {
                const { levelId, chapterId, series } = payload as { levelId: string, chapterId: string, series: Series };
                const { data: curriculumRow } = await supabase.from('curriculum').select('data').eq('id', 1).single<{ data: Level[] }>();
                const curriculum = curriculumRow?.data || [];
                const levelIdx = findLevelIndex(curriculum, levelId);
                const chapterIdx = curriculum[levelIdx].chapters.findIndex((c: Chapter) => c.id === chapterId);
                if (chapterIdx === -1) throw new Error(`Chapter ${chapterId} not found`);
                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'series'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: series as any }));
                break;
            }
             case 'ADD_OR_UPDATE_EXERCISE': {
                const { levelId, chapterId, seriesId, exercise } = payload as { levelId: string, chapterId: string, seriesId: string, exercise: Exercise };
                const { data: curriculumRow } = await supabase.from('curriculum').select('data').eq('id', 1).single<{ data: Level[] }>();
                const curriculum = curriculumRow?.data || [];
                const levelIdx = findLevelIndex(curriculum, levelId);
                const chapterIdx = curriculum[levelIdx].chapters.findIndex((c: Chapter) => c.id === chapterId);
                if (chapterIdx === -1) throw new Error(`Chapter ${chapterId} not found`);
                const seriesIdx = curriculum[levelIdx].chapters[chapterIdx].series.findIndex((s: Series) => s.id === seriesId);
                if (seriesIdx === -1) throw new Error(`Series ${seriesId} not found`);
                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'series', seriesIdx.toString(), 'exercises'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: exercise as any }));
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ': {
                const { levelId, chapterId, quiz } = payload as { levelId: string, chapterId: string, quiz: Quiz };
                const { data: curriculumRow } = await supabase.from('curriculum').select('data').eq('id', 1).single<{ data: Level[] }>();
                const curriculum = curriculumRow?.data || [];
                const levelIdx = findLevelIndex(curriculum, levelId);
                const chapterIdx = curriculum[levelIdx].chapters.findIndex((c: Chapter) => c.id === chapterId);
                if (chapterIdx === -1) throw new Error(`Chapter ${chapterId} not found`);
                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'quizzes'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: quiz as any }));
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ_QUESTION': {
                const { levelId, chapterId, quizId, question } = payload as { levelId: string, chapterId: string, quizId: string, question: QuizQuestion };
                const { data: curriculumRow } = await supabase.from('curriculum').select('data').eq('id', 1).single<{ data: Level[] }>();
                const curriculum = curriculumRow?.data || [];
                const levelIdx = findLevelIndex(curriculum, levelId);
                const chapterIdx = curriculum[levelIdx].chapters.findIndex((c: Chapter) => c.id === chapterId);
                if (chapterIdx === -1) throw new Error(`Chapter ${chapterId} not found`);
                const quizIdx = curriculum[levelIdx].chapters[chapterIdx].quizzes.findIndex((q: Quiz) => q.id === quizId);
                if (quizIdx === -1) throw new Error(`Quiz ${quizId} not found`);
                const path = [levelIdx.toString(), 'chapters', chapterIdx.toString(), 'quizzes', quizIdx.toString(), 'questions'];
                ({ error: rpcError } = await supabase.rpc('upsert_item', { p_path: path, p_item_data: question as any }));
                break;
            }
            case 'DELETE_ITEM': {
                const { type, ids } = payload as DeletionInfo;
                const { levelId, chapterId, seriesId, exerciseId, quizId, questionId } = ids;
                const { data: curriculumRow } = await supabase.from('curriculum').select('data').eq('id', 1).single<{ data: Level[] }>();
                const curriculum = curriculumRow?.data || [];
                
                switch(type) {
                    case 'level':
                        ({ error: rpcError } = await supabase.rpc('delete_level', { p_level_id: levelId }));
                        break;
                    case 'chapter':
                        ({ error: rpcError } = await supabase.rpc('delete_chapter', { p_level_id: levelId, p_chapter_id: chapterId }));
                        break;
                    case 'series':
                        const levelIdx_s = findLevelIndex(curriculum, levelId);
                        const chapterIdx_s = curriculum[levelIdx_s].chapters.findIndex((c: Chapter) => c.id === chapterId);
                        if (chapterIdx_s === -1) throw new Error(`Chapter ${chapterId} not found`);
                        const path_s = [levelIdx_s.toString(), 'chapters', chapterIdx_s.toString(), 'series'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path_s, p_item_id: seriesId }));
                        break;
                    case 'exercise':
                        const levelIdx_e = findLevelIndex(curriculum, levelId);
                        const chapterIdx_e = curriculum[levelIdx_e].chapters.findIndex((c: Chapter) => c.id === chapterId);
                        if (chapterIdx_e === -1) throw new Error(`Chapter ${chapterId} not found`);
                        const seriesIdx_e = curriculum[levelIdx_e].chapters[chapterIdx_e].series.findIndex((s: Series) => s.id === seriesId);
                        if (seriesIdx_e === -1) throw new Error(`Series ${seriesId} not found`);
                        const path_e = [levelIdx_e.toString(), 'chapters', chapterIdx_e.toString(), 'series', seriesIdx_e.toString(), 'exercises'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path_e, p_item_id: exerciseId }));
                        break;
                     case 'quiz':
                        const levelIdx_q = findLevelIndex(curriculum, levelId);
                        const chapterIdx_q = curriculum[levelIdx_q].chapters.findIndex((c: Chapter) => c.id === chapterId);
                        if (chapterIdx_q === -1) throw new Error(`Chapter ${chapterId} not found`);
                        const path_q = [levelIdx_q.toString(), 'chapters', chapterIdx_q.toString(), 'quizzes'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path_q, p_item_id: quizId }));
                        break;
                    case 'quizQuestion':
                        const levelIdx_qq = findLevelIndex(curriculum, levelId);
                        const chapterIdx_qq = curriculum[levelIdx_qq].chapters.findIndex((c: Chapter) => c.id === chapterId);
                        if (chapterIdx_qq === -1) throw new Error(`Chapter ${chapterId} not found`);
                        const quizIdx_qq = curriculum[levelIdx_qq].chapters[chapterIdx_qq].quizzes.findIndex((q: Quiz) => q.id === quizId);
                        if (quizIdx_qq === -1) throw new Error(`Quiz ${quizId} not found`);
                        const path_qq = [levelIdx_qq.toString(), 'chapters', chapterIdx_qq.toString(), 'quizzes', quizIdx_qq.toString(), 'questions'];
                        ({ error: rpcError } = await supabase.rpc('delete_item', { p_path_to_parent_array: path_qq, p_item_id: questionId }));
                        break;
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
        
        // Return a simple success message instead of the heavy curriculum object.
        return res.status(200).json({ success: true });

    } catch (e: any) {
        console.error(`Erreur critique dans 'update-curriculum' pour l'action '${req.body.action}':`, e);
        return res.status(500).json({ error: e.message || "Une erreur interne est survenue." });
    }
}