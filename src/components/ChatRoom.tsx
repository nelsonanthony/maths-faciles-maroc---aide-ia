import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';
import { useAIExplain } from '@/hooks/useAIExplain';
import { SpinnerIcon, PlayCircleIcon, PaperClipIcon, ArrowLeftIcon, XCircleIcon } from '@/components/icons';
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

const processLineForMathJax = (line: string): string => {
    // This regex identifies consecutive sequences of 2 or more letters (including accented ones).
    const textRegex = /([a-zA-Z\u00C0-\u017F]{2,})/g;
    
    // Split the line by these text blocks. The text blocks will be at odd indices in the resulting array.
    const parts = line.split(textRegex);

    return parts.map((part, index) => {
        // If it's a text block (odd index), wrap it in \text{}.
        if (index % 2 === 1) {
            return `\\text{${part}}`;
        } else {
            // Otherwise, it's a mix of symbols, numbers, single letters, and spaces.
            // Replace spaces with non-breaking spaces `~` for correct rendering in math mode.
            return part.replace(/ /g, '~');
        }
    }).join('');
};

const TutorSummary: React.FC<{ dialogue: DialogueMessage[], onBack: () => void }> = ({ dialogue, onBack }) => (
    <div className="p-4 space-y-4 animate-fade-in h-full flex flex-col">
        <h3 className="text-2xl font-bold text-center text-slate-100">Résumé de la session</h3>
        <p className="text-sm text-center text-slate-400">Voici un récapitulatif de votre discussion avec le tuteur.</p>
        <div className="space-y-4 flex-grow overflow-y-auto p-4 bg-slate-950 rounded-lg border border-slate-800">
            {dialogue.map((msg, index) => {
                let content;
                if (msg.role === 'ai') {
                    content = <MathJaxRenderer content={DOMPurify.sanitize(marked.parse(msg.content, { breaks: true }) as string)} />;
                } else {
                     const mathContent = `$$ \\begin{array}{l} ${
                        msg.content
                            .replace(/\\ /g, ' ') // Normalize MathQuill space
                            .replace(/\\\\/g, '\n') // Normalize MathQuill breaks
                            .split('\n')
                            .map(processLineForMathJax)
                            .join(' \\\\ ')
                    } \\end{array} $$`;
                    content = <MathJaxRenderer content={mathContent} />;
                }
                
                return (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'} max-w-full`}>
                           {content}
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
    const [isTutorActive, setIsTutorActive] = useState(false);
    const [isTutorFinished, setIsTutorFinished] = useState(false);

    const [isVerifying, setIsVerifying] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [isRateLimited, setIsRateLimited] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedFileSrc, setUploadedFileSrc] = useState<string | null>(null);
    const [isOcrLoading, setIsLoadingOcr] = useState(false);
    const [ocrVerificationText, setOcrVerificationText] = useState<string | null>(null);
    
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const mathFieldRef = useRef<MathField | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (dialogue.length === 0) {
            onDialogueUpdate([{ role: 'ai', content: "Bonjour ! Pour commencer, décris-moi ce que tu as déjà fait ou envoie-moi une photo de ton brouillon. Si tu n'as pas encore commencé, dis-le moi et nous débuterons ensemble." }]);
        }
    }, []);

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
        if (!aiResponse) return;

        if (aiResponse.socraticPath) {
            const path = aiResponse.socraticPath;
            const startIndex = aiResponse.startingStepIndex ?? 0;

            setSocraticPath(path);
            
            if (startIndex >= path.length) {
                onDialogueUpdate([...dialogue, { role: 'ai', content: "Il semble que tu aies déjà résolu cet exercice avec succès. Excellent travail ! Si tu as d'autres questions, n'hésite pas." }]);
                setIsTutorFinished(true);
            } else {
                setCurrentStep(startIndex);
            }
            setIsTutorActive(true);
        }
        if (aiResponse.explanation) {
            onDialogueUpdate([...dialogue, { role: 'ai', content: aiResponse.explanation }]);
        }
    }, [aiResponse]);
    
    useEffect(() => {
        if (isTutorActive && socraticPath && currentStep < socraticPath.length) {
            const currentQuestion = socraticPath[currentStep].ia_question;
            const lastMessage = dialogue[dialogue.length - 1];
            if (!lastMessage || lastMessage.role !== 'ai' || lastMessage.content !== currentQuestion) {
                 onDialogueUpdate([...dialogue, { role: 'ai', content: currentQuestion }]);
            }
        } else if (isTutorActive && socraticPath && currentStep >= socraticPath.length && !isTutorFinished) {
            onDialogueUpdate([...dialogue, { role: 'ai', content: "Bravo, vous avez terminé toutes les étapes ! L'exercice est résolu. Vous pouvez maintenant le marquer comme terminé sur la page de l'exercice pour gagner de l'XP." }]);
            setIsTutorFinished(true);
        }
    }, [currentStep, socraticPath, isTutorActive, isTutorFinished, dialogue, onDialogueUpdate]);

    const startTutor = useCallback((initialWork: string) => {
        resetAIExplain();
        setError(null);
        const newDialogue = [...dialogue, { role: 'user' as 'user', content: initialWork }];
        onDialogueUpdate(newDialogue);

        const prompt = `
        # CONTEXTE DE L'EXERCICE
        ## Énoncé:
        ${exercise.statement}
        ## Correction de référence (pour information):
        ${exercise.fullCorrection || exercise.correctionSnippet}
        
        # DEMANDE ÉLÈVE
        Voici ce que l'élève a déjà fait ou sa question :
        "${initialWork}"
        
        # MISSION
        Analyse la demande de l'élève par rapport à l'exercice et démarre le tutorat socratique à l'étape appropriée.
        `;
        explain(prompt, chapter.id, 'socratic');
    }, [dialogue, onDialogueUpdate, exercise, chapter, explain, resetAIExplain]);

    const validateAnswer = useCallback(async (answer: string) => {
        if (!socraticPath) return;
        
        setIsVerifying(true);
        setError(null);
        
        const newDialogue = [...dialogue, { role: 'user' as 'user', content: answer }];
        onDialogueUpdate(newDialogue);
        
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté.");

            const response = await fetch('/api/validate-socratic-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    studentAnswer: answer,
                    currentIaQuestion: socraticPath[currentStep].ia_question,
                    expectedAnswerKeywords: socraticPath[currentStep].expected_answer_keywords,
                    exerciseStatement: exercise.statement,
                    exerciseCorrection: exercise.fullCorrection || exercise.correctionSnippet,
                    dialogueHistory: newDialogue
                })
            });

            const responseBody = await response.text();
            if (!response.ok) {
                const errorData = JSON.parse(responseBody);
                throw new Error(errorData.error || `Erreur serveur: ${response.status}`);
            }

            const result = JSON.parse(responseBody);
            let finalDialogue = [...newDialogue, { role: 'ai' as 'ai', content: result.feedback_message }];

            if (result.is_correct) {
                setCurrentStep(prev => prev + 1);
            }
            onDialogueUpdate(finalDialogue);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Une erreur est survenue.";
            setError(errorMessage);
            onDialogueUpdate([...newDialogue, { role: 'system', content: `Erreur: ${errorMessage}` }]);
        } finally {
            setIsVerifying(false);
        }
    }, [dialogue, onDialogueUpdate, socraticPath, currentStep, exercise]);

    const handleSubmit = () => {
        const textToSend = ocrVerificationText !== null ? ocrVerificationText.replace(/\\n/g, '\n').trim() : studentInput;
        
        if (!textToSend.trim()) return;

        if (isTutorActive) {
            validateAnswer(textToSend);
        } else {
            startTutor(textToSend);
        }
        setStudentInput('');
        setOcrVerificationText(null);
        setUploadedFile(null);
        setUploadedFileSrc(null);
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setUploadedFile(file);
            setUploadedFileSrc(URL.createObjectURL(file));
            setOcrVerificationText(null);
        }
    };
    
    const handleExtractTextFromImage = async () => {
        if (!uploadedFile || !user) return;
        
        setIsLoadingOcr(true);
        setError(null);
        
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté.");

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
                 throw new Error(errorData.error || `Erreur OCR: ${response.status}`);
            }
            
            const result = JSON.parse(responseBody);
            setOcrVerificationText(result.text);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur lors du traitement de l\'image.');
        } finally {
            setIsLoadingOcr(false);
        }
    };

    if (isTutorFinished) {
        return <TutorSummary dialogue={dialogue} onBack={onBack} />;
    }

    const currentPrompt = isTutorActive && socraticPath && currentStep < socraticPath.length
        ? socraticPath[currentStep].student_response_prompt
        : "Décris ton raisonnement...";

    return (
        <div className="flex flex-col h-[85vh] max-w-4xl mx-auto bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-lg">
            <header className="p-4 border-b border-slate-700 flex items-center gap-4 flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-700">
                    <ArrowLeftIcon className="w-5 h-5 text-slate-300" />
                </button>
                <div>
                    <h2 className="text-lg font-bold text-brand-blue-300">{exercise.statement.substring(0, 50)}...</h2>
                    <p className="text-xs text-slate-400">{chapter.title}</p>
                </div>
            </header>

            <main className="flex-grow p-4 overflow-y-auto space-y-4">
                {dialogue.map((msg, index) => (
                    <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {msg.role === 'ai' ? (
                            <AiMessage message={msg} response={aiResponse} onNavigate={() => onNavigateToTimestamp(levelId, chapter.id, aiResponse?.videoChunk?.video_id || '', aiResponse?.videoChunk?.start_time_seconds || 0)} />
                        ) : msg.role === 'user' ? (
                             <div className="chat-bubble user-bubble self-end">
                                <MathJaxRenderer content={`$$ \\begin{array}{l} ${
                                    msg.content
                                        .replace(/\\ /g, ' ')
                                        .replace(/\\\\/g, '\n')
                                        .split('\n')
                                        .map(processLineForMathJax)
                                        .join(' \\\\ ')
                                } \\end{array} $$`} />
                            </div>
                        ) : (
                            <div className="system-bubble self-center">{msg.content}</div>
                        )}
                    </div>
                ))}
                {(isAIExplainLoading || isVerifying || isOcrLoading) && (
                    <div className="self-start flex items-center gap-2">
                        <SpinnerIcon className="w-5 h-5 animate-spin text-slate-400" />
                        <span className="text-sm text-slate-400">Le tuteur réfléchit...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </main>
            
            {isKeyboardOpen && (
                <MathKeyboard
                    initialValue={studentInput}
                    onConfirm={(latex) => {
                        setStudentInput(latex);
                        if (mathFieldRef.current) mathFieldRef.current.latex(latex);
                        setIsKeyboardOpen(false);
                    }}
                    onClose={() => setIsKeyboardOpen(false)}
                />
            )}

            <footer className="p-4 border-t border-slate-700 bg-slate-800/30 rounded-b-xl flex-shrink-0">
                {isRateLimited && <p className="text-sm text-center text-red-400 mb-2">{error}</p>}
                
                {ocrVerificationText !== null ? (
                    <div className="space-y-2 animate-fade-in">
                        <p className="text-sm text-yellow-300">Vérifiez le texte extrait de votre image :</p>
                        <textarea
                            value={ocrVerificationText}
                            onChange={(e) => setOcrVerificationText(e.target.value)}
                            rows={4}
                            className="w-full p-2 bg-slate-900 border border-slate-600 rounded-md font-mono text-sm"
                        />
                        <button onClick={handleSubmit} className="w-full px-4 py-2 bg-brand-blue-600 text-white font-semibold rounded-lg">
                            Confirmer et Envoyer
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {uploadedFileSrc && (
                            <div className="relative w-32 h-32 mx-auto mb-2">
                                <img src={uploadedFileSrc} alt="Aperçu" className="rounded-lg w-full h-full object-cover" />
                                <button onClick={() => { setUploadedFile(null); setUploadedFileSrc(null); }} className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full">
                                    <XCircleIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        )}
                        <div className="flex items-stretch gap-2">
                            {uploadedFileSrc ? (
                                <button onClick={handleExtractTextFromImage} className="w-full flex-grow px-4 py-3 bg-green-600 text-white font-semibold rounded-lg">
                                    Extraire le texte de l'image
                                </button>
                            ) : (
                                <div className="math-input-wrapper flex-grow">
                                     <EditableMathField
                                        latex={studentInput}
                                        onChange={(field) => setStudentInput(field.latex())}
                                        aria-placeholder={currentPrompt}
                                        mathquillDidMount={(field) => (mathFieldRef.current = field)}
                                        config={{ handlers: { enter: (mf) => mf.cmd('\\\\') } }}
                                        className="h-full"
                                     />
                                </div>
                            )}
                             <button type="button" onClick={() => setIsKeyboardOpen(true)} className="p-3 bg-slate-700 rounded-lg hover:bg-slate-600 flex items-center justify-center">
                                <span className="font-serif text-xl italic text-brand-blue-300">ƒ(x)</span>
                            </button>
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-700 rounded-lg hover:bg-slate-600">
                                <PaperClipIcon className="w-6 h-6" />
                            </button>
                            <button onClick={handleSubmit} disabled={isAIExplainLoading || isVerifying || isOcrLoading || isRateLimited || (!studentInput.trim() && !uploadedFile)} className="px-4 py-3 bg-brand-blue-600 text-white font-semibold rounded-lg disabled:opacity-50">
                                Envoyer
                            </button>
                        </div>
                    </div>
                )}
            </footer>
        </div>
    );
};