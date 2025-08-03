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
  'main': {
    cols: 12,
    keys: [
      [
        { display: 'a^2', type: 'write', value: '^2', category: 'func', width: 2 },
        { display: 'a^b', type: 'write', value: '^', category: 'func', width: 2 },
        { display: '|a|', type: 'cmd', value: '|', category: 'func', width: 2 },
        { display: '7', type: 'write', value: '7', category: 'main' },
        { display: '8', type: 'write', value: '8', category: 'main' },
        { display: '9', type: 'write', value: '9', category: 'main' },
        { display: '\\div', type: 'cmd', value: '\\div', category: 'func' },
        { display: '%', type: 'write', value: '%', category: 'func' },
        { display: '\\frac{a}{b}', type: 'cmd', value: '\\frac', category: 'func' },
      ],
      [
        { display: '\\sqrt{x}', type: 'cmd', value: '\\sqrt', category: 'func', width: 2 },
        { display: '\\sqrt[n]{x}', type: 'cmd', value: '\\sqrt[n]', category: 'func', width: 2 },
        { display: '\\pi', type: 'cmd', value: '\\pi', category: 'func', width: 2 },
        { display: '4', type: 'write', value: '4', category: 'main' },
        { display: '5', type: 'write', value: '5', category: 'main' },
        { display: '6', type: 'write', value: '6', category: 'main' },
        { display: '\\times', type: 'cmd', value: '\\times', category: 'func' },
        { display: '←', type: 'keystroke', value: 'Left', category: 'main' },
        { display: '→', type: 'keystroke', value: 'Right', category: 'main' },
      ],
      [
        { display: 'sin', type: 'cmd', value: 'sin', category: 'func', width: 2 },
        { display: 'cos', type: 'cmd', value: 'cos', category: 'func', width: 2 },
        { display: 'tan', type: 'cmd', value: 'tan', category: 'func', width: 2 },
        { display: '1', type: 'write', value: '1', category: 'main' },
        { display: '2', type: 'write', value: '2', category: 'main' },
        { display: '3', type: 'write', value: '3', category: 'main' },
        { display: '-', type: 'write', value: '-', category: 'func' },
        { display: '⌫', type: 'keystroke', value: 'Backspace', category: 'main', width: 2 },
      ],
      [
        { display: '(', type: 'write', value: '(', category: 'func', width: 2 },
        { display: ')', type: 'write', value: ')', category: 'func', width: 2 },
        { display: ',', type: 'write', value: ',', category: 'func', width: 2 },
        { display: '0', type: 'write', value: '0', category: 'main' },
        { display: '.', type: 'write', value: '.', category: 'main' },
        { display: 'ans', type: 'write', value: 'ans', category: 'func' },
        { display: '+', type: 'write', value: '+', category: 'func' },
        { display: '↵', type: 'keystroke', value: 'Enter', category: 'action', width: 2 },
      ],
    ]
  },
  'abc': {
    cols: 20,
    keys: [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map(k => ({ display: k, type: 'write', value: k, category: 'main', width: 2 })),
      [
        { display: '', type: 'write', value: '', category: 'spacer', width: 1 },
        ...['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map(k => ({ display: k, type: 'write', value: k, category: 'main', width: 2 })),
        { display: '', type: 'write', value: '', category: 'spacer', width: 1 },
      ],
      [
        { display: '=', type: 'write', value: '=', category: 'func', width: 2 },
        ...['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(k => ({ display: k, type: 'write', value: k, category: 'main', width: 2 })),
        { display: ',', type: 'write', value: ',', category: 'func', width: 2 },
        { display: '⌫', type: 'keystroke', value: 'Backspace', category: 'main', width: 2 },
      ],
      [
        { display: '↑', type: 'keystroke', value: 'Shift', category: 'main', width: 3 },
        { display: '(', type: 'write', value: '(', category: 'func', width: 2 },
        { display: ')', type: 'write', value: ')', category: 'func', width: 2 },
        { display: '[', type: 'write', value: '[', category: 'func', width: 2 },
        { display: ']', type: 'write', value: ']', category: 'func', width: 2 },
        { display: '!', type: 'write', value: '!', category: 'func', width: 2 },
        { display: "'", type: 'write', value: "'", category: 'func', width: 2 },
        { display: '\\pi', type: 'cmd', value: '\\pi', category: 'func', width: 2 },
        { display: '↵', type: 'keystroke', value: 'Enter', category: 'action', width: 3 },
      ]
    ]
  },
  'func': {
    cols: 6,
    keys: [
      [
        { display: 'sin', type: 'cmd', value: 'sin', category: 'func' },
        { display: 'cos', type: 'cmd', value: 'cos', category: 'func' },
        { display: 'tan', type: 'cmd', value: 'tan', category: 'func' },
        { display: 'a^b', type: 'write', value: '^', category: 'func' },
        { display: '\\sqrt{x}', type: 'cmd', value: '\\sqrt', category: 'func' },
        { display: '\\sqrt[n]{x}', type: 'cmd', value: '\\sqrt[n]', category: 'func' },
      ],
      [
        { display: 'sin^{-1}', type: 'write', value: 'sin^{-1}', category: 'func' },
        { display: 'cos^{-1}', type: 'write', value: 'cos^{-1}', category: 'func' },
        { display: 'tan^{-1}', type: 'write', value: 'tan^{-1}', category: 'func' },
        { display: 'e^x', type: 'write', value: 'e^', category: 'func' },
        { display: 'abs', type: 'cmd', value: 'abs', category: 'func' },
        { display: 'round', type: 'write', value: 'round', category: 'func' },
      ],
      [
        { display: 'mean', type: 'write', value: 'mean', category: 'func' },
        { display: 'stdev', type: 'write', value: 'stdev', category: 'func' },
        { display: 'stdevp', type: 'write', value: 'stdevp', category: 'func' },
        { display: 'ln', type: 'cmd', value: 'ln', category: 'func' },
        { display: 'log', type: 'cmd', value: 'log', category: 'func' },
        { display: '⌫', type: 'keystroke', value: 'Backspace', category: 'main' },
      ],
      [
        { display: 'nPr', type: 'write', value: 'nPr', category: 'func' },
        { display: 'nCr', type: 'write', value: 'nCr', category: 'func' },
        { display: '!', type: 'write', value: '!', category: 'func' },
        { display: 'e', type: 'write', value: 'e', category: 'func' },
        { display: '\\pi', type: 'cmd', value: '\\pi', category: 'func' },
        { display: '↵', type: 'keystroke', value: 'Enter', category: 'action' },
      ]
    ]
  }
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
  
  const currentLayout = KEY_LAYOUTS[activeTab];

  return (
    <div className="keyboard-overlay" onClick={onClose}>
      <div className="keyboard-container" onClick={e => e.stopPropagation()}>
        <div className="w-full bg-gray-900 border-2 border-gray-700 rounded-t-lg text-gray-300 focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:border-brand-blue-500">
            <EditableMathField
                latex={latex}
                onChange={(field) => setLatex(field.latex())}
                mathquillDidMount={(field) => setMathField(field)}
                config={{
                    // Prevent auto-converting "f" into a function symbol
                    autoOperatorNames: 'sin cos tan log ln',
                }}
                style={{ width: '100%', minHeight: '80px', padding: '1rem' }}
            />
        </div>
        
        <div className="bg-gray-800/80 border-x-2 border-b-2 border-gray-700 rounded-b-lg p-2 space-y-2">
            <header className="keyboard-tabs">
                {Object.keys(KEY_LAYOUTS).map(tabName => (
                    <button
                        key={tabName} type="button" onClick={() => setActiveTab(tabName)}
                        className={`keyboard-tab-button capitalize ${activeTab === tabName ? 'active' : 'inactive'}`}
                    >
                        {tabName}
                    </button>
                ))}
            </header>

            <main className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${currentLayout.cols}, minmax(0, 1fr))` }}>
                {currentLayout.keys.flat().map((key, index) => (
                    key.category === 'spacer' ? (
                        <div key={`${activeTab}-spacer-${index}`} style={{ gridColumn: `span ${key.width || 1}` }} />
                    ) : (
                        <button
                            key={`${activeTab}-${index}`} type="button" onClick={() => handleKeyClick(key)}
                            className={`keyboard-key ${key.category || 'func'}`}
                            aria-label={`Touche ${key.display}`}
                            style={{ gridColumn: `span ${key.width || 1}` }}
                        >
                           <MathJaxRenderer content={key.display.includes('\\') ? `$$${key.display}$$` : key.display} />
                        </button>
                    )
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