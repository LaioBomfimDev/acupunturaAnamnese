import { useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { getDiscipline } from '../../data/disciplines';
import {
  closeAppeal,
  createBatch,
  discardBatch,
  loadBatchXml,
  markBatchSent,
  openAppeal,
  registerConvenioPayment,
  resendGuide,
  saveGuide,
  voidSettlement,
} from '../../services/financeiroService';
import { formatBRL, formatShortDay, parseBRLInput, centsToInput } from '../../utils/finance';
import {
  ACCIDENT_CODES,
  ATTENDANCE_TYPES,
  CHARACTER_CODES,
  CONVENIO_PAYMENT_METHODS,
  GUIDE_STATUS,
  TISS_MAX_GUIDES_PER_BATCH,
  TISS_MISSING_LABELS,
  TISS_WARNING_LABELS,
  batchCandidates,
  convenioDueOn,
  guideStatusLabel,
} from '../../utils/tissXml';
import { DialogShell, VoidDialog } from './FinanceDialogs';
import { EmptyNote, MoneyInput } from './FinanceFields';

// ============================================================
// Convênios, Fase 2 (03/11/2026, tela A): Guias, Lotes, Pagamentos e
// glosas, cada uma no menu do Financeiro, grupo Convênios.
//
// O banco faz e protege tudo (20261103_convenios_fase2.sql): a guia nasce
// com o atendimento de convênio Atendido, o lote congela a cópia e gera o
// XML com o hash, e dinheiro só anula com motivo. A tela mostra, pergunta
// o que falta e chama as funções finance_tiss_*.
// ============================================================

const STATUS_TONE = { neutral: 'gt-badge-neutral', accent: 'fin-pill', success: 'gt-badge-success', warning: 'gt-badge-pending' };

function StatusChip({ status, missing = 0 }) {
  if (status === 'open' && missing > 0) {
    return <span className="gt-badge gt-badge-pending">{missing === 1 ? 'Falta 1' : `Faltam ${missing}`}</span>;
  }
  if (status === 'open') return <span className="gt-badge gt-badge-success">Pronta</span>;
  const tone = GUIDE_STATUS[status]?.tone || 'neutral';
  return <span className={`gt-badge ${STATUS_TONE[tone]}`}>{guideStatusLabel(status)}</span>;
}

function convenioName(fin, id) {
  return fin.conv?.convenios?.find(row => row.id === id)?.name || 'Operadora';
}

function patientName(fin, id, fallback) {
  return fin.patientsById?.get(id)?.name || fallback || 'Paciente';
}

function ErrorLine({ error }) {
  return error ? <p className="gt-notice gt-notice-error" role="alert">{error}</p> : null;
}

function TissGate({ fin, children }) {
  if (fin.tissError) return <p className="gt-notice gt-notice-error" role="alert">{fin.tissError}</p>;
  if (!fin.tiss || !fin.conv) return <p className="gt-empty">Carregando as guias…</p>;
  return children;
}

function useTissSaver(fin) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (message) fin.notify(typeof message === 'function' ? message(result) : message);
      fin.tissReload();
      fin.reload();
      return result ?? true;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** Operadoras com guia, na ordem do nome; a escolhida filtra as três partes. */
function ConvenioChips({ fin, value, onChange, convenioIds }) {
  const list = fin.conv.convenios.filter(row => convenioIds.has(row.id));
  if (list.length <= 1) return null;
  return (
    <div className="fin-choices" role="group" aria-label="Operadora">
      <button type="button" className="fin-choice" aria-pressed={!value} onClick={() => onChange('')}>Todas</button>
      {list.map(row => (
        <button key={row.id} type="button" className="fin-choice" aria-pressed={value === row.id} onClick={() => onChange(row.id)}>{row.name}</button>
      ))}
    </div>
  );
}

function guideDay(guide) {
  return guide.items?.[0]?.executed_on || '';
}

function guideTime(guide) {
  const start = guide.items?.[0]?.start_time;
  return start ? start.slice(0, 5) : '';
}

// ============================================================
// Guias
// ============================================================

const GUIDE_FILTERS = [
  { id: 'todo', label: 'Com pendência', test: guide => guide.status === 'open' && guide.missing.length > 0 },
  { id: 'ready', label: 'Prontas', test: guide => guide.status === 'open' && guide.missing.length === 0 },
  { id: 'batched', label: 'No lote', test: guide => guide.status === 'batched' },
  { id: 'glosa', label: 'Glosadas e em recurso', test: guide => guide.status === 'glosa' || guide.status === 'appeal' },
  { id: 'paid', label: 'Pagas', test: guide => guide.status === 'paid' },
  { id: 'all', label: 'Todas', test: () => true },
];

export function Guias({ fin }) {
  return <TissGate fin={fin}><GuiasBody fin={fin} /></TissGate>;
}

function GuiasBody({ fin }) {
  const guides = fin.tiss.guides;
  const [convenio, setConvenio] = useState('');
  const [filter, setFilter] = useState(() => (guides.some(GUIDE_FILTERS[0].test) ? 'todo' : 'all'));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const convenioIds = useMemo(() => new Set(guides.map(row => row.convenio_id)), [guides]);
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  const scoped = guides.filter(row => !convenio || row.convenio_id === convenio);
  const visible = scoped
    .filter(GUIDE_FILTERS.find(row => row.id === filter).test)
    .filter(row => !needle || patientName(fin, row.patient_id, row.patient_name).toLocaleLowerCase('pt-BR').includes(needle) || row.guide_number.includes(needle))
    .sort((a, b) => guideDay(b).localeCompare(guideDay(a)) || Number(b.guide_number) - Number(a.guide_number));
  const selected = guides.find(row => row.guide_id === selectedId) || null;

  if (guides.length === 0) {
    return (
      <EmptyNote>
        Nenhuma guia ainda. A guia SP/SADT nasce sozinha quando um atendimento de convênio vira Atendido na Agenda, com o número seguinte daquela operadora.
      </EmptyNote>
    );
  }

  return (
    <section className={`fin-section fin-tiss${selected ? ' has-detail' : ''}`}>
      <div className="fin-toolbar">
        <ConvenioChips fin={fin} value={convenio} onChange={setConvenio} convenioIds={convenioIds} />
        <input className="gt-select fin-search" aria-label="Buscar paciente ou número da guia" placeholder="Paciente ou nº da guia" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <div className="fin-choices" role="group" aria-label="Mostrar">
        {GUIDE_FILTERS.map(option => (
          <button key={option.id} type="button" className="fin-choice" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
            {option.label} <b className="fin-num">{scoped.filter(option.test).length}</b>
          </button>
        ))}
      </div>
      <div className="fin-tiss-split">
        <div className="fin-tiss-queue" role="list" aria-label="Guias">
          {visible.length === 0 && <EmptyNote>Nada com esse filtro.</EmptyNote>}
          {visible.map(guide => (
            <button
              key={guide.guide_id}
              type="button"
              role="listitem"
              className={`fin-tiss-item${guide.guide_id === selectedId ? ' is-selected' : ''}`}
              aria-current={guide.guide_id === selectedId ? 'true' : undefined}
              onClick={() => setSelectedId(guide.guide_id)}
            >
              <span className="fin-tiss-item-head">
                <b>{patientName(fin, guide.patient_id, guide.patient_name)}</b>
                <StatusChip status={guide.status} missing={guide.missing.length} />
              </span>
              <span className="fin-tiss-item-sub">
                {formatShortDay(guideDay(guide))}{guideTime(guide) ? `, ${guideTime(guide)}` : ''} · nº {guide.guide_number} · {convenioName(fin, guide.convenio_id)}
                {guide.batch ? ` · lote ${guide.batch.number}` : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="fin-tiss-detail">
          {selected
            ? <GuideDetail key={selected.guide_id} fin={fin} guide={selected} onBack={() => setSelectedId('')} />
            : <p className="gt-empty">Escolha uma guia na lista para ver o que falta e completar.</p>}
        </div>
      </div>
    </section>
  );
}

function missingAction(fin, key) {
  const where = TISS_MISSING_LABELS[key]?.where;
  if (where === 'operadoras' || where === 'faturamento' || where === 'areceber') {
    const label = where === 'operadoras' ? 'Abrir Operadoras' : where === 'faturamento' ? 'Abrir Dados para faturamento' : 'Abrir A receber';
    return <button type="button" className="fin-link" onClick={() => fin.open(where)}>{label}</button>;
  }
  if (where === 'paciente') return <span className="fin-hint">Pacientes → ficha → Cadastro → Convênio</span>;
  if (where === 'agenda') return <span className="fin-hint">Confira a data na Agenda</span>;
  return null;
}

function GuideDetail({ fin, guide, onBack }) {
  const editable = guide.status === 'open';
  const requesters = fin.conv.requesters.filter(row => row.active !== false);
  const [form, setForm] = useState(() => ({
    requester_id: guide.requester_id || '',
    requested_on: guide.requested_on || '',
    clinical_indication: guide.clinical_indication || '',
    character_code: guide.character_code || '1',
    attendance_type: guide.attendance_type || '03',
    accident_code: guide.accident_code || '9',
    password: guide.password || '',
    operator_guide_number: guide.operator_guide_number || '',
    authorized_on: guide.authorized_on || '',
    password_valid_until: guide.password_valid_until || '',
    notes: guide.notes || '',
  }));
  const [resending, setResending] = useState(false);
  const { busy, error, run } = useTissSaver(fin);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const item = guide.items?.[0] || {};
  const area = getDiscipline(fin.data.charges.find(row => row.id === item.charge_id)?.discipline);

  async function save() {
    await run(() => saveGuide(guide.guide_id, form), `Guia ${guide.guide_number} salva.`);
  }

  return (
    <div className="fin-card fin-tiss-guide">
      <button type="button" className="fin-link fin-tiss-back" onClick={onBack}>← Voltar às guias</button>
      <div className="fin-tiss-guide-head">
        <div>
          <h3>Guia SP/SADT nº {guide.guide_number}</h3>
          <p className="fin-hint">
            {patientName(fin, guide.patient_id, guide.patient_name)} · {convenioName(fin, guide.convenio_id)} · {formatShortDay(guideDay(guide))}
            {guideTime(guide) ? `, ${guideTime(guide)}` : ''}{area ? ` · ${area.label}` : ''}
          </p>
        </div>
        <div className="fin-tiss-guide-tools">
          <StatusChip status={guide.status} missing={guide.missing.length} />
          <GuidePrintButton fin={fin} guide={guide} />
        </div>
      </div>

      {guide.batch && (
        <p className="gt-notice">
          No lote {guide.batch.number}{guide.batch.sent_on ? `, enviado em ${formatShortDay(guide.batch.sent_on)}` : ', ainda não enviado'}.
          {' '}Guia em lote não muda: para corrigir, reenvie em novo lote.
        </p>
      )}

      <ul className="fin-conv-check fin-tiss-check">
        <li className={guide.card_number ? 'is-ok' : 'is-missing'}>Carteira {guide.card_number || '—'}</li>
        <li className={guide.contractor_value ? 'is-ok' : 'is-missing'}>Contratado: {guide.contractor_name || '—'}{guide.contractor_value ? ` (código ${guide.contractor_value})` : ''}</li>
        <li className={guide.executor_value && guide.executor_council && guide.executor_cbo ? 'is-ok' : 'is-missing'}>
          Quem atendeu: {guide.executor_name || '—'}{guide.executor_cbo ? ` · CBO ${guide.executor_cbo}` : ''}
        </li>
        <li className={item.tuss_code ? 'is-ok' : 'is-missing'}>
          Procedimento {item.tuss_code ? `TUSS ${item.tuss_code} · ${item.tuss_term || ''}` : '—'} · <span className="fin-num">{item.unit_cents != null ? formatBRL(item.unit_cents) : 'sem valor'}</span>
        </li>
        <li className="is-ok">CNES {guide.cnes}</li>
      </ul>

      {guide.missing.length > 0 && (
        <div className="fin-tiss-missing" role="status">
          <b>Antes do lote, falta:</b>
          <ul>
            {guide.missing.map(key => (
              <li key={key}>{TISS_MISSING_LABELS[key]?.label || key} {missingAction(fin, key)}</li>
            ))}
          </ul>
        </div>
      )}
      {guide.warnings.length > 0 && (
        <ul className="fin-tiss-warnings">
          {guide.warnings.map(key => <li key={key}>{TISS_WARNING_LABELS[key] || key}</li>)}
        </ul>
      )}

      <fieldset className="fin-fieldset" disabled={!editable || busy}>
        <legend>Solicitação</legend>
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor="tiss-requester">
            Quem pediu o atendimento
            <select id="tiss-requester" className="gt-select" value={form.requester_id} onChange={event => set({ requester_id: event.target.value })}>
              <option value="">Quem atendeu (pedido da própria clínica)</option>
              {requesters.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <small className="fin-field-note">Médico de fora entra em Solicitantes.</small>
          </label>
          <label className="gt-field" htmlFor="tiss-requested-on">
            Data do pedido (opcional)
            <input id="tiss-requested-on" type="date" className="gt-select" value={form.requested_on} max={fin.today} onChange={event => set({ requested_on: event.target.value })} />
          </label>
        </div>
        <label className="gt-field" htmlFor="tiss-indication">
          Indicação clínica
          <textarea id="tiss-indication" className="gt-select" rows={2} maxLength={500} value={form.clinical_indication} onChange={event => set({ clinical_indication: event.target.value })} placeholder="O motivo do pedido, como está na solicitação" />
          <small className="fin-field-note">Muitas operadoras pedem em terapia. Vai sem acento no arquivo.</small>
        </label>
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor="tiss-attendance">
            Tipo de atendimento
            <select id="tiss-attendance" className="gt-select" value={form.attendance_type} onChange={event => set({ attendance_type: event.target.value })}>
              {ATTENDANCE_TYPES.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>
          <label className="gt-field" htmlFor="tiss-character">
            Caráter
            <select id="tiss-character" className="gt-select" value={form.character_code} onChange={event => set({ character_code: event.target.value })}>
              {CHARACTER_CODES.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>
          <label className="gt-field" htmlFor="tiss-accident">
            Acidente
            <select id="tiss-accident" className="gt-select" value={form.accident_code} onChange={event => set({ accident_code: event.target.value })}>
              {ACCIDENT_CODES.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="fin-fieldset" disabled={!editable || busy}>
        <legend>Autorização da operadora (opcional)</legend>
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor="tiss-password">
            Senha
            <input id="tiss-password" className="gt-select" maxLength={20} autoComplete="off" value={form.password} onChange={event => set({ password: event.target.value })} placeholder="só se a operadora pediu" />
          </label>
          <label className="gt-field" htmlFor="tiss-operator-number">
            Nº da guia na operadora
            <input id="tiss-operator-number" className="gt-select" maxLength={20} value={form.operator_guide_number} onChange={event => set({ operator_guide_number: event.target.value })} />
          </label>
          <label className="gt-field" htmlFor="tiss-authorized-on">
            Data da autorização
            <input id="tiss-authorized-on" type="date" className="gt-select" max={fin.today} value={form.authorized_on} onChange={event => set({ authorized_on: event.target.value })} />
            <small className="fin-field-note">Com senha ou número da operadora, a data é obrigatória.</small>
          </label>
          <label className="gt-field" htmlFor="tiss-password-until">
            Senha vale até
            <input id="tiss-password-until" type="date" className="gt-select" value={form.password_valid_until} onChange={event => set({ password_valid_until: event.target.value })} />
          </label>
        </div>
        <label className="gt-field" htmlFor="tiss-notes">
          Observação na guia
          <input id="tiss-notes" className="gt-select" maxLength={500} value={form.notes} onChange={event => set({ notes: event.target.value })} />
        </label>
      </fieldset>

      <ErrorLine error={error} />
      <div className="fin-actions">
        {guide.batch && guide.status !== 'paid' && (
          <button type="button" className="gt-btn" onClick={() => setResending(true)}>Reenviar em novo lote</button>
        )}
        {editable && (
          <button type="button" className="gt-btn gt-btn--primary" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar guia'}</button>
        )}
      </div>
      {resending && (
        <VoidDialog
          title={`Reenviar a guia ${guide.guide_number}`}
          description="A guia sai do lote (que fica guardado como foi enviado) e volta a ficar em aberto, para corrigir e entrar no próximo lote. Guia já paga não se reenvia: diferença de valor é por recurso."
          confirmLabel="Reenviar"
          onClose={() => setResending(false)}
          onConfirm={async reason => {
            const ok = await run(() => resendGuide(guide.guide_id, reason), `Guia ${guide.guide_number} voltou a ficar em aberto.`);
            if (ok) setResending(false);
            else throw new Error('Não foi possível reenviar. Veja o aviso na guia.');
          }}
        />
      )}
    </div>
  );
}

// ---------- impressão no layout da ANS (campos numerados) ----------

function PrintBox({ n, label, value, wide = 1, missing = false }) {
  return (
    <div className={`tiss-pbox${missing ? ' is-missing' : ''}`} style={{ flex: wide }}>
      <small>{n} – {label}</small>
      <b>{value || ''}</b>
    </div>
  );
}

function GuidePrint({ fin, guide }) {
  const item = guide.items?.[0] || {};
  const clinic = fin.conv.clinic;
  return (
    <div className="tiss-print">
      <div className="tiss-ptitle">
        <span>GUIA DE SERVIÇO PROFISSIONAL / SERVIÇO AUXILIAR DE DIAGNÓSTICO E TERAPIA – SP/SADT</span>
        <span>2 – Nº Guia no Prestador <b>{guide.guide_number}</b></span>
      </div>
      <div className="tiss-prow">
        <PrintBox n={1} label="Registro ANS" value={guide.ans_registry} missing={!guide.ans_registry} />
        <PrintBox n={3} label="Nº Guia Principal" value="" />
        <PrintBox n={4} label="Data da Autorização" value={guide.authorized_on && formatShortDay(guide.authorized_on)} />
        <PrintBox n={5} label="Senha" value={guide.password} />
        <PrintBox n={6} label="Data de Validade da Senha" value={guide.password_valid_until && formatShortDay(guide.password_valid_until)} />
        <PrintBox n={7} label="Nº da Guia Atribuído pela Operadora" value={guide.operator_guide_number} wide={2} />
      </div>
      <div className="tiss-pband">Dados do beneficiário</div>
      <div className="tiss-prow">
        <PrintBox n={8} label="Número da Carteira" value={guide.card_number} wide={2} missing={!guide.card_number} />
        <PrintBox n={9} label="Validade da Carteira" value={guide.card_valid_until && formatShortDay(guide.card_valid_until)} />
        <PrintBox n={10} label="Nome" value={patientName(fin, guide.patient_id, guide.patient_name)} wide={3} />
        <PrintBox n={12} label="Atendimento a RN" value="N" />
      </div>
      <div className="tiss-pband">Dados do solicitante</div>
      <div className="tiss-prow">
        <PrintBox n={13} label="Código na Operadora" value={guide.requester_code} wide={1.4} />
        <PrintBox n={14} label="Nome do Contratado" value={guide.requester_contractor_name} wide={3} />
      </div>
      <div className="tiss-prow">
        <PrintBox n={15} label="Nome do Profissional Solicitante" value={guide.requester_name} wide={3} />
        <PrintBox n={16} label="Conselho" value={guide.requester_council} />
        <PrintBox n={17} label="Número no Conselho" value={guide.requester_council_number} />
        <PrintBox n={18} label="UF" value={guide.requester_uf} />
        <PrintBox n={19} label="Código CBO" value={guide.requester_cbo} />
      </div>
      <div className="tiss-pband">Dados da solicitação</div>
      <div className="tiss-prow">
        <PrintBox n={21} label="Caráter do Atendimento" value={guide.character_code} />
        <PrintBox n={22} label="Data da Solicitação" value={guide.requested_on && formatShortDay(guide.requested_on)} />
        <PrintBox n={23} label="Indicação Clínica" value={guide.clinical_indication} wide={4} />
      </div>
      <div className="tiss-pband">Dados do contratado executante</div>
      <div className="tiss-prow">
        <PrintBox n={29} label="Código na Operadora" value={guide.contractor_value} wide={1.4} missing={!guide.contractor_value} />
        <PrintBox n={30} label="Nome do Contratado" value={guide.contractor_name || clinic?.name} wide={3} />
        <PrintBox n={31} label="Código CNES" value={guide.cnes} />
      </div>
      <div className="tiss-pband">Dados do atendimento</div>
      <div className="tiss-prow">
        <PrintBox n={32} label="Tipo de Atendimento" value={guide.attendance_type} />
        <PrintBox n={33} label="Indicação de Acidente" value={guide.accident_code} />
        <PrintBox n={91} label="Regime de Atendimento" value={guide.regime_code} />
      </div>
      <div className="tiss-pband">Dados da execução / procedimentos realizados</div>
      <div className="tiss-prow">
        <PrintBox n={36} label="Data" value={item.executed_on && formatShortDay(item.executed_on)} />
        <PrintBox n={37} label="Hora Inicial" value={item.start_time?.slice(0, 5)} />
        <PrintBox n={38} label="Hora Final" value={item.end_time?.slice(0, 5)} />
        <PrintBox n={39} label="Tabela" value={item.tuss_table} />
        <PrintBox n={40} label="Código do Procedimento" value={item.tuss_code} wide={1.4} missing={!item.tuss_code} />
        <PrintBox n={41} label="Descrição" value={item.tuss_term} wide={3} />
        <PrintBox n={42} label="Qtde." value="1" />
        <PrintBox n={46} label="Valor Unitário" value={item.unit_cents != null ? formatBRL(item.unit_cents) : ''} />
        <PrintBox n={47} label="Valor Total" value={item.total_cents != null ? formatBRL(item.total_cents) : ''} />
      </div>
      <div className="tiss-pband">Identificação do(s) profissional(is) executante(s)</div>
      <div className="tiss-prow">
        <PrintBox n={50} label="Código na Operadora / CPF" value={guide.executor_value} wide={1.4} />
        <PrintBox n={51} label="Nome do Profissional" value={guide.executor_name} wide={3} />
        <PrintBox n={52} label="Conselho" value={guide.executor_council} />
        <PrintBox n={53} label="Número no Conselho" value={guide.executor_council_number} />
        <PrintBox n={54} label="UF" value={guide.executor_uf} />
        <PrintBox n={55} label="Código CBO" value={guide.executor_cbo} />
      </div>
      <div className="tiss-prow">
        <PrintBox n={58} label="Observação / Justificativa" value={guide.notes} wide={4} />
        <PrintBox n={65} label="Total Geral" value={formatBRL(guide.total_cents)} />
      </div>
      <div className="tiss-prow tiss-psign">
        <PrintBox n={86} label="Assinatura do Beneficiário ou Responsável" value="" wide={2} />
        <PrintBox n={87} label="Assinatura do Contratado" value="" wide={2} />
      </div>
      <p className="tiss-pnote">Numeração dos campos conforme o modelo da ANS (conferir com o modelo da operadora). Em 4.00 o nome e o CNS saíram do arquivo XML; o nome fica só no papel.</p>
    </div>
  );
}

function GuidePrintButton({ fin, guide }) {
  const [printing, setPrinting] = useState(false);
  function print() {
    flushSync(() => setPrinting(true));
    document.body.classList.add('tiss-printing');
    const done = () => {
      document.body.classList.remove('tiss-printing');
      setPrinting(false);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }
  return (
    <>
      <button type="button" className="gt-btn gt-btn--sm" onClick={print}>Imprimir guia</button>
      {printing && createPortal(<div className="tiss-print-root"><GuidePrint fin={fin} guide={guide} /></div>, document.body)}
    </>
  );
}

// ============================================================
// Lotes
// ============================================================

function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** O XML vai como foi gravado; só ASCII, então os bytes são iguais em ISO-8859-1. */
async function downloadBatch(batch, convenio) {
  const row = await loadBatchXml(batch.id);
  const safe = (convenio || 'operadora').normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadText(row.xml, `lote-${row.number}-${safe}.xml`, 'application/xml;charset=ISO-8859-1');
}

const BATCH_STATUS = {
  generated: { label: 'Gerado, falta enviar', className: 'gt-badge-pending' },
  sent: { label: 'Enviado', className: 'gt-badge-success' },
  discarded: { label: 'Descartado', className: 'gt-badge-neutral' },
};

export function Lotes({ fin }) {
  return <TissGate fin={fin}><LotesBody fin={fin} /></TissGate>;
}

function LotesBody({ fin }) {
  const { guides, batches } = fin.tiss;
  const [convenio, setConvenio] = useState('');
  const [building, setBuilding] = useState(null);
  const [sending, setSending] = useState(null);
  const [discarding, setDiscarding] = useState(null);
  const [error, setError] = useState('');
  const { run } = useTissSaver(fin);
  const convenioIds = useMemo(() => new Set([...guides.map(row => row.convenio_id), ...batches.map(row => row.convenio_id)]), [guides, batches]);
  const scopedGuides = guides.filter(row => !convenio || row.convenio_id === convenio);
  const pending = scopedGuides.filter(row => row.status === 'open' && row.missing.length > 0).length;
  const byConvenio = new Map();
  for (const guide of scopedGuides) {
    if (!byConvenio.has(guide.convenio_id)) byConvenio.set(guide.convenio_id, []);
    byConvenio.get(guide.convenio_id).push(guide);
  }
  const lots = batches.filter(row => !convenio || row.convenio_id === convenio);

  return (
    <section className="fin-section">
      <div className="fin-toolbar">
        <ConvenioChips fin={fin} value={convenio} onChange={setConvenio} convenioIds={convenioIds} />
      </div>
      {[...byConvenio.entries()].map(([convenioId, list]) => {
        const groups = batchCandidates(list);
        const conv = fin.conv.convenios.find(row => row.id === convenioId);
        if (groups.length === 0) return null;
        return groups.map((group, index) => (
          <div key={`${convenioId}:${group.contractorKey}:${index}`} className="fin-card fin-tiss-build">
            <div className="fin-tiss-guide-head">
              <div>
                <h3>{conv?.name || 'Operadora'}: {group.guides.length === 1 ? '1 guia pronta' : `${group.guides.length} guias prontas`}</h3>
                <p className="fin-hint">
                  Contratado {group.contractorName}{conv?.lot_due_day ? ` · envio do lote até o dia ${conv.lot_due_day}` : ''}
                  {' '}· <span className="fin-num">{formatBRL(group.guides.reduce((sum, row) => sum + (row.total_cents || 0), 0))}</span>
                </p>
              </div>
              <button type="button" className="gt-btn gt-btn--primary" onClick={() => setBuilding({ convenioId, guides: group.guides })}>Montar lote</button>
            </div>
          </div>
        ));
      })}
      {pending > 0 && (
        <p className="fin-hint fin-hint--warn">
          {pending === 1 ? '1 guia em aberto tem pendência' : `${pending} guias em aberto têm pendência`} e fica fora do lote até completar.{' '}
          <button type="button" className="fin-link" onClick={() => fin.open('guias')}>Ver em Guias</button>
        </p>
      )}
      <ErrorLine error={error} />

      <h3 className="fin-subtitle">Lotes</h3>
      {lots.length === 0 ? <EmptyNote>Nenhum lote ainda. Monte o primeiro com as guias prontas acima.</EmptyNote> : (
        <div className="fin-list">
          {lots.map(batch => {
            const status = BATCH_STATUS[batch.status];
            const conv = fin.conv.convenios.find(row => row.id === batch.convenio_id);
            const due = batch.status === 'sent' ? convenioDueOn({ sentOn: batch.sent_on, termDays: conv?.payment_term_days }) : null;
            return (
              <div key={batch.id} className={`fin-row${batch.status === 'discarded' ? ' fin-row--void' : ''}`}>
                <span className="fin-date">Lote {batch.number}</span>
                <div className="fin-row-main">
                  <b>{conv?.name || 'Operadora'} · {batch.guide_count === 1 ? '1 guia' : `${batch.guide_count} guias`}</b>
                  <span>
                    {formatShortDay(batch.period_from)}{batch.period_until !== batch.period_from ? ` a ${formatShortDay(batch.period_until)}` : ''}
                    {batch.sent_on ? ` · enviado em ${formatShortDay(batch.sent_on)}` : ''}
                    {batch.protocol_number ? ` · protocolo ${batch.protocol_number}` : ''}
                    {due ? ` · pagamento previsto até ${formatShortDay(due)}` : ''}
                  </span>
                  {batch.status === 'discarded' && <span className="fin-void-reason">Descartado: {batch.discard_reason}</span>}
                </div>
                <span className={`gt-badge ${status.className}`}>{status.label}</span>
                <b className="fin-num fin-amount">{formatBRL(batch.total_cents)}</b>
                <div className="fin-row-actions">
                  {batch.status !== 'discarded' && (
                    <button type="button" className="gt-btn gt-btn--sm" onClick={() => downloadBatch(batch, conv?.name).catch(err => setError(err.message))}>Baixar XML</button>
                  )}
                  {batch.status === 'generated' && (
                    <>
                      <button type="button" className="gt-btn gt-btn--sm gt-btn--primary" onClick={() => setSending(batch)}>Marcar enviado</button>
                      <button type="button" className="gt-btn gt-btn--sm" onClick={() => setDiscarding(batch)}>Descartar</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="fin-hint">O XML segue o padrão TISS 4.03.00 da ANS, com o hash do epílogo, e é para subir no portal da operadora. Lote enviado não muda: guia com problema volta por “Reenviar em novo lote”, em Guias.</p>

      {building && <BuildBatchDialog fin={fin} convenioId={building.convenioId} guides={building.guides} onClose={() => setBuilding(null)} />}
      {sending && <MarkSentDialog fin={fin} batch={sending} onClose={() => setSending(null)} />}
      {discarding && (
        <VoidDialog
          title={`Descartar o lote ${discarding.number}`}
          description="Só lote que ainda não foi enviado se descarta. As guias voltam a ficar em aberto, e o número do lote não volta a ser usado."
          confirmLabel="Descartar lote"
          onClose={() => setDiscarding(null)}
          onConfirm={async reason => {
            const ok = await run(() => discardBatch(discarding.id, reason), `Lote ${discarding.number} descartado.`);
            if (!ok) throw new Error('Não foi possível descartar.');
            setDiscarding(null);
          }}
        />
      )}
    </section>
  );
}

function BuildBatchDialog({ fin, convenioId, guides, onClose }) {
  const [picked, setPicked] = useState(() => new Set(guides.map(row => row.guide_id)));
  const { busy, error, run } = useTissSaver(fin);
  const chosen = guides.filter(row => picked.has(row.guide_id));
  const total = chosen.reduce((sum, row) => sum + (row.total_cents || 0), 0);
  const toggle = id => setPicked(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function build() {
    const batch = await run(() => createBatch(convenioId, chosen.map(row => row.guide_id)), result => `Lote ${result.number} gerado com ${result.guide_count === 1 ? '1 guia' : `${result.guide_count} guias`}. Baixe o XML e envie no portal.`);
    if (batch) onClose();
  }

  return (
    <DialogShell
      title={`Novo lote · ${convenioName(fin, convenioId)}`}
      onClose={onClose}
      busy={busy}
      guard={false}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={build} disabled={busy || chosen.length === 0}>
            {busy ? 'Gerando…' : `Gerar lote com ${chosen.length === 1 ? '1 guia' : `${chosen.length} guias`}`}
          </button>
        </>
      )}
    >
      <p className="fin-dialog-text">
        Entram só guias prontas deste contratado, até {TISS_MAX_GUIDES_PER_BATCH} por lote. Ao gerar, a cópia das guias fica congelada no lote, com o XML e o hash.
      </p>
      <div className="fin-table-scroll">
        <table className="fin-table">
          <thead><tr><th scope="col"><span className="fin-sr">Entra</span></th><th scope="col">Guia</th><th scope="col">Paciente</th><th scope="col">Sessão</th><th scope="col">TUSS</th><th scope="col" className="fin-num">Valor</th></tr></thead>
          <tbody>
            {guides.map(guide => (
              <tr key={guide.guide_id}>
                <td><input type="checkbox" aria-label={`Guia ${guide.guide_number} entra no lote`} checked={picked.has(guide.guide_id)} onChange={() => toggle(guide.guide_id)} /></td>
                <td className="fin-num">{guide.guide_number}</td>
                <td>{patientName(fin, guide.patient_id, guide.patient_name)}</td>
                <td>{formatShortDay(guideDay(guide))}</td>
                <td className="fin-num">{guide.items?.[0]?.tuss_code}</td>
                <td className="fin-num">{formatBRL(guide.total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fin-total">Valor do lote <b className="fin-num">{formatBRL(total)}</b></p>
      <ErrorLine error={error} />
    </DialogShell>
  );
}

function MarkSentDialog({ fin, batch, onClose }) {
  const [sentOn, setSentOn] = useState(fin.today);
  const [protocol, setProtocol] = useState('');
  const { busy, error, run } = useTissSaver(fin);
  async function save() {
    const ok = await run(() => markBatchSent(batch.id, sentOn, protocol.trim()), `Lote ${batch.number} marcado como enviado.`);
    if (ok) onClose();
  }
  return (
    <DialogShell
      title={`Lote ${batch.number} enviado`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={busy || !sentOn}>{busy ? 'Salvando…' : 'Marcar enviado'}</button>
        </>
      )}
    >
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="tiss-sent-on">
          Dia do envio
          <input id="tiss-sent-on" type="date" className="gt-select" min={batch.generated_on} max={fin.today} value={sentOn} onChange={event => setSentOn(event.target.value)} />
        </label>
        <label className="gt-field" htmlFor="tiss-protocol">
          Protocolo do portal (opcional)
          <input id="tiss-protocol" className="gt-select" maxLength={30} value={protocol} onChange={event => setProtocol(event.target.value)} />
        </label>
      </div>
      <p className="fin-hint">O prazo de pagamento da operadora conta a partir deste dia.</p>
      <ErrorLine error={error} />
    </DialogShell>
  );
}

// ============================================================
// Pagamentos e glosas
// ============================================================

export function Pagamentos({ fin }) {
  return <TissGate fin={fin}><PagamentosBody fin={fin} /></TissGate>;
}

function PagamentosBody({ fin }) {
  const { guides, batches, settlements, payments } = fin.tiss;
  const [registering, setRegistering] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [appeal, setAppeal] = useState(null);
  const [closing, setClosing] = useState(null);
  const { run } = useTissSaver(fin);
  const awaiting = guides.filter(row => ['batched', 'glosa', 'appeal'].includes(row.status) && row.batch?.status === 'sent');
  const glosas = guides.filter(row => row.status === 'glosa' || row.status === 'appeal');
  const sentBatches = batches.filter(row => row.status === 'sent');
  const byBatch = new Map();
  for (const guide of awaiting) {
    const key = guide.batch.batch_id;
    if (!byBatch.has(key)) byBatch.set(key, []);
    byBatch.get(key).push(guide);
  }
  const groupRows = new Map();
  for (const row of settlements) {
    if (!groupRows.has(row.group_id)) groupRows.set(row.group_id, []);
    groupRows.get(row.group_id).push(row);
  }
  const history = [...groupRows.entries()]
    .map(([id, rows]) => ({ id, rows, settledOn: rows[0].settled_on, voided: Boolean(rows[0].voided_at), reason: rows[0].void_reason, payment: payments.find(p => p.id === rows.find(r => r.payment_id)?.payment_id) }))
    .sort((a, b) => b.settledOn.localeCompare(a.settledOn));
  const guideById = new Map(guides.map(row => [row.guide_id, row]));

  return (
    <section className="fin-section">
      {sentBatches.length === 0 && (
        <EmptyNote>Nenhum lote enviado ainda. Depois de enviar um lote no portal e marcar como enviado em Lotes, o pagamento da operadora entra aqui.</EmptyNote>
      )}
      {[...byBatch.entries()].map(([batchId, list]) => {
        const batch = batches.find(row => row.id === batchId);
        const conv = fin.conv.convenios.find(row => row.id === batch?.convenio_id);
        const open = list.reduce((sum, row) => sum + (row.total_cents - (row.settled?.paid_cents || 0)), 0);
        return (
          <div key={batchId} className="fin-card fin-tiss-build">
            <div className="fin-tiss-guide-head">
              <div>
                <h3>Lote {batch?.number} · {conv?.name || 'Operadora'}</h3>
                <p className="fin-hint">
                  {list.length === 1 ? '1 guia esperando' : `${list.length} guias esperando`} · falta receber <span className="fin-num">{formatBRL(open)}</span>
                  {batch?.sent_on ? ` · enviado em ${formatShortDay(batch.sent_on)}` : ''}
                </p>
              </div>
              <button type="button" className="gt-btn gt-btn--primary" onClick={() => setRegistering({ convenioId: batch.convenio_id, guides: list, batch })}>Registrar pagamento</button>
            </div>
          </div>
        );
      })}

      {glosas.length > 0 && (
        <>
          <h3 className="fin-subtitle">Glosadas e em recurso</h3>
          <div className="fin-list">
            {glosas.map(guide => (
              <div key={guide.guide_id} className="fin-row">
                <span className="fin-date">nº {guide.guide_number}</span>
                <div className="fin-row-main">
                  <b>{patientName(fin, guide.patient_id, guide.patient_name)}</b>
                  <span>
                    {convenioName(fin, guide.convenio_id)} · {formatShortDay(guideDay(guide))} · glosado <span className="fin-num">{formatBRL(Math.min(guide.settled?.glosa_cents || 0, guide.total_cents - (guide.settled?.paid_cents || 0)))}</span>
                    {' '}· {lastGlosaText(fin, settlements, guide.guide_id)}
                  </span>
                </div>
                <StatusChip status={guide.status} />
                <div className="fin-row-actions">
                  {guide.status === 'glosa'
                    ? <button type="button" className="gt-btn gt-btn--sm" onClick={() => setAppeal(guide)}>Registrar recurso</button>
                    : <button type="button" className="gt-btn gt-btn--sm" onClick={() => setClosing(guide)}>Resultado do recurso</button>}
                </div>
              </div>
            ))}
          </div>
          <p className="fin-hint">Glosa não sai do “A receber”: só sai quando o dinheiro entra. O recurso é enviado no portal da operadora; aqui fica o registro.</p>
        </>
      )}

      <h3 className="fin-subtitle">Lançamentos</h3>
      {history.length === 0 ? <EmptyNote>Nada lançado ainda.</EmptyNote> : (
        <div className="fin-list">
          {history.map(entry => {
            const paid = entry.rows.reduce((sum, row) => sum + row.paid_cents, 0);
            const glosa = entry.rows.reduce((sum, row) => sum + row.glosa_cents, 0);
            const numbers = [...new Set(entry.rows.map(row => guideById.get(row.guide_id)?.guide_number).filter(Boolean))];
            return (
              <div key={entry.id} className={`fin-row${entry.voided ? ' fin-row--void' : ''}`}>
                <span className="fin-date">{formatShortDay(entry.settledOn)}</span>
                <div className="fin-row-main">
                  <b>{entry.payment ? `Depósito ${CONVENIO_PAYMENT_METHODS.find(row => row.id === entry.payment.method)?.label || ''}` : 'Só glosa'}</b>
                  <span>
                    {numbers.length === 1 ? `guia ${numbers[0]}` : `guias ${numbers.join(', ')}`}
                    {glosa > 0 ? ` · glosa ${formatBRL(glosa)}` : ''}
                  </span>
                  {entry.voided && <span className="fin-void-reason">Anulado: {entry.reason}</span>}
                </div>
                <b className="fin-num fin-amount">{formatBRL(paid)}</b>
                {!entry.voided && <button type="button" className="gt-btn gt-btn--sm" onClick={() => setVoiding(entry)}>Anular</button>}
              </div>
            );
          })}
        </div>
      )}

      {registering && <PaymentDialog fin={fin} {...registering} onClose={() => setRegistering(null)} />}
      {voiding && (
        <VoidDialog
          title="Anular lançamento da operadora"
          description="O depósito e o que ele acertou em cada guia ficam riscados, fora das contas. As guias voltam à situação anterior."
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            const ok = await run(() => voidSettlement(voiding.id, reason), 'Lançamento anulado.');
            if (!ok) throw new Error('Não foi possível anular.');
            setVoiding(null);
          }}
        />
      )}
      {appeal && <AppealDialog fin={fin} guide={appeal} onClose={() => setAppeal(null)} />}
      {closing && <CloseAppealDialog fin={fin} guide={closing} onClose={() => setClosing(null)} />}
    </section>
  );
}

function lastGlosaText(fin, settlements, guideId) {
  const row = settlements.find(item => item.guide_id === guideId && !item.voided_at && item.glosa_cents > 0);
  if (!row) return '';
  const term = fin.tiss.glosas.find(item => item.code === row.glosa_code)?.term;
  return `motivo ${row.glosa_code}${term ? ` (${term.toLocaleLowerCase('pt-BR')})` : ''}`;
}

function GlosaCodeInput({ fin, id, value, onChange }) {
  const listId = `${id}-list`;
  const term = fin.tiss.glosas.find(row => row.code === value)?.term;
  return (
    <span className="fin-tiss-glosa-code">
      <input id={id} className="gt-select" inputMode="numeric" maxLength={4} list={listId} placeholder="4 números" value={value} onChange={event => onChange(event.target.value.replace(/\D/g, ''))} />
      <datalist id={listId}>
        {fin.tiss.glosas.map(row => <option key={row.code} value={row.code}>{row.term}</option>)}
      </datalist>
      {value.length === 4 && <small className="fin-field-note">{term || 'Código fora da tabela 38 carregada: confira no demonstrativo.'}</small>}
    </span>
  );
}

function PaymentDialog({ fin, convenioId, guides, batch, onClose }) {
  const [receivedOn, setReceivedOn] = useState(fin.today);
  const [method, setMethod] = useState('ted');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState(() => guides.map(guide => {
    const open = guide.total_cents - (guide.settled?.paid_cents || 0);
    return { guide, paid: centsToInput(open), glosa: '', code: '', glosaNote: '' };
  }));
  const { busy, error, run } = useTissSaver(fin);
  const set = (index, patch) => setRows(list => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const parsed = rows.map(row => ({
    ...row,
    paidCents: parseBRLInput(row.paid || '0') ?? null,
    glosaCents: parseBRLInput(row.glosa || '0') ?? null,
  }));
  const deposit = parsed.reduce((sum, row) => sum + (row.paidCents || 0), 0);
  const problems = [];
  for (const row of parsed) {
    const open = row.guide.total_cents - (row.guide.settled?.paid_cents || 0);
    if (row.paidCents == null || row.glosaCents == null) problems.push(`guia ${row.guide.guide_number}: valor inválido`);
    else if (row.paidCents > open) problems.push(`guia ${row.guide.guide_number}: pago passa do que falta`);
    else if (row.glosaCents > 0 && row.code.length !== 4) problems.push(`guia ${row.guide.guide_number}: glosa sem o código`);
  }
  const items = parsed
    .filter(row => (row.paidCents || 0) + (row.glosaCents || 0) > 0)
    .map(row => ({
      guide_id: row.guide.guide_id,
      paid_cents: row.paidCents || 0,
      glosa_cents: row.glosaCents || 0,
      ...(row.glosaCents > 0 ? { glosa_code: row.code, glosa_note: row.glosaNote.trim() || null } : {}),
    }));

  async function save() {
    const ok = await run(() => registerConvenioPayment({ convenioId, receivedOn, amountCents: deposit, method, items, note }),
      deposit > 0 ? `Pagamento de ${formatBRL(deposit)} registrado.` : 'Glosa registrada.');
    if (ok) onClose();
  }

  return (
    <DialogShell
      title={`Pagamento do lote ${batch.number} · ${convenioName(fin, convenioId)}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={busy || problems.length > 0 || items.length === 0}>
            {busy ? 'Registrando…' : deposit > 0 ? `Registrar ${formatBRL(deposit)}` : 'Registrar só a glosa'}
          </button>
        </>
      )}
    >
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="tiss-pay-on">
          Dia em que o dinheiro entrou
          <input id="tiss-pay-on" type="date" className="gt-select" max={fin.today} value={receivedOn} onChange={event => setReceivedOn(event.target.value)} />
        </label>
        <fieldset className="fin-fieldset">
          <legend>Como chegou</legend>
          <div className="fin-choices">
            {CONVENIO_PAYMENT_METHODS.map(row => (
              <button key={row.id} type="button" className="fin-choice" aria-pressed={method === row.id} onClick={() => setMethod(row.id)}>{row.label}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="fin-hint">Para cada guia, o que o demonstrativo da operadora diz. Deixe pago e glosa em zero na guia que ainda não teve resposta.</p>
      <div className="fin-tiss-pay-rows">
        {rows.map((row, index) => {
          const open = row.guide.total_cents - (row.guide.settled?.paid_cents || 0);
          return (
            <fieldset key={row.guide.guide_id} className="fin-fieldset fin-tiss-pay-row">
              <legend>Guia {row.guide.guide_number} · {patientName(fin, row.guide.patient_id, row.guide.patient_name)} · falta {formatBRL(open)}</legend>
              <div className="fin-grid-2">
                <label className="gt-field" htmlFor={`tiss-paid-${index}`}>
                  Pago
                  <MoneyInput id={`tiss-paid-${index}`} value={row.paid} onChange={value => set(index, { paid: value })} />
                </label>
                <label className="gt-field" htmlFor={`tiss-glosa-${index}`}>
                  Glosado
                  <MoneyInput id={`tiss-glosa-${index}`} value={row.glosa} onChange={value => set(index, { glosa: value })} />
                </label>
              </div>
              {parseBRLInput(row.glosa || '0') > 0 && (
                <div className="fin-grid-2">
                  <label className="gt-field" htmlFor={`tiss-code-${index}`}>
                    Motivo da glosa (código da tabela 38)
                    <GlosaCodeInput fin={fin} id={`tiss-code-${index}`} value={row.code} onChange={value => set(index, { code: value })} />
                  </label>
                  <label className="gt-field" htmlFor={`tiss-gnote-${index}`}>
                    Observação (opcional)
                    <input id={`tiss-gnote-${index}`} className="gt-select" maxLength={500} value={row.glosaNote} onChange={event => set(index, { glosaNote: event.target.value })} />
                  </label>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <label className="gt-field" htmlFor="tiss-pay-note">
        Observação do depósito (opcional)
        <input id="tiss-pay-note" className="gt-select" maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <p className="fin-total">Depósito <b className="fin-num">{formatBRL(deposit)}</b></p>
      {problems.length > 0 && <p className="fin-hint fin-hint--warn">Confira: {problems.join('; ')}.</p>}
      <ErrorLine error={error} />
    </DialogShell>
  );
}

function AppealDialog({ fin, guide, onClose }) {
  const [note, setNote] = useState('');
  const { busy, error, run } = useTissSaver(fin);
  async function save() {
    const ok = await run(() => openAppeal(guide.guide_id, note.trim()), `Recurso da guia ${guide.guide_number} registrado.`);
    if (ok) onClose();
  }
  return (
    <DialogShell
      title={`Recurso da guia ${guide.guide_number}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={busy || note.trim().length < 3}>{busy ? 'Salvando…' : 'Registrar recurso'}</button>
        </>
      )}
    >
      <label className="gt-field" htmlFor="tiss-appeal-note">
        Justificativa enviada à operadora
        <textarea id="tiss-appeal-note" className="gt-select" rows={4} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <p className="fin-hint">O recurso é enviado no portal da operadora. Aqui fica o registro, para lembrar e cobrar a resposta.</p>
      <ErrorLine error={error} />
    </DialogShell>
  );
}

function CloseAppealDialog({ fin, guide, onClose }) {
  const [outcome, setOutcome] = useState('won');
  const [note, setNote] = useState('');
  const { busy, error, run } = useTissSaver(fin);
  async function save() {
    const ok = await run(() => closeAppeal(guide.guide_id, outcome, note.trim()), 'Resultado do recurso registrado.');
    if (ok) onClose();
  }
  return (
    <DialogShell
      title={`Resultado do recurso · guia ${guide.guide_number}`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar resultado'}</button>
        </>
      )}
    >
      <div className="fin-choices" role="group" aria-label="Resultado">
        <button type="button" className="fin-choice" aria-pressed={outcome === 'won'} onClick={() => setOutcome('won')}>Aceito</button>
        <button type="button" className="fin-choice" aria-pressed={outcome === 'lost'} onClick={() => setOutcome('lost')}>Negado</button>
      </div>
      <label className="gt-field" htmlFor="tiss-appeal-outcome">
        Observação (opcional)
        <input id="tiss-appeal-outcome" className="gt-select" maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <p className="fin-hint">
        {outcome === 'won'
          ? 'Aceito: quando o dinheiro entrar, registre o pagamento no lote. Até lá a guia segue no “A receber”.'
          : 'Negado: a guia segue glosada no “A receber”, porque só sai quando o dinheiro entra.'}
      </p>
      <ErrorLine error={error} />
    </DialogShell>
  );
}
