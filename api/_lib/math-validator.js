import { cleanLatex } from '../../src/utils/math-format';

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