export const cleanLatex = (text: string): string => {
  if (!text) return '';
  
  let cleaned = text
    // Remplacer les délimiteurs MathJax par LaTeX
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    // Nettoyer les doubles délimiteurs potentiels
    .replace(/\$\$\$/g, '$$')
    .replace(/\$\$\$\$/g, '$$');
    
  return cleaned;
};

export const validateLatexFormat = (text: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Vérifier les délimiteurs MathJax restants
  if (/\\\(|\\\)/.test(text)) {
    errors.push('Délimiteurs MathJax inline détectés');
  }
  if (/\\\[|\\\]/.test(text)) {
    errors.push('Délimiteurs MathJax display détectés');
  }
  
  // Vérifier l'équilibrage des délimiteurs LaTeX
  const inlineCount = (text.match(/\$/g) || []).length;
  if (inlineCount % 2 !== 0) {
    errors.push('Délimiteurs inline LaTeX non équilibrés');
  }
  
  return { isValid: errors.length === 0, errors };
};
