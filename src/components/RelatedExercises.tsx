

import React, { useState, useEffect } from 'react';
import { Exercise } from '@/types';
import { SpinnerIcon, DocumentTextIcon } from '@/components/icons';

interface RelatedExercisesProps {
    currentExerciseId: string;
    levelId: string;
    onSelectExercise: (exerciseId: string) => void;
}

export const RelatedExercises: React.FC<RelatedExercisesProps> = ({ currentExerciseId, levelId, onSelectExercise }) => {
    const [relatedExercises, setRelatedExercises] = useState<Exercise[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRelated = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/find-similar-exercises`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ exerciseId: currentExerciseId, levelId })
                });

                const responseText = await response.text(); // Read the body ONCE

                if (!response.ok) {
                    try {
                        const errorData = JSON.parse(responseText);
                        throw new Error(errorData.error || 'Failed to fetch related exercises');
                    } catch (e) {
                         throw new Error(responseText || 'Failed to fetch related exercises');
                    }
                }
                
                if (responseText) {
                    const data: Exercise[] = JSON.parse(responseText);
                    setRelatedExercises(data);
                } else {
                    setRelatedExercises([]); // Handle empty success response
                }

            } catch (err) {
                const message = err instanceof Error ? err.message : 'An unknown error occurred';
                console.error("Error fetching related exercises:", message);
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchRelated();
    }, [currentExerciseId, levelId]);

    if (isLoading) {
        return (
            <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30 text-center">
                <SpinnerIcon className="w-8 h-8 animate-spin text-brand-blue-500 mx-auto" />
                <p className="mt-2 text-sm text-gray-400">Recherche d'exercices similaires...</p>
            </div>
        );
    }

    if (error) {
        // We don't show the error to the user to keep the UI clean, just log it.
        // This feature is a "nice-to-have" and shouldn't block the user experience.
        return null; 
    }

    if (relatedExercises.length === 0) {
        // Don't render anything if no similar exercises are found
        return null;
    }

    return (
        <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30">
            <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3 mb-4">
                <DocumentTextIcon className="w-6 h-6" />
                Pour s'entraîner sur le même thème
            </h3>
            <div className="space-y-3">
                {relatedExercises.map(ex => (
                    <button
                        key={ex.id}
                        onClick={() => onSelectExercise(ex.id)}
                        className="w-full text-left p-4 bg-gray-700/50 hover:bg-gray-700 transition-colors rounded-lg"
                    >
                        <p className="font-semibold text-gray-200 truncate">{ex.statement}</p>
                        <p className="text-xs text-brand-blue-400 mt-1">Cliquez pour voir cet exercice</p>
                    </button>
                ))}
            </div>
        </div>
    );
};
