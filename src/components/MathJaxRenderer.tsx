import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    MathJax: any;
  }
}

let mathjaxPromise: Promise<void> | null = null;

const initializeMathJax = (): Promise<void> => {
  if (mathjaxPromise) return mathjaxPromise;

  mathjaxPromise = new Promise((resolve, reject) => {
    const checkMathJax = () => {
      if (window.MathJax) {
        window.MathJax.config = {
          tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']],
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
            displayIndent: '0', // Pas d'indentation des blocs
            linebreaks: {
              automatic: true,
              width: '90% container'
            }
          }
        };
        window.MathJax.startup.promise.then(resolve).catch(reject);
      } else {
        setTimeout(checkMathJax, 50);
      }
    };
    checkMathJax();
  });

  return mathjaxPromise;
};

export const MathJaxRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeMathJax()
      .then(() => setIsInitialized(true))
      .catch((err) => console.error("Failed to initialize MathJax", err));
  }, []);

  useEffect(() => {
    if (ref.current) {
      // Évite que Markdown compresse les espaces autour des formules inline
      const safeContent = content.replace(/\$(.+?)\$/g, ' $' + '$1' + '$ ');
      ref.current.innerHTML = safeContent;

      if (isInitialized) {
        window.MathJax.typesetClear?.();
        window.MathJax.typesetPromise([ref.current]).catch((err: any) =>
          console.error('MathJax typeset error:', err)
        );
      }
    }
  }, [content, isInitialized]);

  return <div ref={ref} className={className || ''} />;
};
