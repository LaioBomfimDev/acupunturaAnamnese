import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ClinicReceiptSheet } from './ClinicReceiptSheet';

/**
 * Imprime uma folha (ou várias, no pacote do mês): monta no portal, abre a
 * impressão e desmonta depois. prepare() pode pedir o número ao banco
 * antes; devolve as props da folha ou uma lista delas.
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
  const sheets = sheet ? (Array.isArray(sheet) ? sheet : [sheet]) : [];
  const portal = sheets.length
    ? createPortal(<div className="fin-print-root">{sheets.map((props, index) => <ClinicReceiptSheet key={index} {...props} />)}</div>, document.body)
    : null;
  return { print, portal, error };
}
