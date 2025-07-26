

import React, { useState, useEffect, useCallback } from 'react';
import { MathJaxRenderer } from './MathJaxRenderer';
import { EditableMathField } from 'react-mathquill';

// L'appel à addStyles() a été déplacé dans App.tsx pour garantir une exécution unique et sécurisée côté client.

interface MathKeyboardProps {
  onExpressionChange: (latex: string) => void;
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  showPreview?: boolean;
}

const KEY_LAYOUT = [
  ['7', '8', '9', '(', ')'],
  ['4', '5', '6', '+', '-'],
  ['1', '2', '3', '*', '/'],
  ['0', '.', '=', 'x', 'y'],
];

const FUNCTION_LAYOUT = [
    { display: '\\sqrt{\\ }', cmd: '\\sqrt' },
    { display: 'x^2', type: '^', value: '2' },
    { display: '\\frac{x}{y}', cmd: '\\frac' },
    { display: 'x^n', type: '^' },
    { display: 'x_n', type: '_' },
    { display: '\\pi', cmd: '\\pi' },
    { display: '\\le', cmd: '\\le' },
    { display: '\\ge', cmd: '\\ge' },
];

export const MathKeyboard: React.FC<MathKeyboardProps> = ({
  onExpressionChange,
  initialValue = '',
  placeholder = "Saisissez votre expression...",
  disabled = false,
  showPreview = false,
}) => {
  const [latex, setLatex] = useState(initialValue);
  const [mathField, setMathField] = useState<any>(null); // To store the MathField API instance

  useEffect(() => {
    // This effect is crucial for a controlled component.
    // It calls the parent's callback whenever the internal latex state changes.
    onExpressionChange(latex);
  }, [latex, onExpressionChange]);
  
  // This effect syncs the internal state if the parent provides a new initialValue.
  useEffect(() => {
    if (initialValue !== latex) {
      setLatex(initialValue || '');
    }
  }, [initialValue]);

  const handleInteraction = (action: (mf: any) => void) => {
    if (mathField) {
      action(mathField);
      mathField.focus();
    }
  };

  const handleButtonClick = useCallback((key: string) => {
    handleInteraction(mf => mf.typedText(key));
  }, [mathField]);

  const handleFunctionClick = useCallback((func: { display: string; cmd?: string; type?: string; value?: string }) => {
    handleInteraction(mf => {
        if (func.cmd) {
            mf.cmd(func.cmd);
        } else if (func.type) {
            mf.typedText(func.type);
            if (func.value) {
                mf.typedText(func.value);
            }
        }
    });
  }, [mathField]);

  return (
    <div className={`w-full transition-opacity ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="w-full bg-gray-900 border-2 border-gray-700 rounded-t-lg text-gray-300 focus-within:ring-2 focus-within:ring-brand-blue-500 focus-within:border-brand-blue-500">
        <EditableMathField
            latex={latex}
            onChange={(field) => {
                setLatex(field.latex());
            }}
            mathquillDidMount={(field) => {
                setMathField(field);
            }}
            style={{ width: '100%' }} // Ensures the field takes full width
            className="mq-editable-field"
        />
      </div>
      
      <div className="grid grid-cols-2 bg-gray-800/80 border-x-2 border-b-2 border-gray-700 rounded-b-lg p-2 gap-2">
         {/* Numeric and basic operators keypad */}
        <div className="grid grid-cols-5 gap-2">
            {KEY_LAYOUT.flat().map((key) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => handleButtonClick(key)}
                    className="math-keyboard-button bg-gray-700/80 hover:bg-gray-700"
                    aria-label={`Touche ${key}`}
                >
                    {key}
                </button>
            ))}
        </div>
        {/* Functions keypad */}
        <div className="grid grid-cols-4 gap-2">
            {FUNCTION_LAYOUT.map((func) => (
                <button
                    key={func.display}
                    type="button"
                    onClick={() => handleFunctionClick(func)}
                    className="math-keyboard-button bg-gray-600/80 hover:bg-gray-600"
                    aria-label={`Fonction ${func.display}`}
                >
                   <MathJaxRenderer content={`$$${func.display}$$`} />
                </button>
            ))}
             <button
                type="button"
                onClick={() => handleInteraction(mf => mf.keystroke('Backspace'))}
                className="col-span-2 math-keyboard-button bg-red-800/80 hover:bg-red-700"
                aria-label="Effacer"
            >
                Effacer
            </button>
        </div>
      </div>

       {showPreview && (
         <div className="mt-2 p-3 min-h-[4rem] bg-gray-900/50 rounded-lg border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-1">Aperçu</h4>
            <div className="text-lg">
                {latex ? <MathJaxRenderer content={`$$${latex}$$`} /> : <span className="text-gray-500">{placeholder}</span>}
            </div>
         </div>
      )}
    </div>
  );
};