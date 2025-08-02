
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import dataAccess from './_lib/data-access';
import { Level, Chapter, Series, Exercise, Quiz, QuizQuestion, DeletionInfo } from "../src/types";

// This function runs on Vercel's servers (Node.js environment)
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!supabaseUrl || !supabaseServiceKey || !adminEmail) {
        return res.status(500).json({ error: "La configuration du serveur est incomplète. Veuillez vérifier les variables d'environnement." });
    }

    try {
        // --- User Authentication & Authorization ---
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'L\'authentification est requise.' });
        }
        const token = authHeader.split(' ')[1];
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Jeton d\'authentification invalide ou expiré.' });
        }
        
        // --- Authorization Check ---
        if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
            return res.status(403).json({ error: 'Accès refusé. Seul un administrateur peut effectuer cette action.' });
        }

        const { action, payload } = req.body;
        if (!action || !payload) {
            return res.status(400).json({ error: "L'action et le payload sont requis." });
        }
        
        let curriculum: Level[] = await dataAccess.getCurriculumFromSupabase();

        switch (action) {
            case 'ADD_OR_UPDATE_LEVEL': {
                const levelData = payload.level as Level;
                const index = curriculum.findIndex(l => l.id === levelData.id);
                if (index > -1) curriculum[index] = levelData;
                else curriculum.push(levelData);
                break;
            }
            case 'ADD_OR_UPDATE_CHAPTER': {
                const { levelId, chapter } = payload as { levelId: string, chapter: Chapter };
                const level = curriculum.find(l => l.id === levelId);
                if (!level) throw new Error("Niveau non trouvé.");
                if (!level.chapters) level.chapters = [];
                const index = level.chapters.findIndex((c: Chapter) => c.id === chapter.id);
                if (index > -1) level.chapters[index] = chapter;
                else level.chapters.push(chapter);
                break;
            }
             case 'ADD_OR_UPDATE_SERIES': {
                const { levelId, chapterId, series } = payload as { levelId: string, chapterId: string, series: Series };
                const level = curriculum.find(l => l.id === levelId);
                if (!level) throw new Error(`Niveau non trouvé pour l'ID : ${levelId}`);
                
                const chapter = level.chapters?.find(c => c.id === chapterId);
                if (!chapter) throw new Error(`Chapitre non trouvé pour l'ID : ${chapterId}`);

                if (!chapter.series) {
                    chapter.series = [];
                }
                
                const seriesIndex = chapter.series.findIndex((s: Series) => s.id === series.id);
                if (seriesIndex > -1) {
                    chapter.series[seriesIndex] = series;
                } else {
                    chapter.series.push(series);
                }
                break;
            }
            case 'ADD_OR_UPDATE_EXERCISE': {
                const { levelId, chapterId, seriesId, exercise } = payload as { levelId: string, chapterId: string, seriesId: string, exercise: Exercise };
                const level = curriculum.find(l => l.id === levelId);
                if (!level) throw new Error(`Niveau non trouvé pour l'ID : ${levelId}`);
                
                const chapter = level.chapters?.find(c => c.id === chapterId);
                if (!chapter) throw new Error(`Chapitre non trouvé pour l'ID : ${chapterId}`);

                const series = chapter.series?.find(s => s.id === seriesId);
                if (!series) throw new Error(`Série non trouvée pour l'ID : ${seriesId}`);
                
                if (!series.exercises) {
                    series.exercises = [];
                }
                
                const exerciseIndex = series.exercises.findIndex((e: Exercise) => e.id === exercise.id);
                if (exerciseIndex > -1) {
                    series.exercises[exerciseIndex] = exercise;
                } else {
                    series.exercises.push(exercise);
                }
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ': {
                const { levelId, chapterId, quiz } = payload as { levelId: string, chapterId: string, quiz: Quiz };
                const chapter = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId);
                if (!chapter) throw new Error("Chapitre non trouvé.");
                if (!chapter.quizzes) chapter.quizzes = [];
                const index = chapter.quizzes.findIndex((q: Quiz) => q.id === quiz.id);
                if (index > -1) chapter.quizzes[index] = quiz;
                else chapter.quizzes.push(quiz);
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ_QUESTION': {
                const { levelId, chapterId, quizId, question } = payload as { levelId: string, chapterId: string, quizId: string, question: QuizQuestion };
                const quiz = curriculum.find(l => l.id === levelId)?.chapters.find(c => c.id === chapterId)?.quizzes.find(q => q.id === quizId);
                if (!quiz) throw new Error("Quiz non trouvé.");
                if (!quiz.questions) quiz.questions = [];
                const index = quiz.questions.findIndex((q: QuizQuestion) => q.id === question.id);
                if (index > -1) quiz.questions[index] = question;
                else quiz.questions.push(question);
                break;
            }
            case 'DELETE_ITEM': {
                const { type, ids } = payload as DeletionInfo;
                switch(type) {
                    case 'level':
                        curriculum = curriculum.filter(l => l.id !== ids.levelId);
                        break;
                    case 'chapter':
                        curriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.filter((c: Chapter) => c.id !== ids.chapterId) } : l);
                        break;
                    case 'series':
                         curriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map((c: Chapter) => c.id === ids.chapterId ? { ...c, series: c.series.filter((s: Series) => s.id !== ids.seriesId) } : c) } : l);
                        break;
                    case 'exercise':
                        curriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map((c: Chapter) => c.id === ids.chapterId ? { ...c, series: c.series.map((s: Series) => s.id === ids.seriesId ? { ...s, exercises: s.exercises.filter((e: Exercise) => e.id !== ids.exerciseId) } : s) } : c) } : l);
                        break;
                     case 'quiz':
                        curriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map((c: Chapter) => c.id === ids.chapterId ? { ...c, quizzes: c.quizzes.filter((q: Quiz) => q.id !== ids.quizId) } : c) } : l);
                        break;
                    case 'quizQuestion':
                        curriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map((c: Chapter) => c.id === ids.chapterId ? { ...c, quizzes: c.quizzes.map((q: Quiz) => q.id === ids.quizId ? { ...q, questions: q.questions.filter((qu: QuizQuestion) => qu.id !== ids.questionId) } : q) } : c) } : l);
                        break;
                }
                break;
            }
            default:
                return res.status(400).json({ error: `Action inconnue: ${action}` });
        }
        
        await dataAccess.saveCurriculumToSupabase(curriculum);
        
        return res.status(200).json({ success: true, curriculum });

    } catch (e: any) {
        console.error("Erreur critique dans la fonction 'update-curriculum':", e);
        return res.status(500).json({ error: e.message || "Une erreur interne est survenue." });
    }
}
