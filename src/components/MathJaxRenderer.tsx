import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    MathJax: {
      config: any;
      startup: {
        promise: Promise<void>;
        ready: () => Promise<void>;
      };
      typesetPromise: (elements?: HTMLElement[]) => Promise<void>;
    };
  }
}

let mathjaxInitialized = false;

const configureMathJax = () => {
  if (!window.MathJax || mathjaxInitialized) return;

  window.MathJax.config = {
    tex: {
      inlineMath: [['\\(', '\\)']], // Seulement \(...\) pour inline
      displayMath: [['\\[', '\\]']], // Seulement \[...\] pour display
      processEscapes: true,
      processEnvironments: true,
      macros: {
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\Q': '\\mathbb{Q}',
        '\\C': '\\mathbb{C}'
      }
    },
    options: {
      ignoreHtmlClass: 'tex2jax_ignore',
      processHtmlClass: 'tex2jax_process'
    },
    svg: {
      fontCache: 'global'
    }
  };

  mathjaxInitialized = true;
};

export const MathJaxRenderer: React.FC<{ content: string; className?: string }> = ({ 
  content, 
  className = '' 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadMathJax = async () => {
      if (typeof window === 'undefined') return;

      if (!window.MathJax) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
        script.async = true;
        script.onload = () => {
          configureMathJax();
          window.MathJax.startup.ready().then(() => {
            setIsReady(true);
          });
        };
        document.head.appendChild(script);
      } else {
        configureMathJax();
        setIsReady(true);
      }
    };

    loadMathJax();
  }, []);

  useEffect(() => {
    if (!isReady || !containerRef.current) return;

    containerRef.current.innerHTML = content;
    window.MathJax.typesetPromise([containerRef.current]).catch(err => {
      console.error('MathJax typesetting error:', err);
    });
  }, [content, isReady]);

  return <div ref={containerRef} className={className} />;
};