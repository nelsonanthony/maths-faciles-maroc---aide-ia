

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import dataAccess from './_lib/data-access.js';
import { Level, Chapter, Series, Exercise, Quiz, QuizQuestion, DeletionInfo } from "../src/types.js";

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
                const index = curriculum.findIndex((l: Level) => l.id === levelData.id);
                if (index > -1) {
                    levelData.chapters = levelData.chapters || curriculum[index].chapters || [];
                    curriculum[index] = levelData;
                } else {
                    levelData.chapters = levelData.chapters || [];
                    curriculum.push(levelData);
                }
                break;
            }
            case 'ADD_OR_UPDATE_CHAPTER': {
                const { levelId, chapter } = payload as { levelId: string, chapter: Chapter };
                const level = curriculum.find((l: Level) => l.id === levelId);
                if (!level) throw new Error("Niveau non trouvé.");
                
                if (!Array.isArray(level.chapters)) level.chapters = [];
                
                const index = level.chapters.findIndex((c: Chapter) => c.id === chapter.id);
                if (index > -1) {
                     chapter.series = chapter.series || level.chapters[index].series || [];
                     chapter.quizzes = chapter.quizzes || level.chapters[index].quizzes || [];
                     level.chapters[index] = chapter;
                } else {
                    chapter.series = chapter.series || [];
                    chapter.quizzes = chapter.quizzes || [];
                    level.chapters.push(chapter);
                }
                break;
            }
             case 'ADD_OR_UPDATE_SERIES': {
                const { levelId, chapterId, series } = payload as { levelId: string, chapterId: string, series: Series };
                const level = curriculum.find((l: Level) => l.id === levelId);
                if (!level || !Array.isArray(level.chapters)) throw new Error(`Niveau non trouvé ou mal formé pour l'ID : ${levelId}`);
                
                const chapter = level.chapters.find((c: Chapter) => c.id === chapterId);
                if (!chapter) throw new Error(`Chapitre non trouvé pour l'ID : ${chapterId}`);

                if (!Array.isArray(chapter.series)) chapter.series = [];
                
                const seriesIndex = chapter.series.findIndex((s: Series) => s.id === series.id);
                if (seriesIndex > -1) {
                    series.exercises = series.exercises || chapter.series[seriesIndex].exercises || [];
                    chapter.series[seriesIndex] = series;
                } else {
                    series.exercises = series.exercises || [];
                    chapter.series.push(series);
                }
                break;
            }
            case 'ADD_OR_UPDATE_EXERCISE': {
                const { levelId, chapterId, seriesId, exercise } = payload as { levelId: string, chapterId: string, seriesId: string, exercise: Exercise };
                const level = curriculum.find((l: Level) => l.id === levelId);
                if (!level || !Array.isArray(level.chapters)) throw new Error(`Niveau non trouvé ou mal formé pour l'ID : ${levelId}`);
                
                const chapter = level.chapters.find((c: Chapter) => c.id === chapterId);
                if (!chapter || !Array.isArray(chapter.series)) throw new Error(`Chapitre non trouvé ou mal formé pour l'ID : ${chapterId}`);

                const series = chapter.series.find((s: Series) => s.id === seriesId);
                if (!series) throw new Error(`Série non trouvée pour l'ID : ${seriesId}`);
                
                if (!Array.isArray(series.exercises)) series.exercises = [];
                
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
                const level = curriculum.find((l: Level) => l.id === levelId);
                if (!level || !Array.isArray(level.chapters)) throw new Error(`Niveau non trouvé ou mal formé pour l'ID : ${levelId}`);
                
                const chapter = level.chapters.find((c: Chapter) => c.id === chapterId);
                if (!chapter) throw new Error("Chapitre non trouvé.");
                
                if (!Array.isArray(chapter.quizzes)) chapter.quizzes = [];
                
                const index = chapter.quizzes.findIndex((q: Quiz) => q.id === quiz.id);
                if (index > -1) {
                    quiz.questions = quiz.questions || chapter.quizzes[index].questions || [];
                    chapter.quizzes[index] = quiz;
                } else {
                    quiz.questions = quiz.questions || [];
                    chapter.quizzes.push(quiz);
                }
                break;
            }
            case 'ADD_OR_UPDATE_QUIZ_QUESTION': {
                const { levelId, chapterId, quizId, question } = payload as { levelId: string, chapterId: string, quizId: string, question: QuizQuestion };
                const level = curriculum.find((l: Level) => l.id === levelId);
                if (!level || !Array.isArray(level.chapters)) throw new Error(`Niveau non trouvé ou mal formé pour l'ID : ${levelId}`);
                
                const chapter = level.chapters.find((c: Chapter) => c.id === chapterId);
                if (!chapter || !Array.isArray(chapter.quizzes)) throw new Error(`Chapitre non trouvé ou mal formé pour l'ID : ${chapterId}`);

                const quiz = chapter.quizzes.find((q: Quiz) => q.id === quizId);
                if (!quiz) throw new Error("Quiz non trouvé.");
                
                if (!Array.isArray(quiz.questions)) quiz.questions = [];
                
                const index = quiz.questions.findIndex((q: QuizQuestion) => q.id === question.id);
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
                        curriculum = curriculum.filter((l: Level) => l.id !== levelId);
                        break;
                    case 'chapter':
                        const levelForChap = curriculum.find((l: Level) => l.id === levelId);
                        if (levelForChap?.chapters) {
                            levelForChap.chapters = levelForChap.chapters.filter((c: Chapter) => c.id !== chapterId);
                        }
                        break;
                    case 'series':
                        const chapForSeries = curriculum.find((l: Level) => l.id === levelId)?.chapters?.find((c: Chapter) => c.id === chapterId);
                        if (chapForSeries?.series) {
                            chapForSeries.series = chapForSeries.series.filter((s: Series) => s.id !== seriesId);
                        }
                        break;
                    case 'exercise':
                        const seriesForEx = curriculum.find((l: Level) => l.id === levelId)?.chapters?.find((c: Chapter) => c.id === chapterId)?.series?.find((s: Series) => s.id === seriesId);
                        if (seriesForEx?.exercises) {
                            seriesForEx.exercises = seriesForEx.exercises.filter((e: Exercise) => e.id !== exerciseId);
                        }
                        break;
                     case 'quiz':
                        const chapForQuiz = curriculum.find((l: Level) => l.id === levelId)?.chapters?.find((c: Chapter) => c.id === chapterId);
                        if (chapForQuiz?.quizzes) {
                            chapForQuiz.quizzes = chapForQuiz.quizzes.filter((q: Quiz) => q.id !== quizId);
                        }
                        break;
                    case 'quizQuestion':
                        const quizForQ = curriculum.find((l: Level) => l.id === levelId)?.chapters?.find((c: Chapter) => c.id === chapterId)?.quizzes?.find((q: Quiz) => q.id === quizId);
                        if (quizForQ?.questions) {
                            quizForQ.questions = quizForQ.questions.filter((qu: QuizQuestion) => qu.id !== questionId);
                        }
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
