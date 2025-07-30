


import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, PlayCircleIcon, PaperClipIcon, XCircleIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueMessage, SocraticPath, AIResponse } from '@/types';
import { MathJaxRenderer } from './MathJaxRenderer';
import { getSupabase } from '@/services/authService';
import { MathKeyboard } from './MathKeyboard';

// =================================================================
// == INSTRUCTIONS SQL POUR LA BASE DE DONNÉES (SUPABASE) ==
// =================================================================
/*
-- IMPORTANT: Cette mise à jour corrige un bug critique mais nécessite de recréer les tables de corrections.
-- Les anciennes données dans `corrections` et `corrections_proposees` seront perdues.

-- 1. Table pour les corrigés officiels
DROP TABLE IF EXISTS public.corrections;
CREATE TABLE IF NOT EXISTS public.corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id TEXT NOT NULL UNIQUE, -- Clé unique qui lie au contenu de data.json
  correction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for corrections" ON public.corrections FOR SELECT USING (true);
-- Seul le 'service_role' (depuis le backend) peut écrire. L'ajout se fait manuellement ou via des scripts sécurisés.
CREATE POLICY "Admin write access for corrections" ON public.corrections FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');


-- 2. Table pour les corrigés proposés par l'IA (Bonus)
DROP TABLE IF EXISTS public.corrections_proposees;
CREATE TABLE IF NOT EXISTS public.corrections_proposees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id TEXT NOT NULL UNIQUE, -- Clé unique qui lie au contenu de data.json
  proposed_correction JSONB, -- Stocke la réponse structurée de l'IA
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.corrections_proposees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to insert proposed corrections" ON public.corrections_proposees FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin can manage proposed corrections" ON public.corrections_proposees FOR ALL USING (auth.role() = 'service_role');
*/
// =================================================================

interface AIInteractionProps {
    exerciseId: string;
    exerciseStatement: string;
    correctionSnippet: string; // Gardé pour le contexte si aucune correction n'est trouvée
    initialQuestion?: string;
    chapterId: string;
    levelId: string;
    onNavigateToTimestamp: (levelId: string, chapterId: string, videoId: string, time: number) => void;
    onShowCorrectionRequest?: () => void;
}

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
    });

export const AIInteraction: React.FC<AIInteractionProps> = ({ exerciseId, exerciseStatement, correctionSnippet, initialQuestion, chapterId, levelId, onNavigateToTimestamp, onShowCorrectionRequest }) => {
    const { user } = useAuth();
    const [mainQuestion, setMainQuestion] = useState(initialQuestion || '');
    const { data: aiResponse, isLoading, error, explain, reset } = useAIExplain();
    const [isAIFeatureEnabled, setIsAIFeatureEnabled] = useState(true);

    // State pour la logique hybride
    const [fullCorrection, setFullCorrection] = useState<string | null>(null);
    const [isFetchingCorrection, setIsFetchingCorrection] = useState(true);
    
    // State pour le Tuteur Socratique
    const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
    const [socraticPath, setSocraticPath] = useState<SocraticPath | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [studentInput, setStudentInput] = useState('');
    const [isTutorActive, setIsTutorActive] = useState(false);
    const [isTutorFinished, setIsTutorFinished] = useState(false);
    const [isStuck, setIsStuck] = useState(false);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);
    const [attachedFile, setAttachedFile] = useState<File | null>(null);


    const dialogueEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoChunk = aiResponse?.videoChunk;

    // Sync internal state with the `initialQuestion` prop from parent
    useEffect(() => {
        if (initialQuestion) {
            setMainQuestion(initialQuestion);
        }
    }, [initialQuestion]);
    
    /**
     * Récupère le corrigé détaillé depuis Supabase quand le composant se charge
     * ou quand l'exercice change.
     */
    useEffect(() => {
        const fetchCorrection = async () => {
            if (!exerciseId) return;

            setIsFetchingCorrection(true);
            setFullCorrection(null);
            const supabase = getSupabase();

            try {
                // Use .limit(1) without .single() to avoid 406 error.
                // The result will be an array.
                const { data, error } = await supabase
                    .from('corrections')
                    .select('correction')
                    .eq('exercise_id', exerciseId)
                    .limit(1);

                if (error) {
                    console.error("Erreur lors de la recherche du corrigé:", error);
                }

                // Check if data is an array and has at least one item
                if (data && data.length > 0) {
                    setFullCorrection(data[0].correction);
                }
            } catch (err) {
                console.error("Exception dans fetchCorrection:", err);
            } finally {
                setIsFetchingCorrection(false);
            }
        };

        fetchCorrection();
    }, [exerciseId]);


    /**
     * [Bonus] Enregistre une correction générée par l'IA dans une table
     * `corrections_proposees` pour validation par un administrateur.
     */
    const logGeneratedCorrection = useCallback(async (response: AIResponse) => {
        if (fullCorrection === null && response) {
            const supabase = getSupabase();
            try {
                await supabase
                    .from('corrections_proposees')
                    .insert({
                        exercise_id: exerciseId,
                        proposed_correction: response.socraticPath || { explanation: response.explanation },
                    });
            } catch (err) {
                 // Ignore unique constraint violation errors, it just means another user already submitted it.
                 if (err instanceof Error && (err as any).code === '23505') {
                    // This is expected if another user triggered the same correction generation.
                 } else {
                    console.error("Exception dans logGeneratedCorrection:", err);
                 }
            }
        }
    }, [fullCorrection, exerciseId]);

    
    useEffect(() => {
        if (aiResponse) {
            if (aiResponse.socraticPath) {
                setSocraticPath(aiResponse.socraticPath);
                setDialogue([{ role: 'ai', content: aiResponse.socraticPath[0].ia_question }]);
                setCurrentStep(0);
                setIsTutorActive(true);
                setIsTutorFinished(false);
            }
            if (aiResponse.explanation) {
                 setDialogue([{ role: 'ai', content: aiResponse.explanation }]);
                 setIsTutorActive(false);
            }
            // Log la réponse pour validation future si elle a été générée par l'IA
            logGeneratedCorrection(aiResponse);
        }
    }, [aiResponse, logGeneratedCorrection]);


    useEffect(() => {
        // Only scroll into view if there is content in the dialogue.
        // This prevents the page from scrolling down on initial load.
        if (dialogue.length > 0) {
            dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [dialogue]);

    useEffect(() => {
        if (error && (error.includes("configurée") || error.includes("valide"))) {
            setIsAIFeatureEnabled(false);
        }
    }, [error]);

    /**
     * Construit le prompt de base pour l'IA, en utilisant la correction détaillée si elle
     * existe, ou en demandant un raisonnement autonome sinon.
     */
    const buildBasePrompt = (studentQuestion: string) => {
         const systemPromptHeader = `
CONTEXTE : Tu es un tuteur de mathématiques expert et bienveillant pour des lycéens marocains.
RÈGLE STRICTE : Ta seule mission est d'aider à comprendre l'exercice fourni. Si la question de l'élève est hors-sujet (météo, histoire, etc.), tu dois le signaler dans ta réponse JSON.
Tes explications doivent être claires, pédagogiques et en français. Utilise la syntaxe Markdown et LaTeX ($$...$$ ou \\(...\\)).
`;
        const contextPrompt = fullCorrection
            ? `Le contexte est la correction détaillée officielle suivante. BASE IMPÉRATIVEMENT TON EXPLICATION SUR CETTE CORRECTION. N'invente pas une autre méthode.\n---CORRECTION DÉTAILLÉE---\n${fullCorrection}`
            : `Aucune correction détaillée n'est disponible. Tu dois donc raisonner par toi-même pour guider l'élève. Le contexte est l'énoncé et un bref extrait de la correction.\n---EXTRAIT CORRECTION---\n${correctionSnippet}`;

        return `${systemPromptHeader}\n---CONTEXTE EXERCICE---\n${exerciseStatement}\n${contextPrompt}\n---QUESTION ÉLÈVE---\n${studentQuestion}`;
    };
    
    const handleStartSocraticTutor = () => {
        if (!mainQuestion.trim() || isLoading || !user) return;
        resetState();
        const basePrompt = buildBasePrompt(mainQuestion);
        const socraticMission = mainQuestion.includes('--- PAGE ')
            ? "La question de l'élève est une transcription de sa résolution sur plusieurs pages (séparées par '--- PAGE X ---'). Évalue l'ensemble de son travail et crée un parcours de tutorat socratique pour le guider."
            : "Crée un parcours de tutorat socratique pour guider l'élève vers la solution, sans la donner directement.";

        const socraticPrompt = `${basePrompt}\n\nMISSION: ${socraticMission}`;
        explain(socraticPrompt, chapterId, 'socratic');
    };

    const handleAskForDirectAnswer = () => {
         if (!mainQuestion.trim() || isLoading || !user) return;
        resetState();
        const basePrompt = buildBasePrompt(mainQuestion);
        const directMission = mainQuestion.includes('--- PAGE ')
            ? "La question de l'élève est une transcription de sa résolution sur plusieurs pages (séparées par '--- PAGE X ---'). Évalue l'ensemble de son travail et réponds directement et complètement à sa demande."
            : "Réponds directement et complètement à la question de l'élève.";

        const directAnswerPrompt = `${basePrompt}\n\nMISSION: ${directMission}`;
        explain(directAnswerPrompt, chapterId, 'direct');
    }

    const handleStudentResponse = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!studentInput.trim() && !attachedFile) || !socraticPath || isTutorFinished || isCheckingAnswer) return;
        
        const currentStudentInput = studentInput;
        const currentAttachedFile = attachedFile;
        setIsStuck(false);

        let userMessageContent = currentStudentInput;
        if (currentAttachedFile) {
            userMessageContent += `\n\n*Image jointe : ${currentAttachedFile.name}*`;
        }

        setDialogue(prev => [...prev, { role: 'user', content: userMessageContent }]);
        setStudentInput('');
        setAttachedFile(null);
        setIsCheckingAnswer(true);

        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour valider votre réponse.");

            const currentSocraticStep = socraticPath[currentStep];

            let requestBody: any = {
                studentAnswer: currentStudentInput,
                currentIaQuestion: currentSocraticStep.ia_question,
                expectedAnswerKeywords: currentSocraticStep.expected_answer_keywords
            };

            if (currentAttachedFile) {
                const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                const compressedFile = await imageCompression(currentAttachedFile, options);
                const base64Image = await fileToBase64(compressedFile);
                requestBody = {
                    ...requestBody,
                    imageAttachment: {
                        base64: base64Image,
                        mimeType: compressedFile.type,
                    },
                };
            }

            const response = await fetch('/api/validate-socratic-answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(requestBody)
            });
            
            const responseBody = await response.text();
            if (!response.ok) {
                 let errorMessage;
                try {
                    const errorData = JSON.parse(responseBody);
                    errorMessage = errorData.error || `Erreur du serveur (${response.status})`;
                } catch (jsonError) {
                    errorMessage = responseBody || `Erreur du serveur (${response.status})`;
                }
                throw new Error(errorMessage);
            }

            const { is_correct } = JSON.parse(responseBody);
            
            if (is_correct) {
                const newDialogue: DialogueMessage[] = [{ role: 'ai', content: currentSocraticStep.positive_feedback }];
                const nextStep = currentStep + 1;

                if (nextStep < socraticPath.length) {
                    newDialogue.push({ role: 'ai', content: socraticPath[nextStep].ia_question });
                    setCurrentStep(nextStep);
                } else {
                    newDialogue.push({ role: 'system', content: 'Félicitations, vous avez terminé ce parcours !' });
                    setIsTutorFinished(true);
                }
                setDialogue(prev => [...prev, ...newDialogue]);

            } else {
                setDialogue(prev => [...prev, { role: 'ai', content: currentSocraticStep.hint_for_wrong_answer }]);
                setIsStuck(true);
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setDialogue(prev => [...prev, { role: 'system', content: `Erreur : ${errorMessage}` }]);
        } finally {
            setIsCheckingAnswer(false);
        }
    }
    
    const handleImStuck = () => {
        if (!socraticPath || isTutorFinished) return;

        // If a handler is provided by the parent, use it to scroll to the official correction.
        if (onShowCorrectionRequest) {
            const newDialogue: DialogueMessage[] = [
                ...dialogue,
                { role: 'system', content: "Pas de problème. Je vous redirige vers la section de correction détaillée pour vous aider." }
            ];
            setDialogue(newDialogue);
            onShowCorrectionRequest();
            resetState(); // Reset the AI interaction
            return;
        }

        // Fallback to old behavior: give the answer for the current step.
        const currentSocraticStep = socraticPath[currentStep];
        const expected = currentSocraticStep.expected_answer_keywords.join('" ou "');
        const newDialogue: DialogueMessage[] = [
            ...dialogue, 
            { 
                role: 'system', 
                content: `Pas de problème, voici la réponse pour cette étape : **"${expected}"**. Continuons.`
            }
        ];

        setIsStuck(false);

        const nextStep = currentStep + 1;
        if (nextStep < socraticPath.length) {
            newDialogue.push({ role: 'ai', content: socraticPath[nextStep].ia_question });
            setCurrentStep(nextStep);
        } else {
            newDialogue.push({ role: 'system', content: 'Félicitations, vous avez terminé ce parcours !' });
            setIsTutorFinished(true);
        }

        setDialogue(newDialogue);
    };

    const resetState = () => {
        reset();
        setDialogue([]);
        setSocraticPath(null);
        setCurrentStep(0);
        setStudentInput('');
        setIsTutorActive(false);
        setIsTutorFinished(false);
        setIsStuck(false);
        setIsKeyboardOpen(false);
        setAttachedFile(null);
    };
    
    const resetForNewQuestion = () => {
        resetState();
        setMainQuestion('');
    }

    const isReadyForUser = !!user && isAIFeatureEnabled && !isFetchingCorrection;

    return (
        <div className="bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-lg p-6 space-y-6">
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
                    <div className="p-4 bg-slate-800 border-2 border-slate-700 rounded-lg min-h-[6rem] flex flex-col justify-center">
                        {mainQuestion ? (
                            <MathJaxRenderer content={`$$${mainQuestion}$$`} />
                        ) : (
                            <span className="text-slate-500">Posez votre question principale ici...</span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsKeyboardOpen(true)}
                        disabled={!isReadyForUser || isLoading || isTutorActive}
                        className="w-full px-5 py-3 font-semibold text-white bg-slate-700 rounded-lg shadow-md hover:bg-slate-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {mainQuestion ? "Modifier ma question" : "Saisir ma question"}
                    </button>
                    
                    {isKeyboardOpen && (
                        <MathKeyboard
                            initialValue={mainQuestion}
                            onConfirm={(latex) => { setMainQuestion(latex); setIsKeyboardOpen(false); }}
                            onClose={() => setIsKeyboardOpen(false)}
                        />
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleStartSocraticTutor} disabled={!isReadyForUser || isLoading || !mainQuestion.trim() || isTutorActive} className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">
                             Démarrer le tutorat interactif
                        </button>
                        <button type="button" onClick={handleAskForDirectAnswer} disabled={!isReadyForUser || isLoading || !mainQuestion.trim() || isTutorActive} className="inline-flex items-center justify-center gap-2 px-4 py-2 font-semibold text-slate-200 bg-slate-600 rounded-lg hover:bg-slate-700 disabled:opacity-70 disabled:cursor-not-allowed">
                            Voir la réponse directe
                        </button>
                    </div>
                </div>
            </div>
            
             <div className="min-h-[24rem] bg-slate-900/50 p-4 sm:p-6 rounded-lg border border-slate-700/50 flex flex-col justify-between">
                <div className="flex-grow space-y-4 overflow-y-auto pr-2">
                    {dialogue.map((msg, index) => (
                        <div key={index} className={`flex flex-col animate-fade-in ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : msg.role === 'ai' ? 'ai-bubble' : 'system-bubble'}`}>
                                <MathJaxRenderer content={DOMPurify.sanitize(marked.parse(msg.content) as string)} />
                            </div>
                        </div>
                    ))}
                     <div ref={dialogueEndRef} />
                     {isLoading || isFetchingCorrection ? (
                        <div className="flex flex-col items-center justify-center text-slate-400 p-8">
                            <SpinnerIcon className="w-10 h-10 animate-spin text-brand-blue-500" />
                            <p className="mt-3 text-md">
                                {isFetchingCorrection ? "Recherche d'un corrigé existant..." : "L'IA prépare votre tutorat..."}
                            </p>
                        </div>
                    ) : null}
                    {isCheckingAnswer && (
                        <div className="flex items-start">
                            <div className="chat-bubble ai-bubble flex items-center gap-2">
                                <SpinnerIcon className="w-5 h-5 animate-spin"/>
                                <span>Vérification...</span>
                            </div>
                        </div>
                    )}
                    {error && (<div className="flex items-center justify-center h-full text-red-400 p-4 text-center"><p><span className="font-bold">Erreur :</span> {error}</p></div>)}
                    {dialogue.length === 0 && !isLoading && !isFetchingCorrection && !error && !isCheckingAnswer && (<div className="flex items-center justify-center h-full text-slate-500"><p>La conversation avec l'IA apparaîtra ici.</p></div>)}
                </div>

                {isTutorActive && !isTutorFinished && !isLoading && (
                    <form onSubmit={handleStudentResponse} className="mt-4 pt-4 border-t border-slate-700 space-y-2">
                        {attachedFile && (
                            <div className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg text-sm">
                                <PaperClipIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <span className="text-slate-300 truncate flex-grow">{attachedFile.name}</span>
                                <button
                                    type="button"
                                    onClick={() => setAttachedFile(null)}
                                    className="ml-auto text-slate-500 hover:text-white flex-shrink-0"
                                    aria-label="Remove attachment"
                                >
                                    <XCircleIcon className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input 
                                type="text"
                                value={studentInput}
                                onChange={(e) => setStudentInput(e.target.value)}
                                placeholder={socraticPath?.[currentStep]?.student_response_prompt || "Votre réponse... (ou joignez une photo)"}
                                disabled={isCheckingAnswer}
                                className="flex-grow p-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-brand-blue-500 disabled:opacity-50"
                            />
                            <div className="flex items-center gap-2 self-start sm:self-auto">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={(e) => setAttachedFile(e.target.files ? e.target.files[0] : null)}
                                    className="hidden"
                                    accept="image/*"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isCheckingAnswer}
                                    className="p-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                                    aria-label="Attach file"
                                >
                                    <PaperClipIcon className="w-5 h-5" />
                                </button>
                                <button type="submit" disabled={(!studentInput.trim() && !attachedFile) || isCheckingAnswer} className="px-4 py-2 bg-brand-blue-600 text-white font-semibold rounded-lg hover:bg-brand-blue-700 disabled:opacity-50">
                                    Envoyer
                                </button>
                            </div>
                        </div>
                        {isStuck && (
                             <div className="flex justify-end pt-2">
                                <button 
                                    type="button" 
                                    onClick={handleImStuck}
                                    className="px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg hover:bg-yellow-700 animate-pulse"
                                >
                                    Je suis bloqué
                                </button>
                            </div>
                        )}
                    </form>
                )}
                 {(dialogue.length > 0) && !isLoading && (
                    <div className="mt-4 pt-2 border-t border-slate-700/50 flex justify-between items-center gap-3">
                         <button onClick={resetForNewQuestion} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700">
                            Recommencer
                        </button>
                    </div>
                )}
                 {videoChunk && (
                    <div className="mt-6 p-4 bg-brand-blue-900/20 border-l-4 border-brand-blue-500 rounded-r-lg">
                        <h4 className="text-sm font-semibold text-brand-blue-300 mb-2">💡 Passage pertinent dans la vidéo du cours :</h4>
                        <p className="text-sm italic text-slate-300/90 mb-3">"{videoChunk.chunk_text}"</p>
                        <button onClick={() => onNavigateToTimestamp(levelId, chapterId, videoChunk.video_id, videoChunk.start_time_seconds)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-500">
                            <PlayCircleIcon className="w-5 h-5"/>Regarder ce passage
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};