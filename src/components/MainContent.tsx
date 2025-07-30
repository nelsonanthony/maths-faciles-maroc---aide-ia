


import React from 'react';
import { HomePage } from '@/components/HomePage';
import { ChapterListPage } from '@/components/ChapterListPage';
import { ChapterHomePage } from '@/components/ChapterHomePage';
import { SeriesListPage } from '@/components/SeriesListPage';
import { ExerciseListPage } from '@/components/ExerciseListPage';
import { ExercisePage } from '@/components/ExercisePage';
import { QuizPage } from '@/components/QuizPage';
import { LoginPage } from '@/components/LoginPage';
import { RegisterPage } from '@/components/RegisterPage';
import { DashboardPage } from '@/components/DashboardPage';
import { ForgotPasswordPage } from '@/components/ForgotPasswordPage';
import { ResetPasswordPage } from '@/components/ResetPasswordPage';
import { ChatPage } from '@/components/ChatPage';
import { TutorPage } from '@/components/TutorPage';
import { Level, Chapter, Exercise, Series, Quiz, QuizQuestion, User, ExerciseContext, ModalState, View } from '@/types';

interface MainContentProps {
    view: View;
    user: User | null;
    curriculum: Level[];
    passwordResetToken: string | null;
    selectedLevelId: string | null;
    selectedChapterId: string | null;
    selectedSeriesId: string | null;
    selectedExerciseId: string | null;
    selectedQuizId: string | null;
    selectedExerciseContext: ExerciseContext | null;
    videoNavigation: { videoId: string; time: number; } | null;
    onNavigate: (view: View) => void;
    onSelectLevel: (levelId: string) => void;
    onSelectChapter: (chapterId: string) => void;
    onSelectSeries: (seriesId: string) => void;
    onSelectSeriesList: () => void;
    onSelectExercise: (exerciseId: string) => void;
    onSelectQuiz: (quizId: string) => void;
    onNavigateToChat: (context: ExerciseContext) => void;
    onNavigateToTutor: (context: ExerciseContext) => void;
    onNavigateToTimestamp: (levelId: string, chapterId: string, videoId: string, time: number) => void;
    onBackToDefault: () => void;
    resetSelections: (level?: 'all' | 'level' | 'chapter' | 'series' | 'exercise') => void;
    openModal: (modalState: ModalState) => void;
}

export const MainContent: React.FC<MainContentProps> = (props) => {
    const {
        view, user, curriculum, passwordResetToken, selectedLevelId, selectedChapterId,
        selectedSeriesId, selectedExerciseId, selectedQuizId, selectedExerciseContext, videoNavigation,
        onNavigate, onSelectLevel, onSelectChapter, onSelectSeries, onSelectSeriesList,
        onSelectExercise, onSelectQuiz, onNavigateToChat, onNavigateToTutor, onNavigateToTimestamp,
        onBackToDefault, resetSelections, openModal
    } = props;
    
    const level = curriculum.find(l => l.id === selectedLevelId);
    const chapter = level?.chapters.find(c => c.id === selectedChapterId);
    const series = chapter?.series.find(s => s.id === selectedSeriesId);
    const exercise = series?.exercises.find(e => e.id === selectedExerciseId);
    const quiz = chapter?.quizzes.find(q => q.id === selectedQuizId);

    const handleBackToChapters = () => { onNavigate('chapters'); resetSelections('level'); };
    const handleBackToChapterHome = () => { onNavigate('chapterHome'); resetSelections('chapter'); };
    const handleBackToSeries = () => { onNavigate('seriesList'); resetSelections('series'); };
    const handleBackToExercises = () => { onNavigate('exerciseList'); resetSelections('exercise'); };
    const handleBackToExercise = () => { onNavigate('exercise'); };


    switch (view) {
        case 'login': return <LoginPage onNavigate={onNavigate} />;
        case 'register': return <RegisterPage onRegisterSuccess={() => onNavigate('login')} />;
        case 'forgotPassword': return <ForgotPasswordPage onBackToLogin={() => onNavigate('login')} />;
        case 'resetPassword': 
            if (passwordResetToken) return <ResetPasswordPage onResetSuccess={() => onNavigate('login')} />;
            break;
        case 'dashboard':
            return <DashboardPage onNavigateToCourses={() => onNavigate('courses')} />;
        case 'tutor':
            if (selectedExerciseContext && exercise && chapter && level) return <TutorPage exercise={exercise} chapter={chapter} levelId={level.id} onBack={handleBackToExercise} onNavigateToTimestamp={onNavigateToTimestamp} />;
            break;
        case 'chat':
            if (selectedExerciseContext && user) return <ChatPage exerciseContext={selectedExerciseContext} onBack={() => onNavigate('exercise')} />;
            break;
        case 'quiz':
            if (quiz && chapter) {
                if (user) {
                    return <QuizPage quiz={quiz} chapterId={chapter.id} chapterTitle={chapter.title} onBack={handleBackToChapterHome} />;
                }
                // For non-logged-in users, show a prompt
                return (
                    <div className="max-w-md mx-auto text-center p-8 bg-gray-800/50 rounded-xl border border-gray-700/50">
                        <h2 className="text-2xl font-bold text-brand-blue-300 mb-4">Accès Réservé</h2>
                        <p className="text-gray-300 mb-6">Vous devez être connecté pour répondre aux quiz et suivre votre progression.</p>
                        <div className="flex justify-center gap-4">
                            <button onClick={() => onNavigate('login')} className="px-6 py-2 font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700">
                                Connexion
                            </button>
                            <button onClick={() => onNavigate('register')} className="px-6 py-2 font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300">
                                S'inscrire
                            </button>
                        </div>
                        <button onClick={handleBackToChapterHome} className="mt-8 text-sm text-brand-blue-400 hover:text-brand-blue-300">
                            Retour au chapitre
                        </button>
                    </div>
                );
            }
            break;
        case 'exercise':
            if (exercise && series && chapter && level) return <ExercisePage exercise={exercise} chapter={chapter} seriesId={series.id} levelId={level.id} onBack={handleBackToExercises} onEdit={() => openModal({ type: 'editExercise', payload: { exercise, seriesId: series.id }})} onNavigateToTimestamp={onNavigateToTimestamp} onSelectExercise={onSelectExercise} onNavigateToChat={onNavigateToChat} onNavigateToTutor={onNavigateToTutor} />;
            break;
        case 'exerciseList':
            if (series && chapter && level) return <ExerciseListPage series={series} chapterTitle={chapter.title} onSelectExercise={onSelectExercise} onBack={handleBackToSeries} onAddExercise={() => openModal({ type: 'editExercise', payload: { exercise: null, seriesId: series.id }})} onEditExercise={(exercise) => openModal({ type: 'editExercise', payload: { exercise, seriesId: series.id }})} onDeleteExercise={(exerciseId, exerciseStatement) => openModal({ type: 'delete', payload: { type: 'exercise', ids: { levelId: level.id, chapterId: chapter.id, seriesId: series.id, exerciseId }, name: exerciseStatement }})} />;
            break;
        case 'seriesList':
            if (chapter && level) return <SeriesListPage chapter={chapter} onSelectSeries={onSelectSeries} onBack={handleBackToChapterHome} onAddSeries={() => openModal({ type: 'editSeries', payload: { series: null, chapterId: chapter.id }})} onEditSeries={(series) => openModal({ type: 'editSeries', payload: { series, chapterId: chapter.id }})} onDeleteSeries={(seriesId, seriesTitle) => openModal({ type: 'delete', payload: { type: 'series', ids: { levelId: level.id, chapterId: chapter.id, seriesId }, name: seriesTitle }})} />;
            break;
        case 'chapterHome':
             if (chapter && level) return <ChapterHomePage chapter={chapter} videoNavigation={videoNavigation} onSelectQuiz={onSelectQuiz} onSelectSeriesList={onSelectSeriesList} onBack={handleBackToChapters} onEditChapter={(ch) => openModal({ type: 'editChapter', payload: { chapter: ch }})} onAddQuiz={() => openModal({ type: 'editQuiz', payload: { quiz: null, chapterId: chapter.id }})} onEditQuiz={(q) => openModal({ type: 'editQuiz', payload: { quiz: q, chapterId: chapter.id }})} onDeleteQuiz={(quizId, quizTitle) => openModal({ type: 'delete', payload: { type: 'quiz', ids: { levelId: level.id, chapterId: chapter.id, quizId }, name: quizTitle }})} />;
            break;
        case 'chapters':
            if (level) return <ChapterListPage level={level} onSelectChapter={onSelectChapter} onBack={onBackToDefault} onAddChapter={() => openModal({ type: 'addChapter' })} onEditChapter={(ch) => openModal({ type: 'editChapter', payload: { chapter: ch }})} onDeleteChapter={(chapterId, chapterTitle) => openModal({ type: 'delete', payload: { type: 'chapter', ids: { levelId: level.id, chapterId }, name: chapterTitle }})} />;
            break;
        case 'home':
        case 'courses':
        default:
            return <HomePage levels={curriculum} onSelectLevel={onSelectLevel} onAddLevel={() => openModal({ type: 'addLevel' })} onEditLevel={(l) => openModal({ type: 'editLevel', payload: { level: l }})} onDeleteLevel={(levelId, levelName) => openModal({ type: 'delete', payload: { type: 'level', ids: { levelId }, name: levelName }})} />;
    }
    
    // Fallback if something goes wrong with the view logic
    return (
        <div className="text-center text-gray-400">
            <p>Chargement de la vue...</p>
            <button onClick={onBackToDefault} className="mt-4 text-brand-blue-400">Retour à l'accueil</button>
        </div>
    );
};