import { useMemo, useState } from 'react';
import { closeMonth, receiptVoucherNumber, reopenMonth } from '../../services/financeiroService';
import { operatorReceiptsFrom } from '../../utils/tissXml';
import {
  addDays,
  formatBRL,
  formatBRLWithCents,
  formatDay,
  formatShortDay,
  itemsOfPurchase,
  todayInClinic,
} from '../../utils/finance';
import { REPORT_BASES, buildReportRows, fileStamp, rangeError, rangeLabel, reportRange, reportSheets, weekOf } from '../../utils/financeReport';
import { clientSheetProps, expenseSheetProps, providerSheetProps } from '../../utils/financeReceipts';
import { buildXlsx, downloadBlob } from '../../utils/xlsxExport';
import { DialogShell, VoidDialog } from './FinanceDialogs';
import { EmptyNote } from './FinanceFields';
import { useLetterheadPrint } from './useLetterheadPrint';
import { usePrintSheet } from './usePrintSheet';

// ============================================================
// Relatório do contador (11/11/2026, etapa 3): semana, mês ou período,
// por data do serviço (padrão, em teste) ou do pagamento; tudo o que
// entrou e saiu com o número do recibo; baixa em Excel e PDF no papel
// timbrado e imprime o pacote com todos os recibos do período. No mês,
// fecha para o contador (trava pela data do pagamento, 20261111) e
// mostra o que mudou depois do fechamento.
// ============================================================

const KINDS = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'periodo', label: 'Período' },
];

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function liveClosing(fin, monthFrom) {
  return (fin.data.monthClosings || []).find(row => row.month === monthFrom && !row.reopened_at) || null;
}

function useLookups(fin) {
  return useMemo(() => ({
    chargesById: new Map(fin.data.charges.map(row => [row.id, row])),
    packagesById: new Map(fin.data.packages.map(row => [row.id, row])),
    patientsById: fin.patientsById,
    membersById: fin.membersById,
    peopleById: fin.peopleById,
    categoriesById: fin.categoriesById,
    conveniosById: new Map((fin.conv?.convenios || []).map(row => [row.id, row])),
    vouchersByGroup: new Map((fin.fiscal?.vouchers || []).map(row => [row.group_id, row.number])),
    fiscalByGroup: fin.fiscalBySource?.byGroup || new Map(),
    providerByExpense: new Map((fin.data.providerReceipts || []).filter(row => !row.voided_at).map(row => [row.expense_id, row])),
  }), [fin.data, fin.patientsById, fin.membersById, fin.peopleById, fin.categoriesById, fin.conv, fin.fiscal, fin.fiscalBySource]);
}

// ---------- PDF no papel timbrado ----------

const TEXT = '#0f172a';
const MUTED = '#64748b';
const LINE = '#cbd5e1';
const cell = { padding: '4px 5px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top', fontSize: 10.5 };
const right = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };

function ReportPrintBody({ title, range, basisLabel, report, closing }) {
  const { entradas, saidas, totals } = report;
  const struck = row => (row.voided ? { textDecoration: 'line-through', color: MUTED } : null);
  return (
    <>
      <h2 style={{ margin: '0 0 4px', color: TEXT, fontSize: 16 }}>{title}</h2>
      <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 11 }}>
        {rangeLabel(range)} · por {basisLabel.toLocaleLowerCase('pt-BR')}{basisLabel === 'Data do serviço' ? ' (em teste)' : ''}
        {closing ? ` · mês fechado em ${formatDay(todayInClinic(new Date(closing.closed_at)))}` : ''}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 12px' }}>
        <tbody>
          <tr><td style={cell}>Entradas de pacientes</td><td style={right}>{formatBRLWithCents(totals.patientsCents)}</td></tr>
          <tr><td style={cell}>Entradas de operadoras</td><td style={right}>{formatBRLWithCents(totals.operatorsCents)}</td></tr>
          <tr><td style={{ ...cell, fontWeight: 700 }}>Total de entradas</td><td style={{ ...right, fontWeight: 700 }}>{formatBRLWithCents(totals.inCents)}</td></tr>
          <tr><td style={{ ...cell, fontWeight: 700 }}>Total de saídas</td><td style={{ ...right, fontWeight: 700 }}>{formatBRLWithCents(totals.outCents)}</td></tr>
          <tr><td style={{ ...cell, fontWeight: 700 }}>Resultado</td><td style={{ ...right, fontWeight: 700 }}>{formatBRLWithCents(totals.resultCents)}</td></tr>
        </tbody>
      </table>
      {totals.byCategory.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 12px' }}>
          <thead><tr><th style={{ ...cell, textAlign: 'left', color: MUTED }}>Saídas por categoria</th><th style={{ ...right, color: MUTED }}>Valor</th></tr></thead>
          <tbody>{totals.byCategory.map(([name, cents]) => <tr key={name}><td style={cell}>{name}</td><td style={right}>{formatBRLWithCents(cents)}</td></tr>)}</tbody>
        </table>
      )}
      <h3 style={{ margin: '6px 0 6px', color: TEXT, fontSize: 13 }}>Entradas ({entradas.length})</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 12px' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Serviço</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Pago em</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>De</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Referente a</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Forma</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Recibo</th>
            <th style={{ ...right, color: MUTED }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {entradas.map(row => (
            <tr key={row.id} style={struck(row)}>
              <td style={cell}>{formatShortDay(row.serviceOn)}</td>
              <td style={cell}>{formatShortDay(row.paidOn)}</td>
              <td style={cell}>{row.who}</td>
              <td style={cell}>{row.what}{row.voided ? ` · ANULADO: ${row.voidReason}` : ''}{row.afterClose ? ' · depois do fechamento' : ''}</td>
              <td style={cell}>{row.method}</td>
              <td style={cell}>{row.receiptNumber}{row.nfse ? ` · NFS-e ${row.nfse}` : ''}</td>
              <td style={right}>{formatBRLWithCents(row.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ margin: '6px 0 6px', color: TEXT, fontSize: 13 }}>Saídas ({saidas.length})</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 12px' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Serviço</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Pago em</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Descrição</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Categoria</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Forma</th>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Comprovante</th>
            <th style={{ ...right, color: MUTED }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {saidas.map(row => (
            <tr key={row.id} style={struck(row)}>
              <td style={cell}>{formatShortDay(row.serviceOn)}</td>
              <td style={cell}>{formatShortDay(row.paidOn)}</td>
              <td style={cell}>{row.description}{row.payee ? ` · ${row.payee}` : ''}{row.voided ? ` · ANULADO: ${row.voidReason}` : ''}{row.afterClose ? ' · depois do fechamento' : ''}</td>
              <td style={cell}>{row.category}</td>
              <td style={cell}>{row.method}</td>
              <td style={cell}>{row.receiptNumber}{row.providerNumber ? ` · prestador ${row.providerNumber}` : ''}</td>
              <td style={right}>{formatBRLWithCents(row.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: 0, color: MUTED, fontSize: 10 }}>
        Relatório de controle interno gerado pelo sistema em {formatDay(todayInClinic())}. Anulados aparecem riscados e ficam fora dos totais.
        Comprovante de despesa e recibo de prestador não substituem o boleto pago nem a nota fiscal do fornecedor; recibo de cliente não substitui a NFS-e.
      </p>
    </>
  );
}

// ---------- fechamento ----------

function ClosingPanel({ fin, range, closing, history }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [reopening, setReopening] = useState(false);
  const lookups = useLookups(fin);
  const ended = range.to < fin.today;
  const now = useMemo(() => buildReportRows({
    receipts: fin.data.receipts,
    operatorReceipts: operatorReceiptsFrom(fin.data.tissPaid),
    expenses: fin.data.expenses,
    lookups,
    range,
    basis: 'pagamento',
  }).totals, [fin.data, lookups, range]);

  async function close() {
    setBusy(true);
    setError('');
    try {
      await closeMonth(range.from);
      fin.notify(`${range.month.label.charAt(0).toUpperCase() + range.month.label.slice(1)} fechado para o contador.`);
      fin.reload();
      setConfirming(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const snap = closing?.snapshot || null;
  const changed = snap && (Number(snap.entradas_centavos) !== now.inCents || Number(snap.saidas_centavos) !== now.outCents);
  const reopened = history.filter(row => row.reopened_at);

  return (
    <section className={`fin-closing-panel${closing ? ' fin-closing-panel--closed' : ''}`} aria-label="Fechamento do mês">
      {closing ? (
        <>
          <p className="fin-closing-title">
            <span className="fin-pill fin-pill--ok">Fechado</span>
            {range.month.label} fechado em {formatDay(todayInClinic(new Date(closing.closed_at)))} por {fin.membersById.get(closing.closed_by)?.full_name || 'administração'}.
          </p>
          <p className="fin-hint">
            Na hora do fechamento, pela data do pagamento: entradas {formatBRL(Number(snap.entradas_centavos))}, saídas {formatBRL(Number(snap.saidas_centavos))}.
            {changed
              ? ` Hoje: entradas ${formatBRL(now.inCents)}, saídas ${formatBRL(now.outCents)}. Mudou depois do fechamento (anulação): as linhas estão marcadas abaixo.`
              : ' Nada mudou desde então.'}
          </p>
          <p className="fin-hint">Mês fechado não aceita lançamento com data de pagamento nele. Pagamento atrasado de serviço deste mês entra no mês em que o dinheiro entrou.</p>
          <div className="fin-actions">
            <button type="button" className="gt-btn gt-btn--sm" onClick={() => setReopening(true)}>Reabrir o mês</button>
          </div>
        </>
      ) : (
        <>
          <p className="fin-closing-title">
            <span className="fin-pill fin-pill--next">Aberto</span>
            {ended
              ? `Conferiu ${range.month.label} com o contador? Feche o mês para travar.`
              : `${range.month.label.charAt(0).toUpperCase() + range.month.label.slice(1)} ainda não terminou: fecha depois do último dia.`}
          </p>
          {ended && (
            <div className="fin-actions">
              <button type="button" className="gt-btn gt-btn--primary gt-btn--sm" onClick={() => { setTyped(''); setConfirming(true); }}>Fechar {range.month.label}</button>
            </div>
          )}
        </>
      )}
      {reopened.length > 0 && (
        <p className="fin-hint">Reaberto antes: {reopened.map(row => `${formatDay(todayInClinic(new Date(row.reopened_at)))} (${row.reopen_reason})`).join('; ')}.</p>
      )}
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}

      {confirming && (
        <DialogShell
          title={`Fechar ${range.month.label}`}
          onClose={() => setConfirming(false)}
          busy={busy}
          guard={false}
          footer={(
            <>
              <button type="button" className="gt-btn" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</button>
              <button type="button" className="gt-btn gt-btn--primary" onClick={close} disabled={busy || typed.trim().toLowerCase() !== 'fechar'}>
                {busy ? 'Fechando…' : 'Fechar o mês'}
              </button>
            </>
          )}
        >
          <p className="fin-dialog-text">
            Depois de fechado, nenhum recebimento, depósito de operadora ou saída com data de pagamento em {range.month.label} entra. Anular continua possível, com motivo, e fica marcado no relatório.
          </p>
          <p className="fin-dialog-text">
            Pela data do pagamento: entradas <b className="fin-num">{formatBRL(now.inCents)}</b>, saídas <b className="fin-num">{formatBRL(now.outCents)}</b>, resultado <b className="fin-num">{formatBRL(now.resultCents)}</b>. Esses totais ficam guardados.
          </p>
          <label className="gt-field" htmlFor="fin-close-typed">
            Para confirmar, digite fechar
            <input id="fin-close-typed" className="gt-select" autoComplete="off" value={typed} onChange={event => setTyped(event.target.value)} />
          </label>
        </DialogShell>
      )}
      {reopening && (
        <VoidDialog
          title={`Reabrir ${range.month.label}`}
          description="O mês volta a aceitar lançamentos. O fechamento anterior fica no histórico com o motivo; feche de novo depois de corrigir."
          confirmLabel="Reabrir"
          onClose={() => setReopening(false)}
          onConfirm={async reason => {
            await reopenMonth(range.from, reason);
            fin.notify(`${range.month.label} reaberto.`);
            fin.reload();
            setReopening(false);
          }}
        />
      )}
    </section>
  );
}

// ---------- tela ----------

export function AccountantReport({ fin }) {
  const [kind, setKind] = useState('mes');
  const [weekAnchor, setWeekAnchor] = useState(() => (fin.today >= fin.month.from && fin.today <= fin.month.to ? fin.today : fin.month.from));
  const [from, setFrom] = useState(fin.month.from);
  const [to, setTo] = useState(fin.month.to);
  const [basis, setBasis] = useState('servico');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [packConfirm, setPackConfirm] = useState(null);
  const lookups = useLookups(fin);
  const pdf = useLetterheadPrint(fin.profile);
  const sheets = usePrintSheet();

  const range = useMemo(() => reportRange({ kind, anchor: kind === 'semana' ? weekAnchor : fin.month.from, from, to }), [kind, weekAnchor, fin.month.from, from, to]);
  const invalid = kind === 'periodo' ? rangeError(range) : '';
  const closing = range.kind === 'mes' ? liveClosing(fin, range.from) : null;
  const history = range.kind === 'mes' ? (fin.data.monthClosings || []).filter(row => row.month === range.from) : [];
  const basisLabel = REPORT_BASES.find(item => item.id === basis).label;
  const report = useMemo(() => (invalid ? null : buildReportRows({
    receipts: fin.data.receipts,
    operatorReceipts: operatorReceiptsFrom(fin.data.tissPaid),
    expenses: fin.data.expenses,
    lookups,
    range,
    basis,
    closing,
  })), [invalid, fin.data, lookups, range, basis, closing]);

  async function downloadExcel() {
    setBusy('excel');
    setError('');
    try {
      const blob = await buildXlsx(reportSheets({ report, range, basisLabel }));
      downloadBlob(blob, `financeiro-${fileStamp(range)}.xlsx`);
    } catch (err) {
      setError(err.message || 'Não foi possível montar a planilha.');
    } finally {
      setBusy('');
    }
  }

  function printPdf() {
    pdf.print(
      <ReportPrintBody title="Relatório financeiro para o contador" range={range} basisLabel={basisLabel} report={report} closing={closing} />,
      { dateLabel: formatDay(todayInClinic()), kindLabel: `Relatório · ${rangeLabel(range)}` },
    );
  }

  // Pacote: comprovante de cada saída paga, recibo de prestador emitido e
  // recibo de cada recebimento de paciente do período (o recibo sem número
  // ganha o número agora, na sequência de sempre, depois de confirmar).
  function packPlan() {
    const groups = new Map();
    for (const row of fin.data.receipts) {
      if (row.voided_at || !report.entradas.some(entry => entry.id === row.id)) continue;
      const group = groups.get(row.group_id) || { id: row.group_id, rows: [], receivedOn: row.received_on, patientId: row.patient_id };
      group.rows.push(row);
      groups.set(row.group_id, group);
    }
    const expenseIds = new Set(report.saidas.map(row => row.id));
    const expenses = fin.data.expenses.filter(row => expenseIds.has(row.id) && row.receipt_number);
    const providers = (fin.data.providerReceipts || []).filter(row => !row.voided_at && expenseIds.has(row.expense_id));
    const unnumbered = [...groups.values()].filter(group => !lookups.vouchersByGroup.has(group.id)).length;
    return { groups: [...groups.values()], expenses, providers, unnumbered };
  }

  function printPack(plan) {
    setPackConfirm(null);
    sheets.print(async () => {
      const list = [];
      if (fin.fiscal) {
        for (const group of plan.groups) {
          const number = lookups.vouchersByGroup.get(group.id) ?? await receiptVoucherNumber(group.id);
          const what = [...new Set(group.rows.map(row => report.entradas.find(entry => entry.id === row.id)?.what).filter(Boolean))].join(', ');
          list.push(clientSheetProps({
            fin,
            number,
            group,
            doc: lookups.fiscalByGroup.get(group.id) || null,
            what,
            serviceDays: group.rows.map(row => lookups.chargesById.get(row.charge_id)?.service_on || null),
            patient: fin.patientsById.get(group.patientId)?.name || '',
          }));
        }
      }
      for (const expense of plan.expenses) {
        list.push(expenseSheetProps(fin.profile, expense, {
          category: report.saidas.find(row => row.id === expense.id)?.category || '',
          payee: report.saidas.find(row => row.id === expense.id)?.payee || '',
          paidBy: fin.membersById.get(expense.paid_by)?.full_name || '',
          items: expense.is_purchase ? itemsOfPurchase(fin.data.purchaseItems, expense.id) : [],
        }));
      }
      for (const receipt of plan.providers) list.push(providerSheetProps(fin.profile, receipt));
      if (!list.length) throw new Error('Nenhum recibo neste período.');
      return list;
    }, () => { fin.fiscalReload(); });
  }

  return (
    <section className="fin-section fin-report">
      <div className="fin-report-controls">
        <div className="fin-choices" role="group" aria-label="Período">
          {KINDS.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={kind === option.id} onClick={() => setKind(option.id)}>{option.label}</button>
          ))}
        </div>
        {kind === 'semana' && (
          <div className="gt-period-nav" role="group" aria-label="Semana">
            <button type="button" className="gt-period-arrow" aria-label="Semana anterior" onClick={() => setWeekAnchor(day => addDays(day, -7))}>‹</button>
            <span className="gt-period-label fin-num">{formatShortDay(weekOf(weekAnchor).from)} a {formatShortDay(weekOf(weekAnchor).to)}</span>
            <button type="button" className="gt-period-arrow" aria-label="Próxima semana" onClick={() => setWeekAnchor(day => addDays(day, 7))}>›</button>
          </div>
        )}
        {kind === 'mes' && <span className="fin-hint">Mês escolhido no topo: {fin.month.label}.</span>}
        {kind === 'periodo' && (
          <div className="fin-inline">
            <label className="gt-field" htmlFor="fin-report-from">De<input id="fin-report-from" type="date" className="gt-select" value={from} onChange={event => setFrom(event.target.value)} /></label>
            <label className="gt-field" htmlFor="fin-report-to">Até<input id="fin-report-to" type="date" className="gt-select" value={to} onChange={event => setTo(event.target.value)} /></label>
          </div>
        )}
        <div className="fin-choices" role="group" aria-label="Datas pelo">
          {REPORT_BASES.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={basis === option.id} onClick={() => setBasis(option.id)}>{option.label}</button>
          ))}
        </div>
      </div>
      <p className="fin-basis">
        {basis === 'servico' ? (
          <><span className="fin-basis-tag">Em teste</span>Por data do serviço: recebimento no dia do atendimento pago, conta fixa no vencimento, o resto no dia do pagamento. O fechamento do mês trava pela data do pagamento.</>
        ) : (
          <>Por data do pagamento: quando o dinheiro entrou ou saiu, como no extrato do banco. É a data que o fechamento do mês trava.</>
        )}
      </p>

      {invalid && <p className="gt-notice gt-notice-error" role="alert">{invalid}</p>}
      {range.kind === 'mes' && <ClosingPanel fin={fin} range={range} closing={closing} history={history} />}

      {report && (
        <>
          <div className="fin-bill-tiles">
            <div className="fin-bill-tile"><small>Entradas</small><b className="fin-num">{formatBRL(report.totals.inCents)}</b><span>pacientes {formatBRL(report.totals.patientsCents)} · operadoras {formatBRL(report.totals.operatorsCents)}</span></div>
            <div className="fin-bill-tile"><small>Saídas</small><b className="fin-num">{formatBRL(report.totals.outCents)}</b><span>{plural(report.saidas.filter(row => !row.voided).length, 'lançamento', 'lançamentos')}</span></div>
            <div className="fin-bill-tile fin-bill-tile--main"><small>Resultado</small><b className="fin-num">{formatBRL(report.totals.resultCents)}</b><span>{rangeLabel(range)}</span></div>
            <div className="fin-bill-tile">
              <small>Para conferir</small>
              <b className="fin-num">{report.totals.missingProvider + report.totals.afterCloseCount}</b>
              <span>
                {[
                  report.totals.missingProvider ? plural(report.totals.missingProvider, 'recibo de prestador sem assinatura', 'recibos de prestador sem assinatura') : '',
                  report.totals.afterCloseCount ? plural(report.totals.afterCloseCount, 'mudança depois do fechamento', 'mudanças depois do fechamento') : '',
                  report.totals.voidedCount ? plural(report.totals.voidedCount, 'anulado', 'anulados') : '',
                ].filter(Boolean).join(' · ') || 'nada pendente'}
              </span>
            </div>
          </div>

          <div className="fin-actions fin-report-downloads">
            <button type="button" className="gt-btn gt-btn--primary" onClick={downloadExcel} disabled={Boolean(busy)}>{busy === 'excel' ? 'Montando…' : 'Baixar Excel'}</button>
            <button type="button" className="gt-btn" onClick={printPdf}>Baixar PDF (timbrado)</button>
            <button type="button" className="gt-btn" onClick={() => setPackConfirm(packPlan())}>Pacote de recibos</button>
          </div>
          {(error || sheets.error) && <p className="gt-notice gt-notice-error" role="alert">{error || sheets.error}</p>}

          <h3 className="fin-subtitle">Entradas ({report.entradas.length})</h3>
          {report.entradas.length === 0 ? <EmptyNote>Nada entrou neste período.</EmptyNote> : (
            <div className="fin-table-scroll">
              <table className="fin-table fin-table--cards">
                <thead><tr><th scope="col">Serviço</th><th scope="col">Pago em</th><th scope="col">De</th><th scope="col">Referente a</th><th scope="col">Forma</th><th scope="col">Recibo</th><th scope="col" className="fin-num">Valor</th></tr></thead>
                <tbody>
                  {report.entradas.map(row => (
                    <tr key={row.id} className={row.voided ? 'fin-report-void' : row.afterClose ? 'fin-report-late' : undefined}>
                      <td data-label="Serviço">{formatShortDay(row.serviceOn)}</td>
                      <td data-label="Pago em">{formatShortDay(row.paidOn)}</td>
                      <th scope="row" data-label="De">{row.who}</th>
                      <td data-label="Referente a">{row.what}{row.voided ? <small className="fin-cell-note">Anulado: {row.voidReason}</small> : null}{row.afterClose ? <small className="fin-cell-note">depois do fechamento</small> : null}</td>
                      <td data-label="Forma">{row.method}</td>
                      <td data-label="Recibo">{row.receiptNumber || '–'}{row.nfse ? <small className="fin-cell-note">NFS-e {row.nfse}</small> : null}</td>
                      <td data-label="Valor" className="fin-num">{formatBRL(row.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="fin-subtitle">Saídas ({report.saidas.length})</h3>
          {report.saidas.length === 0 ? <EmptyNote>Nada saiu neste período.</EmptyNote> : (
            <div className="fin-table-scroll">
              <table className="fin-table fin-table--cards">
                <thead><tr><th scope="col">Serviço</th><th scope="col">Pago em</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col">Forma</th><th scope="col">Comprovante</th><th scope="col" className="fin-num">Valor</th></tr></thead>
                <tbody>
                  {report.saidas.map(row => (
                    <tr key={row.id} className={row.voided ? 'fin-report-void' : row.afterClose ? 'fin-report-late' : undefined}>
                      <td data-label="Serviço">{formatShortDay(row.serviceOn)}</td>
                      <td data-label="Pago em">{formatShortDay(row.paidOn)}</td>
                      <th scope="row" data-label="Descrição">{row.description}{row.payee ? <small className="fin-cell-note">{row.payee}</small> : null}{row.voided ? <small className="fin-cell-note">Anulado: {row.voidReason}</small> : null}{row.afterClose ? <small className="fin-cell-note">depois do fechamento</small> : null}</th>
                      <td data-label="Categoria">{row.category}</td>
                      <td data-label="Forma">{row.method}</td>
                      <td data-label="Comprovante">{row.receiptNumber || '–'}{row.providerNumber ? <small className="fin-cell-note">Prestador {row.providerNumber}{row.providerSigned ? ' · assinado' : ' · falta assinar'}</small> : null}</td>
                      <td data-label="Valor" className="fin-num">{formatBRL(row.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {packConfirm && (
        <DialogShell
          title="Pacote de recibos"
          onClose={() => setPackConfirm(null)}
          guard={false}
          footer={(
            <>
              <button type="button" className="gt-btn" onClick={() => setPackConfirm(null)}>Cancelar</button>
              <button type="button" className="gt-btn gt-btn--primary" onClick={() => printPack(packConfirm)}>Imprimir / salvar PDF</button>
            </>
          )}
        >
          <p className="fin-dialog-text">
            Um arquivo com todos os recibos de {rangeLabel(range)}, um por folha:
          </p>
          <ul className="fin-dialog-list">
            <li>{plural(fin.fiscal ? packConfirm.groups.length : 0, 'recibo de cliente', 'recibos de cliente')}{!fin.fiscal ? ' (as notas fiscais não carregaram: tente de novo)' : ''}</li>
            <li>{plural(packConfirm.expenses.length, 'comprovante de despesa', 'comprovantes de despesa')}</li>
            <li>{plural(packConfirm.providers.length, 'recibo de prestador', 'recibos de prestador')}</li>
          </ul>
          {fin.fiscal && packConfirm.unnumbered > 0 && (
            <p className="fin-hint fin-hint--warn">
              {plural(packConfirm.unnumbered, 'recibo de cliente ainda não tem número e vai ganhar', 'recibos de cliente ainda não têm número e vão ganhar')} o próximo número agora, na sequência de sempre.
            </p>
          )}
          <p className="fin-hint">Saída paga antes dos comprovantes (10/11/2026) não tem número e fica fora do pacote; ela aparece no relatório.</p>
        </DialogShell>
      )}
      {pdf.portal}
      {sheets.portal}
    </section>
  );
}
