
import React, { useState, useRef } from 'react';
import { CameraIcon, CheckCircleIcon, XCircleIcon } from '@/components/icons';
import { HandwrittenCorrectionResponse } from '@/types';
import { SpinnerIcon } from '@/components/icons';
import imageCompression from 'browser-image-compression';
import { recognize } from 'tesseract.js';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/services/authService';

interface HandwrittenCorrectionProps {
    exerciseId: string;
}

export const HandwrittenCorrection: React.FC<HandwrittenCorrectionProps> = ({ exerciseId }) => {
    const { user } = useAuth();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [ocrText, setOcrText] = useState<string | null>(null);
    const [correction, setCorrection] = useState<HandwrittenCorrectionResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        processImage(file);
    };

    const processImage = async (file: File) => {
        setIsLoading(true);
        setError(null);
        setCorrection(null);
        setOcrText(null);
        setImageSrc(URL.createObjectURL(file));

        try {
            // 0. Get user session for auth
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
             if (!session) {
                throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");
            }

            // 1. Compress Image
            setLoadingMessage('Compression de l\'image...');
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
            const compressedFile = await imageCompression(file, options);
            
            // 2. OCR with Tesseract.js
            setLoadingMessage('Analyse de l\'écriture (OCR)...');
            const { data: { text } } = await recognize(compressedFile, 'fra', {
                logger: m => console.log(m.status, `${Math.round(m.progress * 100)}%`)
            });
            setOcrText(text);

            // 3. Get Correction from AI
            setLoadingMessage('Correction par l\'IA...');
            const response = await fetch(`/api/correct-handwriting`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ ocrText: text, exerciseId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'La correction a échoué.');
            }
            const correctionData = await response.json();
            setCorrection(correctionData);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur inconnue est survenue');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    if (!user) return null; // Don't show the component if the user is not logged in

    if (!isPanelOpen) {
        return (
            <div className="bg-gray-800/30 rounded-xl p-6 border-2 border-dashed border-gray-700/30 text-center">
                <CameraIcon className="w-10 h-10 mx-auto text-brand-blue-400" />
                <h3 className="text-xl font-semibold text-brand-blue-300 mt-4">Faites corriger votre copie !</h3>
                <p className="text-gray-400 mt-2 text-sm">Prenez en photo votre résolution manuscrite et laissez notre IA vous donner un feedback détaillé.</p>
                <button onClick={() => setIsPanelOpen(true)} className="mt-4 px-6 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700">
                    Commencer la correction
                </button>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-semibold text-brand-blue-300 mb-4">Correction de copie manuscrite</h3>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    {!imageSrc && (
                        <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-600 p-8">
                             <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                             <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-gray-700 rounded-lg mb-2">Choisir une image</button>
                             <p className="text-xs text-gray-500">Ou prenez une photo</p>
                        </div>
                    )}
                    {imageSrc && <img src={imageSrc} alt="Copie de l'élève" className="rounded-lg w-full" />}
                </div>
                <div className="relative">
                     {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/80 backdrop-blur-sm rounded-lg z-10">
                            <SpinnerIcon className="w-8 h-8 animate-spin text-brand-blue-400" />
                            <p className="mt-3 text-gray-300">{loadingMessage}</p>
                        </div>
                    )}
                    {error && <p className="p-4 text-center bg-red-900/30 text-red-300 rounded-lg">{error}</p>}
                    {correction && (
                        <div className="space-y-4">
                            <h4 className="font-semibold">Résultats de la correction</h4>
                            <div className="text-center p-4 bg-gray-900/50 rounded-lg">
                                <p className="text-sm text-gray-400">Score</p>
                                <p className="text-4xl font-bold text-brand-blue-300">{correction.score}/100</p>
                            </div>
                            <div className="p-4 bg-gray-900/50 rounded-lg">
                                <p className="text-sm font-semibold text-gray-400 mb-2">Commentaire global :</p>
                                <p className="text-sm text-gray-300 italic">"{correction.global_feedback}"</p>
                            </div>
                            <div className="space-y-2">
                                {correction.lines.map(line => (
                                    <div key={line.line} className="p-2 bg-gray-900/30 rounded-md">
                                        <div className="flex items-start gap-2">
                                            {line.status === 'correct' ? <CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /> : <XCircleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
                                            <p className="text-sm text-gray-300 font-mono">{line.student_text}</p>
                                        </div>
                                        {line.status === 'error' && line.explanation && <p className="text-xs text-red-300 pl-7 mt-1">{line.explanation}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
             <div className="flex justify-between items-center mt-4">
                <button onClick={() => setIsPanelOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">Fermer</button>
                 {imageSrc && <button onClick={() => { setImageSrc(null); setCorrection(null); setError(null); }} className="text-xs text-brand-blue-400 hover:text-brand-blue-300">Corriger une autre copie</button>}
            </div>
        </div>
    );
};
