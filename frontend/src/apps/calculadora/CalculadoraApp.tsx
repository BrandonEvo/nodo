import { useState, useCallback } from 'react';
import { Delete } from 'lucide-react';
import type { AppProps } from '../index';

// ─── Tipos internos ──────────────────────────────────────────
type Operator = '+' | '-' | '×' | '÷' | null;

interface HistoryEntry {
  expression: string;
  result: string;
}

// ─── Componente principal ─────────────────────────────────────
export function CalculadoraApp(_props: AppProps) {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [expression, setExpression] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ── Lógica ──────────────────────────────────────────────────
  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  }, [display, waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  }, [display, waitingForOperand]);

  const clear = useCallback(() => {
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    setExpression('');
  }, []);

  const backspace = useCallback(() => {
    if (waitingForOperand) return;
    setDisplay(display.length > 1 ? display.slice(0, -1) : '0');
  }, [display, waitingForOperand]);

  const toggleSign = useCallback(() => {
    setDisplay(String(parseFloat(display) * -1));
  }, [display]);

  const percentage = useCallback(() => {
    setDisplay(String(parseFloat(display) / 100));
  }, [display]);

  const handleOperator = useCallback((nextOp: Operator) => {
    const current = parseFloat(display);
    setExpression(`${display} ${nextOp}`);
    setPrevValue(current);
    setOperator(nextOp);
    setWaitingForOperand(true);
  }, [display]);

  const calculate = useCallback(() => {
    if (operator === null || prevValue === null) return;
    const current = parseFloat(display);
    let result = 0;
    switch (operator) {
      case '+': result = prevValue + current; break;
      case '-': result = prevValue - current; break;
      case '×': result = prevValue * current; break;
      case '÷': result = current !== 0 ? prevValue / current : 0; break;
    }
    const resultStr = String(parseFloat(result.toFixed(10)));
    const expr = `${expression} ${display}`;
    setHistory(prev => [{ expression: expr, result: resultStr }, ...prev].slice(0, 8));
    setDisplay(resultStr);
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(true);
    setExpression('');
  }, [display, prevValue, operator, expression]);

  // ── Formateo del display ─────────────────────────────────────
  const formatDisplay = (val: string) => {
    if (val.length > 12) return parseFloat(val).toExponential(4);
    return val;
  };

  // ── Layout de botones ────────────────────────────────────────
  const buttons: Array<{
    label: React.ReactNode;
    action: () => void;
    variant: 'function' | 'operator' | 'number' | 'equals' | 'backspace';
    wide?: boolean;
  }> = [
    { label: 'AC', action: clear, variant: 'function' },
    { label: '+/-', action: toggleSign, variant: 'function' },
    { label: '%', action: percentage, variant: 'function' },
    { label: '÷', action: () => handleOperator('÷'), variant: 'operator' },

    { label: '7', action: () => inputDigit('7'), variant: 'number' },
    { label: '8', action: () => inputDigit('8'), variant: 'number' },
    { label: '9', action: () => inputDigit('9'), variant: 'number' },
    { label: '×', action: () => handleOperator('×'), variant: 'operator' },

    { label: '4', action: () => inputDigit('4'), variant: 'number' },
    { label: '5', action: () => inputDigit('5'), variant: 'number' },
    { label: '6', action: () => inputDigit('6'), variant: 'number' },
    { label: '-', action: () => handleOperator('-'), variant: 'operator' },

    { label: '1', action: () => inputDigit('1'), variant: 'number' },
    { label: '2', action: () => inputDigit('2'), variant: 'number' },
    { label: '3', action: () => inputDigit('3'), variant: 'number' },
    { label: '+', action: () => handleOperator('+'), variant: 'operator' },

    { label: <Delete size={18} />, action: backspace, variant: 'backspace' },
    { label: '0', action: () => inputDigit('0'), variant: 'number' },
    { label: '.', action: inputDecimal, variant: 'number' },
    { label: '=', action: calculate, variant: 'equals' },
  ];

  const variantStyles: Record<string, string> = {
    function:  'bg-slate-100 hover:bg-slate-200 text-[#111111] font-semibold',
    operator:  'bg-[#111111] hover:bg-[#222222] text-[#69E7A8] font-bold text-xl',
    number:    'bg-white hover:bg-slate-50 text-[#111111] font-semibold border border-slate-100',
    equals:    'bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-bold text-xl shadow-lg',
    backspace: 'bg-white hover:bg-red-50 text-red-400 hover:text-red-600 border border-slate-100',
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-3xl mx-auto">

      {/* ── Calculadora ── */}
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden flex flex-col w-full lg:w-72 shrink-0">

        {/* Display */}
        <div className="bg-[#111111] px-6 pt-8 pb-6 flex flex-col items-end min-h-[140px] justify-end">
          {expression && (
            <p className="text-slate-400 text-sm font-medium mb-1 truncate max-w-full">
              {expression}
            </p>
          )}
          <p
            className="text-white font-black leading-none truncate max-w-full"
            style={{ fontSize: display.length > 9 ? '2rem' : display.length > 6 ? '2.5rem' : '3.5rem' }}
          >
            {formatDisplay(display)}
          </p>
        </div>

        {/* Botones */}
        <div className="grid grid-cols-4 gap-2 p-4">
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              className={`
                h-14 rounded-2xl text-base transition-all duration-100
                active:scale-95 flex items-center justify-center
                ${variantStyles[btn.variant]}
                ${btn.wide ? 'col-span-2' : ''}
                ${btn.variant === 'operator' && operator === btn.label ? 'ring-2 ring-[#69E7A8] ring-offset-1' : ''}
              `}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Historial ── */}
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 flex-1 min-h-[300px]">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Historial de Cálculos
        </h3>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
              <span className="text-2xl">🧮</span>
            </div>
            <p className="text-slate-400 text-sm font-medium">Sin cálculos aún</p>
            <p className="text-slate-300 text-xs mt-1">Los resultados aparecerán aquí</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry, i) => (
              <div
                key={i}
                className={`p-4 rounded-2xl border transition-all ${
                  i === 0
                    ? 'border-[#69E7A8]/30 bg-[#69E7A8]/5'
                    : 'border-slate-100 bg-slate-50/50'
                }`}
              >
                <p className="text-xs text-slate-400 font-medium">{entry.expression}</p>
                <p className={`text-lg font-black mt-0.5 ${i === 0 ? 'text-[#111111]' : 'text-slate-600'}`}>
                  = {entry.result}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
