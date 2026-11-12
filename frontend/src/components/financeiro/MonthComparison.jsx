import { useMemo, useState } from 'react';
import { operatorReceiptsFrom } from '../../utils/tissXml';
import { formatBRL, formatBRLWithCents, formatDay, todayInClinic } from '../../utils/finance';
import { REPORT_BASES, buildMonthComparison, buildReportRows, formatChange, lastMonths } from '../../utils/financeReport';
import { buildXlsx, downloadBlob } from '../../utils/xlsxExport';
import { useLetterheadPrint } from './useLetterheadPrint';

// ============================================================
// Comparar meses (11/11/2026, etapa 3): os últimos 6 ou 12 meses até o
// mês escolhido no topo, com entradas, saídas e resultado de cada um, a
// diferença para o mês anterior e as saídas por categoria. As contas são
// as mesmas do Relatório do contador (buildReportRows), pela mesma base
// de datas escolhida aqui.
// ============================================================

const SPANS = [6, 12];

function monthShort(month) {
  const [year, number] = month.key.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[Number(number) - 1]}/${year.slice(2)}`;
}

export function MonthComparison({ fin }) {
  const [span, setSpan] = useState(6);
  const [basis, setBasis] = useState('servico');
  const pdf = useLetterheadPrint(fin.profile);
  const [error, setError] = useState('');

  const lookups = useMemo(() => ({
    chargesById: new Map(fin.data.charges.map(row => [row.id, row])),
    packagesById: new Map(fin.data.packages.map(row => [row.id, row])),
    patientsById: fin.patientsById,
    membersById: fin.membersById,
    peopleById: fin.peopleById,
    categoriesById: fin.categoriesById,
  }), [fin.data, fin.patientsById, fin.membersById, fin.peopleById, fin.categoriesById]);

  const comparison = useMemo(() => {
    const operatorReceipts = operatorReceiptsFrom(fin.data.tissPaid);
    return buildMonthComparison({
      months: lastMonths(fin.month, span),
      rowsFor: month => buildReportRows({
        receipts: fin.data.receipts,
        operatorReceipts,
        expenses: fin.data.expenses,
        lookups,
        range: { from: month.from, to: month.to },
        basis,
      }),
    });
  }, [fin.data, fin.month, span, basis, lookups]);

  const top = Math.max(1, ...comparison.columns.flatMap(column => [column.totals.inCents, column.totals.outCents]));
  const basisLabel = REPORT_BASES.find(item => item.id === basis).label;
  const first = comparison.columns[0].month;
  const last = comparison.columns[comparison.columns.length - 1].month;

  async function downloadExcel() {
    setError('');
    try {
      const months = comparison.columns.map(column => monthShort(column.month));
      const blob = await buildXlsx([{
        name: 'Comparação',
        columns: [{ header: basisLabel, width: 30 }, ...months.map(header => ({ header, width: 14, type: 'money' }))],
        rows: [
          ['Entradas', ...comparison.columns.map(column => column.totals.inCents)],
          ['Saídas', ...comparison.columns.map(column => column.totals.outCents)],
          ['Resultado', ...comparison.columns.map(column => column.totals.resultCents)],
          ...comparison.categories.map(row => [`Saídas · ${row.name}`, ...row.values]),
        ],
      }]);
      downloadBlob(blob, `financeiro-comparacao-${first.key}_a_${last.key}.xlsx`);
    } catch (err) {
      setError(err.message || 'Não foi possível montar a planilha.');
    }
  }

  function printPdf() {
    const cell = { padding: '4px 5px', borderBottom: '1px solid #cbd5e1', fontSize: 10, textAlign: 'right', whiteSpace: 'nowrap' };
    const label = { ...cell, textAlign: 'left', whiteSpace: 'normal' };
    pdf.print(
      <>
        <h2 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: 16 }}>Comparação de meses</h2>
        <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: 11 }}>{first.label} a {last.label} · por {basisLabel.toLocaleLowerCase('pt-BR')}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={label} />{comparison.columns.map(column => <th key={column.month.key} style={cell}>{monthShort(column.month)}</th>)}</tr></thead>
          <tbody>
            <tr><td style={{ ...label, fontWeight: 700 }}>Entradas</td>{comparison.columns.map(column => <td key={column.month.key} style={cell}>{formatBRLWithCents(column.totals.inCents)}</td>)}</tr>
            <tr><td style={{ ...label, fontWeight: 700 }}>Saídas</td>{comparison.columns.map(column => <td key={column.month.key} style={cell}>{formatBRLWithCents(column.totals.outCents)}</td>)}</tr>
            <tr><td style={{ ...label, fontWeight: 700 }}>Resultado</td>{comparison.columns.map(column => <td key={column.month.key} style={cell}>{formatBRLWithCents(column.totals.resultCents)}</td>)}</tr>
            {comparison.categories.map(row => (
              <tr key={row.name}><td style={label}>{row.name}</td>{row.values.map((value, index) => <td key={index} style={cell}>{value ? formatBRLWithCents(value) : '–'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </>,
      { dateLabel: formatDay(todayInClinic()), kindLabel: 'Comparação de meses' },
    );
  }

  return (
    <section className="fin-section fin-compare">
      <div className="fin-report-controls">
        <div className="fin-choices" role="group" aria-label="Quantos meses">
          {SPANS.map(value => (
            <button key={value} type="button" className="fin-choice" aria-pressed={span === value} onClick={() => setSpan(value)}>Últimos {value} meses</button>
          ))}
        </div>
        <div className="fin-choices" role="group" aria-label="Datas pelo">
          {REPORT_BASES.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={basis === option.id} onClick={() => setBasis(option.id)}>{option.label}</button>
          ))}
        </div>
        <div className="fin-actions">
          <button type="button" className="gt-btn" onClick={downloadExcel}>Baixar Excel</button>
          <button type="button" className="gt-btn" onClick={printPdf}>Baixar PDF</button>
        </div>
      </div>
      <p className="fin-hint">Até {last.label}, o mês escolhido no topo. {basis === 'servico' ? 'Por data do serviço (em teste).' : 'Por data do pagamento.'}</p>
      {fin.data.tissReady === false && (
        <p className="gt-notice gt-notice-error" role="alert">
          O dinheiro de convênio não carregou agora: a comparação mostra só o particular. Recarregue a tela antes de comparar.
        </p>
      )}
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}

      <figure className="fin-compare-chart" aria-label="Entradas e saídas por mês">
        <div className="fin-compare-bars">
          {comparison.columns.map(column => (
            <div key={column.month.key} className="fin-compare-month">
              <div className="fin-compare-pair">
                <i className="fin-compare-in" style={{ height: `${Math.round((column.totals.inCents / top) * 100)}%` }} title={`Entradas ${formatBRL(column.totals.inCents)}`} />
                <i className="fin-compare-out" style={{ height: `${Math.round((column.totals.outCents / top) * 100)}%` }} title={`Saídas ${formatBRL(column.totals.outCents)}`} />
              </div>
              <span>{monthShort(column.month)}</span>
            </div>
          ))}
        </div>
        <figcaption className="fin-compare-legend"><span className="fin-compare-key fin-compare-key--in">Entradas</span><span className="fin-compare-key fin-compare-key--out">Saídas</span></figcaption>
      </figure>

      <div className="fin-table-scroll">
        <table className="fin-table fin-compare-table">
          <thead>
            <tr><th scope="col">Mês</th><th scope="col" className="fin-num">Entradas</th><th scope="col" className="fin-num">Saídas</th><th scope="col" className="fin-num">Resultado</th></tr>
          </thead>
          <tbody>
            {[...comparison.columns].reverse().map(column => (
              <tr key={column.month.key}>
                <th scope="row">{column.month.label}</th>
                <td className="fin-num">{formatBRL(column.totals.inCents)}{column.inChange != null && <small className="fin-cell-note">{formatChange(column.inChange)} sobre o mês anterior</small>}</td>
                <td className="fin-num">{formatBRL(column.totals.outCents)}{column.outChange != null && <small className="fin-cell-note">{formatChange(column.outChange)} sobre o mês anterior</small>}</td>
                <td className="fin-num"><b>{formatBRL(column.totals.resultCents)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="fin-subtitle">Saídas por categoria</h3>
      {comparison.categories.length === 0 ? <p className="fin-hint">Nenhuma saída nestes meses.</p> : (
        <div className="fin-table-scroll">
          <table className="fin-table fin-compare-table">
            <thead>
              <tr><th scope="col">Categoria</th>{comparison.columns.map(column => <th key={column.month.key} scope="col" className="fin-num">{monthShort(column.month)}</th>)}</tr>
            </thead>
            <tbody>
              {comparison.categories.map(row => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  {row.values.map((value, index) => <td key={index} className="fin-num">{value ? formatBRL(value) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pdf.portal}
    </section>
  );
}
