
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, PlayCircleIcon, PaperClipIcon, ArrowLeftIcon, XCircleIcon, CameraIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueMessage, SocraticPath, AIResponse, Exercise, Chapter } from '@/types';
import { MathJaxRenderer } from './MathJaxRenderer';
import { getSupabase } from '../services/authService';
import { EditableMathField, MathField } from 'react-mathquill';
import { MathKeyboard } from './MathKeyboard';


interface TutorPageProps {
    exercise: Exercise;
    chapter: Chapter;
    levelId: string;
    onBack: () => void;
    onNavigateToTimestamp: (levelId: string, chapterId: string, videoId: string, time: number) => void;
    dialogueHistory: DialogueMessage[];
    onDialogueUpdate: (dialogue: DialogueMessage[]) => void;
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

const TutorSummary: React.FC<{ dialogue: DialogueMessage[], onBack: () => void }> = ({ dialogue, onBack }) => (
    <div className="p-4 space-y-4 animate-fade-in h-full flex flex-col">
        <h3 className="text-2xl font-bold text-center text-slate-100">Résumé de la session</h3>
        <p className="text-sm text-center text-slate-400">Voici un récapitulatif de votre discussion avec le tuteur.</p>
        <div className="space-y-4 flex-grow overflow-y-auto p-4 bg-slate-950 rounded-lg border border-slate-800">
            {dialogue.map((msg, index) => {
                let contentToRender;
                if (msg.role === 'ai') {
                    contentToRender = DOMPurify.sanitize(marked.parse(msg.content, { breaks: true }) as string);
                } else {
                    const alignedContent = '& ' + msg.content.replace(/\\\\/g, ' \\\\ & ');
                    contentToRender = `$$\\begin{aligned}${alignedContent}\\end{aligned}$$`;
                }

                return (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'} max-w-full`}>
                            <MathJaxRenderer content={contentToRender} />
                        </div>
                    </div>
                );
            })}
        </div>
        <div className="text-center mt-4 flex-shrink-0">
            <button onClick={onBack} className="px-6 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700">
                Retour à l'exercice
            </button>
        </div>
    </div>
);


export const TutorPage: React.FC<TutorPageProps> = ({ exercise, chapter, levelId, onBack, onNavigateToTimestamp, dialogueHistory, onDialogueUpdate }) => {
    const { user } = useAuth();
    const { data: aiResponse, isLoading: isAIExplainLoading, error: aiError, explain, reset: resetAIExplain } = useAIExplain();
    
    const dialogue = dialogueHistory;
    
    const [socraticPath, setSocraticPath] = useState<SocraticPath | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [studentInput, setStudentInput] = useState('');
    const [isTutorActive, setIsTutorActive] = useState(false); // Controls if we are in socratic mode
    const [isTutorFinished, setIsTutorFinished] = useState(false);

    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<'correct' | 'incorrect' | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [isRateLimited, setIsRateLimited] = useState(false);

    const [inputMode, setInputMode] = useState<'text' | 'photo'>('text');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedFileSrc, setUploadedFileSrc] = useState<string | null>(null);
    const [isOcrLoading, setIsLoadingOcr] = useState(false);
    const [ocrVerificationText, setOcrVerificationText] = useState<string | null>(null);
    
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const mathFieldRef = useRef<MathField | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    const dialogueRef = useRef(dialogueHistory);
    useEffect(() => {
        dialogueRef.current = dialogueHistory;
    }, [dialogueHistory]);
    
    const addMessageToDialogue = useCallback((role: DialogueMessage['role'], content: string) => {
        const newDialogue = [...dialogueRef.current, { role, content }];
        onDialogueUpdate(newDialogue);
    }, [onDialogueUpdate]);

    // Initialize the conversation if the history is empty
    useEffect(() => {
        if (dialogue.length === 0) {
            addMessageToDialogue('ai', "Bonjour ! Pour commencer, décris-moi ce que tu as déjà fait ou envoie-moi une photo de ton brouillon. Si tu n'as pas encore commencé, dis-le moi et nous débuterons ensemble.");
        }
    }, [dialogue.length, addMessageToDialogue]);

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
    
    // Effect to process the initial AI response and start the tutor
    useEffect(() => {
        if (aiResponse?.socraticPath) {
            const path = aiResponse.socraticPath;
            const startIndex = aiResponse.startingStepIndex ?? 0;

            setSocraticPath(path);
            
            if (startIndex >= path.length) {
                addMessageToDialogue('ai', "Il semble que tu aies déjà résolu cet exercice avec succès. Excellent travail ! Si tu as d'autres questions, n'hésite pas.");
                setIsTutorFinished(true);
            } else {
                setCurrentStep(startIndex);
            }
            setIsTutorActive(true);
        }
        if (aiResponse?.explanation) {
            addMessageToDialogue('ai', aiResponse.explanation);
        }
    }, [aiResponse, addMessageToDialogue]);
    
    // Effect to advance the socratic dialogue
    useEffect(() => {
        if (isTutorActive && socraticPath && currentStep < socraticPath.length) {
            const currentQuestion = socraticPath[currentStep].ia_question;
            // Use the ref to get the latest dialogue state without adding a dependency on the dialogue array itself.
            const lastMessage = dialogueRef.current[dialogueRef.current.length - 1];
            if (!lastMessage || lastMessage.role !== 'ai' || lastMessage.content !== currentQuestion) {
                 addMessageToDialogue('ai', currentQuestion);
            }
        } else if (isTutorActive && socraticPath && currentStep >= socraticPath.length && !isTutorFinished) {
            addMessageToDialogue('ai', "Bravo, vous avez terminé toutes les étapes ! L'exercice est résolu. Vous pouvez maintenant le marquer comme terminé sur la page de l'exercice pour gagner de l'XP.");
            setIsTutorFinished(true);
        }
    // This effect should only run when the step changes, not on every new message.
    }, [currentStep, socraticPath, isTutorActive, isTutorFinished, addMessageToDialogue]);

    
    // Called only for the FIRST user message to initialize the tutor
    const startTutor = (initialWork: string) => {
        resetAIExplain();
        setError(null);
        addMessageToDialogue('user', initialWork);
        setStudentInput('');
        
        const prompt = `---CONTEXTE EXERCICE---
        ${exercise.statement}
        ${exercise.fullCorrection ? `\n---CORRECTION---
        ${exercise.fullCorrection}`: (exercise.correctionSnippet ? `\n---INDICE---
        ${exercise.correctionSnippet}` : '')}
        
        ---DEMANDE ÉLÈVE---
        ${initialWork.trim() || "J'ai besoin d'aide pour commencer cet exercice. Guide-moi pas à pas (mode socratique)."}`;
        explain(prompt, chapter.id, 'socratic');
    };

    // Called for subsequent answers during the socratic dialogue
    const validateAnswer = async (answer: string) => {
        if (!socraticPath || isVerifying) return;
        
        addMessageToDialogue('user', answer);
        setStudentInput('');
        setIsVerifying(true);
        setVerificationResult(null);

        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");

            const response = await fetch('/api/validate-socratic-answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ 
                    studentAnswer: answer,
                    currentIaQuestion: socraticPath[currentStep].ia_question,
                    expectedAnswerKeywords: socraticPath[currentStep].expected_answer_keywords,
                    exerciseStatement: exercise.statement,
                    exerciseCorrection: exercise.fullCorrection || exercise.correctionSnippet
                }),
            });
            
            const responseBody = await response.text();

            if (!response.ok) {
                let errorMessage;
                try {
                    const errorData = JSON.parse(responseBody);
                    errorMessage = errorData.error || `Une erreur est survenue (${response.status})`;
                } catch (e) {
                    errorMessage = responseBody || `Une erreur est survenue (${response.status})`;
                }
                throw new Error(errorMessage);
            }
            
            const result = await JSON.parse(responseBody);
            
            if(result.is_correct) {
                // The AI can provide more specific positive feedback than our canned one.
                const feedbackMessage = result.feedback_message || socraticPath[currentStep]?.positive_feedback;
                addMessageToDialogue('ai', feedbackMessage);
                setVerificationResult('correct');
                // Give time for user to read feedback before showing next question
                setTimeout(() => {
                    setCurrentStep(prev => prev + 1);
                }, 1000); 
            } else {
                const feedbackMessage = result.feedback_message || socraticPath[currentStep]?.hint_for_wrong_answer;
                addMessageToDialogue('ai', feedbackMessage);
                setVerificationResult('incorrect');
            }
            
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de la vérification.');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setUploadedFile(file);
            setUploadedFileSrc(URL.createObjectURL(file));
            setOcrVerificationText(null); // Reset verification text when new image is uploaded
        }
    };
    
    const handleOcr = async () => {
        if (!uploadedFile) return;
        setIsLoadingOcr(true);
        setError(null);
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");

            const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
            const compressedFile = await imageCompression(uploadedFile, options);
            const base64Image = await fileToBase64(compressedFile);

            const response = await fetch('/api/ocr-with-gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ image: base64Image, mimeType: compressedFile.type }),
            });

            const responseBody = await response.text();
            if (!response.ok) {
                 const errorData = JSON.parse(responseBody);
                 throw new Error(errorData.error || `Une erreur est survenue (${response.status})`);
            }
            const result = JSON.parse(responseBody);
            setOcrVerificationText(result.text);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors du traitement de l\'image.');
        } finally {
            setIsLoadingOcr(false);
        }
    };

    const handleSubmit = () => {
        const textToSend = ocrVerificationText !== null ? ocrVerificationText : studentInput;
        if (!textToSend.trim()) return;

        if (isTutorActive) {
            validateAnswer(textToSend);
        } else {
            startTutor(textToSend);
        }
        setOcrVerificationText(null);
        setUploadedFile(null);
        setUploadedFileSrc(null);
    };

    const isLoading = isAIExplainLoading || isVerifying || isOcrLoading;
    const currentPrompt = socraticPath?.[currentStep]?.student_response_prompt || 'Décris ton raisonnement...';
    
    if (isTutorFinished) {
        return <TutorSummary dialogue={dialogue} onBack={onBack} />;
    }

    return (
        <div className="flex flex-col h-full max-h-[85vh] bg-slate-900 rounded-xl border border-slate-800 shadow-2xl">
            {/* Header */}
            <header className="p-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-700/50">
                    <ArrowLeftIcon className="w-5 h-5 text-slate-400" />
                </button>
                <div className="text-center">
                    <h2 className="text-base font-bold text-slate-100 truncate max-w-xs sm:max-w-md md:max-w-lg">{exercise.statement}</h2>
                    <p className="text-xs text-brand-blue-400">Tuteur IA</p>
                </div>
                 <div className="w-9 h-9" />
            </header>

            {/* Chat Area */}
            <main className="flex-grow p-4 overflow-y-auto space-y-4">
                {dialogue.map((msg, index) => (
                    msg.role === 'ai' ? (
                        <AiMessage 
                            key={index} 
                            message={msg}
                            response={aiResponse}
                            onNavigate={() => onNavigateToTimestamp(levelId, chapter.id, aiResponse?.videoChunk!.video_id, aiResponse?.videoChunk!.start_time_seconds)} 
                        />
                    ) : (
                        <div key={index} className="flex justify-end animate-fade-in">
                            <div className="chat-bubble user-bubble">
                                <MathJaxRenderer content={`$$${msg.content.replace(/\\\\/g, '\\\\\\\\')}$$`} />
                            </div>
                        </div>
                    )
                ))}
                
                {isLoading && (
                     <div className="flex justify-start">
                         <div className="chat-bubble ai-bubble flex items-center gap-2">
                            <SpinnerIcon className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Analyse en cours...</span>
                         </div>
                     </div>
                )}
                 <div ref={messagesEndRef} />
            </main>

            {/* Input Area */}
            <footer className="p-3 border-t border-slate-800 flex-shrink-0 bg-slate-950/50 rounded-b-xl">
                 {error && (
                    <div className="mb-2 p-2 bg-rose-900/30 border border-rose-500/50 rounded-lg text-center text-xs text-rose-300">
                        {error}
                    </div>
                 )}

                 {isKeyboardOpen && (
                    <MathKeyboard
                        initialValue={studentInput}
                        onConfirm={(latex) => { setStudentInput(latex); setIsKeyboardOpen(false); }}
                        onClose={() => setIsKeyboardOpen(false)}
                    />
                )}
                
                {ocrVerificationText !== null ? (
                    <div className="space-y-2 animate-fade-in">
                         <p className="text-xs text-yellow-300 text-center">Veuillez vérifier et corriger le texte extrait de votre image :</p>
                         <textarea
                            value={ocrVerificationText}
                            onChange={(e) => setOcrVerificationText(e.target.value)}
                            rows={4}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-md text-sm font-mono"
                         />
                    </div>
                ) : uploadedFileSrc ? (
                    <div className="relative w-32 h-32 mx-auto mb-2 group">
                        <img src={uploadedFileSrc} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                        <button onClick={() => { setUploadedFile(null); setUploadedFileSrc(null); }} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100">
                            <XCircleIcon className="w-5 h-5" />
                        </button>
                    </div>
                ) : null}

                <div className="flex items-end gap-2">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />

                    <div className="flex-grow space-y-1">
                        <div className="flex items-stretch gap-2">
                            <div className="math-input-wrapper flex-grow">
                                <EditableMathField
                                    latex={studentInput}
                                    onChange={(field) => { setStudentInput(field.latex()); setError(null); }}
                                    mathquillDidMount={(field) => (mathFieldRef.current = field)}
                                    config={{ autoOperatorNames: 'sin cos tan log ln' }}
                                    aria-placeholder={currentPrompt}
                                    className="h-full"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsKeyboardOpen(true)}
                                className="px-3 bg-slate-800 rounded-lg hover:bg-slate-700 flex items-center justify-center shrink-0"
                                aria-label="Ouvrir le clavier mathématique"
                            >
                                <span className="font-serif text-xl italic text-brand-blue-300">ƒ(x)</span>
                            </button>
                             <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3 bg-slate-800 rounded-lg hover:bg-slate-700 flex items-center justify-center shrink-0"
                                aria-label="Joindre une photo"
                            >
                               <CameraIcon className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading || isRateLimited}
                        className="self-stretch px-4 py-2 bg-brand-blue-600 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center"
                    >
                        {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : 'Envoyer'}
                    </button>
                </div>
            </footer>
        </div>
    );
};
