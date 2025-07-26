
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fichier de configuration central pour les limites d'utilisation de l'IA.
 * MODIFIEZ CES VALEURS pour ajuster le nombre d'appels quotidiens par utilisateur.
 */
export const AI_USAGE_LIMITS = {
    // Nombre de fois qu'un élève peut demander une explication par jour.
    EXPLANATION: 20,
    
    // Nombre de fois qu'un élève peut soumettre une copie manuscrite par jour.
    HANDWRITING_CORRECTION: 10,

    // Nombre de fois qu'un élève peut faire valider sa réponse à un exercice.
    ANSWER_VALIDATION: 30,
};

export type AiCallType = keyof typeof AI_USAGE_LIMITS;


/**
 * Vérifie si un utilisateur a dépassé sa limite quotidienne pour un type d'appel IA spécifique.
 * @param supabase Le client Supabase.
 * @param userId L'ID de l'utilisateur.
 * @param callType Le type d'appel (ex: 'EXPLANATION').
 * @returns {Promise<{limitExceeded: boolean, usageCount: number, limit: number}>}
 */
export const checkUsageLimit = async (supabase: SupabaseClient, userId: string, callType: AiCallType) => {
    const limit = AI_USAGE_LIMITS[callType];
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await (supabase
        .from('ai_usage_logs') as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('call_type', callType)
        .gte('request_timestamp', twentyFourHoursAgo);

    if (error) {
        console.error(`Error checking AI usage for user ${userId}:`, error);
        // Fail-open: if we can't check the limit, allow the request but log the error.
        return { limitExceeded: false, usageCount: 0, limit };
    }

    return {
        limitExceeded: count !== null && count >= limit,
        usageCount: count || 0,
        limit,
    };
};

/**
 * Enregistre un nouvel appel à l'IA pour un utilisateur.
 * @param supabase Le client Supabase.
 * @param userId L'ID de l'utilisateur.
 * @param callType Le type d'appel.
 */
export const logAiCall = async (supabase: SupabaseClient, userId: string, callType: AiCallType) => {
    const { error } = await (supabase
        .from('ai_usage_logs') as any)
        .insert({
            user_id: userId,
            call_type: callType
        });
    
    if (error) {
        console.error(`Error logging AI call for user ${userId}:`, error);
        // This is a non-blocking error for the user experience.
    }
};
