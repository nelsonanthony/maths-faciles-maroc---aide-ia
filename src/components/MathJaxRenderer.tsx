
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
      if (window.MathJax?.startup?.promise) {
        window.MathJax.startup.promise.then(resolve).catch(reject);
      } else {
        setTimeout(checkMathJax, 50);
      }
    };
    checkMathJax();
  });
  return mathjaxPromise;
};

// Create a custom renderer that does not add IDs to headings
const customRenderer = new marked.Renderer();
customRenderer.heading = (token: any): string => {
  const textContent = token?.text || '';
  const text = marked.parseInline(textContent);
  const level = token?.depth || 1;
  return `<h${level}>${text}</h${level}>\n`;
};


/**
 * Robustly processes a Markdown string that contains LaTeX using a placeholder strategy.
 */
export const processMarkdownWithMath = (content: string | undefined): string => {
    let source = content || '';
    if (!source.trim()) return '';

    const placeholders: string[] = [];
    const placeholder = (i: number) => `@@MATHJAX_PLACEHOLDER_${i}@@`;

    // 1. Protect display math first
    source = source
        .replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
            placeholders.push(match);
            return placeholder(placeholders.length - 1);
        })
        .replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
            placeholders.push(match);
            return placeholder(placeholders.length - 1);
        });

    // 2. Protect inline math
    source = source
        .replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
            placeholders.push(match);
            return placeholder(placeholders.length - 1);
        })
        // Use a non-greedy regex for single dollar signs.
        .replace(/\$([\s\S]+?)\$/g, (match) => {
            placeholders.push(match);
            return placeholder(placeholders.length - 1);
        });

    // 3. Parse markdown on text-only content
    let html = marked.parse(source, {
        breaks: true,
        gfm: true,
        renderer: customRenderer,
    }) as string;

    // 4. Restore math content
    html = html.replace(/@@MATHJAX_PLACEHOLDER_(\d+)@@/g, (_, index) => {
        return placeholders[parseInt(index, 10)];
    });

    // 5. Clean up <p> tags only around display math to fix spacing issues
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