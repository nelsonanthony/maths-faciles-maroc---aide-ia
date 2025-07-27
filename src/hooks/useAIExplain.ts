
import { useState, useCallback } from 'react';
import getAIExplanation from '@/services/geminiService';
import { AIResponse } from '@/types';

interface UseAIExplainState {
    data: AIResponse | null;
    isLoading: boolean;
    error: string | null;
}

export const useAIExplain = () => {
    const [state, setState] = useState<UseAIExplainState>({
        data: null,
        isLoading: false,
        error: null,
    });

    const explain = useCallback(async (prompt: string, chapterId: string, requestType: 'socratic' | 'direct') => {
        setState({ data: null, isLoading: true, error: null });
        
        try {
            const responseData = await getAIExplanation(prompt, chapterId, requestType);
            setState({ data: responseData, isLoading: false, error: null });

        } catch (e: any) {
             // Handle specific 429 "Too Many Requests" error
            if (e.status === 429) {
                setState({ data: null, isLoading: false, error: e.message });
            } else {
                const errorMessage = e instanceof Error ? e.message : "Une erreur inconnue est survenue.";
                setState({ data: null, isLoading: false, error: errorMessage });
            }
        }
    }, []);

    const reset = useCallback(() => {
        setState({ data: null, isLoading: false, error: null });
    }, []);

    return { ...state, explain, reset };
};