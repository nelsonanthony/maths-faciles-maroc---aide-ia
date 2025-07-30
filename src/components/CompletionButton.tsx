import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as userService from '../services/userService';
import { SpinnerIcon, CheckCircleIcon, XCircleIcon, CameraIcon } from './icons';
import { Exercise } from '../types';
import { getSupabase } from '../services/authService';
import imageCompression from 'browser-image-compression';
import { MathKeyboard } from './MathKeyboard';
import { MathJaxRenderer } from './MathJaxRenderer';


interface CheckAnswerResponse {
    is_correct: boolean;
    feedback: string;
}

interface CompletionButtonProps {
    exercise: Exercise;
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

export const CompletionButton: React.FC<CompletionButtonProps> = ({ exercise }) => {
    const { user, updateUser } = useAuth();
    
    const [inputMode, setInputMode] = useState<'text' | 'photo'>('text');
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    const [studentAnswer, setStudentAnswer] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
    const [photoProcessingMessage, setPhotoProcessingMessage] = useState('');

    const [isChecking, setIsChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<CheckAnswerResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [isCompleting, setIsCompleting] = useState(false);

    if (!user || user.is_admin) return null;

    const isAlreadyCompleted = user.completed_exercises.includes(exercise.id);

    const resetState = () => {
        setError(null);
        setCheckResult(null);
        setStudentAnswer('');
        setImageSrc(null);
        setIsKeyboardOpen(false);
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
        setPhotoProcessingMessage('Compression de l\'image...');
        setError(null);
        setCheckResult(null);
        setImageSrc(URL.createObjectURL(file));

        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");

            const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
            const compressedFile = await imageCompression(file, options);
            const base64Image = await fileToBase64(compressedFile);

            setPhotoProcessingMessage('Envoi à l\'IA pour analyse et vérification...');

            const response = await fetch('/api/check-photo-answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    image: base64Image,
                    mimeType: compressedFile.type,
                    exerciseId: exercise.id
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

            const result = JSON.parse(responseBody);
            setCheckResult(result);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors du traitement de l\'image.');
        } finally {
            setIsProcessingPhoto(false);
            setPhotoProcessingMessage('');
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
        <div className="mt-8 pt-6 border-t border-gray-700/50">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-200">Valider ma réponse</h3>
                <div className="flex items-center gap-2 p-1 bg-gray-700 rounded-lg">
                    <button onClick={() => setInputMode('text')} className={`px-3 py-1 text-sm rounded-md ${inputMode === 'text' ? 'bg-brand-blue-600 text-white' : 'text-gray-300'}`}>Texte</button>
                    <button onClick={() => setInputMode('photo')} className={`px-3 py-1 text-sm rounded-md ${inputMode === 'photo' ? 'bg-brand-blue-600 text-white' : 'text-gray-300'}`}>Photo</button>
                </div>
            </div>
            
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
                        disabled={isChecking || !studentAnswer.trim()}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isChecking && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                        Vérifier ma réponse
                    </button>
                </div>
            )}

             {inputMode === 'photo' && (
                <div>
                     <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                     <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingPhoto}
                        className="w-full flex items-center justify-center gap-3 px-5 py-3 font-semibold text-white bg-gray-600 rounded-lg shadow-md hover:bg-gray-500 transition-colors disabled:opacity-70"
                    >
                        <CameraIcon className="w-6 h-6" />
                        {imageSrc ? "Choisir une autre photo" : "Prendre / Choisir une photo"}
                    </button>
                    {isProcessingPhoto && (
                        <div className="text-center mt-4">
                            <SpinnerIcon className="w-6 h-6 animate-spin mx-auto text-brand-blue-400" />
                            <p className="text-sm text-gray-400 mt-2">{photoProcessingMessage}</p>
                        </div>
                    )}
                     {imageSrc && !isProcessingPhoto && (
                        <div className="mt-4 p-2 border border-gray-600 rounded-lg">
                            <img src={imageSrc} alt="Prévisualisation de la réponse" className="max-h-64 w-auto mx-auto rounded"/>
                        </div>
                     )}
                </div>
             )}

            {error && <p className="mt-4 text-sm text-red-400 text-center">{error}</p>}

            {checkResult && (
                <div className={`mt-4 p-4 rounded-lg border ${checkResult.is_correct ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                    <div className="flex items-start gap-3">
                        {checkResult.is_correct
                            ? <CheckCircleIcon className="w-6 h-6 text-green-400 shrink-0" />
                            : <XCircleIcon className="w-6 h-6 text-red-400 shrink-0" />}
                        <div>
                             <p className={`font-semibold ${checkResult.is_correct ? 'text-green-300' : 'text-red-300'}`}>
                                {checkResult.is_correct ? "Correct !" : "Incorrect"}
                             </p>
                             <p className="text-sm text-gray-300 mt-1">{checkResult.feedback}</p>
                        </div>
                    </div>
                </div>
            )}
            
             {(checkResult?.is_correct || isAlreadyCompleted) && !isCompleting && (
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