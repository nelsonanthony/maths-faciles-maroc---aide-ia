

import React, { useState, useEffect, useCallback } from 'react';
import { addStyles } from 'react-mathquill';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Level, Chapter, Exercise, Quiz, Series, QuizQuestion, ExerciseContext, DeletionInfo, ModalState, View, CurriculumActionPayload } from '@/types';
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
    return response.json();
};

export const App: React.FC = () => {
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    
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
    
    const handleAddOrUpdateLevel = async (levelData: Level) => {
        const response = await callUpdateApi({ action: 'ADD_OR_UPDATE_LEVEL', payload: { level: levelData } });
        setCurriculum(response.curriculum);
        closeModal();
    };

    const handleAddOrUpdateChapter = async (chapterData: Chapter) => {
        const response = await callUpdateApi({ action: 'ADD_OR_UPDATE_CHAPTER', payload: { levelId: selectedLevelId, chapter: chapterData } });
        setCurriculum(response.curriculum);
        closeModal();
    };

    const handleAddOrUpdateSeries = async (seriesData: Series, chapterId: string) => {
        const response = await callUpdateApi({ action: 'ADD_OR_UPDATE_SERIES', payload: { levelId: selectedLevelId, chapterId: chapterId, series: seriesData } });
        setCurriculum(response.curriculum);
        closeModal();
    };
    
    const handleAddOrUpdateExercise = async (exerciseData: Exercise, seriesId: string) => {
         const response = await callUpdateApi({ action: 'ADD_OR_UPDATE_EXERCISE', payload: { levelId: selectedLevelId, chapterId: selectedChapterId, seriesId: seriesId, exercise: exerciseData } });
        setCurriculum(response.curriculum);
        closeModal();
    };
    
    const handleAddOrUpdateQuiz = async (quizData: Quiz, chapterId: string) => {
        const response = await callUpdateApi({ action: 'ADD_OR_UPDATE_QUIZ', payload: { levelId: selectedLevelId, chapterId: chapterId, quiz: quizData } });
        setCurriculum(response.curriculum);
        
        const isCreating = modal?.type === 'editQuiz' && !modal.payload.quiz;
        if (isCreating) {
            // Find the newly created quiz in the response from the server to get the definitive version.
            const newQuiz = response.curriculum
                .find((l: Level) => l.id === selectedLevelId)
                ?.chapters.find((c: Chapter) => c.id === chapterId)
                ?.quizzes.find((q: Quiz) => q.id === quizData.id); // Match by the temporary ID

            closeModal();
            
            if (newQuiz) {
                // Re-open the modal with the new quiz data.
                openModal({ type: 'editQuiz', payload: { quiz: newQuiz, chapterId } });
            } else {
                console.warn("Could not find the newly created quiz in the API response. Modal will not reopen.");
            }
        } else {
            // If we are just updating, simply close the modal.
            closeModal();
        }
    };
    
    const handleAddOrUpdateQuizQuestion = async (questionData: QuizQuestion, quizId: string, chapterId: string) => {
        const response = await callUpdateApi({ action: 'ADD_OR_UPDATE_QUIZ_QUESTION', payload: { levelId: selectedLevelId, chapterId, quizId, question: questionData } });
        setCurriculum(response.curriculum);
        closeModal();
        // Re-open parent quiz modal
        const updatedQuiz = response.curriculum.find((l: Level) => l.id === selectedLevelId)?.chapters.find((c: Chapter) => c.id === chapterId)?.quizzes.find((q: Quiz) => q.id === quizId);
        if (updatedQuiz) {
             openModal({ type: 'editQuiz', payload: { quiz: updatedQuiz, chapterId } });
        }
    };

    const handleConfirmDelete = async () => {
        if (!modal || modal.type !== 'delete') return;
        const { payload: deletionInfo } = modal;
        const response = await callUpdateApi({ action: 'DELETE_ITEM', payload: deletionInfo });
        setCurriculum(response.curriculum);
        
        // After deleting a question, re-open the quiz modal to see the updated list
        if (deletionInfo.type === 'quizQuestion') {
            const { ids } = deletionInfo;
            const updatedQuiz = response.curriculum.find((l: Level) => l.id === ids.levelId)?.chapters.find((c: Chapter) => c.id === ids.chapterId)?.quizzes.find((q: Quiz) => q.id === ids.quizId);
            closeModal();
            if (updatedQuiz && ids.chapterId) {
                openModal({ type: 'editQuiz', payload: { quiz: updatedQuiz, chapterId: ids.chapterId } });
            }
        } else {
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