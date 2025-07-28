
import React, { useState, useEffect, useCallback } from 'react';
import { addStyles } from 'react-mathquill';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Level, Chapter, Exercise, Quiz, Series, QuizQuestion, ExerciseContext, DeletionInfo, ModalState, View } from '@/types';
import { SpinnerIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { getCurriculum, saveCurriculum } from '@/services/api';
import { getSupabase } from '@/services/authService';
import { MainContent } from '@/components/MainContent';
import { ModalManager } from '@/components/ModalManager';


export const App: React.FC = () => {
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    
    const [view, setView] = useState<View>('home');
    const [curriculum, setCurriculum] = useState<Level[] | null>(null);
    const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    
    const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
    const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
    const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
    const [selectedExerciseContext, setSelectedExerciseContext] = useState<ExerciseContext | null>(null);

    const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
    const [videoNavigation, setVideoNavigation] = useState<{ videoId: string; time: number; } | null>(null);
    
    // Centralized modal state
    const [modal, setModal] = useState<ModalState | null>(null);

    // Inject MathQuill styles once when the app loads
    useEffect(() => {
        addStyles();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
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
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (!isAuthLoading) {
            if (user) {
                // If user is logged in and on a public-only page, redirect to dashboard.
                if (['home', 'login', 'register', 'forgotPassword', 'resetPassword'].includes(view)) {
                     setView('dashboard');
                }
            } else {
                // If user is not logged in and on a protected page, redirect to home.
                const protectedViews: View[] = ['dashboard', 'chat', 'courses', 'chapters', 'chapterHome', 'seriesList', 'exerciseList', 'exercise', 'quiz'];
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

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const resetSelections = useCallback((level?: 'all' | 'level' | 'chapter' | 'series' | 'exercise') => {
        if (level === 'all') {
            setSelectedLevelId(null);
        }
        if (['all', 'level'].includes(level || '')) {
            setSelectedChapterId(null);
        }
        if (['all', 'level', 'chapter'].includes(level || '')) {
            setSelectedSeriesId(null);
        }
        if (['all', 'level', 'chapter', 'series'].includes(level || '')) {
            setSelectedExerciseId(null);
            setSelectedQuizId(null);
            setSelectedExerciseContext(null);
        }
         if (videoNavigation) {
            setVideoNavigation(null);
        }
    }, [videoNavigation]);

    // --- NAVIGATION ---
    const handleNavigate = (targetView: View) => setView(targetView);
    
    const handleBackToDefault = () => {
        resetSelections('all');
        setView(user ? 'dashboard' : 'home');
    };

    const handleSelectLevel = (levelId: string) => {
        setSelectedLevelId(levelId);
        resetSelections('level');
        setView('chapters');
    };
    
    const handleSelectChapter = (chapterId: string) => {
        setSelectedChapterId(chapterId);
        resetSelections('chapter');
        setView('chapterHome');
    };

    const handleSelectSeriesList = () => {
        setView('seriesList');
    };
    
    const handleSelectSeries = (seriesId: string) => {
        setSelectedSeriesId(seriesId);
        resetSelections('series');
        setView('exerciseList');
    };
    
    const handleSelectExercise = (exerciseId: string) => {
        setSelectedExerciseId(exerciseId);
        setView('exercise');
    };

    const handleSelectQuiz = (quizId: string) => {
        setSelectedQuizId(quizId);
        setView('quiz');
    };

    const handleNavigateToChat = (context: ExerciseContext) => {
        setSelectedExerciseContext(context);
        setView('chat');
    };

    const handleNavigateToTimestamp = (levelId: string, chapterId: string, videoId: string, time: number) => {
        setSelectedLevelId(levelId);
        setSelectedChapterId(chapterId);
        setVideoNavigation({ videoId, time });
        setView('chapterHome');
    };

    // --- MODAL & CRUD OPERATIONS ---
    const openModal = (modalState: ModalState) => setModal(modalState);
    const closeModal = () => setModal(null);

    const handleSaveChanges = async () => {
        if (!isAdmin || !curriculum) return;
        
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            await saveCurriculum(curriculum);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000); // Hide message after 3 seconds
        } catch (error) {
            console.error("Save failed:", error);
            const errorMessage = error instanceof Error ? error.message : "Une erreur inconnue est survenue.";
            alert(`Erreur lors de la sauvegarde : ${errorMessage}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddOrUpdateLevel = (levelData: Level) => {
        if (!curriculum) return;
        const levelExists = curriculum.some(l => l.id === levelData.id);
        let newCurriculum;
        if (levelExists) {
            newCurriculum = curriculum.map(l => l.id === levelData.id ? levelData : l);
        } else {
            newCurriculum = [...curriculum, levelData];
        }
        setCurriculum(newCurriculum);
        closeModal();
    };

    const handleAddOrUpdateChapter = (chapterData: Chapter) => {
        if (!curriculum || !selectedLevelId) return;
        const newCurriculum = curriculum.map(level => {
            if (level.id === selectedLevelId) {
                const chapterExists = level.chapters.some(c => c.id === chapterData.id);
                const newChapters = chapterExists
                    ? level.chapters.map(c => c.id === chapterData.id ? chapterData : c)
                    : [...level.chapters, chapterData];
                return { ...level, chapters: newChapters };
            }
            return level;
        });
        setCurriculum(newCurriculum);
        closeModal();
    };

    const handleAddOrUpdateSeries = (seriesData: Series, chapterId: string) => {
        if (!curriculum || !selectedLevelId) return;
        const newCurriculum = curriculum.map(level => {
            if (level.id === selectedLevelId) {
                const newChapters = level.chapters.map(chapter => {
                    if (chapter.id === chapterId) {
                        const seriesExists = chapter.series.some(s => s.id === seriesData.id);
                        const newSeries = seriesExists
                            ? chapter.series.map(s => s.id === seriesData.id ? seriesData : s)
                            : [...chapter.series, seriesData];
                        return { ...chapter, series: newSeries };
                    }
                    return chapter;
                });
                return { ...level, chapters: newChapters };
            }
            return level;
        });
        setCurriculum(newCurriculum);
        closeModal();
    };
    
    const handleAddOrUpdateExercise = (exerciseData: Exercise, seriesId: string) => {
        if (!curriculum || !selectedLevelId || !selectedChapterId) return;
        const newCurriculum = curriculum.map(level => {
            if (level.id === selectedLevelId) {
                const newChapters = level.chapters.map(chapter => {
                    if (chapter.id === selectedChapterId) {
                        const newSeries = chapter.series.map(series => {
                            if (series.id === seriesId) {
                                const exerciseExists = series.exercises.some(e => e.id === exerciseData.id);
                                const newExercises = exerciseExists
                                    ? series.exercises.map(e => e.id === exerciseData.id ? exerciseData : e)
                                    : [...series.exercises, exerciseData];
                                return { ...series, exercises: newExercises };
                            }
                            return series;
                        });
                        return { ...chapter, series: newSeries };
                    }
                    return chapter;
                });
                return { ...level, chapters: newChapters };
            }
            return level;
        });
        setCurriculum(newCurriculum);
        closeModal();
    };
    
    const handleAddOrUpdateQuiz = (quizData: Quiz, chapterId: string) => {
        if (!curriculum || !selectedLevelId) return;
        const newCurriculum = curriculum.map(level => {
            if (level.id === selectedLevelId) {
                const newChapters = level.chapters.map(chapter => {
                    if (chapter.id === chapterId) {
                        const quizExists = chapter.quizzes.some(q => q.id === quizData.id);
                        const newQuizzes = quizExists
                            ? chapter.quizzes.map(q => q.id === quizData.id ? quizData : q)
                            : [...chapter.quizzes, quizData];
                        return { ...chapter, quizzes: newQuizzes };
                    }
                    return chapter;
                });
                return { ...level, chapters: newChapters };
            }
            return level;
        });
        setCurriculum(newCurriculum);
        // If creating, we stay in the quiz modal to add questions.
        if (modal?.type === 'editQuiz' && modal.payload.quiz?.id === quizData.id) {
             // Re-open the modal with the updated quiz data
            openModal({ type: 'editQuiz', payload: { quiz: quizData, chapterId } });
        } else {
            closeModal();
        }
    };
    
    const handleAddOrUpdateQuizQuestion = (questionData: QuizQuestion, quizId: string, chapterId: string) => {
        if (!curriculum || !selectedLevelId) return;
        const newCurriculum = curriculum.map(level => {
            if (level.id === selectedLevelId) {
                const newChapters = level.chapters.map(chapter => {
                    if (chapter.id === chapterId) {
                        const newQuizzes = chapter.quizzes.map(quiz => {
                            if (quiz.id === quizId) {
                                const questionExists = quiz.questions.some(q => q.id === questionData.id);
                                const newQuestions = questionExists
                                    ? quiz.questions.map(q => q.id === questionData.id ? questionData : q)
                                    : [...quiz.questions, questionData];
                                return { ...quiz, questions: newQuestions };
                            }
                            return quiz;
                        });
                        return { ...chapter, quizzes: newQuizzes };
                    }
                    return chapter;
                });
                return { ...level, chapters: newChapters };
            }
            return level;
        });
        setCurriculum(newCurriculum);
        closeModal();
         // Re-open parent quiz modal
        const updatedQuiz = newCurriculum.find(l => l.id === selectedLevelId)?.chapters.find(c => c.id === chapterId)?.quizzes.find(q => q.id === quizId);
        if (updatedQuiz) {
             openModal({ type: 'editQuiz', payload: { quiz: updatedQuiz, chapterId } });
        }
    };

    const handleConfirmDelete = () => {
        if (!modal || modal.type !== 'delete' || !curriculum) return;
    
        const { type, ids } = modal.payload;
        let newCurriculum = [...curriculum];
    
        if (type === 'level') {
            newCurriculum = curriculum.filter(l => l.id !== ids.levelId);
        } else if (type === 'chapter' && ids.chapterId) {
            newCurriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.filter(c => c.id !== ids.chapterId) } : l);
        } else if (type === 'series' && ids.chapterId && ids.seriesId) {
            newCurriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map(c => c.id === ids.chapterId ? { ...c, series: c.series.filter(s => s.id !== ids.seriesId) } : c) } : l);
        } else if (type === 'exercise' && ids.chapterId && ids.seriesId && ids.exerciseId) {
            newCurriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map(c => c.id === ids.chapterId ? { ...c, series: c.series.map(s => s.id === ids.seriesId ? { ...s, exercises: s.exercises.filter(e => e.id !== ids.exerciseId) } : s) } : c) } : l);
        } else if (type === 'quiz' && ids.chapterId && ids.quizId) {
             newCurriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map(c => c.id === ids.chapterId ? { ...c, quizzes: c.quizzes.filter(q => q.id !== ids.quizId) } : c) } : l);
        } else if (type === 'quizQuestion' && ids.chapterId && ids.quizId && ids.questionId) {
            newCurriculum = curriculum.map(l => l.id === ids.levelId ? { ...l, chapters: l.chapters.map(c => c.id === ids.chapterId ? { ...c, quizzes: c.quizzes.map(q => q.id === ids.quizId ? { ...q, questions: q.questions.filter(qu => qu.id !== ids.questionId) } : q) } : c) } : l);
             // After deleting a question, re-open the quiz modal to see the updated list
            const updatedQuiz = newCurriculum.find(l => l.id === ids.levelId)?.chapters.find(c => c.id === ids.chapterId)?.quizzes.find(q => q.id === ids.quizId);
             closeModal();
            if (updatedQuiz) {
                openModal({ type: 'editQuiz', payload: { quiz: updatedQuiz, chapterId: ids.chapterId } });
            }
        }
    
        setCurriculum(newCurriculum);
        if (type !== 'quizQuestion') {
             closeModal();
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
            <Header
                onNavigate={handleNavigate}
                onSaveChanges={handleSaveChanges}
                isSaving={isSaving}
                saveSuccess={saveSuccess}
            />
            <main className="flex-grow container mx-auto px-4 py-8">
                {curriculum ? (
                    <MainContent
                        view={view}
                        user={user}
                        curriculum={curriculum}
                        passwordResetToken={passwordResetToken}
                        selectedLevelId={selectedLevelId}
                        selectedChapterId={selectedChapterId}
                        selectedSeriesId={selectedSeriesId}
                        selectedExerciseId={selectedExerciseId}
                        selectedQuizId={selectedQuizId}
                        selectedExerciseContext={selectedExerciseContext}
                        videoNavigation={videoNavigation}
                        onNavigate={handleNavigate}
                        onSelectLevel={handleSelectLevel}
                        onSelectChapter={handleSelectChapter}
                        onSelectSeries={handleSelectSeries}
                        onSelectSeriesList={handleSelectSeriesList}
                        onSelectExercise={handleSelectExercise}
                        onSelectQuiz={handleSelectQuiz}
                        onNavigateToChat={handleNavigateToChat}
                        onNavigateToTimestamp={handleNavigateToTimestamp}
                        onBackToDefault={handleBackToDefault}
                        resetSelections={resetSelections}
                        openModal={openModal}
                    />
                ) : (
                    <div className="text-center text-red-400">
                        <p>Impossible de charger le contenu pédagogique. Veuillez réessayer plus tard.</p>
                    </div>
                )}
            </main>
            <Footer />
            <ModalManager
                modal={modal}
                levelId={selectedLevelId}
                onClose={closeModal}
                openModal={openModal}
                onSaveLevel={handleAddOrUpdateLevel}
                onSaveChapter={handleAddOrUpdateChapter}
                onSaveSeries={handleAddOrUpdateSeries}
                onSaveExercise={handleAddOrUpdateExercise}
                onSaveQuiz={handleAddOrUpdateQuiz}
                onSaveQuizQuestion={handleAddOrUpdateQuizQuestion}
                onConfirmDelete={handleConfirmDelete}
            />
        </div>
    );
};

export default App;
