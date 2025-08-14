
import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

declare global {
  interface Window {
    MathJax: any; // Use `any` for simplicity with the dynamic config
  }
}

// Singleton promise to ensure configuration and loading happens only once.
let mathjaxPromise: Promise<void> | null = null;

const initializeMathJax = (): Promise<void> => {
  if (mathjaxPromise) {
    return mathjaxPromise;
  }

  mathjaxPromise = new Promise((resolve, reject) => {
    const checkMathJax = () => {
      if (window.MathJax) {
        window.MathJax.config = {
          tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']], // Handles $...$ and \(...\)
            displayMath: [['$$', '$$'], ['\\[', '\\]']], // Handles $$...$$ and \[...\]
            processEscapes: true,
            processEnvironments: true,
            macros: {
              'R': '\\mathbb{R}',
              'N': '\\mathbb{N}',
              'Z': '\\mathbb{Z}',
              'Q': '\\mathbb{Q}',
              'C': '\\mathbb{C}'
            }
          },
          svg: {
            fontCache: 'global',
            displayAlign: 'left',
            linebreaks: {
              automatic: true,
              width: '90% container' // Allow automatic line breaking
            }
          },
        };
        // This promise resolves when MathJax is ready.
        window.MathJax.startup.promise.then(resolve).catch(reject);
      } else {
        // If not ready, wait and check again.
        setTimeout(checkMathJax, 50);
      }
    };
    checkMathJax();
  });
  return mathjaxPromise;
};

// Create a custom renderer that does not add IDs to headings
const customRenderer = new marked.Renderer();
customRenderer.heading = (text: string, level: number): string => {
  return `<h${level}>${text}</h${level}>\n`;
};

/**
 * Robustly processes a Markdown string that contains LaTeX, ensuring math is not corrupted by the parser.
 * @param content The Markdown string to process.
 * @returns Sanitized HTML string ready for rendering.
 */
export const processMarkdownWithMath = (content: string | undefined): string => {
    let source = content || '';
    if (!source.trim()) return '';

    // Étape 1: Protéger les formules mathématiques
    source = source
        // Protéger les formules display
        .replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g, '\n\n$1\n\n')
        // Protéger les formules en ligne en ajoutant un espace si elles sont collées à du texte
        .replace(/([^\s])(\$[^$]+?\$|\\\([\s\S]*?\\\))/g, '$1 $2')
        .replace(/(\$[^$]+?\$|\\\([\s\S]*?\\\))([^\s])/g, '$1 $2');

    const placeholders: string[] = [];
    const placeholder = (i: number) => `@@MATHJAX_PLACEHOLDER_${i}@@`;

    // Étape 2: Remplacer séquentiellement les expressions mathématiques par des placeholders
    let processedText = source;
    
    const mathPatterns = [
        { regex: /\$\$[\s\S]*?\$\$/g, type: 'display' },
        { regex: /\\\[[\s\S]*?\\\]/g, type: 'display' },
        { regex: /\\\([\s\S]*?\\\)/g, type: 'inline' },
        { regex: /(^|[^\\])\$([^$\n]+?)\$/g, type: 'inline' }
    ];

    mathPatterns.forEach(({ regex }) => {
        processedText = processedText.replace(regex, (match) => {
            placeholders.push(match);
            return placeholder(placeholders.length - 1);
        });
    });

    // Étape 3: Parser le Markdown
    let html = marked.parse(processedText, { 
        breaks: true, 
        gfm: true,
        renderer: customRenderer,
    }) as string;

    // Étape 4: Restaurer les expressions mathématiques
    html = html.replace(/@@MATHJAX_PLACEHOLDER_(\d+)@@/g, (_, index) => {
        return placeholders[parseInt(index, 10)];
    });

    // Étape 5: Nettoyer les paragraphes qui contiennent UNIQUEMENT des formules display
    html = html.replace(
        /<p>\s*(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])\s*<\/p>/g, 
        '$1'
    );
    
    // Étape 6: S'assurer qu'il y a un espace autour des formules inline pour éviter qu'elles ne soient collées au texte
    html = html.replace(/\s*(\$[^$]+?\$|\\\([\s\S]*?\\\))\s*/g, ' $1 ');


    return DOMPurify.sanitize(html);
};


export const MathJaxRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeMathJax()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((err) => console.error("Failed to initialize MathJax", err));
  }, []);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = content;
      if (isInitialized) {
        window.MathJax.typesetPromise([ref.current]).catch((err: any) =>
          console.error('MathJax typeset error:', err)
        );
      }
    }
  }, [content, isInitialized]);

  return <div ref={ref} className={className || ''} />;
};
