
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, PlayCircleIcon, PaperClipIcon, ArrowLeftIcon, PencilIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueMessage, SocraticPath, AIResponse, Exercise, Chapter } from '@/types';
import { MathJaxRenderer } from './MathJaxRenderer';
import { getSupabase } from '@/services/authService';
import { MathKeyboard } from './MathKeyboard';


interface TutorPageProps {
    exercise: Exercise;
    chapter: Chapter;
    levelId: string;
    onBack: () => void;
    onNavigateToTimestamp: (levelId: string, chapterId: string, videoId: string, time: number) => void;
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

const convertMathJaxToLatex = (text: string): string => {
    if (!text) return '';
    // Remplace les délimiteurs MathJax inline \(...\) par $...$
    let converted = text.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
    // Remplace les délimiteurs MathJax display \[...\] par $$...$$
    converted = converted.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    return converted;
};

export const TutorPage: React.FC<TutorPageProps> = ({ exercise, chapter, levelId, onBack, onNavigateToTimestamp }) => {
    const { user } = useAuth();
    const [mainQuestion, setMainQuestion] = useState('');
    const { data: aiResponse, isLoading, error: aiError, explain, reset } = useAIExplain();
    const [isAIFeatureEnabled, setIsAIFeatureEnabled] = useState(true);

    const [fullCorrection, setFullCorrection] = useState<string | null>(null);
    const [isFetchingCorrection, setIsFetchingCorrection] = useState(true);
    
    const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
    const [socraticPath, setSocraticPath] = useState<SocraticPath | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [studentInput, setStudentInput] = useState('');
    const [isTutorActive, setIsTutorActive] = useState(false);
    const [isTutorFinished, setIsTutorFinished] = useState(false);
    const [isStuck, setIsStuck] = useState(false);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [submissionError, setSubmissionError] = useState<string|null>(null);

    // New states for OCR verification step
    const [ocrResultText, setOcrResultText] = useState<string>('');
    const [isVerificationStep, setIsVerificationStep] = useState(false);


    const dialogueEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoChunk = aiResponse?.videoChunk;
    
    // --- Logic Functions (hoisted) ---
    const resetState = useCallback(() => {
        reset();
        setDialogue([]);
        setSocraticPath(null);
        setCurrentStep(0);
        setStudentInput('');
        setIsTutorActive(false);
        setIsTutorFinished(false);
        setIsStuck(false);
        setIsKeyboardOpen(false);
        setSubmissionError(null);
        setOcrResultText('');
        setIsVerificationStep(false);
    }, [reset]);

    const buildBasePrompt = useCallback((studentQuestion: string) => {
        const systemPromptHeader = `CONTEXTE : Tu es un tuteur de mathématiques expert et bienveillant pour des lycéens marocains...`;
        const contextPrompt = fullCorrection ? `...BASE IMPÉRATIVEMENT TON EXPLICATION SUR CETTE CORRECTION...\n${fullCorrection}` : `...Tu dois donc raisonner par toi-même...\n${exercise.correctionSnippet}`;
        return `${systemPromptHeader}\n---CONTEXTE EXERCICE---\n${exercise.statement}\n${contextPrompt}\n---QUESTION ÉLÈVE---\n${studentQuestion}`;
    }, [fullCorrection, exercise.statement, exercise.correctionSnippet]);

    const startSocraticTutor = useCallback((question: string) => {
        if (!question.trim() || isLoading || !user) return;
        resetState();
        const basePrompt = buildBasePrompt(question);
        const socraticMission = question.includes('--- Photo ') ? "Évalue l'ensemble de son travail (transcrit depuis des photos) et crée un parcours de tutorat socratique pour le guider." : "Crée un parcours de tutorat socratique pour guider l'élève à travers cette question.";
        explain(`${basePrompt}\n\nMISSION: ${socraticMission}`, chapter.id, 'socratic');
    }, [isLoading, user, resetState, buildBasePrompt, explain, chapter.id]);

    const askForDirectAnswer = useCallback((question: string) => {
        if (!question.trim() || isLoading || !user) return;
        resetState();
        const basePrompt = buildBasePrompt(question);
        const directMission = question.includes('--- Photo ') ? "Évalue l'ensemble de son travail (transcrit depuis des photos) et réponds directement à sa demande d'aide." : "Réponds directement à la question de l'élève.";
        explain(`${basePrompt}\n\nMISSION: ${directMission}`, chapter.id, 'direct');
    }, [isLoading, user, resetState, buildBasePrompt, explain, chapter.id]);

    const resetForNewQuestion = useCallback(() => {
        resetState();
        setMainQuestion('');
    }, [resetState]);

    const logGeneratedCorrection = useCallback(async (response: AIResponse) => {
        if (fullCorrection === null && response) {
            const supabase = getSupabase();
            try {
                await supabase.from('corrections_proposees').insert({ exercise_id: exercise.id, proposed_correction: response.socraticPath || { explanation: response.explanation } });
            } catch (err) {
                if (!(err instanceof Error && (err as any).code === '23505')) {
                    console.error("Exception dans logGeneratedCorrection:", err);
                }
            }
        }
    }, [fullCorrection, exercise.id]);
    
    // --- Effects ---
    useEffect(() => {
        const fetchCorrection = async () => {
            if (!exercise.id) return;
            setIsFetchingCorrection(true);
            setFullCorrection(null);
            const supabase = getSupabase();
            try {
                const { data, error } = await supabase.from('corrections').select('correction').eq('exercise_id', exercise.id).limit(1);
                if (error) console.error("Erreur lors de la recherche du corrigé:", error);
                if (data && data.length > 0) setFullCorrection(data[0].correction);
                else setFullCorrection(exercise.fullCorrection || null);
            } catch (err) {
                console.error("Exception dans fetchCorrection:", err);
            } finally {
                setIsFetchingCorrection(false);
            }
        };
        fetchCorrection();
    }, [exercise.id, exercise.fullCorrection]);

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
            logGeneratedCorrection(aiResponse);
        }
    }, [aiResponse, logGeneratedCorrection]);

    useEffect(() => {
        if (dialogue.length > 0) {
            dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [dialogue]);

    useEffect(() => {
        if (aiError && (aiError.includes("configurée") || aiError.includes("valide"))) {
            setIsAIFeatureEnabled(false);
        }
    }, [aiError]);

    // --- Event Handlers ---
    const handleFileSelectAndOcr = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        setIsOcrLoading(true);
        setSubmissionError(null);
    
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour analyser des images.");
    
            const imagePayloads = await Promise.all(
                Array.from(files).map(async (file) => {
                    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                    const compressedFile = await imageCompression(file, options);
                    const base64Image = await fileToBase64(compressedFile);
                    return { image: base64Image, mimeType: compressedFile.type };
                })
            );
            
            const response = await fetch('/api/ocr-multipage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ images: imagePayloads }),
            });
    
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `L'analyse des photos a échoué.`);
            }
            const { text } = await response.json();
            
            const newOcrText = `${mainQuestion ? mainQuestion + '\n\n' : ''}${convertMathJaxToLatex(text)}`.trim();
            
            setOcrResultText(newOcrText);
            setIsVerificationStep(true);
    
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setSubmissionError(errorMessage);
        } finally {
            setIsOcrLoading(false);
            if (event.target) event.target.value = ''; // Reset file input
        }
    };
    
    const handleConfirmOcr = () => {
        if (!ocrResultText.trim()) {
            setSubmissionError("Le texte ne peut pas être vide.");
            return;
        }
        setMainQuestion(ocrResultText);
        startSocraticTutor(ocrResultText);
        setIsVerificationStep(false);
    };

    const handleCancelOcr = () => {
        setOcrResultText('');
        setIsVerificationStep(false);
    };


    const handleStudentResponse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentInput.trim() || !socraticPath || isTutorFinished || isSubmitting) return;

        setIsStuck(false);
        setDialogue(prev => [...prev, { role: 'user', content: studentInput }]);
        const currentInput = studentInput;
        setStudentInput('');
        setIsSubmitting(true);
        setSubmissionError(null);

        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour valider votre réponse.");

            const requestBody = {
                studentAnswer: currentInput,
                currentIaQuestion: socraticPath[currentStep].ia_question,
                expectedAnswerKeywords: socraticPath[currentStep].expected_answer_keywords,
            };

            const response = await fetch('/api/validate-socratic-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erreur du serveur (${response.status})`);
            }

            const { is_correct } = await response.json();
            
            const newDialogue: DialogueMessage[] = [];
            if (is_correct) {
                newDialogue.push({ role: 'ai', content: socraticPath[currentStep].positive_feedback });
                const nextStep = currentStep + 1;
                if (nextStep < socraticPath.length) {
                    newDialogue.push({ role: 'ai', content: socraticPath[nextStep].ia_question });
                    setCurrentStep(nextStep);
                } else {
                    newDialogue.push({ role: 'system', content: 'Félicitations, vous avez terminé ce parcours !' });
                    setIsTutorFinished(true);
                }
            } else {
                newDialogue.push({ role: 'ai', content: socraticPath[currentStep].hint_for_wrong_answer });
                setIsStuck(true);
            }
            setDialogue(prev => [...prev, ...newDialogue]);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setSubmissionError(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleImStuck = () => {
        if (!socraticPath || isTutorFinished) return;
        const currentSocraticStep = socraticPath[currentStep];
        const expected = currentSocraticStep.expected_answer_keywords.join('" ou "');
        const newDialogue: DialogueMessage[] = [{ role: 'system', content: `Voici la réponse attendue : **"${expected}"**. Continuons.` }];
        setIsStuck(false);
        const nextStep = currentStep + 1;
        if (nextStep < socraticPath.length) {
            newDialogue.push({ role: 'ai', content: socraticPath[nextStep].ia_question });
            setCurrentStep(nextStep);
        } else {
            newDialogue.push({ role: 'system', content: 'Félicitations, vous avez terminé ce parcours !' });
            setIsTutorFinished(true);
        }
        setDialogue(prev => [...prev, ...newDialogue]);
    };

    const isReadyForUser = !!user && isAIFeatureEnabled && !isFetchingCorrection;
    const isProcessing = isLoading || isFetchingCorrection || isSubmitting || isOcrLoading;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors">
                <ArrowLeftIcon className="w-5 h-5" />
                Retour à l'exercice
            </button>
            <div className="bg-slate-800/30 rounded-xl p-6 border border-gray-700/30">
                <h2 className="text-2xl font-bold text-brand-blue-300 mb-2">Tutorat IA : {chapter.title}</h2>
                 <div className="prose prose-invert max-w-none text-sm text-slate-400 line-clamp-3">
                    <MathJaxRenderer content={DOMPurify.sanitize(marked.parse(exercise.statement) as string)} />
                </div>
            </div>
            <div className="bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-lg p-6 space-y-6">
                <div>
                    {!user && <div className="p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-sm">Vous devez être connecté pour utiliser l'IA.</div>}
                    
                    {isVerificationStep ? (
                        <div className="space-y-4 animate-fade-in">
                            <h3 className="text-xl font-semibold text-yellow-300">Vérifiez la transcription</h3>
                            <p className="text-sm text-slate-400">L'IA a transcrit le texte de vos photos. Veuillez le vérifier et le corriger si nécessaire avant de continuer.</p>
                            <textarea
                                value={ocrResultText}
                                onChange={(e) => setOcrResultText(e.target.value)}
                                rows={10}
                                className="w-full p-3 bg-slate-950 border-2 border-slate-700 rounded-lg text-slate-300 font-mono"
                            />
                            {submissionError && <p className="text-sm text-red-400">{submissionError}</p>}
                            <div className="flex gap-4">
                                <button
                                    onClick={handleConfirmOcr}
                                    className="flex-1 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700"
                                >
                                    Confirmer et démarrer le tutorat
                                </button>
                                <button
                                    onClick={handleCancelOcr}
                                    className="px-5 py-3 font-semibold text-slate-300 bg-slate-700 rounded-lg shadow-md hover:bg-slate-600"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 mt-4">
                            <div className="p-4 bg-slate-800 border-2 border-slate-700 rounded-lg min-h-[6rem] flex flex-col justify-center">
                                {mainQuestion ? <MathJaxRenderer content={`$$${mainQuestion}$$`} /> : <span className="text-slate-500">Posez votre question ou joignez une photo de votre travail ici...</span>}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <button type="button" onClick={() => setIsKeyboardOpen(true)} disabled={!isReadyForUser || isLoading || isTutorActive} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-slate-700 rounded-lg shadow-md hover:bg-slate-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                                    <PencilIcon className="w-5 h-5" />
                                    {mainQuestion ? "Modifier ma question" : "Saisir ma question"}
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileSelectAndOcr} className="hidden" accept="image/*" multiple />
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!isReadyForUser || isProcessing || isTutorActive} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-slate-700 rounded-lg shadow-md hover:bg-slate-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                                    {isOcrLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <PaperClipIcon className="w-5 h-5" />}
                                    Joindre une photo
                                </button>
                            </div>

                            {isKeyboardOpen && <MathKeyboard initialValue={mainQuestion} onConfirm={(latex) => { setMainQuestion(latex); setIsKeyboardOpen(false); }} onClose={() => setIsKeyboardOpen(false)} />}
                            
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => startSocraticTutor(mainQuestion)} disabled={!isReadyForUser || isLoading || !mainQuestion.trim() || isTutorActive} className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">Démarrer le tutorat interactif</button>
                                <button type="button" onClick={() => askForDirectAnswer(mainQuestion)} disabled={!isReadyForUser || isLoading || !mainQuestion.trim() || isTutorActive} className="inline-flex items-center justify-center gap-2 px-4 py-2 font-semibold text-slate-200 bg-slate-600 rounded-lg hover:bg-slate-700 disabled:opacity-70 disabled:cursor-not-allowed">Voir la réponse directe</button>
                            </div>
                        </div>
                    )}
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
                        {isProcessing && (
                            <div className="flex flex-col items-center justify-center text-slate-400 p-8">
                                <SpinnerIcon className="w-10 h-10 animate-spin text-brand-blue-500" />
                                <p className="mt-3 text-md">{isFetchingCorrection ? "Recherche d'un corrigé..." : isOcrLoading ? "Analyse de l'image..." : "L'IA prépare votre tutorat..."}</p>
                            </div>
                        )}
                        {isSubmitting && (
                            <div className="flex items-start">
                                <div className="chat-bubble ai-bubble flex items-center gap-2">
                                    <SpinnerIcon className="w-5 h-5 animate-spin"/>
                                    <span>Analyse en cours...</span>
                                </div>
                            </div>
                        )}
                        {(aiError || submissionError) && <div className="text-red-400 p-4 text-center"><p><span className="font-bold">Erreur :</span> {aiError || submissionError}</p></div>}
                        {dialogue.length === 0 && !isProcessing && !aiError && !isVerificationStep && <div className="flex items-center justify-center h-full text-slate-500"><p>La conversation avec l'IA apparaîtra ici.</p></div>}
                    </div>

                    {isTutorActive && !isTutorFinished && !isLoading && (
                        <form onSubmit={handleStudentResponse} className="mt-4 pt-4 border-t border-slate-700 space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <textarea
                                    value={studentInput}
                                    onChange={(e) => setStudentInput(e.target.value)}
                                    placeholder={socraticPath?.[currentStep]?.student_response_prompt || "Votre réponse..."}
                                    disabled={isSubmitting}
                                    rows={3}
                                    className="flex-grow p-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-brand-blue-500 disabled:opacity-50"
                                />
                                <button type="submit" disabled={!studentInput.trim() || isSubmitting} className="px-4 py-2 bg-brand-blue-600 text-white font-semibold rounded-lg hover:bg-brand-blue-700 disabled:opacity-50">
                                    Envoyer
                                </button>
                            </div>
                            {isStuck && (
                                <div className="flex justify-end pt-2">
                                    <button type="button" onClick={handleImStuck} className="px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg hover:bg-yellow-700 animate-pulse">Je suis bloqué</button>
                                </div>
                            )}
                        </form>
                    )}
                    {(dialogue.length > 0) && !isLoading && (
                        <div className="mt-4 pt-2 border-t border-slate-700/50 flex justify-between items-center gap-3">
                            <button onClick={resetForNewQuestion} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700">Recommencer</button>
                        </div>
                    )}
                    {videoChunk && (
                        <div className="mt-6 p-4 bg-brand-blue-900/20 border-l-4 border-brand-blue-500 rounded-r-lg">
                            <h4 className="text-sm font-semibold text-brand-blue-300 mb-2">💡 Passage pertinent dans la vidéo du cours :</h4>
                            <p className="text-sm italic text-slate-300/90 mb-3">"{videoChunk.chunk_text}"</p>
                            <button onClick={() => onNavigateToTimestamp(levelId, chapter.id, videoChunk.video_id, videoChunk.start_time_seconds)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-500">
                                <PlayCircleIcon className="w-5 h-5"/>Regarder ce passage
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
