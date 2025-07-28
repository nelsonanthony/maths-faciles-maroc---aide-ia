import React, { useState, useEffect, useCallback } from 'react';
import { MathJaxRenderer } from './MathJaxRenderer';
import { EditableMathField, MathField } from 'react-mathquill';
import { MathKeyboardLayout, MathKey } from '@/types';

interface MathKeyboardProps {
  onConfirm: (latex: string) => void;
  onClose: () => void;
  initialValue?: string;
}

const KEY_LAYOUTS: MathKeyboardLayout = {
  'Principal': [
    [
      { display: 'x^2', type: 'write', value: '^2' },
      { display: 'x^n', type: 'write', value: '^' },
      { display: '|x|', type: 'cmd', value: '|' },
      { display: '7', type: 'write', value: '7', category: 'main' },
      { display: '8', type: 'write', value: '8', category: 'main' },
      { display: '9', type: 'write', value: '9', category: 'main' },
      { display: '\\div', type: 'cmd', value: '\\div' },
    ],
    [
      { display: '\\sqrt{x}', type: 'cmd', value: '\\sqrt' },
      { display: '\\sqrt[n]{x}', type: 'cmd', value: '\\sqrt[n]' },
      { display: '\\pi', type: 'cmd', value: '\\pi' },
      { display: '4', type: 'write', value: '4', category: 'main' },
      { display: '5', type: 'write', value: '5', category: 'main' },
      { display: '6', type: 'write', value: '6', category: 'main' },
      { display: '\\times', type: 'cmd', value: '\\times' },
    ],
    [
      { display: '(', type: 'write', value: '(' },
      { display: ')', type: 'write', value: ')' },
      { display: ',', type: 'write', value: ',' },
      { display: '1', type: 'write', value: '1', category: 'main' },
      { display: '2', type: 'write', value: '2', category: 'main' },
      { display: '3', type: 'write', value: '3', category: 'main' },
      { display: '-', type: 'write', value: '-' },
    ],
    [
      { display: '\\frac{a}{b}', type: 'cmd', value: '\\frac' },
      { display: 'x_n', type: 'write', value: '_' },
      { display: '=', type: 'write', value: '=' },
      { display: '0', type: 'write', value: '0', category: 'main' },
      { display: '.', type: 'write', value: '.', category: 'main' },
      { display: '\\rightarrow', type: 'keystroke', value: 'Right' },
      { display: '+', type: 'write', value: '+' },
    ],
  ],
  'Fonctions': [
    [
      { display: 'sin', type: 'cmd', value: 'sin' }, { display: 'cos', type: 'cmd', value: 'cos' },
      { display: 'tan', type: 'cmd', value: 'tan' }, { display: 'ln', type: 'cmd', value: 'ln' },
      { display: '\\sum', type: 'cmd', value: '\\sum' }, { display: '\\int', type: 'cmd', value: '\\int' },
    ],
    [
      { display: 'csc', type: 'cmd', value: 'csc' }, { display: 'sec', type: 'cmd', value: 'sec' },
      { display: 'cot', type: 'cmd', value: 'cot' }, { display: 'log', type: 'cmd', value: 'log' },
      { display: '\\lim_{x \\to a}', type: 'cmd', value: '\\lim' }, { display: 'e^x', type: 'write', value: 'e^' },
    ],
  ],
  'Symboles': [
    [
      { display: '<', type: 'write', value: '<' }, { display: '>', type: 'write', value: '>' },
      { display: '\\le', type: 'cmd', value: '\\le' }, { display: '\\ge', type: 'cmd', value: '\\ge' },
      { display: '\\ne', type: 'cmd', value: '\\ne' }, { display: '\\infty', type: 'cmd', value: '\\infty' },
    ],
    [
      { display: '\\in', type: 'cmd', value: '\\in' }, { display: '\\notin', type: 'cmd', value: '\\notin' },
      { display: '\\subset', type: 'cmd', value: '\\subset' }, { display: '\\cup', type: 'cmd', value: '\\cup' },
      { display: '\\cap', type: 'cmd', value: '\\cap' }, { display: '\\pm', type: 'cmd', value: '\\pm' },
    ],
     [
      { display: '\\forall', type: 'cmd', value: '\\forall' }, { display: '\\exists', type: 'cmd', value: '\\exists' },
      { display: '\\vec{v}', type: 'cmd', value: '\\vec' },
    ],
  ],
  'Lettres Grecques': [
    [
      { display: '\\alpha', type: 'cmd', value: '\\alpha' }, { display: '\\beta', type: 'cmd', value: '\\beta' },
      { display: '\\gamma', type: 'cmd', value: '\\gamma' }, { display: '\\delta', type: 'cmd', value: '\\delta' },
      { display: '\\epsilon', type: 'cmd', value: '\\epsilon' }, { display: '\\zeta', type: 'cmd', value: '\\zeta' },
    ],
    [
      { display: '\\eta', type: 'cmd', value: '\\eta' }, { display: '\\theta', type: 'cmd', value: '\\theta' },
      { display: '\\iota', type: 'cmd', value: '\\iota' }, { display: '\\kappa', type: 'cmd', value: '\\kappa' },
      { display: '\\lambda', type: 'cmd', value: '\\lambda' }, { display: '\\mu', type: 'cmd', value: '\\mu' },
    ],
    [
      { display: '\\nu', type: 'cmd', value: '\\nu' }, { display: '\\xi', type: 'cmd', value: '\\xi' },
      { display: '\\rho', type: 'cmd', value: '\\rho' }, { display: '\\sigma', type: 'cmd', value: '\\sigma' },
      { display: '\\tau', type: 'cmd', value: '\\tau' }, { display: '\\phi', type: 'cmd', value: '\\phi' },
    ],
  ],
};


export const MathKeyboard: React.FC<MathKeyboardProps> = ({ onConfirm, onClose, initialValue = '' }) => {
  const [latex, setLatex] = useState(initialValue);
  const [mathField, setMathField] = useState<MathField | null>(null);
  const [activeTab, setActiveTab] = useState(Object.keys(KEY_LAYOUTS)[0]);

  const handleInteraction = (action: (mf: MathField) => void) => {
    if (mathField) {
      action(mathField);
      mathField.focus();
    }
  };

  const handleKeyClick = useCallback((key: MathKey) => {
    handleInteraction(mf => {
        switch (key.type) {
            case 'write': mf.write(key.value); break;
            case 'cmd': mf.cmd(key.value); break;
            case 'keystroke': mf.keystroke(key.value); break;
        }
    });
  }, [mathField]);
  
  const handleConfirm = () => {
    onConfirm(latex);
  };
  
  return (
    <div className="keyboard-overlay" onClick={onClose}>
      <div className="keyboard-container" onClick={e => e.stopPropagation()}>
        <div className="w-full bg-gray-900 border-2 border-gray-700 rounded-t-lg text-gray-300 focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:border-brand-blue-500">
            <EditableMathField
                latex={latex}
                onChange={(field) => setLatex(field.latex())}
                mathquillDidMount={(field) => setMathField(field)}
                style={{ width: '100%', minHeight: '80px', padding: '1rem' }}
            />
        </div>
        
        <div className="bg-gray-800/80 border-x-2 border-b-2 border-gray-700 rounded-b-lg p-2 space-y-2">
            <header className="keyboard-tabs">
                {Object.keys(KEY_LAYOUTS).map(tabName => (
                    <button
                        key={tabName} type="button" onClick={() => setActiveTab(tabName)}
                        className={`keyboard-tab-button ${activeTab === tabName ? 'active' : 'inactive'}`}
                    >
                        {tabName}
                    </button>
                ))}
            </header>

            <main className="grid grid-cols-7 gap-1">
                {KEY_LAYOUTS[activeTab].flat().map((key, index) => (
                    <button
                        key={`${activeTab}-${index}`} type="button" onClick={() => handleKeyClick(key)}
                        className={`keyboard-key ${key.category || 'func'}`}
                        aria-label={`Touche ${key.display}`}
                        style={{ gridColumn: `span ${key.width || 1}` }}
                    >
                       <MathJaxRenderer content={`$$${key.display}$$`} />
                    </button>
                ))}
            </main>
            <footer className="grid grid-cols-4 gap-1 pt-2 border-t border-gray-700/50">
                 <button type="button" onClick={() => handleInteraction(mf => mf.keystroke('Left'))} className="keyboard-key main">←</button>
                 <button type="button" onClick={() => handleInteraction(mf => mf.keystroke('Right'))} className="keyboard-key main">→</button>
                 <button type="button" onClick={() => handleInteraction(mf => mf.keystroke('Backspace'))} className="keyboard-key main">⌫</button>
                 <button type="button" onClick={handleConfirm} className="keyboard-key action font-semibold">OK</button>
            </footer>
        </div>
      </div>
    </div>
  );
};