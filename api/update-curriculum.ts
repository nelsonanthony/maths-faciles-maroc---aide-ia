

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Level, Chapter, Series, Exercise, Quiz, QuizQuestion, DeletionInfo } from "../src/types.js";
import dataAccess from "./_lib/data-access.js";

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

        let curriculum = await dataAccess.getCurriculumFromSupabase();

        switch (action) {
            case 'ADD_OR_UPDATE_LEVEL': {
                const levelData = payload.level as Level;
                const index = curriculum.findIndex(l => l.id === levelData.id);
                if (index > -1) {
                    curriculum[index] = { ...curriculum[index], ...levelData };
                } else {
                    curriculum.push(levelData);
                }
                break;
            }
            case 'ADD_OR_UPDATE_CHAPTER': {
                const { levelId, chapter: chapterData } = payload as { levelId: string, chapter: Chapter };
                const level = curriculum.find(l => l.id === levelId);
                if (!level) throw new Error(`Niveau ${levelId} non trouvé.`);
                const index = level.chapters.findIndex(c => c.id === chapterData.id);
                if (index > -1) {
                    level.chapters[index] = { ...level.chapters[index], ...chapterData };
                } else {
                    level.chapters.push(chapterData);
                }
                break;
            }
             case 'ADD_OR_UPDATE_SERIES': {
                const { levelId, chapterId, series: seriesData } = payload as { levelId: string, chapterId: string, series: Series };
                const chapter = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId);
                if (!chapter) throw new Error(`Chapitre ${chapterId} non trouvé.`);
                const index = chapter.series.findIndex(s => s.id === seriesData.id);
                if (index > -1) {
                    chapter.series[index] = { ...chapter.series[index], ...seriesData };
                } else {
                    chapter.series.push(seriesData);
                }
                break;
            }
             case 'ADD_OR_UPDATE_EXERCISE': {
                const { levelId, chapterId, seriesId, exercise } = payload as { levelId: string, chapterId: string, seriesId: string, exercise: Exercise };
                const series = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId)?.series.find(s => s.id === seriesId);
                if (!series) throw new Error(`Série ${seriesId} non trouvée.`);
                const index = series.exercises.findIndex(e => e.id === exercise.id);
                if (index > -1) {
                    series.exercises[index] = exercise;
                } else {
                    series.exercises.push(exercise);
                }
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ': {
                const { levelId, chapterId, quiz: quizData } = payload as { levelId: string, chapterId: string, quiz: Quiz };
                const chapter = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId);
                if (!chapter) throw new Error(`Chapitre ${chapterId} non trouvé.`);
                if (!chapter.quizzes) { // Defensive check
                    chapter.quizzes = [];
                }
                const index = chapter.quizzes.findIndex(q => q.id === quizData.id);
                if (index > -1) {
                    chapter.quizzes[index] = { ...chapter.quizzes[index], ...quizData };
                } else {
                    chapter.quizzes.push(quizData);
                }
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ_QUESTION': {
                const { levelId, chapterId, quizId, question } = payload as { levelId: string, chapterId: string, quizId: string, question: QuizQuestion };
                const quiz = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId)?.quizzes.find(q => q.id === quizId);
                if (!quiz) throw new Error(`Quiz ${quizId} non trouvé.`);
                if (!quiz.questions) { // Defensive check to prevent crash
                    quiz.questions = [];
                }
                const index = quiz.questions.findIndex(q => q.id === question.id);
                if (index > -1) {
                    quiz.questions[index] = question;
                } else {
                    quiz.questions.push(question);
                }
                break;
            }
            case 'DELETE_ITEM': {
                const { type, ids } = payload as DeletionInfo;
                const { levelId, chapterId, seriesId, exerciseId, quizId, questionId } = ids;
                
                switch(type) {
                    case 'level':
                        curriculum = curriculum.filter(l => l.id !== levelId);
                        break;
                    case 'chapter':
                        curriculum.find(l => l.id === levelId)!.chapters = curriculum.find(l => l.id === levelId)!.chapters.filter(c => c.id !== chapterId);
                        break;
                    case 'series': 
                        const chapterForSeries = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId);
                        if(chapterForSeries) chapterForSeries.series = chapterForSeries.series.filter(s => s.id !== seriesId);
                        break;
                    case 'exercise':
                        const seriesForEx = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId)?.series.find(s => s.id === seriesId);
                        if(seriesForEx) seriesForEx.exercises = seriesForEx.exercises.filter(e => e.id !== exerciseId);
                        break;
                    case 'quiz':
                         const chapterForQuiz = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId);
                         if(chapterForQuiz) chapterForQuiz.quizzes = chapterForQuiz.quizzes.filter(q => q.id !== quizId);
                        break;
                    case 'quizQuestion':
                        const quizForQuestion = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId)?.quizzes.find(q => q.id === quizId);
                        if(quizForQuestion) quizForQuestion.questions = quizForQuestion.questions.filter(qu => qu.id !== questionId);
                        break;
                }
                break;
            }
            default:
                return res.status(400).json({ error: `Action inconnue: ${action}` });
        }
        
        // Save the entire updated curriculum back to the database
        const { error: updateError } = await (supabase
            .from('curriculum') as any)
            .update({ data: curriculum })
            .eq('id', 1);

        if (updateError) {
            throw new Error(`Échec de la sauvegarde dans la base de données : ${updateError.message}`);
        }
        
        dataAccess.invalidateCache();

        return res.status(200).json({ success: true, message: "Curriculum mis à jour avec succès." });

    } catch (e: any) {
        console.error(`Erreur critique dans 'update-curriculum' pour l'action '${req.body.action}':`, e);
        return res.status(500).json({ error: e.message || "Une erreur interne est survenue." });
    }
}