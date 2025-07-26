import React, { useEffect, useRef } from 'react';
// Import `desmos` for its side-effect: it attaches a `Desmos` object to the `window`.
import 'desmos';

// Define a more specific type for the Desmos calculator instance for better type safety
interface DesmosCalculator {
  destroy: () => void;
  setExpression: (expression: { id: string; latex: string }) => void;
}

interface DesmosGraphProps {
  latexFormula: string;
}

export const DesmosGraph: React.FC<DesmosGraphProps> = ({ latexFormula }) => {
  const calculatorRef = useRef<HTMLDivElement>(null);
  const calculatorInstance = useRef<DesmosCalculator | null>(null);

  useEffect(() => {
    const currentRef = calculatorRef.current;
    // The desmos library attaches itself to the window object.
    const DesmosGlobal = (window as any).Desmos;

    if (!currentRef || !DesmosGlobal) {
      return;
    }

    // Initialize the calculator
    const calculator = DesmosGlobal.GraphingCalculator(currentRef, {
      keypad: false,
      expressions: false,
      settingsMenu: false,
      zoomButtons: true,
    });
    calculatorInstance.current = calculator as unknown as DesmosCalculator;

    // Set the initial expression
    if (latexFormula) {
      calculator.setExpression({ id: 'main-graph', latex: latexFormula });
    }

    // Cleanup function: runs when the component unmounts
    return () => {
      if (calculatorInstance.current) {
        calculatorInstance.current.destroy();
        calculatorInstance.current = null;
      }
    };
  }, []); // Run only on mount to initialize the calculator

  // This separate effect handles updates to the formula when the prop changes
  useEffect(() => {
    if (calculatorInstance.current && latexFormula) {
      calculatorInstance.current.setExpression({ id: 'main-graph', latex: latexFormula });
    }
  }, [latexFormula]);

  return (
    <div className="w-full h-[400px] md:h-[500px] relative">
      <div 
        ref={calculatorRef} 
        className="w-full h-full rounded-lg border-2 border-gray-700/50 bg-white"
      />
    </div>
  );
};
