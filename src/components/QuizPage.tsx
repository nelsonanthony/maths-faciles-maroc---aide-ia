
import React, { useState } from 'react';
import { Quiz } from '@/types';
import { ArrowLeftIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';
import { useAuth } from '@/contexts/AuthContext';
import { CircularProgressBar } from '@/components/CircularProgressBar';
import * as userService from '@/services/userService';

interface QuizPageProps {
    quiz: Quiz;
    chapterTitle: string;
    onBack: () => void;
}

export const QuizPage: React.FC<QuizPageProps> = ({ quiz, chapterTitle, onBack }) => {
    const { user, updateUser, isAdmin } = useAuth();
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
    const [showResults, setShowResults] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentQuestion = quiz.questions[currentQuestionIndex];

    const handleSelectAnswer = (optionIndex: number) => {
        setSelectedAnswers(prev => ({ ...prev, [currentQuestionIndex]: optionIndex }));
    };

    const handleNext = () => {
        if (currentQuestionIndex < quiz.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const handleSubmitQuiz = async () => {
        if (!user || isSubmitting) return;

        setIsSubmitting(true);
        const score = calculateScore();
        const totalQuestions = quiz.questions.length;
        const xpGained = 50; // XP for completing a quiz

        try {
            await userService.logQuizAttempt(user.id, quiz.id, score, totalQuestions, xpGained);
            
            // Update user state locally
            const newXp = user.xp + xpGained;
            const newLevel = userService.calculateLevel(newXp);
            updateUser({
                xp: newXp,
                level: newLevel,
            });

        } catch (error) {
            console.error("Failed to log quiz attempt:", error);
            // Non-critical, so we'll still show the results.
        } finally {
            setShowResults(true);
            setIsSubmitting(false);
        }
    };
    
    const calculateScore = () => {
        return quiz.questions.reduce((score, question, index) => {
            if (selectedAnswers[index] === question.correctAnswerIndex) {
                return score + 1;
            }
            return score;
        }, 0);
    };
    
    const getResultMessage = (percentage: number) => {
        if (percentage === 100) return "Excellent ! Score parfait ! (+50 XP)";
        if (percentage >= 75) return "Très bien ! Continuez comme ça ! (+50 XP)";
        if (percentage >= 50) return "Pas mal ! Encore un petit effort. (+50 XP)";
        return "N'hésitez pas à revoir la leçon et à réessayer. (+50 XP)";
    };

    if (showResults) {
        const score = calculateScore();
        const percentage = quiz.questions.length > 0 ? Math.round((score / quiz.questions.length) * 100) : 0;
        const resultMessage = getResultMessage(percentage);

        return (
             <div className="max-w-2xl mx-auto bg-gray-800/50 p-8 rounded-xl border border-gray-700">
                <h2 className="text-3xl font-bold text-center text-brand-blue-300 mb-6">Résultats du Quiz</h2>
                
                <div className="flex flex-col items-center mb-8">
                   <CircularProgressBar percentage={percentage} />
                   <p className="text-xl text-center text-gray-300 mt-4">
                        {resultMessage}
                   </p>
                </div>

                <div className="space-y-4">
                    {quiz.questions.map((q, index) => (
                        <div key={q.id} className={`p-4 rounded-lg border-2 ${selectedAnswers[index] === q.correctAnswerIndex ? 'border-green-500/50 bg-green-900/20' : 'border-red-500/50 bg-red-900/20'}`}>
                            <div className="font-semibold text-gray-200 flex items-start gap-2">
                               <span>{index + 1}.</span>
                               <MathJaxRenderer content={q.question} />
                            </div>
                            {q.options && typeof selectedAnswers[index] !== 'undefined' && (
                                <p className="text-sm mt-2">Votre réponse : <span className="font-medium">{q.options[selectedAnswers[index]]}</span></p>
                            )}
                             {q.options && selectedAnswers[index] !== q.correctAnswerIndex && typeof q.correctAnswerIndex !== 'undefined' && (
                                <p className="text-sm text-green-400">Bonne réponse : <span className="font-medium">{q.options[q.correctAnswerIndex]}</span></p>
                            )}
                        </div>
                    ))}
                </div>
                <div className="text-center mt-8">
                    <button onClick={onBack} className="px-6 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700">Retour au Chapitre</button>
                </div>
             </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour au chapitre
                </button>
                <h2 className="text-3xl font-bold text-brand-blue-300">{chapterTitle} - {quiz.title}</h2>
                <p className="text-lg text-gray-400 mt-1">Question {currentQuestionIndex + 1} sur {quiz.questions.length}</p>
            </div>

            <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700">
                <div className="text-xl font-semibold text-gray-200 mb-6">
                   {currentQuestion && <MathJaxRenderer content={currentQuestion.question} />}
                </div>
                {currentQuestion && currentQuestion.options && (
                    <div className="space-y-4">
                        {currentQuestion.options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => handleSelectAnswer(index)}
                                className={`w-full text-left p-4 rounded-lg border-2 transition-colors duration-200 ${
                                    selectedAnswers[currentQuestionIndex] === index
                                        ? 'bg-brand-blue-600/30 border-brand-blue-500'
                                        : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                                }`}
                            >
                                <MathJaxRenderer content={option} />
                            </button>
                        ))}
                    </div>
                )}
                 {!currentQuestion && (
                    <p className="text-center text-gray-400">Ce quiz ne contient aucune question pour le moment.</p>
                )}
            </div>
            
            <div className="flex justify-between items-center">
                <button 
                    onClick={handlePrev} 
                    disabled={currentQuestionIndex === 0}
                    className="px-6 py-2 font-semibold text-white bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Précédent
                </button>
                 {currentQuestionIndex === quiz.questions.length - 1 ? (
                    <button 
                        onClick={handleSubmitQuiz} 
                        disabled={isSubmitting || typeof selectedAnswers[currentQuestionIndex] === 'undefined'}
                        className="px-6 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Enregistrement...' : 'Terminer le Quiz'}
                    </button>
                 ) : (
                    <button 
                        onClick={handleNext} 
                        disabled={currentQuestionIndex >= quiz.questions.length - 1 || !currentQuestion || typeof selectedAnswers[currentQuestionIndex] === 'undefined'}
                        className="px-6 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Suivant
                    </button>
                 )}
            </div>

            {isAdmin && (
                <div className="mt-12 pt-8 border-t-2 border-gray-700/50">
                    <div className="p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-center">
                        La gestion des questions du quiz se fait via le portail d'administration.
                    </div>
                </div>
            )}
        </div>
    );
};
