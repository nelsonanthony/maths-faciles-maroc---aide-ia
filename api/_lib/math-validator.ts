
// Duplicated from src/utils/math-format.ts to resolve Vercel build issues
export const cleanLatex = (text: string): string => {
  if (!text) return '';

  // Étape 1: Remplacer les échappements simples et doubles de MathJax par des délimiteurs LaTeX standard.
  // L'ordre est important : d'abord les plus spécifiques (doubles échappements) puis les simples.
  let cleaned = text
    .replace(/\\\\\(/g, '$').replace(/\\\\\)/g, '$')   //  \\( -> $
    .replace(/\\\\\\[/g, '$$').replace(/\\\\\\]/g, '$$') //  \\[ -> $$
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')     //  \( -> $
    .replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');   //  \[ -> $$
  
  // Étape 2: Fusionner les délimiteurs multiples qui peuvent résulter du remplacement.
  cleaned = cleaned.replace(/\$\$/g, '$$').replace(/\$ \$/g, '$$'); // $$$, $ $ -> $$
  
  // Étape 3: Validation stricte pour s'assurer qu'aucun format MathJax n'a survécu.
  const mathjaxPatterns = [/\\\(/, /\\\)/, /\\\[/, /\\\]/];
  if (mathjaxPatterns.some(pattern => pattern.test(cleaned))) {
    console.error(`Format MathJax non autorisé détecté APRÈS nettoyage. Original: "${text}", Nettoyé: "${cleaned}"`);
    // Lancer une erreur force un retour 500, ce qui est préférable à renvoyer du contenu mal formaté.
    // Cela aide à identifier les cas où le prompt de l'IA doit être amélioré.
    throw new Error('ERREUR: Format MathJax non autorisé détecté. La réponse de l\'IA n\'a pas pu être assainie.');
  }

  return cleaned;
};


/**
 * Parcourt récursivement un objet ou un tableau et applique la fonction cleanLatex
 * à toutes les valeurs de type chaîne de caractères.
 * @param content L'objet, le tableau ou la chaîne à nettoyer.
 * @returns Le contenu nettoyé avec le même type que l'entrée.
 */
export const validateMathResponse = (content: any): any => {
  if (typeof content === 'string') {
    // Applique le nettoyage et la validation sur chaque chaîne
    return cleanLatex(content);
  }

  if (Array.isArray(content)) {
    // Applique récursivement sur chaque élément du tableau
    return content.map(validateMathResponse);
  }

  if (typeof content === 'object' && content !== null) {
    // Applique récursivement sur chaque valeur de l'objet
    return Object.fromEntries(
      Object.entries(content).map(([key, value]) => [
        key, 
        validateMathResponse(value)
      ])
    );
  }

  // Retourne les types non-traités (nombres, booléens, etc.) tels quels
  return content;
};
