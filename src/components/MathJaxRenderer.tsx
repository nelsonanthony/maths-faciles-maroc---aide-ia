
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
  const source = content || '';
  if (!source.trim()) return '';

  const mathExpressions: string[] = [];
  const placeholder = (i: number) => `<!--MATHJAX_PLACEHOLDER_${i}-->`;

  // 1. Isolate all math expressions to protect them from the Markdown parser.
  // Display math is processed first to correctly handle nested expressions.
  let processedText = source
    .replace(/\$\$([\s\S]*?)\$\$/g, (match) => { // display math $$...$$
      mathExpressions.push(match);
      return placeholder(mathExpressions.length - 1);
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (match) => { // display math \[...\]
      mathExpressions.push(match);
      return placeholder(mathExpressions.length - 1);
    })
    // Updated regex for inline math: using `+` instead of `*` to ensure content is not empty.
    // This prevents issues with expressions like `$ $` being processed incorrectly.
    .replace(/\$((?:\\.|[^$])+?)\$/g, (match) => { // inline math $...$
      mathExpressions.push(match);
      return placeholder(mathExpressions.length - 1);
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (match) => { // inline math \(...\), also updated to `+`
      mathExpressions.push(match);
      return placeholder(mathExpressions.length - 1);
    });

  // 2. Parse the remaining text with Markdown
  const html = marked.parse(processedText, { breaks: true, gfm: true }) as string;
  
  // 3. Restore math expressions.
  // This also "unwraps" display math from <p> tags if they are on their own line, which is cleaner for rendering.
  let finalHtml = html.replace(/<p>\s*<!--MATHJAX_PLACEHOLDER_(\d+)-->\s*<\/p>/g, (_, index) => {
    return mathExpressions[parseInt(index, 10)];
  }).replace(/<!--MATHJAX_PLACEHOLDER_(\d+)-->/g, (_, index) => {
    return mathExpressions[parseInt(index, 10)];
  });
  
  // 4. Sanitize the final HTML for security
  return DOMPurify.sanitize(finalHtml);
};


export const MathJaxRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Effect to initialize MathJax. Runs only once for the lifetime of the app
  // because of the singleton `mathjaxPromise`.
  useEffect(() => {
    initializeMathJax()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((err) => console.error("Failed to initialize MathJax", err));
  }, []);

  // A single effect to handle content changes and typesetting.
  useEffect(() => {
    if (ref.current) {
      // Always set the content. This ensures the element is populated before typesetting.
      ref.current.innerHTML = content;
      
      // If MathJax has been initialized, then proceed to typeset.
      if (isInitialized) {
        window.MathJax.typesetPromise([ref.current]).catch((err: any) =>
          console.error('MathJax typeset error:', err)
        );
      }
    }
  }, [content, isInitialized]); // Reruns when content changes or when MathJax becomes ready.

  // We render the div, and the effect populates it. This is a sound pattern.
  return <div ref={ref} className={className || ''} />;
};
