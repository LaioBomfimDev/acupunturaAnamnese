import { useMemo, useState } from 'react';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import {
  cancelFiscalDocument,
  receiptVoucherNumber,
  registerFiscalIssued,
  saveFiscalDocument,
  saveFiscalSettings,
} from '../../services/financeiroService';
import { formatBRL, formatShortDay } from '../../utils/finance';
import {
  DEFAULT_EMITTER_URL,
  FISCAL_MISSING_LABELS,
  SUGGESTED_SERVICE_CODES,
  dayForEmitter,
  fiscalMissing,
  fiscalQueue,
  formatTakerDocument,
  moneyForEmitter,
} from '../../utils/fiscal';
import { VoidDialog } from './FinanceDialogs';
import { EmptyNote } from './FinanceFields';
import { usePrintSheet } from './usePrintSheet';
import { clientSheetProps } from '../../utils/financeReceipts';

// ============================================================
// Notas fiscais e comprovante (04/11/2026, banco A + tela A).
//
// A nota nasce sozinha no banco (20261104_notas_fiscais.sql) quando o
// dinheiro entra: uma por recebimento do particular e uma por depósito
// da operadora. Aqui fica a fila do que falta, os dados prontos para
// copiar no emissor (Emissor Nacional ou o da prefeitura) e o lugar para
// guardar o número. O sistema não emite: quem emite é a pessoa, no site
// do emissor (caminho A; o B, emitir pelo sistema, vem depois).
// ============================================================

function ErrorLine({ error }) {
  return error ? <p className="gt-notice gt-notice-error" role="alert">{error}</p> : null;
}

function useFiscalSaver(fin) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (message) fin.notify(message);
      fin.fiscalReload();
      return result ?? true;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function FiscalGate({ fin, children }) {
  if (fin.fiscalError) return <p className="gt-notice gt-notice-error" role="alert">{fin.fiscalError}</p>;
  if (!fin.fiscal) return <p className="gt-empty">Carregando as notas…</p>;
  return children;
}

/** Copiar no clique; se o navegador recusar, seleciona o texto. */
function CopyButton({ value, label }) {
  const [state, setState] = useState('');
  async function copy(event) {
    const target = event.currentTarget.previousElementSibling;
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
      setState('Copiado');
    } catch {
      if (target) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setState('Selecionado: use Ctrl+C');
    }
    window.setTimeout(() => setState(''), 1800);
  }
  return (
    <button type="button" className="gt-btn gt-btn--sm" onClick={copy} disabled={!value} aria-label={`Copiar ${label}`}>
      {state || 'Copiar'}
    </button>
  );
}

function CopyRow({ label, value, shown = value }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td><span className="fin-fiscal-value">{shown || '—'}</span><CopyButton value={value} label={label} /></td>
    </tr>
  );
}

// ---------- configuração ----------

function FiscalSettings({ fin, startOpen }) {
  const { settings, codes } = fin.fiscal;
  const [open, setOpen] = useState(startOpen);
  const [url, setUrl] = useState(settings?.emitter_url || '');
  const [rows, setRows] = useState(() => Object.fromEntries(DISCIPLINES.map(area => {
    const saved = codes.find(row => row.discipline === area.id);
    return [area.id, { code: saved?.service_code || '', label: saved?.service_label || '' }];
  })));
  const { busy, error, run } = useFiscalSaver(fin);
  const invalid = DISCIPLINES.filter(area => rows[area.id].code && !/^[0-9][0-9./-]{0,19}$/.test(rows[area.id].code));
  const badUrl = url.trim() && !/^https:\/\/\S{4,}$/.test(url.trim());

  async function save() {
    await run(() => saveFiscalSettings(url.trim(), DISCIPLINES.map(area => ({
      discipline: area.id,
      service_code: rows[area.id].code.trim(),
      service_label: rows[area.id].label.trim(),
    }))), 'Configuração das notas salva.');
  }

  if (!open) {
    return (
      <p className="fin-hint">
        Emissor: {settings?.emitter_url || `${DEFAULT_EMITTER_URL} (padrão)`} · {codes.length === 1 ? '1 área com código' : `${codes.length} áreas com código`}.{' '}
        <button type="button" className="fin-link" onClick={() => setOpen(true)}>Configurar</button>
      </p>
    );
  }

  return (
    <div className="fin-card fin-fiscal-settings">
      <h3>Configurar as notas</h3>
      <label className="gt-field" htmlFor="fiscal-url">
        Onde a clínica emite a nota
        <input id="fiscal-url" className="gt-select" value={url} placeholder={DEFAULT_EMITTER_URL} onChange={event => setUrl(event.target.value)} />
        <small className="fin-field-note">Vazio = Emissor Nacional, obrigatório para o Simples desde 01/11/2026. Se a prefeitura mandar usar o emissor dela, ponha o endereço aqui.</small>
      </label>
      <div className="fin-table-scroll">
        <table className="fin-table">
          <thead><tr><th scope="col">Área</th><th scope="col">Código do serviço</th><th scope="col">Nome do serviço (opcional)</th></tr></thead>
          <tbody>
            {DISCIPLINES.map(area => {
              const suggestion = SUGGESTED_SERVICE_CODES[area.id];
              return (
                <tr key={area.id}>
                  <td>{area.label}</td>
                  <td>
                    <input className="gt-select fin-small-input" aria-label={`Código do serviço de ${area.label}`} maxLength={20}
                      value={rows[area.id].code} placeholder={suggestion ? suggestion.code : ''}
                      onChange={event => setRows(current => ({ ...current, [area.id]: { ...current[area.id], code: event.target.value } }))} />
                  </td>
                  <td>
                    <input className="gt-select" aria-label={`Nome do serviço de ${area.label}`} maxLength={150}
                      value={rows[area.id].label} placeholder={suggestion ? suggestion.label : ''}
                      onChange={event => setRows(current => ({ ...current, [area.id]: { ...current[area.id], label: event.target.value } }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fin-hint">Os números em cinza são sugestão pela lista de serviços (LC 116) e não são gravados. Quem define o código de cada área é o contador.</p>
      {invalid.length > 0 && <p className="fin-hint fin-hint--warn">Confira o código de {invalid.map(area => area.label).join(', ')}: começa com número, até 20 caracteres.</p>}
      {badUrl && <p className="fin-hint fin-hint--warn">O endereço do emissor começa com https://.</p>}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={() => setOpen(false)} disabled={busy}>Fechar</button>
        <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={busy || invalid.length > 0 || Boolean(badUrl)}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  );
}

// ---------- Notas fiscais (tela A) ----------

const FILTERS = [
  { id: 'pending', label: 'Falta emitir', test: doc => doc.status === 'pending' },
  { id: 'cancel', label: 'Cancelar no emissor', test: doc => doc.status === 'issued' && doc.needs_cancellation },
  { id: 'issued', label: 'Emitidas', test: doc => doc.status === 'issued' },
  { id: 'cancelled', label: 'Canceladas', test: doc => doc.status === 'cancelled' },
];

function takerTitle(fin, doc) {
  if (doc.taker_kind === 'convenio') return doc.taker_name;
  const patient = fin.patientsById?.get(doc.patient_id)?.name;
  return patient && patient !== doc.taker_name ? `${doc.taker_name} (paciente ${patient})` : doc.taker_name;
}

export function NotasFiscais({ fin }) {
  return <FiscalGate fin={fin}><NotasBody fin={fin} /></FiscalGate>;
}

function NotasBody({ fin }) {
  const docs = fin.fiscal.documents;
  const queue = fiscalQueue(docs);
  const [filter, setFilter] = useState(() => (queue.toCancel.length ? 'cancel' : 'pending'));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  const visible = docs
    .filter(FILTERS.find(row => row.id === filter).test)
    .filter(doc => !needle || takerTitle(fin, doc).toLocaleLowerCase('pt-BR').includes(needle) || (doc.nfse_number || '').includes(needle));
  const selected = docs.find(doc => doc.id === selectedId) || null;
  const missingCode = queue.pending.some(doc => !doc.service_code);

  return (
    <section className={`fin-section fin-tiss${selected ? ' has-detail' : ''}`}>
      <FiscalSettings fin={fin} startOpen={!fin.fiscal.settings || missingCode} />
      <div className="fin-toolbar">
        <div className="fin-choices" role="group" aria-label="Mostrar">
          {FILTERS.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setSelectedId(''); }}>
              {option.label} <b className="fin-num">{docs.filter(option.test).length}</b>
            </button>
          ))}
        </div>
        <input className="gt-select fin-search" aria-label="Buscar tomador ou número" placeholder="Nome ou nº da nota" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      {docs.length === 0 ? (
        <EmptyNote>Nenhuma nota ainda. A nota nasce sozinha quando um recebimento do particular ou um depósito da operadora é lançado.</EmptyNote>
      ) : (
        <div className="fin-tiss-split">
          <div className="fin-tiss-queue" role="list" aria-label="Notas">
            {visible.length === 0 && <EmptyNote>Nada com esse filtro.</EmptyNote>}
            {visible.map(doc => {
              const missing = fiscalMissing(doc).length;
              return (
                <button key={doc.id} type="button" role="listitem" className={`fin-tiss-item${doc.id === selectedId ? ' is-selected' : ''}`}
                  aria-current={doc.id === selectedId ? 'true' : undefined} onClick={() => setSelectedId(doc.id)}>
                  <span className="fin-tiss-item-head">
                    <b>{takerTitle(fin, doc)}</b>
                    <span className="fin-num">{formatBRL(doc.amount_cents)}</span>
                  </span>
                  <span className="fin-tiss-item-sub">
                    {doc.taker_kind === 'convenio' ? 'Operadora' : 'Particular'} · competência {formatShortDay(doc.competence_on)}
                    {doc.nfse_number ? ` · nº ${doc.nfse_number}` : ''}
                    {doc.status === 'pending' && missing ? ` · falta ${missing === 1 ? '1 dado' : `${missing} dados`}` : ''}
                    {doc.needs_cancellation ? ' · cancelar no emissor' : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="fin-tiss-detail">
            {selected
              ? <FiscalDetail key={selected.id} fin={fin} doc={selected} onBack={() => setSelectedId('')} />
              : <p className="gt-empty">Escolha uma nota na lista para ver os dados prontos para copiar.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function FiscalDetail({ fin, doc, onBack }) {
  const emitter = fin.fiscal.settings?.emitter_url || DEFAULT_EMITTER_URL;
  const missing = fiscalMissing(doc);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    taker_document: doc.taker_document ? formatTakerDocument(doc.taker_document) : '',
    taker_name: doc.taker_name,
    service_code: doc.service_code || '',
    description: doc.description,
    competence_on: doc.competence_on,
  }));
  const [number, setNumber] = useState('');
  const [issuedOn, setIssuedOn] = useState(fin.today);
  const [accessKey, setAccessKey] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const { busy, error, run } = useFiscalSaver(fin);
  const area = getDiscipline(doc.discipline);
  const keyDigits = accessKey.replace(/\D/g, '');

  async function saveFields() {
    const ok = await run(() => saveFiscalDocument(doc.id, form), 'Dados da nota salvos.');
    if (ok) setEditing(false);
  }

  async function register() {
    await run(() => registerFiscalIssued(doc.id, number.trim(), issuedOn, keyDigits || null), `Nota nº ${number.trim()} registrada.`);
  }

  return (
    <div className="fin-card fin-tiss-guide">
      <button type="button" className="fin-link fin-tiss-back" onClick={onBack}>← Voltar às notas</button>
      <div className="fin-tiss-guide-head">
        <div>
          <h3>{doc.status === 'pending' ? 'Nota a emitir' : doc.status === 'issued' ? `NFS-e nº ${doc.nfse_number}` : 'Nota cancelada'}</h3>
          <p className="fin-hint">{takerTitle(fin, doc)} · {area?.label || 'Atendimento'} · {formatBRL(doc.amount_cents)}</p>
        </div>
        {doc.status === 'pending' && <a className="gt-btn gt-btn--sm" href={emitter} target="_blank" rel="noopener noreferrer">Abrir emissor ↗</a>}
      </div>

      {doc.needs_cancellation && (
        <p className="gt-notice gt-notice-error" role="alert">
          O dinheiro desta nota foi anulado (ou mudou de valor) depois da emissão. Cancele a nota no emissor e registre aqui o cancelamento.
        </p>
      )}

      {missing.length > 0 && doc.status === 'pending' && (
        <div className="fin-tiss-missing" role="status">
          <b>Antes de emitir, falta:</b>
          <ul>{missing.map(key => <li key={key}>{FISCAL_MISSING_LABELS[key]}</li>)}</ul>
        </div>
      )}

      {editing ? (
        <fieldset className="fin-fieldset" disabled={busy}>
          <legend>Dados da nota</legend>
          <div className="fin-grid-2">
            <label className="gt-field" htmlFor="fiscal-taker-doc">
              CPF ou CNPJ de quem recebe a nota
              <input id="fiscal-taker-doc" className="gt-select" value={form.taker_document} onChange={event => setForm(value => ({ ...value, taker_document: event.target.value }))} />
            </label>
            <label className="gt-field" htmlFor="fiscal-taker-name">
              Nome
              <input id="fiscal-taker-name" className="gt-select" maxLength={150} value={form.taker_name} onChange={event => setForm(value => ({ ...value, taker_name: event.target.value }))} />
            </label>
            <label className="gt-field" htmlFor="fiscal-code">
              Código do serviço
              <input id="fiscal-code" className="gt-select" maxLength={20} value={form.service_code} onChange={event => setForm(value => ({ ...value, service_code: event.target.value }))} />
            </label>
            <label className="gt-field" htmlFor="fiscal-competence">
              Competência (dia do atendimento)
              <input id="fiscal-competence" type="date" className="gt-select" max={fin.today} value={form.competence_on} onChange={event => setForm(value => ({ ...value, competence_on: event.target.value }))} />
            </label>
          </div>
          <label className="gt-field" htmlFor="fiscal-description">
            Descrição do serviço
            <textarea id="fiscal-description" className="gt-select" rows={4} maxLength={2000} value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} />
          </label>
          <div className="fin-actions">
            <button type="button" className="gt-btn" onClick={() => setEditing(false)}>Cancelar</button>
            <button type="button" className="gt-btn gt-btn--primary" onClick={saveFields} disabled={busy || !form.taker_name.trim() || !form.description.trim()}>{busy ? 'Salvando…' : 'Salvar dados'}</button>
          </div>
        </fieldset>
      ) : (
        <div className="fin-table-scroll">
          <table className="fin-table fin-fiscal-copy">
            <tbody>
              <CopyRow label={doc.taker_kind === 'convenio' ? 'CNPJ do tomador' : 'CPF do tomador'} value={doc.taker_document || ''} shown={formatTakerDocument(doc.taker_document)} />
              <CopyRow label="Nome do tomador" value={doc.taker_name} />
              <CopyRow label="Código do serviço" value={doc.service_code || ''} />
              <CopyRow label="Descrição" value={doc.description} />
              <CopyRow label="Valor" value={moneyForEmitter(doc.amount_cents)} shown={formatBRL(doc.amount_cents)} />
              <CopyRow label="Competência" value={dayForEmitter(doc.competence_on)} />
            </tbody>
          </table>
        </div>
      )}
      {doc.status === 'pending' && !editing && (
        <button type="button" className="fin-link" onClick={() => setEditing(true)}>Corrigir dados antes de emitir</button>
      )}

      {doc.status === 'pending' && (
        <fieldset className="fin-fieldset" disabled={busy || missing.length > 0}>
          <legend>Emitiu no emissor? Guarde o número</legend>
          <div className="fin-grid-2">
            <label className="gt-field" htmlFor="fiscal-number">
              Nº da NFS-e
              <input id="fiscal-number" className="gt-select" inputMode="numeric" maxLength={15} value={number} onChange={event => setNumber(event.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="gt-field" htmlFor="fiscal-issued-on">
              Data da emissão
              <input id="fiscal-issued-on" type="date" className="gt-select" min={doc.competence_on} max={fin.today} value={issuedOn} onChange={event => setIssuedOn(event.target.value)} />
            </label>
          </div>
          <label className="gt-field" htmlFor="fiscal-key">
            Chave de acesso (50 números, opcional)
            <input id="fiscal-key" className="gt-select" inputMode="numeric" maxLength={60} value={accessKey} onChange={event => setAccessKey(event.target.value)} />
          </label>
          {keyDigits && keyDigits.length !== 50 && <p className="fin-hint fin-hint--warn">A chave tem 50 números ({keyDigits.length} digitados).</p>}
          <div className="fin-actions">
            <button type="button" className="gt-btn gt-btn--primary" onClick={register}
              disabled={busy || !number || !issuedOn || (keyDigits && keyDigits.length !== 50)}>
              {busy ? 'Registrando…' : 'Registrar nota'}
            </button>
          </div>
        </fieldset>
      )}

      {doc.status === 'issued' && (
        <>
          <dl className="fin-fiscal-facts">
            <dt>Emitida em</dt><dd>{formatShortDay(doc.issued_on)}</dd>
            {doc.access_key && (<><dt>Chave</dt><dd className="fin-num">{doc.access_key}</dd></>)}
          </dl>
          <div className="fin-actions">
            <button type="button" className="gt-btn" onClick={() => setCancelling(true)}>Registrar cancelamento</button>
          </div>
        </>
      )}
      {doc.status === 'cancelled' && <p className="fin-hint">Cancelada: {doc.cancel_reason}</p>}
      <ErrorLine error={error} />

      {cancelling && (
        <VoidDialog
          title={`Cancelamento da nota nº ${doc.nfse_number}`}
          description="Cancele primeiro no emissor; aqui fica o registro, com o número. Se o recebimento ainda vale, a nota volta para “Falta emitir”, para emitir de novo."
          confirmLabel="Registrar cancelamento"
          onClose={() => setCancelling(false)}
          onConfirm={async reason => {
            const ok = await run(() => cancelFiscalDocument(doc.id, reason), `Cancelamento da nota nº ${doc.nfse_number} registrado.`);
            if (!ok) throw new Error('Não foi possível registrar o cancelamento.');
            setCancelling(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- na linha de Recebidos ----------

/** "Nota: falta" ou "Nota nº 152" no recebimento. */
export function FiscalChip({ doc }) {
  if (!doc) return null;
  if (doc.status === 'issued' && doc.needs_cancellation) return <span className="gt-badge gt-badge-pending">Nota nº {doc.nfse_number}: cancelar</span>;
  if (doc.status === 'issued') return <span className="gt-badge gt-badge-success">Nota nº {doc.nfse_number}</span>;
  if (doc.status === 'pending') return <span className="gt-badge gt-badge-pending">Nota: falta</span>;
  return null;
}

// ---------- recibo do cliente (modelo 08 da clínica, 10/11/2026) ----------

/** Numera (uma vez, na mesma sequência de antes) e imprime o recibo do cliente. */
export function VoucherButton({ fin, group, what = '', serviceDays = [], patient = '' }) {
  const doc = useMemo(() => fin.fiscalBySource?.byGroup.get(group.id) || null, [fin.fiscalBySource, group.id]);
  const sheet = usePrintSheet();
  function print() {
    sheet.print(async () => {
      const number = await receiptVoucherNumber(group.id);
      return clientSheetProps({ fin, number, group, doc, what, serviceDays, patient });
    }, () => fin.fiscalReload());
  }
  return (
    <>
      <button type="button" className="gt-btn gt-btn--sm" onClick={print} title={sheet.error || undefined}>Recibo</button>
      {sheet.error && <span className="fin-hint fin-hint--warn" role="alert">{sheet.error}</span>}
      {sheet.portal}
    </>
  );
}
