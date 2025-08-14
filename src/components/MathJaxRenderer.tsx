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
// The `heading` method in recent versions of `marked`'s renderer receives a single
// token object, not separate `text` and `level` arguments. This fixes the type error.
customRenderer.heading = (token: any): string => {
  // `token.text` is the raw markdown content of the heading. We must parse it
  // for inline markdown elements like bold, italics, etc.
  const text = marked.parseInline(token.text);
  // `token.depth` is the heading level (1-6).
  return `<h${token.depth}>${text}</h${token.depth}>\n`;
};


/**
 * Robustly processes a Markdown string that contains LaTeX
 */
export const processMarkdownWithMath = (content: string | undefined): string => {
    let source = content || '';
    if (!source.trim()) return '';

    // Nouvelle approche simplifiée
    // Étape 1: Protéger les formules mathématiques avec des balises temporaires
    const protectedSource = source
        .replace(/\$\$([\s\S]*?)\$\$/g, '<math-display>$$$1$$</math-display>')
        .replace(/\\\[([\s\S]*?)\\\]/g, '<math-display>\\[$1\\]</math-display>')
        .replace(/\\\(([\s\S]*?)\\\)/g, '<math-inline>\\($1\\)</math-inline>')
        .replace(/(^|[^\\])\$([^$\n]+?)\$/g, '$1<math-inline>$ $2 $</math-inline>');

    // Étape 2: Parser le Markdown
    let html = marked.parse(protectedSource, {
        breaks: true,
        gfm: true,
        renderer: customRenderer,
    }) as string;

    // Étape 3: Remplacer les balises temporaires par les formules originales
    html = html
        .replace(/<math-display>([\s\S]*?)<\/math-display>/g, '$1')
        .replace(/<math-inline>([\s\S]*?)<\/math-inline>/g, '$1');

    // Étape 4: Nettoyer les paragraphes autour des formules display
    html = html.replace(
        /<p>\s*(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])\s*<\/p>/g,
        '$1'
    );

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
