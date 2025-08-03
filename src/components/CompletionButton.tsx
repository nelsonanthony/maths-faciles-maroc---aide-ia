
import React, { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAuth } from '../contexts/AuthContext';
import * as userService from '../services/userService';
import { SpinnerIcon, CheckCircleIcon, XCircleIcon, CameraIcon, TrashIcon, PlusCircleIcon, PencilIcon } from './icons';
import { Exercise } from '../types';
import { getSupabase } from '../services/authService';
import imageCompression from 'browser-image-compression';
import { MathKeyboard } from './MathKeyboard';
import { MathJaxRenderer } from './MathJaxRenderer';


interface FeedbackPart {
    part_title: string;
    evaluation: 'correct' | 'incorrect' | 'partial';
    explanation: string;
}

interface CheckAnswerResponse {
    is_globally_correct: boolean;
    summary: string;
    detailed_feedback: FeedbackPart[];
}

interface CompletionButtonProps {
    exercise: Exercise;
}

type UploadedImage = {
    id: string;
    src: string;
    file: File;
};


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

export const CompletionButton: React.FC<CompletionButtonProps> = ({ exercise }) => {
    const { user, updateUser } = useAuth();
    
    const [inputMode, setInputMode] = useState<'text' | 'photo'>('text');
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    const [studentAnswer, setStudentAnswer] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    
    const [ocrText, setOcrText] = useState<string>('');
    const [isVerificationStep, setIsVerificationStep] = useState(false);
    const [isOcrLoading, setIsOcrLoading] = useState(false);

    const [isChecking, setIsChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<CheckAnswerResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRateLimited, setIsRateLimited] = useState(false);

    const [isCompleting, setIsCompleting] = useState(false);

    useEffect(() => {
        if (error && (error.includes("limite") || error.includes("limit") || error.includes("429"))) {
            setIsRateLimited(true);
        }
    }, [error]);

    if (!user || user.is_admin) return null;

    const isAlreadyCompleted = user.completed_exercises.includes(exercise.id);
    
    const handleCheckAnswer = async (answerText: string) => {
        const safeAnswer = answerText || '';
        if (!safeAnswer.trim() || !user) return;

        setIsChecking(true);
        setError(null);
        setCheckResult(null);

        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");

            const response = await fetch('/api/check-answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ studentAnswer: safeAnswer, exerciseId: exercise.id }),
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

            const result: CheckAnswerResponse = JSON.parse(responseBody);
            setCheckResult(result);

        } catch (err) {
            setError(err instanceof Error ? err.message : "Une erreur inconnue est survenue.");
        } finally {
            setIsChecking(false);
            setIsVerificationStep(false);
        }
    };
    
    const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        setCheckResult(null);
        setError(null);

        const newImages: UploadedImage[] = Array.from(files).map((file: File) => ({
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            src: URL.createObjectURL(file),
            file,
        }));
        setUploadedImages(prev => [...prev, ...newImages]);
    };

    const handleRemoveImage = (idToRemove: string) => {
        setUploadedImages(prev => prev.filter(img => img.id !== idToRemove));
    };

    const handleExtractTextFromImages = async () => {
        if (uploadedImages.length === 0 || !user) return;
        
        setIsOcrLoading(true);
        setError(null);
        setCheckResult(null);
        
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");

            const imagePayloads = await Promise.all(
                uploadedImages.map(async (image) => {
                    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                    const compressedFile = await imageCompression(image.file, options);
                    const base64Image = await fileToBase64(compressedFile);
                    return { image: base64Image, mimeType: compressedFile.type };
                })
            );

            const response = await fetch('/api/ocr-multipage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ images: imagePayloads }),
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
            
            const result = JSON.parse(responseBody);
            setOcrText(result.text);
            setIsVerificationStep(true);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors du traitement des images.');
        } finally {
            setIsOcrLoading(false);
        }
    };

    
    const handleCompleteExercise = async () => {
        if (!user) return;
        setIsCompleting(true);
        try {
            const xpGained = 25;
            await userService.completeExercise(user.id, exercise.id, xpGained);

            const newXp = user.xp + xpGained;
            const newLevel = userService.calculateLevel(newXp);
            
            updateUser({
                xp: newXp,
                level: newLevel,
                completed_exercises: [...user.completed_exercises, exercise.id]
            });

        } catch (error) {
            console.error("Failed to mark exercise as complete:", error);
            setError("Une erreur est survenue lors de la validation. Veuillez réessayer.");
        } finally {
            setIsCompleting(false);
        }
    };

    if (isAlreadyCompleted) {
        return (
            <div className="mt-6 flex items-center justify-center gap-2 p-3 text-lg font-semibold text-green-400 bg-green-900/30 rounded-lg border border-green-500/50">
                <CheckCircleIcon className="w-6 h-6" />
                <span>Terminé ! (+25 XP)</span>
            </div>
        );
    }
    
    return (
        <div className="mt-8 pt-6 border-t border-gray-700/50">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-200">Valider ma réponse</h3>
                <div className="flex items-center gap-2 p-1 bg-gray-700 rounded-lg">
                    <button onClick={() => setInputMode('text')} className={`px-3 py-1 text-sm rounded-md ${inputMode === 'text' ? 'bg-brand-blue-600 text-white' : 'text-gray-300'}`}>Texte</button>
                    <button onClick={() => setInputMode('photo')} className={`px-3 py-1 text-sm rounded-md ${inputMode === 'photo' ? 'bg-brand-blue-600 text-white' : 'text-gray-300'}`}>Photo</button>
                </div>
            </div>
            
            {isRateLimited && (
                 <div className="my-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm text-center">
                    {error || "Vous avez atteint la limite quotidienne pour cette action. Réessayez demain."}
                </div>
            )}

            {inputMode === 'text' && (
                <div className="space-y-4">
                    {studentAnswer && !isKeyboardOpen && (
                         <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-600">
                             <MathJaxRenderer content={`$$${studentAnswer}$$`} />
                         </div>
                    )}
                    <button
                        onClick={() => setIsKeyboardOpen(true)}
                        className="w-full px-5 py-3 font-semibold text-white bg-gray-600 rounded-lg shadow-md hover:bg-gray-500 transition-colors"
                        disabled={isRateLimited}
                    >
                        {studentAnswer ? "Modifier ma réponse" : "Saisir ma réponse"}
                    </button>

                    {isKeyboardOpen && (
                         <MathKeyboard 
                            initialValue={studentAnswer}
                            onConfirm={(latex) => { setStudentAnswer(latex); setIsKeyboardOpen(false); }}
                            onClose={() => setIsKeyboardOpen(false)}
                         />
                    )}

                    <button
                        onClick={() => handleCheckAnswer(studentAnswer)}
                        disabled={isChecking || !studentAnswer.trim() || isRateLimited}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isChecking && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                        Vérifier ma réponse
                    </button>
                </div>
            )}

            {inputMode === 'photo' && (
                isVerificationStep ? (
                     <div className="space-y-4 animate-fade-in">
                        <h4 className="font-semibold text-yellow-300">Vérifiez la transcription de vos photos</h4>
                        <p className="text-sm text-slate-400">Corrigez le texte ci-dessous si nécessaire, puis soumettez-le pour vérification.</p>
                        <textarea
                            value={ocrText}
                            onChange={(e) => setOcrText(e.target.value)}
                            rows={10}
                            className="w-full p-3 bg-slate-950 border-2 border-slate-700 rounded-lg text-slate-300 font-mono"
                        />
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => handleCheckAnswer(ocrText)}
                                disabled={isChecking || !ocrText.trim() || isRateLimited}
                                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70"
                            >
                                {isChecking && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                                Confirmer et Vérifier la Réponse
                            </button>
                            <button
                                onClick={() => {
                                    setIsVerificationStep(false);
                                    setOcrText('');
                                    setUploadedImages([]);
                                }}
                                disabled={isChecking}
                                className="px-5 py-3 font-semibold text-slate-300 bg-slate-700 rounded-lg shadow-md hover:bg-slate-600 disabled:opacity-70"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFilesSelected} className="hidden" multiple />
                        {uploadedImages.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {uploadedImages.map((image) => (
                                    <div key={image.id} className="relative group aspect-[3/4]">
                                        <img src={image.src} alt="Copie de l'élève" className="rounded-lg w-full h-full object-cover" />
                                        <button onClick={() => handleRemoveImage(image.id)} className="absolute top-1 right-1 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button onClick={() => fileInputRef.current?.click()} disabled={isOcrLoading || isRateLimited} className="flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-900/50 hover:border-brand-blue-500 transition-colors disabled:opacity-50">
                                    <PlusCircleIcon className="w-8 h-8"/>
                                    <span className="text-sm mt-1">Ajouter</span>
                                </button>
                            </div>
                        )}

                        <button
                            onClick={uploadedImages.length === 0 ? () => fileInputRef.current?.click() : handleExtractTextFromImages}
                            disabled={isOcrLoading || isRateLimited}
                            className="w-full flex items-center justify-center gap-3 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 transition-colors disabled:opacity-70"
                        >
                            {isOcrLoading ? (
                                <SpinnerIcon className="w-6 h-6 animate-spin" />
                            ) : (
                            <CameraIcon className="w-6 h-6" />
                            )}
                            {uploadedImages.length === 0 ? "Prendre / Choisir des photos" : "Extraire le texte des photos"}
                        </button>
                    </div>
                )
             )}

            {error && !isRateLimited && <p className="mt-4 text-sm text-red-400 text-center">{error}</p>}

            {checkResult && (
                 <div className={`mt-4 p-4 rounded-lg border ${checkResult.is_globally_correct ? 'border-green-500/30' : 'border-red-500/30'} bg-slate-800/20`}>
                    {/* Bilan global */}
                    <div className="flex items-start gap-3 mb-4 pb-4 border-b border-slate-700/50">
                        {checkResult.is_globally_correct
                            ? <span className="text-2xl" role="img" aria-label="Succès global">🎉</span>
                            : <span className="text-2xl" role="img" aria-label="Échec global">🤔</span>}
                        <div className="flex-grow">
                            <h4 className="font-bold text-slate-100 text-lg">Bilan</h4>
                            <p className="text-sm text-slate-300">{checkResult.summary}</p>
                        </div>
                    </div>

                    {/* Feedback détaillé */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-100 text-lg">Explication détaillée</h4>
                        {checkResult.detailed_feedback.map((part, index) => (
                            <div key={index} className="flex items-start gap-3">
                                <div className="mt-1 shrink-0 text-xl">
                                    {part.evaluation === 'correct' && <span role="img" aria-label="Succès">🎉</span>}
                                    {part.evaluation === 'incorrect' && <span role="img" aria-label="Incorrect">❌</span>}
                                    {part.evaluation === 'partial' && <span role="img" aria-label="Partiel">🔎</span>}
                                </div>
                                <div className="flex-grow">
                                    <h5 className="font-semibold text-slate-200">{part.part_title}</h5>
                                    <div className="text-sm text-slate-400 prose prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5">
                                        <MathJaxRenderer content={DOMPurify.sanitize(marked.parse(part.explanation) as string)} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
             {(checkResult?.is_globally_correct || isAlreadyCompleted) && !isCompleting && (
                <button
                    onClick={handleCompleteExercise}
                    disabled={isCompleting}
                    className="w-full mt-4 px-5 py-3 font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 disabled:opacity-70"
                >
                    Marquer comme terminé et gagner 25 XP
                </button>
            )}
             {isCompleting && (
                 <div className="text-center mt-4"><SpinnerIcon className="w-6 h-6 animate-spin mx-auto" /></div>
             )}
        </div>
    );
};
