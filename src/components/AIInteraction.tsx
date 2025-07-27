
import React, { useState, useMemo, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, ThumbsUpIcon, ThumbsDownIcon, PlayCircleIcon, StarIcon, CheckCircleIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { MathKeyboard } from './MathKeyboard';
import { ExplanationPlan } from '@/types';

interface AIInteractionProps {
    exerciseStatement: string;
    correctionSnippet: string;
    fullCorrection?: string;
    initialQuestion?: string;
    chapterId: string;
    levelId: string;
    onNavigateToTimestamp: (levelId: string, chapterId: string, videoId: string, time: number) => void;
}

export const AIInteraction: React.FC<AIInteractionProps> = ({ exerciseStatement, correctionSnippet, fullCorrection, initialQuestion, chapterId, levelId, onNavigateToTimestamp }) => {
    const { user } = useAuth();
    const [question, setQuestion] = useState(initialQuestion || '');
    const { data: aiResponse, isLoading, error, explain, reset } = useAIExplain();
    const [isAIFeatureEnabled, setIsAIFeatureEnabled] = useState(true);
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
    const [useMathKeyboard, setUseMathKeyboard] = useState(false);

    // State for "à la carte" explanation
    const [plan, setPlan] = useState<ExplanationPlan | null>(null);
    const [detailedExplanation, setDetailedExplanation] = useState<string | null>(null);
    const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'question' | 'plan' | 'detail'>('question');

    const videoChunk = aiResponse?.videoChunk;
    
    useEffect(() => {
        if (initialQuestion) {
            handleAskForPlan();
        }
         // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    useEffect(() => {
        if (error && (error.includes("configurée") || error.includes("valide"))) {
            setIsAIFeatureEnabled(false);
        }
    }, [error]);

    useEffect(() => {
        if (aiResponse?.plan) {
            setPlan(aiResponse.plan);
            setViewMode('plan');
        }
        if (aiResponse?.explanation) {
            setDetailedExplanation(aiResponse.explanation);
            if(viewMode !== 'detail') setViewMode('detail');
        }
    }, [aiResponse, viewMode]);

    const buildBasePrompt = (studentQuestion: string) => {
        const systemPromptHeader = "Tu es un tuteur de mathématiques expert et bienveillant. Ton public est constitué de lycéens marocains. Tes explications doivent être claires, concises, pédagogiques et en français. Utilise la syntaxe Markdown pour formater tes réponses, y compris les formules LaTeX (en utilisant les délimiteurs $$...$$ ou \\(...\\)).";
        const contextPrompt = fullCorrection
            ? `Le contexte est la correction détaillée suivante. N'hésite pas à y faire référence.\n---CORRECTION DÉTAILLÉE---\n${fullCorrection}`
            : `Le contexte est cet extrait de la correction.\n---EXTRAIT CORRECTION---\n${correctionSnippet}`;

        return `${systemPromptHeader}\n---CONTEXTE EXERCICE---\n${exerciseStatement}\n${contextPrompt}\n---QUESTION ÉLÈVE---\n${studentQuestion}`;
    };
    
    const handleAskForPlan = () => {
        if (!question.trim() || isLoading || !user) return;
        resetState();
        const basePrompt = buildBasePrompt(question);
        const planPrompt = `${basePrompt}\n\nMISSION: Décompose la réponse en 2 à 4 grandes étapes logiques et identifie 2-3 concepts mathématiques clés. Ne fournis pas encore la solution.`;
        explain(planPrompt, chapterId, 'plan');
    };

    const handleAskForStepDetail = (stepIndex: number) => {
        if (plan === null) return;
        setSelectedStepIndex(stepIndex);
        setDetailedExplanation(null); // Reset previous detail
        setFeedback(null);
        
        const stepTitle = plan.steps[stepIndex];
        const basePrompt = buildBasePrompt(question);
        const detailPrompt = `${basePrompt}\n\nMISSION: L'élève a choisi une étape du plan que tu as fourni. Explique en détail et uniquement CETTE étape: "${stepTitle}". Termine ton explication par une phrase de transition vers l'étape suivante si elle existe.`;
        
        explain(detailPrompt, chapterId, 'detail');
    };

    const handleAskForDirectAnswer = () => {
         if (!question.trim() || isLoading || !user) return;
        resetState();
        const basePrompt = buildBasePrompt(question);
        const directAnswerPrompt = `${basePrompt}\n\nMISSION: Réponds directement à la question de l'élève en fournissant une explication complète et détaillée.`;
        explain(directAnswerPrompt, chapterId, 'detail');
    }
    
    const resetState = () => {
        reset();
        setPlan(null);
        setDetailedExplanation(null);
        setSelectedStepIndex(null);
        setFeedback(null);
        setViewMode('question');
    };
    
    const resetForNewQuestion = () => {
        resetState();
        setQuestion('');
    }

    const sanitizedHtml = useMemo(() => {
        const contentToRender = detailedExplanation;
        if (!contentToRender) return { __html: '' };
        const rawMarkup = marked.parse(contentToRender) as string;
        const sanitizedMarkup = DOMPurify.sanitize(rawMarkup);
        return { __html: sanitizedMarkup };
    }, [detailedExplanation]);

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAskForPlan();
        }
    };

    const handleFeedback = (feedbackType: 'up' | 'down') => {
        setFeedback(feedbackType);
        // In a real application, you might want to send this feedback to a logging service.
        console.log(`Feedback submitted: ${feedbackType}`);
    };

    const isReadyForUser = !!user && isAIFeatureEnabled;

    return (
        <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-lg p-6 space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-brand-blue-300 mb-2">
                    Besoin d'un coup de pouce ? Demandez à l'IA
                </h3>
                {!user && (
                     <div className="p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-sm">
                        Vous devez être connecté pour utiliser l'IA.
                    </div>
                )}
                <div className="space-y-4 mt-4">
                    {useMathKeyboard ? (
                        <MathKeyboard onExpressionChange={setQuestion} initialValue={question} disabled={!isReadyForUser || isLoading}/>
                    ) : (
                        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={handleTextareaKeyDown} placeholder="Posez votre question ici..." className="w-full h-24 p-4 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 transition" disabled={!isReadyForUser || isLoading || viewMode !== 'question'} />
                    )}
                     <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={handleAskForPlan} disabled={isLoading || !question.trim() || !isReadyForUser} className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">
                                {isLoading && viewMode !== 'detail' ? 'En cours...' : "Obtenir un plan d'aide"}
                            </button>
                            <button type="button" onClick={handleAskForDirectAnswer} disabled={isLoading || !question.trim() || !isReadyForUser} className="inline-flex items-center justify-center gap-2 px-4 py-2 font-semibold text-gray-200 bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed">
                                Voir la réponse directe
                            </button>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                            <input type="checkbox" checked={useMathKeyboard} onChange={() => setUseMathKeyboard(!useMathKeyboard)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-brand-blue-600 focus:ring-brand-blue-500" />
                            Clavier Mathématique
                        </label>
                    </div>
                </div>
            </div>
            
            <div className="min-h-[20rem] bg-gray-900/50 p-4 sm:p-6 rounded-lg border border-gray-700/50 relative flex flex-col">
                <div className="flex-grow">
                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-900/50 backdrop-blur-sm rounded-lg z-10">
                            <SpinnerIcon className="w-10 h-10 animate-spin text-brand-blue-500" />
                            <p className="mt-3 text-md">L'IA réfléchit...</p>
                        </div>
                    )}
                    {error && (<div className="flex items-center justify-center h-full text-red-400 p-4 text-center"><p><span className="font-bold">Erreur :</span> {error}</p></div>)}
                    
                    {viewMode === 'plan' && plan && (
                        <div className="space-y-4 animate-fade-in">
                            <h4 className="font-semibold text-gray-300">Voici un plan pour vous aider. Cliquez sur une étape pour obtenir les détails.</h4>
                            <div className="space-y-3">
                                {plan.steps.map((step, index) => (
                                    <button key={index} onClick={() => handleAskForStepDetail(index)} className="ai-plan-step-button inactive">
                                        <div className="flex items-center justify-center shrink-0 w-8 h-8 text-lg font-bold text-brand-blue-400 bg-gray-800 rounded-full border-2 border-gray-600">{index + 1}</div>
                                        <p className="text-gray-200">{step}</p>
                                    </button>
                                ))}
                            </div>
                            {plan.key_concepts.length > 0 && (
                                <div className="pt-4 mt-4 border-t border-gray-700">
                                    <h5 className="text-sm font-semibold text-gray-400 flex items-center gap-2 mb-2"><StarIcon className="w-4 h-4"/>Concepts clés à réviser</h5>
                                    <div className="flex flex-wrap gap-2">
                                        {plan.key_concepts.map(concept => <span key={concept} className="px-3 py-1 text-xs bg-yellow-900/50 text-yellow-300 rounded-full">{concept}</span>)}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'detail' && plan && (
                        <div className="space-y-3 mb-4">
                            {plan.steps.map((step, index) => (
                                <button key={index} onClick={() => handleAskForStepDetail(index)} className={`ai-plan-step-button ${selectedStepIndex === index ? 'active' : 'inactive'}`}>
                                    <div className={`flex items-center justify-center rounded-full w-6 h-6 text-sm font-bold shrink-0 ${selectedStepIndex === index ? 'bg-brand-blue-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
                                        {detailedExplanation && selectedStepIndex === index ? <CheckCircleIcon className="w-4 h-4"/> : index + 1}
                                    </div>
                                    <p className="text-gray-200">{step}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {detailedExplanation && (
                        <div className={`text-gray-300 ${viewMode === 'detail' ? 'mt-4 pt-4 border-t border-gray-700' : ''}`}>
                            <div className="ai-response-content" dangerouslySetInnerHTML={sanitizedHtml} />
                        </div>
                    )}

                    {videoChunk && (
                        <div className="mt-6 p-4 bg-brand-blue-900/20 border-l-4 border-brand-blue-500 rounded-r-lg">
                            <h4 className="text-sm font-semibold text-brand-blue-300 mb-2">💡 Passage pertinent dans la vidéo du cours :</h4>
                            <p className="text-sm italic text-gray-300/90 mb-3">"{videoChunk.chunk_text}"</p>
                            <button onClick={() => onNavigateToTimestamp(levelId, chapterId, videoChunk.video_id, videoChunk.start_time_seconds)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-500">
                                <PlayCircleIcon className="w-5 h-5"/>Regarder ce passage
                            </button>
                        </div>
                    )}

                    {!isLoading && !error && !plan && !detailedExplanation && (<div className="flex items-center justify-center h-full text-gray-500"><p>La réponse de l'IA apparaîtra ici.</p></div>)}
                </div>
                {(plan || detailedExplanation) && !isLoading && (
                    <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-between items-center gap-3">
                         <button onClick={resetForNewQuestion} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700/50 text-gray-300 hover:bg-gray-700">
                            Poser une autre question
                        </button>
                        <div className="flex items-center gap-3">
                            <button onClick={() => handleFeedback('up')} aria-label="Bonne réponse" className={`p-1.5 rounded-full ${feedback === 'up' ? 'text-green-400 bg-green-500/10' : 'text-gray-500 hover:text-green-400 hover:bg-gray-700'}`}>
                                <ThumbsUpIcon className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleFeedback('down')} aria-label="Mauvaise réponse" className={`p-1.5 rounded-full ${feedback === 'down' ? 'text-red-400 bg-red-500/10' : 'text-gray-500 hover:text-red-400 hover:bg-gray-700'}`}>
                                <ThumbsDownIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
