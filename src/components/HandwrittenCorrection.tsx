
import React, { useState, useRef } from 'react';
import { CameraIcon, CheckCircleIcon, XCircleIcon, SpinnerIcon, TrashIcon, PlusCircleIcon, PencilIcon } from '@/components/icons';
import { HandwrittenCorrectionResponse } from '@/types';
import imageCompression from 'browser-image-compression';
import { recognize } from 'tesseract.js';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/services/authService';

interface HandwrittenCorrectionProps {
    exerciseId: string;
}

type UploadedImage = {
    id: string;
    src: string;
    file: File;
    ocrText?: string;
    ocrStatus: 'pending' | 'processing' | 'done' | 'error';
};

type Step = 'upload' | 'review' | 'result';

const UploadPlaceholder: React.FC<{ onButtonClick: () => void, disabled: boolean }> = ({ onButtonClick, disabled }) => (
    <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-600 p-8 text-center">
        <CameraIcon className="w-10 h-10 text-brand-blue-400 mb-4"/>
        <button type="button" onClick={onButtonClick} disabled={disabled} className="px-4 py-2 bg-gray-700 rounded-lg mb-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50">
            Choisir une ou plusieurs pages
        </button>
        <p className="text-xs text-gray-500">Ou prenez des photos.</p>
    </div>
);

export const HandwrittenCorrection: React.FC<HandwrittenCorrectionProps> = ({ exerciseId }) => {
    const { user } = useAuth();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [step, setStep] = useState<Step>('upload');
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    const [editableOcrText, setEditableOcrText] = useState<string>('');
    const [correction, setCorrection] = useState<HandwrittenCorrectionResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetAllState = () => {
        setIsPanelOpen(false);
        setStep('upload');
        setUploadedImages([]);
        setEditableOcrText('');
        setCorrection(null);
        setIsLoading(false);
        setLoadingMessage('');
        setError(null);
    };

    const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const newImages: UploadedImage[] = Array.from(files).map((file: File) => ({
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            src: URL.createObjectURL(file),
            file,
            ocrStatus: 'pending'
        }));
        
        setUploadedImages(prev => [...prev, ...newImages]);
    };

    const handleRemoveImage = (idToRemove: string) => {
        setUploadedImages(prev => prev.filter(img => img.id !== idToRemove));
    };

    const handleStartOcr = async () => {
        setIsLoading(true);
        setError(null);

        const ocrResults: string[] = [];
        // Use a for...of loop for sequential processing to avoid race conditions with Tesseract workers.
        for (const [index, image] of uploadedImages.entries()) {
            if (image.ocrStatus === 'done' && image.ocrText) {
                ocrResults.push(image.ocrText);
                continue; // Skip already processed images
            }

            setUploadedImages(prev => prev.map(img => img.id === image.id ? { ...img, ocrStatus: 'processing' } : img));
            setLoadingMessage(`Analyse de la page ${index + 1}...`);

            try {
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
                const compressedFile = await imageCompression(image.file, options);

                const { data: { text } } = await recognize(compressedFile, 'fra', {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            setLoadingMessage(`Analyse de la page ${index + 1} (${Math.round(m.progress * 100)}%)...`);
                        }
                    }
                });

                setUploadedImages(prev => prev.map(img => img.id === image.id ? { ...img, ocrStatus: 'done', ocrText: text } : img));
                ocrResults.push(text);
            } catch (err) {
                setUploadedImages(prev => prev.map(img => img.id === image.id ? { ...img, ocrStatus: 'error' } : img));
                console.error(`OCR failed for image ${index + 1}`, err);
                const errorText = `[Erreur d'analyse pour la page ${index + 1}]`;
                ocrResults.push(errorText);
                setError(`L'analyse de la page ${index + 1} a échoué. Veuillez réessayer avec une meilleure image.`);
                // Stop processing on the first error.
                setIsLoading(false);
                setLoadingMessage('');
                return;
            }
        }

        // This part runs only if all images were processed successfully
        const fullText = ocrResults.map((text, index) => `--- PAGE ${index + 1} ---\n${text}`).join('\n\n');
        setEditableOcrText(fullText);
        setStep('review');
        setIsLoading(false);
        setLoadingMessage('');
    };
    
    const handleSubmitForCorrection = async () => {
        if (!editableOcrText.trim()) {
            setError("Le texte extrait est vide. Impossible de lancer la correction.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setLoadingMessage('Correction par l\'IA...');
        
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
             if (!session) {
                throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");
            }
            
            const response = await fetch(`/api/correct-handwriting`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ ocrText: editableOcrText, exerciseId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'La correction a échoué.');
            }
            const correctionData = await response.json();
            setCorrection(correctionData);
            setStep('result');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur inconnue est survenue');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const renderContent = () => {
        switch (step) {
            case 'upload':
                return (
                    <div>
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFilesSelected} className="hidden" multiple />
                        {uploadedImages.length === 0 ? (
                             <UploadPlaceholder onButtonClick={() => fileInputRef.current?.click()} disabled={isLoading} />
                        ) : (
                             <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {uploadedImages.map((image) => (
                                        <div key={image.id} className="relative group">
                                            <img src={image.src} alt="Copie de l'élève" className="rounded-lg w-full aspect-[3/4] object-cover" />
                                            <button onClick={() => handleRemoveImage(image.id)} className="absolute top-1 right-1 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-900/50 hover:border-brand-blue-500 transition-colors">
                                        <PlusCircleIcon className="w-8 h-8"/>
                                        <span className="text-sm mt-1">Ajouter</span>
                                    </button>
                                </div>
                                <button onClick={handleStartOcr} disabled={isLoading || uploadedImages.length === 0} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">
                                    {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <PencilIcon className="w-5 h-5" />}
                                    {isLoading ? loadingMessage : "Analyser le texte des images"}
                                </button>
                             </div>
                        )}
                    </div>
                );
            case 'review':
                return (
                    <div className="space-y-4">
                        <h4 className="font-semibold text-gray-300">Vérifiez et corrigez le texte extrait</h4>
                         <p className="text-sm text-gray-400">L'IA se basera sur ce texte pour la correction. Modifiez-le si nécessaire pour qu'il corresponde parfaitement à votre copie.</p>
                         <textarea
                            value={editableOcrText}
                            onChange={(e) => setEditableOcrText(e.target.value)}
                            rows={15}
                            className="w-full p-3 font-mono text-sm bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500"
                         />
                        <button onClick={handleSubmitForCorrection} disabled={isLoading} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 disabled:opacity-70">
                             {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                             {isLoading ? loadingMessage : "Valider et Lancer la Correction"}
                        </button>
                    </div>
                );
            case 'result':
                return correction ? (
                     <div className="space-y-4">
                        <h4 className="font-semibold text-gray-300">Résultats de la correction</h4>
                        <div className="text-center p-4 bg-gray-900/50 rounded-lg">
                            <p className="text-sm text-gray-400">Score</p>
                            <p className="text-4xl font-bold text-brand-blue-300">{correction.score}/100</p>
                        </div>
                        <div className="p-4 bg-gray-900/50 rounded-lg">
                            <p className="text-sm font-semibold text-gray-400 mb-2">Commentaire global :</p>
                            <p className="text-sm text-gray-300 italic">"{correction.global_feedback}"</p>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                            {correction.lines.map((line, index) => (
                                <div key={index} className="p-2 bg-gray-900/30 rounded-md">
                                    <div className="flex items-start gap-2">
                                        {line.status === 'correct' ? <CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /> : <XCircleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
                                        <p className="text-sm text-gray-300 font-mono">{line.student_text}</p>
                                    </div>
                                    {line.status === 'error' && line.explanation && <p className="text-xs text-red-300 pl-7 mt-1">{line.explanation}</p>}
                                </div>
                            ))}
                        </div>
                        <button onClick={() => { setStep('upload'); setUploadedImages([]); setCorrection(null); }} className="w-full mt-4 text-center px-4 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700">
                           Corriger une autre copie
                        </button>
                    </div>
                ) : null;
            default: return null;
        }
    };
    
    if (!user) return null;

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
             {error && <p className="mb-4 p-3 text-center bg-red-900/30 text-red-300 rounded-lg">{error}</p>}
             {renderContent()}
             <div className="flex justify-between items-center mt-4">
                <button onClick={resetAllState} className="text-xs text-gray-500 hover:text-gray-300">Annuler et fermer</button>
            </div>
        </div>
    );
};
