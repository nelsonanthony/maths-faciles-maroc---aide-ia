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
        // Use negative lookbehind to avoid matching escaped dollars like \$
        .replace(/(?<!\\)\$([^\n\$]+?)\$/g, (match) => {
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

    // 5. Clean up <p> tags only around display math
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
