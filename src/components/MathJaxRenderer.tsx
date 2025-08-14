
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

  // Step 1: Fix MathQuill's escaped spaces, which is a key cause of "glued text".
  source = source.replace(/\\ /g, ' ');

  const placeholders: string[] = [];
  // Use a placeholder format that Markdown won't interpret. '@@' is safe, unlike '__'.
  const placeholder = (i: number) => `@@MATHJAX_PLACEHOLDER_${i}@@`;

  // Step 2: Sequentially replace math expressions with placeholders.
  // Order is crucial: display math must be replaced before inline math to avoid conflicts.
  let processedText = source
    .replace(/\$\$([\s\S]*?)\$\$/g, (match) => { // Display math $$...$$
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (match) => { // Display math \[...\]
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    })
    .replace(/\$([\s\S]*?)\$/g, (match) => {   // Inline math $...$
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (match) => { // Inline math \(...\)
      placeholders.push(match);
      return placeholder(placeholders.length - 1);
    });

  // Step 3: Parse the remaining text with Markdown.
  let html = marked.parse(processedText, { breaks: true, gfm: true }) as string;

  // Step 4: Restore the math expressions from placeholders.
  html = html.replace(/@@MATHJAX_PLACEHOLDER_(\d+)@@/g, (_, index) => {
    return placeholders[parseInt(index, 10)];
  });
  
  // Step 5: Clean up cases where math is wrapped in a <p> tag by `marked`,
  // which can cause unwanted margins and layout issues. This now handles
  // all formats correctly.
  html = html.replace(/<p>\s*(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$([\s\S]*?)\$|\\\([\s\S]*?\\\))\s*<\/p>/g, '$1');

  // Step 6: Sanitize the final HTML to prevent XSS attacks.
  return DOMPurify.sanitize(html);
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
