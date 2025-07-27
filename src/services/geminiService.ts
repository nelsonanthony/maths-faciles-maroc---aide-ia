

import { AIResponse } from "@/types";
import { getSupabase } from '@/services/authService';

/**
 * Calls the production-ready serverless function to get an explanation from the AI.
 * This now sends the auth token for rate limiting and chapterId for semantic video search.
 * @param prompt The full prompt to send to the serverless function.
 * @param chapterId The ID of the chapter to search for relevant video chunks.
 * @param requestType The type of response desired from the AI ('socratic', 'direct').
 * @returns An object containing the explanation, socratic path, and/or an optional video chunk.
 */
const getAIExplanation = async (prompt: string, chapterId: string, requestType: 'socratic' | 'direct'): Promise<AIResponse> => {
    try {
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error("Vous devez être connecté pour utiliser cette fonctionnalité.");
        }

        const response = await fetch(`/api/explain`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ prompt, chapterId, requestType }),
        });
        
        const responseBody = await response.text(); // Read the body ONCE.

        if (!response.ok) {
            const errorStatus = response.status;
            let errorMessage;
            try {
                // Try to parse the text as JSON, as the server might send a JSON error object.
                const errorData = JSON.parse(responseBody);
                errorMessage = errorData.error || `Erreur du serveur: ${response.statusText}`;
            } catch (jsonError) {
                // If parsing fails, the body was not JSON. Use the raw text.
                errorMessage = responseBody || `Erreur du serveur: ${response.statusText}`;
            }
            const error = new Error(errorMessage);
            (error as any).status = errorStatus;
            throw error;
        }

        // If response is OK, it should be valid JSON.
        const data: AIResponse = JSON.parse(responseBody);
        return data;

    } catch (error) {
        console.error("Erreur lors de l'appel à la fonction serverless pour l'explication IA:", error);
        throw error; // Propagate the error with status code
    }
};

export default getAIExplanation;