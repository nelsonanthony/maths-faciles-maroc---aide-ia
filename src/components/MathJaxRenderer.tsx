
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

/**
 * Robustly processes a Markdown string that contains LaTeX, ensuring math is not corrupted.
 * @param content The Markdown string to process.
 * @returns Sanitized HTML string ready for rendering.
 */
export const processMarkdownWithMath = (content: string | undefined): string => {
  let source = content || '';
  if (!source.trim()) return '';

  const placeholders: string[] = [];
  const placeholder = (i: number) => `@@MATHJAX_PLACEHOLDER_${i}@@`;

  // Use more robust regexes to handle edge cases better
  let processedText = source
    // Display math $$...$$
    .replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    })
    // Display math \[...\]
    .replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    })
    // Inline math $...$ - Improved regex to avoid escaped dollars and newlines
    .replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_, prefix, math) => {
      // Reconstruct the original match part that needs to be replaced
      const originalMatch = `$${math}$`;
      placeholders.push(originalMatch);
      // The prefix is preserved, and only the math part is replaced.
      return `${prefix}${placeholder(placeholders.length - 1)}`;
    })
    // Inline math \(...\)
    .replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    });

  let html = marked.parse(processedText, { breaks: true, gfm: true }) as string;

  // Restore placeholders
  html = html.replace(/@@MATHJAX_PLACEHOLDER_(\d+)@@/g, (_, index) => {
    return placeholders[parseInt(index, 10)];
  });
  
  // Important Correction: Only remove <p> tags for display math formulas
  // to avoid breaking inline math flow.
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
