
import React, { useState, useMemo, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, ThumbsUpIcon, ThumbsDownIcon, PlayCircleIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { MathKeyboard } from './MathKeyboard';

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

    const explanation = aiResponse?.explanation;
    const videoChunk = aiResponse?.videoChunk;
    
    useEffect(() => {
        // If an initial question is provided, automatically trigger the AI explanation on mount.
        // The key change in the parent will cause a re-mount, triggering this effect.
        if (initialQuestion) {
            handleAskAI();
        }
    }, []); // Runs only on mount

    useEffect(() => {
        if (error && (error.includes("configurée") || error.includes("valide"))) {
            setIsAIFeatureEnabled(false);
        }
    }, [error]);
    
    const handleAskAI = () => {
        if (!question.trim() || isLoading || !user || !isAIFeatureEnabled) return;
        
        reset();
        setFeedback(null);

        const systemPromptHeader = "Tu es un tuteur de mathématiques expert et bienveillant. Ton public est constitué de lycéens marocains préparant leur baccalauréat scientifique. Tes explications doivent être claires, concises, pédagogiques et en français. Utilise la syntaxe Markdown pour formater tes réponses, y compris les formules LaTeX (en utilisant les délimiteurs $$...$$ ou \\(...\\)). IMPORTANT : Évite les commandes LaTeX non standard ou nécessitant des paquets inhabituels (comme `\\square`). Privilégie les notations universellement reconnues par MathJax pour assurer un rendu correct.";

        const contextPrompt = fullCorrection
            ? `Ton rôle est d'expliquer une étape spécifique ou de répondre à une question sur la correction détaillée qui t'est fournie. Ne redonne pas toute la correction.
---
**CORRECTION DÉTAILLÉE COMPLÈTE :**
${fullCorrection}`
            : `Ne te contente pas de donner la réponse, mais guide l'élève pour qu'il la comprenne.
---
**EXTRAIT DE LA CORRECTION :**
${correctionSnippet}`;

        const fullPrompt = `
${systemPromptHeader}
---
**CONTEXTE DE L'EXERCICE :**
${exerciseStatement}
${contextPrompt}
---
**QUESTION DE L'ÉLÈVE :**
${question}
`;

        explain(fullPrompt, chapterId);
    };
    
    const handleFeedback = (newFeedback: 'up' | 'down') => {
        setFeedback(prev => (prev === newFeedback ? null : newFeedback));
    };
    
    const sanitizedHtml = useMemo(() => {
        if (!explanation) return { __html: '' };
        const rawMarkup = marked.parse(explanation) as string;
        const sanitizedMarkup = DOMPurify.sanitize(rawMarkup);
        return { __html: sanitizedMarkup };
    }, [explanation]);

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAskAI();
        }
    };

    const isReadyForUser = !!user && isAIFeatureEnabled;

    return (
        <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-lg p-6 space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-brand-blue-300 mb-2">
                    Besoin d'un coup de pouce ? Demandez à l'IA
                </h3>
                {!user ? (
                     <div className="p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-sm">
                        Vous devez être connecté pour utiliser l'IA.
                    </div>
                ) : !isAIFeatureEnabled && (
                    <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm">
                        La fonctionnalité IA n'est pas disponible en raison d'un problème de configuration.
                    </div>
                )}
                <div className="space-y-4 mt-4">
                    <div className="flex bg-gray-900/50 rounded-lg p-1 border border-gray-700 w-full sm:w-auto self-start">
                        <button 
                            onClick={() => setUseMathKeyboard(false)}
                            className={`w-1/2 p-2 rounded-md text-sm font-semibold transition-colors ${!useMathKeyboard ? 'bg-brand-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                        >
                            Texte Simple
                        </button>
                        <button 
                            onClick={() => setUseMathKeyboard(true)}
                            className={`w-1/2 p-2 rounded-md text-sm font-semibold transition-colors ${useMathKeyboard ? 'bg-brand-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                        >
                            Clavier Mathématique
                        </button>
                    </div>

                    {useMathKeyboard ? (
                        <MathKeyboard 
                            onExpressionChange={setQuestion} 
                            initialValue={question}
                            placeholder="Posez votre question avec des formules..."
                            showPreview={true}
                            disabled={!isReadyForUser || isLoading}
                        />
                    ) : (
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={handleTextareaKeyDown}
                            placeholder={isReadyForUser ? "Posez votre question ici... Par exemple : « Pourquoi calcule-t-on -b/2a ? »" : "Fonctionnalité IA non disponible."}
                            className="w-full h-24 p-4 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 transition duration-200 resize-y disabled:opacity-50"
                            aria-label="Votre question à l'IA"
                            disabled={!isReadyForUser || isLoading}
                        />
                    )}
                    <button
                        type="button"
                        onClick={handleAskAI}
                        disabled={isLoading || !question.trim() || !isReadyForUser}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:bg-brand-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? 'En cours...' : "Demander à l'IA"}
                    </button>
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
                    {error && (
                        <div className="flex items-center justify-center h-full text-red-400 p-4 text-center">
                            <p><span className="font-bold">Erreur :</span> {error}</p>
                        </div>
                    )}
                    {explanation && (
                        <div className="text-gray-300">
                            <div className="ai-response-content" dangerouslySetInnerHTML={sanitizedHtml} />
                        </div>
                    )}
                     {videoChunk && (
                        <div className="mt-6 p-4 bg-brand-blue-900/20 border-l-4 border-brand-blue-500 rounded-r-lg">
                            <h4 className="text-sm font-semibold text-brand-blue-300 mb-2">💡 Passage pertinent dans la vidéo du cours :</h4>
                            <p className="text-sm italic text-gray-300/90 mb-3">"{videoChunk.chunk_text}"</p>
                            <button 
                                onClick={() => onNavigateToTimestamp(levelId, chapterId, videoChunk.video_id, videoChunk.start_time_seconds)}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-500 transition-colors"
                            >
                                <PlayCircleIcon className="w-5 h-5"/>
                                Regarder ce passage
                            </button>
                        </div>
                    )}
                    {!isLoading && !error && !explanation && !videoChunk && (
                         <div className="flex items-center justify-center h-full text-gray-500">
                            <p>La réponse de l'IA apparaîtra ici.</p>
                        </div>
                    )}
                </div>
                {explanation && !isLoading && (
                    <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end items-center gap-3">
                        <button
                            onClick={() => handleFeedback('up')}
                            aria-label="Bonne réponse"
                            className={`p-1.5 rounded-full transition-colors ${feedback === 'up' ? 'text-green-400 bg-green-500/10' : 'text-gray-500 hover:text-green-400 hover:bg-gray-700'}`}
                        >
                            <ThumbsUpIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleFeedback('down')}
                            aria-label="Mauvaise réponse"
                            className={`p-1.5 rounded-full transition-colors ${feedback === 'down' ? 'text-red-400 bg-red-500/10' : 'text-gray-500 hover:text-red-400 hover:bg-gray-700'}`}
                        >
                            <ThumbsDownIcon className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
