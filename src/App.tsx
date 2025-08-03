

import React, { useState, useEffect, useCallback } from 'react';
import { addStyles } from 'react-mathquill';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Level, Chapter, Exercise, Quiz, Series, QuizQuestion, DeletionInfo, ModalState, View, CurriculumActionPayload, ExerciseContext } from '@/types';
import { SpinnerIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { getCurriculum } from '@/services/api';
import { getSupabase } from '@/services/authService';
import { MainContent } from '@/components/MainContent';
import { ModalManager } from '@/components/ModalManager';

const callUpdateApi = async (body: CurriculumActionPayload) => {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error("Vous devez être connecté pour effectuer cette action.");
    }

    const response = await fetch('/api/update-curriculum', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "La mise à jour a échoué.");
    }
    // The API now returns a lightweight success message, not the full curriculum
    return response.json(); 
};

export const App: React.FC = () => {
    const { user, isLoading: isAuthLoading } = useAuth();
    
    const [view, setView] = useState<View>('home');
    const [curriculum, setCurriculum] = useState<Level[] | null>(null);
    const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
    
    const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
    const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
    const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
    const [selectedExerciseContext, setSelectedExerciseContext] = useState<ExerciseContext | null>(null);

    const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
    const [videoNavigation, setVideoNavigation] = useState<{ videoId: string; time: number; } | null>(null);
    
    const [modal, setModal] = useState<ModalState | null>(null);

    useEffect(() => { addStyles(); }, []);

    const fetchInitialData = useCallback(async () => {
        setIsLoadingData(true);
        try {
            const data = await getCurriculum();
            setCurriculum(data);
        } catch (error) {
            console.error("❌ Erreur lors du chargement du programme :", error);
            setCurriculum(null);
        } finally {
            setIsLoadingData(false);
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    useEffect(() => {
        if (!isAuthLoading) {
            if (user) {
                if (['home', 'login', 'register', 'forgotPassword', 'resetPassword'].includes(view)) {
                     setView('dashboard');
                }
            } else {
                const protectedViews: View[] = ['dashboard', 'chat', 'courses', 'chapters', 'chapterHome', 'seriesList', 'exerciseList', 'exercise', 'quiz', 'tutor'];
                if (protectedViews.includes(view)) {
                    setView('home');
                }
            }
        }
    }, [user, isAuthLoading, view]);

    useEffect(() => {
        const supabase = getSupabase();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session?.access_token) {
                setPasswordResetToken(session.access_token);
                setView('resetPassword');
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const resetSelections = useCallback((level?: 'all' | 'level' | 'chapter' | 'series' | 'exercise') => {
        if (level === 'all') setSelectedLevelId(null);
        if (['all', 'level'].includes(level || '')) setSelectedChapterId(null);
        if (['all', 'level', 'chapter'].includes(level || '')) setSelectedSeriesId(null);
        if (['all', 'level', 'chapter', 'series'].includes(level || '')) {
            setSelectedExerciseId(null);
            setSelectedQuizId(null);
            setSelectedExerciseContext(null);
        }
        if (videoNavigation) setVideoNavigation(null);
    }, [videoNavigation]);

    // --- NAVIGATION ---
    const handleNavigate = (targetView: View) => setView(targetView);
    const handleBackToDefault = () => { resetSelections('all'); setView(user ? 'dashboard' : 'home'); };
    const handleSelectLevel = (levelId: string) => { setSelectedLevelId(levelId); resetSelections('level'); setView('chapters'); };
    const handleSelectChapter = (chapterId: string) => { setSelectedChapterId(chapterId); resetSelections('chapter'); setView('chapterHome'); };
    const handleSelectSeriesList = () => setView('seriesList');
    const handleSelectSeries = (seriesId: string) => { setSelectedSeriesId(seriesId); resetSelections('series'); setView('exerciseList'); };
    const handleSelectExercise = (exerciseId: string) => { setSelectedExerciseId(exerciseId); setView('exercise'); };
    const handleSelectQuiz = (quizId: string) => { setSelectedQuizId(quizId); setView('quiz'); };
    const handleNavigateToChat = (context: ExerciseContext) => { setSelectedExerciseContext(context); setView('chat'); };
    const handleNavigateToTutor = (context: ExerciseContext) => { setSelectedExerciseContext(context); setView('tutor'); };
    const handleNavigateToTimestamp = (levelId: string, chapterId: string, videoId: string, time: number) => {
        setSelectedLevelId(levelId);
        setSelectedChapterId(chapterId);
        setVideoNavigation({ videoId, time });
        setView('chapterHome');
    };

    // --- MODAL & CRUD OPERATIONS ---
    const openModal = (modalState: ModalState) => setModal(modalState);
    const closeModal = () => setModal(null);
    
    const handleCRUDError = (error: unknown, operation: string) => {
        console.error(`${operation} a échoué, restauration de l'état.`, error);
        alert(`La sauvegarde a échoué (${operation}). Vos modifications ont été annulées.\nErreur: ${error instanceof Error ? error.message : String(error)}`);
    };

    const handleAddOrUpdateLevel = async (levelData: Level) => {
        const originalCurriculum = curriculum;
        
        const optimisticCurriculum = (() => {
            if (!originalCurriculum) return [levelData];
            const index = originalCurriculum.findIndex(l => l.id === levelData.id);
            if (index > -1) {
                const newState = [...originalCurriculum];
                newState[index] = { ...newState[index], ...levelData };
                return newState;
            }
            return [...originalCurriculum, levelData];
        })();
        
        setCurriculum(optimisticCurriculum);
        closeModal();

        try {
            await callUpdateApi({ action: 'ADD_OR_UPDATE_LEVEL', payload: { level: levelData } });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'niveau');
            setCurriculum(originalCurriculum);
        }
    };

    const handleAddOrUpdateChapter = async (chapterData: Chapter) => {
        if (!selectedLevelId) return;

        const originalCurriculum = curriculum;
        const optimisticCurriculum = originalCurriculum?.map(level => {
            if (level.id !== selectedLevelId) return level;
            const chapters = level.chapters || [];
            const chapterIndex = chapters.findIndex(c => c.id === chapterData.id);
            const newChapters = [...chapters];
            if (chapterIndex > -1) {
                newChapters[chapterIndex] = { ...newChapters[chapterIndex], ...chapterData };
            } else {
                newChapters.push({ quizzes: [], series: [], videoLinks: [], ...chapterData });
            }
            return { ...level, chapters: newChapters };
        }) || null;

        setCurriculum(optimisticCurriculum);
        closeModal();

        try {
            await callUpdateApi({ action: 'ADD_OR_UPDATE_CHAPTER', payload: { levelId: selectedLevelId, chapter: chapterData } });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'chapitre');
            setCurriculum(originalCurriculum);
        }
    };

    const handleAddOrUpdateSeries = async (seriesData: Series, chapterId: string) => {
        if (!selectedLevelId) return;

        const originalCurriculum = curriculum;
        const optimisticCurriculum = originalCurriculum?.map(level => {
            if (level.id !== selectedLevelId) return level;
            const newChaps = level.chapters.map(c => {
                if (c.id !== chapterId) return c;
                const series = c.series || [];
                const seriesIndex = series.findIndex(s => s.id === seriesData.id);
                const newSeriesArr = [...series];
                if (seriesIndex > -1) {
                    newSeriesArr[seriesIndex] = { ...newSeriesArr[seriesIndex], ...seriesData };
                } else {
                    newSeriesArr.push({ exercises: [], ...seriesData });
                }
                return { ...c, series: newSeriesArr };
            });
            return { ...level, chapters: newChaps };
        }) || null;

        setCurriculum(optimisticCurriculum);
        closeModal();

        try {
            await callUpdateApi({ action: 'ADD_OR_UPDATE_SERIES', payload: { levelId: selectedLevelId, chapterId, series: seriesData } });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'série');
            setCurriculum(originalCurriculum);
        }
    };

    const handleAddOrUpdateExercise = async (exerciseData: Exercise, seriesId: string) => {
        if (!selectedLevelId || !selectedChapterId) return;

        const originalCurriculum = curriculum;
        const optimisticCurriculum = originalCurriculum?.map(l => {
            if (l.id !== selectedLevelId) return l;
            const newChaps = l.chapters.map(c => {
                if (c.id !== selectedChapterId) return c;
                const newSeriesArr = c.series.map(s => {
                    if (s.id !== seriesId) return s;
                    const exercises = s.exercises || [];
                    const exIndex = exercises.findIndex(e => e.id === exerciseData.id);
                    const newExArr = [...exercises];
                    if (exIndex > -1) {
                        newExArr[exIndex] = exerciseData;
                    } else {
                        newExArr.push(exerciseData);
                    }
                    return { ...s, exercises: newExArr };
                });
                return { ...c, series: newSeriesArr };
            });
            return { ...l, chapters: newChaps };
        }) || null;

        setCurriculum(optimisticCurriculum);
        closeModal();

        try {
            await callUpdateApi({ action: 'ADD_OR_UPDATE_EXERCISE', payload: { levelId: selectedLevelId, chapterId: selectedChapterId, seriesId, exercise: exerciseData } });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'exercice');
            setCurriculum(originalCurriculum);
        }
    };

    const handleAddOrUpdateQuiz = async (quizData: Quiz, chapterId: string) => {
        if (!selectedLevelId) return;

        const originalCurriculum = curriculum;
        const optimisticCurriculum = originalCurriculum?.map(level => {
            if (level.id !== selectedLevelId) return level;
            const newChaps = level.chapters.map(c => {
                if (c.id !== chapterId) return c;
                const quizzes = c.quizzes || [];
                const quizIndex = quizzes.findIndex(q => q.id === quizData.id);
                const newQuizzesArr = [...quizzes];
                if (quizIndex > -1) {
                    newQuizzesArr[quizIndex] = { ...newQuizzesArr[quizIndex], ...quizData };
                } else {
                    newQuizzesArr.push({ questions: [], ...quizData });
                }
                return { ...c, quizzes: newQuizzesArr };
            });
            return { ...level, chapters: newChaps };
        }) || null;
        
        setCurriculum(optimisticCurriculum);
        closeModal();

        try {
            await callUpdateApi({ action: 'ADD_OR_UPDATE_QUIZ', payload: { levelId: selectedLevelId, chapterId, quiz: quizData } });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'quiz');
            setCurriculum(originalCurriculum);
            closeModal();
        }
    };

    const handleAddOrUpdateQuizQuestion = async (questionData: QuizQuestion, quizId: string, chapterId: string) => {
        if (!selectedLevelId) return;

        const originalCurriculum = curriculum;
        let optimisticQuiz: Quiz | undefined;
        const optimisticCurriculum = originalCurriculum?.map(l => {
            if (l.id !== selectedLevelId) return l;
            const newChaps = l.chapters.map(c => {
                if (c.id !== chapterId) return c;
                const newQuizzesArr = c.quizzes.map(q => {
                    if (q.id !== quizId) return q;
                    const questions = q.questions || [];
                    const qIndex = questions.findIndex(qu => qu.id === questionData.id);
                    const newQArr = [...questions];
                    if (qIndex > -1) newQArr[qIndex] = questionData;
                    else newQArr.push(questionData);
                    const newQuizData = { ...q, questions: newQArr };
                    optimisticQuiz = newQuizData;
                    return newQuizData;
                });
                return { ...c, quizzes: newQuizzesArr };
            });
            return { ...l, chapters: newChaps };
        }) || null;

        setCurriculum(optimisticCurriculum);
        closeModal();
        if (optimisticQuiz) {
            openModal({ type: 'editQuiz', payload: { quiz: optimisticQuiz, chapterId } });
        }

        try {
            await callUpdateApi({ action: 'ADD_OR_UPDATE_QUIZ_QUESTION', payload: { levelId: selectedLevelId, chapterId, quizId, question: questionData } });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'question de quiz');
            setCurriculum(originalCurriculum);
            closeModal();
        }
    };

    const handleConfirmDelete = async () => {
        if (!modal || modal.type !== 'delete') return;

        const { payload: delInfo } = modal;
        const { type, ids } = delInfo;
        const originalCurriculum = curriculum;

        const optimisticCurriculum = (() => {
            if (!originalCurriculum) return null;
            let newCurriculum = [...originalCurriculum];
            switch (type) {
                case 'level': return newCurriculum.filter(l => l.id !== ids.levelId);
                case 'chapter': return newCurriculum.map(l => l.id !== ids.levelId ? l : { ...l, chapters: l.chapters.filter(c => c.id !== ids.chapterId) });
                case 'series': return newCurriculum.map(l => l.id !== ids.levelId ? l : { ...l, chapters: l.chapters.map(c => c.id !== ids.chapterId ? c : { ...c, series: c.series.filter(s => s.id !== ids.seriesId) }) });
                case 'exercise': return newCurriculum.map(l => l.id !== ids.levelId ? l : { ...l, chapters: l.chapters.map(c => c.id !== ids.chapterId ? c : { ...c, series: c.series.map(s => s.id !== ids.seriesId ? s : { ...s, exercises: s.exercises.filter(e => e.id !== ids.exerciseId) }) }) });
                case 'quiz': return newCurriculum.map(l => l.id !== ids.levelId ? l : { ...l, chapters: l.chapters.map(c => c.id !== ids.chapterId ? c : { ...c, quizzes: c.quizzes.filter(q => q.id !== ids.quizId) }) });
                case 'quizQuestion': return newCurriculum.map(l => l.id !== ids.levelId ? l : { ...l, chapters: l.chapters.map(c => c.id !== ids.chapterId ? c : { ...c, quizzes: c.quizzes.map(q => q.id !== ids.quizId ? q : { ...q, questions: q.questions.filter(qu => qu.id !== ids.questionId) }) }) });
                default: return originalCurriculum;
            }
        })();
        
        setCurriculum(optimisticCurriculum);
        closeModal();

        if (type === 'quizQuestion' && ids.levelId && ids.chapterId && ids.quizId) {
            const updatedQuiz = optimisticCurriculum?.find(l => l.id === ids.levelId)?.chapters.find(c => c.id === ids.chapterId)?.quizzes.find(q => q.id === ids.quizId);
            if (updatedQuiz) openModal({ type: 'editQuiz', payload: { quiz: updatedQuiz, chapterId: ids.chapterId } });
        }

        try {
            await callUpdateApi({ action: 'DELETE_ITEM', payload: delInfo });
            await fetchInitialData(); // Re-sync with database
        } catch (error) {
            handleCRUDError(error, 'suppression');
            setCurriculum(originalCurriculum);
            if (type === 'quizQuestion') closeModal(); // Close the re-opened quiz modal on failure
        }
    };
    

    if (isLoadingData || isAuthLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <SpinnerIcon className="w-12 h-12 animate-spin text-brand-blue-500 mx-auto" />
                    <p className="mt-4 text-lg text-slate-400">Chargement du programme...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col min-h-screen font-sans bg-slate-950 text-slate-300">
            <Header onNavigate={handleNavigate} />
            <main className="flex-grow container mx-auto px-4 py-8">
                {curriculum ? (
                    <MainContent
                        view={view} user={user} curriculum={curriculum} passwordResetToken={passwordResetToken}
                        selectedLevelId={selectedLevelId} selectedChapterId={selectedChapterId} selectedSeriesId={selectedSeriesId}
                        selectedExerciseId={selectedExerciseId} selectedQuizId={selectedQuizId} selectedExerciseContext={selectedExerciseContext}
                        videoNavigation={videoNavigation} onNavigate={handleNavigate} onSelectLevel={handleSelectLevel}
                        onSelectChapter={handleSelectChapter} onSelectSeries={handleSelectSeries} onSelectSeriesList={handleSelectSeriesList}
                        onSelectExercise={handleSelectExercise} onSelectQuiz={handleSelectQuiz} onNavigateToChat={handleNavigateToChat}
                        onNavigateToTutor={handleNavigateToTutor} onNavigateToTimestamp={handleNavigateToTimestamp}
                        onBackToDefault={handleBackToDefault} resetSelections={resetSelections} openModal={openModal}
                    />
                ) : (
                    <div className="text-center text-red-400">
                        <p>Impossible de charger le contenu pédagogique. Veuillez réessayer plus tard.</p>
                        <button onClick={fetchInitialData} className="mt-4 px-4 py-2 bg-brand-blue-600 text-white rounded-lg">Réessayer</button>
                    </div>
                )}
            </main>
            <Footer />
            <ModalManager
                modal={modal} levelId={selectedLevelId} onClose={closeModal} openModal={openModal}
                onSaveLevel={handleAddOrUpdateLevel} onSaveChapter={handleAddOrUpdateChapter} onSaveSeries={handleAddOrUpdateSeries}
                onSaveExercise={handleAddOrUpdateExercise} onSaveQuiz={handleAddOrUpdateQuiz} onSaveQuizQuestion={handleAddOrUpdateQuizQuestion}
                onConfirmDelete={handleConfirmDelete}
            />
        </div>
    );
};

export default App;