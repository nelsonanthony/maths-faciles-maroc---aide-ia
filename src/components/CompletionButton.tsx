


import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as userService from '../services/userService';
import { SpinnerIcon, CheckCircleIcon, XCircleIcon, CameraIcon } from './icons';
import { Exercise } from '../types';
import { getSupabase } from '../services/authService';
import imageCompression from 'browser-image-compression';
import { recognize } from 'tesseract.js';
import { MathKeyboard } from './MathKeyboard';


interface CheckAnswerResponse {
    is_correct: boolean;
    feedback: string;
}

interface CompletionButtonProps {
    exercise: Exercise;
}

export const CompletionButton: React.FC<CompletionButtonProps> = ({ exercise }) => {
    const { user, updateUser } = useAuth();
    
    // Input mode state
    const [inputMode, setInputMode] = useState<'text' | 'photo' | 'keyboard'>('text');

    // Text input state
    const [studentAnswer, setStudentAnswer] = useState<string>('');

    // Photo input state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
    const [photoProcessingMessage, setPhotoProcessingMessage] = useState('');

    // Shared state for API call and result
    const [isChecking, setIsChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<CheckAnswerResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Completion state
    const [isCompleting, setIsCompleting] = useState(false);

    if (!user || user.is_admin) return null;

    const isAlreadyCompleted = user.completed_exercises.includes(exercise.id);

    const resetState = () => {
        setError(null);
        setCheckResult(null);
        setStudentAnswer('');
        setImageSrc(null);
    }

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

            const responseBody = await response.text(); // Read the body ONCE

            if (!response.ok) {
                let errorMessage;
                try {
                    // Try to parse the text as JSON.
                    const errorData = JSON.parse(responseBody);
                    errorMessage = errorData.error || `Une erreur est survenue (${response.status})`;
                } catch (e) {
                    // If parsing fails, the body was likely not JSON. Use the raw text.
                    errorMessage = responseBody || `Une erreur est survenue (${response.status})`;
                }
                throw new Error(errorMessage);
            }

            const result = JSON.parse(responseBody);
            setCheckResult(result);

        } catch (err) {
            setError(err instanceof Error ? err.message : "Une erreur inconnue est survenue.");
        } finally {
            setIsChecking(false);
            setIsProcessingPhoto(false);
        }
    };

    const handleProcessImage = async (file: File) => {
        setIsProcessingPhoto(true);
        setError(null);
        setCheckResult(null);
        setImageSrc(URL.createObjectURL(file));

        try {
            setPhotoProcessingMessage('Compression de l\'image...');
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
            const compressedFile = await imageCompression(file, options);
            
            setPhotoProcessingMessage('Analyse de l\'écriture...');
            const { data: { text } } = await recognize(compressedFile, 'fra', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        setPhotoProcessingMessage(`Analyse de l'écriture... ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            setPhotoProcessingMessage('Vérification par l\'IA...');
            await handleCheckAnswer(text);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors du traitement de l\'image.');
            setIsProcessingPhoto(false);
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await handleProcessImage(file);
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
        <div className="mt-6 bg-gray-800/30 p-6 rounded-xl border border-gray-700/30 space-y-4">
            <h3 className="text-lg font-semibold text-brand-blue-300">Validez votre exercice</h3>
            <p className="text-sm text-gray-400">Soumettez votre réponse pour vérification et gagnez des points d'XP.</p>
            
             <div className="flex bg-gray-900/50 rounded-lg p-1 border border-gray-700">
                <button 
                    onClick={() => { setInputMode('text'); resetState(); }}
                    className={`w-1/3 p-2 rounded-md text-sm font-semibold transition-colors ${inputMode === 'text' ? 'bg-brand-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                >
                    Saisir la réponse
                </button>
                <button 
                    onClick={() => { setInputMode('keyboard'); resetState(); }}
                    className={`w-1/3 p-2 rounded-md text-sm font-semibold transition-colors ${inputMode === 'keyboard' ? 'bg-brand-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                >
                    Clavier Mathématique
                </button>
                 <button 
                    onClick={() => { setInputMode('photo'); resetState(); }}
                    className={`w-1/3 p-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${inputMode === 'photo' ? 'bg-brand-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                >
                    <CameraIcon className="w-5 h-5" />
                    Envoyer une photo
                </button>
            </div>

            {inputMode === 'text' && (
                <div>
                    <textarea
                        value={studentAnswer}
                        onChange={(e) => setStudentAnswer(e.target.value)}
                        placeholder="Écrivez votre raisonnement et votre réponse finale ici..."
                        rows={5}
                        className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 transition duration-200 resize-y disabled:opacity-50"
                        disabled={isChecking || !!checkResult?.is_correct}
                        aria-label="Zone de réponse pour l'exercice"
                    />
                </div>
            )}
            
            {inputMode === 'keyboard' && (
                <div>
                    <MathKeyboard
                        onExpressionChange={setStudentAnswer}
                        initialValue={studentAnswer}
                        disabled={isChecking || !!checkResult?.is_correct}
                        showPreview={true}
                    />
                </div>
            )}

            {inputMode === 'photo' && (
                 <div className="relative">
                    {(isChecking || isProcessingPhoto) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/80 backdrop-blur-sm rounded-lg z-10">
                            <SpinnerIcon className="w-8 h-8 animate-spin text-brand-blue-400" />
                            <p className="mt-3 text-gray-300">{isChecking ? 'Vérification par l\'IA...' : photoProcessingMessage}</p>
                        </div>
                    )}
                    {!imageSrc ? (
                        <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-600 p-8">
                             <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                             <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-gray-700 rounded-lg mb-2 text-white font-semibold">Choisir une image</button>
                             <p className="text-xs text-gray-500">Ou prenez une photo de votre brouillon.</p>
                        </div>
                    ) : (
                        <img src={imageSrc} alt="Copie de l'élève" className="rounded-lg w-full" />
                    )}
                 </div>
            )}
            
            {error && <p className="text-sm text-red-400 text-center" role="alert">{error}</p>}

            {checkResult && (
                <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${checkResult.is_correct ? 'bg-green-900/20 border-green-500/50 text-green-300' : 'bg-red-900/20 border-red-500/50 text-red-300'}`} role="alert">
                    {checkResult.is_correct ? <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5"/> : <XCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />}
                    <span>{checkResult.feedback}</span>
                </div>
            )}

            {checkResult?.is_correct ? (
                 <button 
                    onClick={handleCompleteExercise}
                    disabled={isCompleting}
                    className="w-full flex items-center justify-center gap-3 p-4 text-lg font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-800 disabled:cursor-wait"
                >
                    {isCompleting ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : <CheckCircleIcon className="w-6 h-6" />}
                    {isCompleting ? 'Enregistrement...' : "Confirmer et marquer comme terminé (+25 XP)"}
                </button>
            ) : (
                (inputMode === 'text' || inputMode === 'keyboard') && (
                    <button
                        onClick={() => handleCheckAnswer(studentAnswer || '')}
                        disabled={isChecking || !String(studentAnswer || '').trim()}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:bg-brand-blue-800 disabled:cursor-not-allowed"
                    >
                        {isChecking && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                        {isChecking ? 'Vérification...' : 'Vérifier ma réponse'}
                    </button>
                )
            )}
             {inputMode === 'photo' && imageSrc && !checkResult?.is_correct && (
                <button onClick={() => { setImageSrc(null); setCheckResult(null); setError(null); }} className="text-xs text-brand-blue-400 hover:text-brand-blue-300 text-center w-full">
                    Envoyer une autre photo
                </button>
             )}
        </div>
    );
};
