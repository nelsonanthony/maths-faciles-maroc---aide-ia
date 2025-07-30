
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

    // Nombre de vérifications d'étape dans le tuteur socratique.
    SOCRATIC_VALIDATION: 60,

    // Nombre de reconnaissances d'écriture par image.
    OCR: 30,
};

export type AiCallType = keyof typeof AI_USAGE_LIMITS;
