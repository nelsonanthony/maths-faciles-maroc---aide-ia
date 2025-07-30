

import React, { useState, useRef } from 'react';
import { CameraIcon, CheckCircleIcon, XCircleIcon, SpinnerIcon, TrashIcon, PlusCircleIcon, PencilIcon } from '@/components/icons';
import imageCompression from 'browser-image-compression';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/services/authService';

interface HandwrittenCorrectionProps {
    exerciseId: string;
    onTextReady: (text: string) => void;
}

type UploadedImage = {
    id: string;
    src: string;
    file: File;
    ocrText?: string;
    ocrStatus: 'pending' | 'processing' | 'done' | 'error';
};

type Step = 'upload' | 'review';

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

const UploadPlaceholder: React.FC<{ onButtonClick: () => void, disabled: boolean }> = ({ onButtonClick, disabled }) => (
    <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-600 p-8 text-center">
        <CameraIcon className="w-10 h-10 text-brand-blue-400 mb-4"/>
        <button type="button" onClick={onButtonClick} disabled={disabled} className="px-4 py-2 bg-gray-700 rounded-lg mb-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50">
            Choisir une ou plusieurs pages
        </button>
        <p className="text-xs text-gray-500">Ou prenez des photos.</p>
    </div>
);

export const HandwrittenCorrection: React.FC<HandwrittenCorrectionProps> = ({ exerciseId, onTextReady }) => {
    const { user } = useAuth();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [step, setStep] = useState<Step>('upload');
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    const [editableOcrText, setEditableOcrText] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetAllState = () => {
        setIsPanelOpen(false);
        setStep('upload');
        setUploadedImages([]);
        setEditableOcrText('');
        setIsLoading(false);
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

        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setError("Vous devez être connecté pour analyser des images.");
            setIsLoading(false);
            return;
        }

        const ocrResults: string[] = [];
        // Use a for...of loop for sequential processing.
        for (const [index, image] of uploadedImages.entries()) {
            if (image.ocrStatus === 'done' && image.ocrText) {
                ocrResults.push(image.ocrText);
                continue;
            }

            setUploadedImages(prev => prev.map(img => img.id === image.id ? { ...img, ocrStatus: 'processing' } : img));
            
            try {
                const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                const compressedFile = await imageCompression(image.file, options);
                const base64Image = await fileToBase64(compressedFile);

                const response = await fetch('/api/ocr-with-gemini', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ image: base64Image, mimeType: compressedFile.type })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `L'analyse de la page ${index + 1} a échoué.`);
                }
                
                const { text } = await response.json();
                
                setUploadedImages(prev => prev.map(img => img.id === image.id ? { ...img, ocrStatus: 'done', ocrText: text } : img));
                ocrResults.push(text);

            } catch (err) {
                setUploadedImages(prev => prev.map(img => img.id === image.id ? { ...img, ocrStatus: 'error' } : img));
                const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
                setError(errorMessage);
                setIsLoading(false);
                return;
            }
        }

        const fullText = ocrResults.map((text, index) => `--- PAGE ${index + 1} ---\n${text}`).join('\n\n');
        setEditableOcrText(fullText);
        setStep('review');
        setIsLoading(false);
    };
    
    const handleSubmitForAssistant = async () => {
        if (!editableOcrText.trim()) {
            setError("Le texte extrait est vide.");
            return;
        }
        onTextReady(editableOcrText);
        resetAllState();
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
                                        <div key={image.id} className="relative group aspect-[3/4]">
                                            <img src={image.src} alt="Copie de l'élève" className="rounded-lg w-full h-full object-cover" />
                                            <button onClick={() => handleRemoveImage(image.id)} className="absolute top-1 right-1 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                             {image.ocrStatus !== 'pending' && (
                                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                                                    {image.ocrStatus === 'processing' && <SpinnerIcon className="w-8 h-8 text-white animate-spin" />}
                                                    {image.ocrStatus === 'done' && <CheckCircleIcon className="w-10 h-10 text-green-400" />}
                                                    {image.ocrStatus === 'error' && <XCircleIcon className="w-10 h-10 text-red-400" />}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-900/50 hover:border-brand-blue-500 transition-colors disabled:opacity-50">
                                        <PlusCircleIcon className="w-8 h-8"/>
                                        <span className="text-sm mt-1">Ajouter</span>
                                    </button>
                                </div>
                                <button onClick={handleStartOcr} disabled={isLoading || uploadedImages.length === 0} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-brand-blue-600 rounded-lg shadow-md hover:bg-brand-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">
                                    {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <PencilIcon className="w-5 h-5" />}
                                    {isLoading ? "Analyse en cours..." : "Analyser le texte des images"}
                                </button>
                             </div>
                        )}
                    </div>
                );
            case 'review':
                return (
                    <div className="space-y-4">
                        <h4 className="font-semibold text-gray-300">Vérifiez et corrigez le texte extrait</h4>
                         <p className="text-sm text-gray-400">L'IA se basera sur ce texte. Modifiez-le si nécessaire pour qu'il corresponde parfaitement à votre copie.</p>
                         <textarea
                            value={editableOcrText}
                            onChange={(e) => setEditableOcrText(e.target.value)}
                            rows={15}
                            className="w-full p-3 font-mono text-sm bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500"
                         />
                        <button onClick={handleSubmitForAssistant} disabled={isLoading} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 disabled:opacity-70">
                             {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                             {isLoading ? "Chargement..." : "Utiliser ce texte pour l'assistant IA"}
                        </button>
                    </div>
                );
            default: return null;
        }
    };
    
    if (!user) return null;

    if (!isPanelOpen) {
        return (
            <div className="bg-gray-800/30 rounded-xl p-6 border-2 border-dashed border-gray-700/30 text-center">
                <CameraIcon className="w-10 h-10 mx-auto text-brand-blue-400" />
                <h3 className="text-xl font-semibold text-brand-blue-300 mt-4">Analyser votre copie par photo</h3>
                <p className="text-gray-400 mt-2 text-sm">Prenez une photo de votre brouillon. L'IA la transcrira pour que vous puissiez l'utiliser avec l'assistant interactif.</p>
                <button onClick={() => setIsPanelOpen(true)} className="mt-4 px-6 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700">
                    Analyser une photo
                </button>
            </div>
        );
    }
    
    return (
         <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-semibold text-brand-blue-300 mb-4">Analyse de copie par photo</h3>
             {error && <p className="mb-4 p-3 text-center bg-red-900/30 text-red-300 rounded-lg">{error}</p>}
             {renderContent()}
             <div className="flex justify-between items-center mt-4">
                <button onClick={resetAllState} className="text-xs text-gray-500 hover:text-gray-300">Annuler et fermer</button>
            </div>
        </div>
    );
};