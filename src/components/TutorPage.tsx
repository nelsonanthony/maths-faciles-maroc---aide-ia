
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, PlayCircleIcon, PaperClipIcon, ArrowLeftIcon, PencilIcon, XCircleIcon, CheckCircleIcon, CameraIcon } from '@/components/icons';
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

const AiMessage: React.FC<{ message: DialogueMessage; response?: AIResponse | null; onNavigate: () => void; }> = ({ message, response, onNavigate }) => {
    const safeContent = DOMPurify.sanitize(marked.parse(message.content, { breaks: true }) as string);
    const videoChunk = response?.videoChunk;
    return (
        <div className="chat-bubble ai-bubble self-start animate-fade-in">
            <div className="prose prose-invert max-w-none text-sm">
                <MathJaxRenderer content={safeContent} />
            </div>
            {videoChunk && (
                <button
                    onClick={onNavigate}
                    className="mt-3 p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg w-full text-left"
                >
                    <div className="flex items-center gap-3">
                        <PlayCircleIcon className="w-8 h-8 text-rose-400 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-rose-300 text-xs">Vidéo pertinente trouvée</p>
                            <p className="text-slate-300 text-xs line-clamp-2">"{videoChunk.chunk_text}"</p>
                        </div>
                    </div>
                </button>
            )}
        </div>
    );
};

export const TutorPage: React.FC<TutorPageProps> = ({ exercise, chapter, levelId, onBack, onNavigateToTimestamp }) => {
    const { user } = useAuth();
    const { data: aiResponse, isLoading: isAIExplainLoading, error: aiError, explain, reset: resetAIExplain } = useAIExplain();
    
    const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
    const [socraticPath, setSocraticPath] = useState<SocraticPath | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [studentInput, setStudentInput] = useState('');
    const [isTutorActive, setIsTutorActive] = useState(false);
    const [isTutorFinished, setIsTutorFinished] = useState(false);

    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<'correct' | 'incorrect' | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [isRateLimited, setIsRateLimited] = useState(false);

    const [inputMode, setInputMode] = useState<'text' | 'photo'>('text');
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedFileSrc, setUploadedFileSrc] = useState<string | null>(null);
    const [isOcrLoading, setIsLoadingOcr] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [dialogue]);

    useEffect(() => {
        const combinedError = aiError || error;
        if (combinedError) {
             setError(combinedError);
             if (combinedError.includes("limite") || combinedError.includes("limit") || combinedError.includes("429")) {
                setIsRateLimited(true);
            }
        }
    }, [aiError, error]);

    useEffect(() => {
        if (aiResponse?.socraticPath) {
            setSocraticPath(aiResponse.socraticPath);
            setIsTutorActive(true);
            setDialogue([{ role: 'system', content: 'Le tuteur a été initialisé. Répondez à la première question.' }]);
            setCurrentStep(0);
        }
        if (aiResponse?.explanation) {
            addMessageToDialogue('ai', aiResponse.explanation);
        }
    }, [aiResponse]);

    useEffect(() => {
        if (isTutorActive && socraticPath && currentStep < socraticPath.length) {
            const currentQuestion = socraticPath[currentStep].ia_question;
            addMessageToDialogue('ai', currentQuestion);
        } else if (isTutorActive && socraticPath && currentStep === socraticPath.length) {
            addMessageToDialogue('ai', "Bravo, vous avez terminé toutes les étapes ! L'exercice est résolu. Vous pouvez maintenant le marquer comme terminé sur la page de l'exercice pour gagner de l'XP.");
            setIsTutorFinished(true);
        }
    }, [currentStep, socraticPath, isTutorActive]);

    const addMessageToDialogue = (role: DialogueMessage['role'], content: string) => {
        setDialogue(prev => [...prev, { role, content }]);
    };

    const handleStartTutor = () => {
        resetAIExplain();
        setError(null);
        setDialogue([]);
        const prompt = `---CONTEXTE EXERCICE---
        ${exercise.statement}
        ${exercise.correctionSnippet ? `\n---CORRECTION/INDICE---
        ${exercise.correctionSnippet}` : ''}
        
        ---DEMANDE ÉLÈVE---
        J'ai besoin d'aide pour commencer cet exercice. Guide-moi pas à pas (mode socratique).`;
        explain(prompt, chapter.id, 'socratic');
    };

    const handleGetDirectHelp = () => {
        const lastAiMessage = dialogue.filter(d => d.role === 'ai').pop();
        const prompt = `---CONTEXTE EXERCICE---
        ${exercise.statement}
        ${exercise.correctionSnippet ? `\n---CORRECTION/INDICE---
        ${exercise.correctionSnippet}` : ''}

        ---HISTORIQUE DISCUSSION---
        ${dialogue.map(d => `${d.role}: ${d.content}`).join('\n')}
        
        ---DEMANDE ÉLÈVE---
        Je suis bloqué. Donne-moi une explication directe pour l'étape actuelle : "${lastAiMessage?.content || "l'exercice"}"`;
        explain(prompt, chapter.id, 'direct');
    };

    const handleSubmitAnswer = async (answer: string) => {
        if (!socraticPath || isVerifying) return;
        addMessageToDialogue('user', answer);
        setStudentInput('');
        setIsVerifying(true);
        setVerificationResult(null);
        setError(null);

        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");

            const response = await fetch('/api/validate-socratic-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    studentAnswer: answer,
                    currentIaQuestion: socraticPath[currentStep].ia_question,
                    expectedAnswerKeywords: socraticPath[currentStep].expected_answer_keywords,
                })
            });
            const bodyText = await response.text();
            if (!response.ok) {
                const errData = JSON.parse(bodyText);
                throw new Error(errData.error);
            }

            const data = JSON.parse(bodyText);
            if (data.is_correct) {
                setVerificationResult('correct');
                addMessageToDialogue('ai', socraticPath[currentStep].positive_feedback);
                setTimeout(() => {
                    setCurrentStep(prev => prev + 1);
                    setVerificationResult(null);
                }, 2000);
            } else {
                setVerificationResult('incorrect');
                addMessageToDialogue('ai', socraticPath[currentStep].hint_for_wrong_answer);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsVerifying(false);
        }
    };
    
    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setUploadedFile(file);
            setUploadedFileSrc(URL.createObjectURL(file));
            setError(null);
        }
    };

    const handleOcrAndSubmit = async () => {
        if (!uploadedFile) return;
        setIsLoadingOcr(true);
        setError(null);
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Auth required");

            const compressedFile = await imageCompression(uploadedFile, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
            const base64Image = await fileToBase64(compressedFile);
            const response = await fetch('/api/ocr-with-gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ image: base64Image, mimeType: compressedFile.type }),
            });
            const bodyText = await response.text();
            if (!response.ok) {
                const errData = JSON.parse(bodyText);
                throw new Error(errData.error);
            }

            const data = JSON.parse(bodyText);
            await handleSubmitAnswer(data.text);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoadingOcr(false);
            setUploadedFile(null);
            setUploadedFileSrc(null);
        }
    };

    const isLoadingAction = isAIExplainLoading || isVerifying || isOcrLoading;
    const isDisabled = isLoadingAction || isTutorFinished || isRateLimited;

    return (
        <div className="max-w-4xl mx-auto flex flex-col h-[90vh]">
            <header className="p-4 flex items-center gap-4 flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-700">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="flex-grow">
                    <h2 className="text-xl font-bold text-brand-blue-300">Tuteur IA</h2>
                    <p className="text-xs text-slate-400 truncate">{exercise.statement}</p>
                </div>
            </header>
            
            <main className="flex-grow p-4 overflow-y-auto space-y-4 bg-slate-900/50 rounded-t-xl border-t border-x border-slate-800">
                 {dialogue.map((msg, index) => (
                    msg.role === 'ai'
                        ? <AiMessage key={index} message={msg} response={aiResponse} onNavigate={() => onNavigateToTimestamp(levelId, chapter.id, aiResponse!.videoChunk!.video_id, aiResponse!.videoChunk!.start_time_seconds)} />
                        : <div key={index} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'system-bubble'} self-end animate-fade-in`}>
                            <MathJaxRenderer content={msg.content} />
                          </div>
                ))}
                {isLoadingAction && <div className="text-center"><SpinnerIcon className="w-6 h-6 animate-spin text-slate-400" /></div>}
                
                {isTutorActive && verificationResult && (
                    <div className={`self-end flex items-center gap-2 text-sm px-3 py-1 rounded-full ${verificationResult === 'correct' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {verificationResult === 'correct' ? <CheckCircleIcon className="w-4 h-4" /> : <XCircleIcon className="w-4 h-4" />}
                        {verificationResult === 'correct' ? 'Correct !' : 'Incorrect.'}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </main>
            
             <footer className="p-4 bg-slate-800/80 backdrop-blur-sm rounded-b-xl border-b border-x border-slate-700/50">
                {isRateLimited ? (
                     <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm text-center">
                        {error}
                     </div>
                ) : !isTutorActive ? (
                     <button onClick={handleStartTutor} disabled={isLoadingAction} className="w-full px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 transition-colors disabled:opacity-50">
                        {isAIExplainLoading ? "Initialisation..." : "Démarrer le tutorat"}
                     </button>
                ) : (
                    <div className="space-y-3">
                         {inputMode === 'text' && (
                             <div className="flex items-center gap-2">
                                 <input
                                     type="text"
                                     value={studentInput}
                                     onChange={(e) => setStudentInput(e.target.value)}
                                     onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer(studentInput)}
                                     placeholder={socraticPath?.[currentStep]?.student_response_prompt || "Votre réponse..."}
                                     className="w-full p-3 pr-14 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                                     disabled={isDisabled}
                                 />
                                 <button type="button" onClick={() => setIsKeyboardOpen(true)} className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600" disabled={isDisabled}>
                                    <span className="font-serif text-xl italic text-brand-blue-300">ƒ(x)</span>
                                 </button>
                                 <button onClick={() => handleSubmitAnswer(studentInput)} className="px-4 py-3 bg-brand-blue-600 text-white font-semibold rounded-lg disabled:opacity-50" disabled={isDisabled || !studentInput.trim()}>
                                    Envoyer
                                </button>
                             </div>
                         )}
                         {inputMode === 'photo' && (
                             <div className="flex items-center gap-2">
                                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 p-3 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50" disabled={isDisabled}>
                                    <PaperClipIcon className="w-5 h-5"/> {uploadedFile ? "Changer" : "Choisir photo"}
                                </button>
                                {uploadedFile && (
                                    <button onClick={handleOcrAndSubmit} className="flex-1 px-4 py-3 bg-brand-blue-600 text-white font-semibold rounded-lg disabled:opacity-50" disabled={isDisabled}>
                                        <div className="flex items-center justify-center gap-2">
                                            <CameraIcon className="w-5 h-5"/> Envoyer la photo
                                        </div>
                                    </button>
                                )}
                             </div>
                         )}

                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 p-1 bg-gray-900/50 rounded-lg">
                                 <button onClick={() => setInputMode('text')} className={`px-2 py-1 text-xs rounded ${inputMode === 'text' ? 'bg-brand-blue-600/50' : ''}`} disabled={isDisabled}>Texte</button>
                                 <button onClick={() => setInputMode('photo')} className={`px-2 py-1 text-xs rounded ${inputMode === 'photo' ? 'bg-brand-blue-600/50' : ''}`} disabled={isDisabled}>Photo</button>
                             </div>
                             <button onClick={handleGetDirectHelp} className="text-xs text-slate-400 hover:text-brand-blue-300 disabled:opacity-50" disabled={isDisabled}>
                                 Je suis bloqué, donne-moi de l'aide
                             </button>
                         </div>
                         {error && !isRateLimited && <p className="text-sm text-red-400">{error}</p>}
                    </div>
                )}
                {isKeyboardOpen && (
                    <MathKeyboard 
                        initialValue={studentInput}
                        onConfirm={(latex) => { setStudentInput(latex); setIsKeyboardOpen(false); }}
                        onClose={() => setIsKeyboardOpen(false)}
                    />
                )}
            </footer>
        </div>
    );
};
