import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ClinicReceiptSheet } from './ClinicReceiptSheet';

/**
 * Imprime uma folha: monta no portal, abre a impressão e desmonta depois.
 * prepare() pode pedir o número ao banco antes; devolve as props da folha.
 */
export function usePrintSheet() {
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState('');
  async function print(prepare, afterPrint) {
    setError('');
    try {
      const props = await prepare();
      flushSync(() => setSheet(props));
      document.body.classList.add('fin-printing');
      const done = () => {
        document.body.classList.remove('fin-printing');
        setSheet(null);
        window.removeEventListener('afterprint', done);
        afterPrint?.();
      };
      window.addEventListener('afterprint', done);
      window.print();
    } catch (err) {
      setError(err.message || 'Não foi possível imprimir.');
    }
  }
  const portal = sheet ? createPortal(<div className="fin-print-root"><ClinicReceiptSheet {...sheet} /></div>, document.body) : null;
  return { print, portal, error };
}
