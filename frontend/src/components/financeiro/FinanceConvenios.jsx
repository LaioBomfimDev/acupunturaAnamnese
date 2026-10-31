import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchSelect } from '../ui/SearchSelect';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import { getProfession } from '../../data/professionalCouncils';
import {
  CBO_BY_PROFESSION,
  COUNCIL_BY_PROFESSION,
  TISS_COUNCILS,
  TISS_UFS,
  councilShort,
  ufSigla,
} from '../../data/tissDomains';
import {
  deleteConvenioPrice,
  saveClinicCnes,
  saveConvenio,
  saveConvenioPrice,
  saveCredential,
  savePlan,
  saveProfessionalBilling,
  saveRequester,
  searchTussProcedures,
} from '../../services/convenioService';
import {
  ANS_PATTERN,
  CNES_NONE,
  CNES_PATTERN,
  COUNCIL_NUMBER_PATTERN,
  OWN_CODE_PATTERN,
  PROVIDER_CODE_PATTERN,
  SUBMISSION_CHANNELS,
  TUSS_PATTERN,
  TUSS_TABLES,
  convenioReadiness,
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  missingLabel,
  onlyDigits,
  procedureCodeLabel,
  professionalBillingMissing,
} from '../../utils/convenio';
import {
  FINANCE_APPOINTMENT_TYPES,
  centsToInput,
  formatBRL,
  formatDay,
  parseBRLInput,
  payableMembers,
  typeLabel,
} from '../../utils/finance';
import { DialogShell } from './FinanceDialogs';
import { AreaTag, EmptyNote, MoneyInput } from './FinanceFields';

// ============================================================
// Financeiro → Convênios (Fase 1, 31/10/2026; banco A + tela B escolhidos
// pela administradora): operadoras em cartões com o que falta para
// faturar, e um passo a passo de quatro etapas (operadora, credenciamento,
// planos, tabela de preços), na ordem em que a operadora entrega os dados.
// Cada etapa grava ao continuar: operadora pela metade aparece no cartão
// com o que falta. Guia e lote são a Fase 2.
// ============================================================

const STEPS = [
  { id: 1, label: 'Operadora' },
  { id: 2, label: 'Credenciamento' },
  { id: 3, label: 'Planos' },
  { id: 4, label: 'Tabela de preços' },
];

function useConvSaver(fin, onSaved = null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (message) fin.notify(message);
      fin.convReload();
      onSaved?.();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function ErrorLine({ error }) {
  return error ? <p className="gt-notice gt-notice-error" role="alert">{error}</p> : null;
}

/** Sem os dados de convênio (carregando ou com erro), cada parte diz por quê. */
function ConvGate({ fin, children }) {
  if (fin.convError) return <p className="gt-notice gt-notice-error" role="alert">{fin.convError}</p>;
  if (!fin.conv) return <p className="gt-empty">Carregando os convênios…</p>;
  return children;
}

// ---------- Operadoras ----------

export function Operadoras({ fin }) {
  const [open, setOpen] = useState(null);
  return (
    <ConvGate fin={fin}>
      <OperadorasBody fin={fin} open={open} setOpen={setOpen} />
    </ConvGate>
  );
}

function OperadorasBody({ fin, open, setOpen }) {
  const { convenios } = fin.conv;
  const active = convenios.filter(row => row.active !== false);
  const inactive = convenios.filter(row => row.active === false);

  function card(convenio) {
    const readiness = convenioReadiness({ convenio, ...fin.conv });
    const firstMissing = readiness.items.find(item => !item.ok)?.step || 1;
    return (
      <button
        key={convenio.id}
        type="button"
        className={`fin-conv-card${convenio.active === false ? ' is-inactive' : ''}`}
        onClick={() => setOpen({ convenio, step: firstMissing })}
      >
        <span className="fin-conv-card-head">
          <b>{convenio.name}</b>
          {convenio.active === false
            ? <span className="fin-pill">Desativada</span>
            : <span className={`fin-pill ${readiness.ready ? 'fin-pill--ok' : 'fin-pill--warn'}`}>{readiness.ready ? 'Pronta' : missingLabel(readiness.missing)}</span>}
        </span>
        <span className="fin-conv-sub">{convenio.ans_registry ? `ANS ${convenio.ans_registry}` : 'Sem registro ANS'}</span>
        <span className="fin-conv-meter" aria-hidden="true"><i style={{ width: `${readiness.percent}%` }} /></span>
        <ul className="fin-conv-check">
          {readiness.items.map(item => (
            <li key={item.key} className={item.ok ? (item.optional ? 'is-optional' : 'is-ok') : 'is-missing'}>{item.label}</li>
          ))}
        </ul>
        <span className="fin-conv-go" aria-hidden="true">{readiness.ready ? 'Ver e mudar →' : 'Completar →'}</span>
      </button>
    );
  }

  return (
    <section className="fin-section">
      {convenios.length === 0 && (
        <EmptyNote>
          Nenhuma operadora ainda. Cadastre a primeira com os dados que ela mandou no credenciamento: registro ANS, CNPJ e o código de prestador da clínica.
        </EmptyNote>
      )}
      <div className="fin-conv-cards">
        {active.map(card)}
        <button type="button" className="fin-conv-card fin-conv-card--add" onClick={() => setOpen({ convenio: null, step: 1 })}>
          <span aria-hidden="true">+</span>
          Nova operadora
        </button>
      </div>
      {inactive.length > 0 && (
        <>
          <h3 className="fin-subtitle">Desativadas</h3>
          <div className="fin-conv-cards">{inactive.map(card)}</div>
        </>
      )}
      <p className="fin-hint">Operadora pronta tem registro ANS, CNPJ, código do prestador e todos os preços com código. Planos são opcionais.</p>
      {open && <ConvenioWizard fin={fin} initial={open.convenio} initialStep={open.step} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ConvenioWizard({ fin, initial, initialStep, onClose }) {
  const [convenio, setConvenio] = useState(initial);
  const [step, setStep] = useState(initial ? initialStep : 1);
  const [savedKey, setSavedKey] = useState(0);
  const markSaved = () => setSavedKey(key => key + 1);
  // Sempre a versão mais nova do banco depois de cada gravação.
  const current = convenio ? fin.conv.convenios.find(row => row.id === convenio.id) || convenio : null;
  const readiness = current ? convenioReadiness({ convenio: current, ...fin.conv }) : null;
  const doneSteps = new Set(readiness ? readiness.items.filter(item => item.ok && !item.optional).map(item => item.step) : []);

  return (
    <DialogShell
      title={current ? current.name : 'Nova operadora'}
      onClose={onClose}
      busy={false}
      guard
      savedKey={savedKey}
      // A etapa 1 grava pelo próprio botão: "Próxima etapa" ali pularia o que foi digitado.
      footer={step === 1 || step === 4 || !current
        ? <button type="button" className="gt-btn" onClick={onClose}>Fechar</button>
        : (
          <>
            <button type="button" className="gt-btn" onClick={onClose}>Fechar</button>
            <button type="button" className="gt-btn gt-btn--primary" onClick={() => setStep(value => Math.min(4, value + 1))}>Próxima etapa</button>
          </>
        )}
    >
      <ol className="fin-steps" aria-label="Etapas">
        {STEPS.map(item => (
          <li key={item.id}>
            <button
              type="button"
              className="fin-step"
              aria-current={step === item.id ? 'step' : undefined}
              data-done={doneSteps.has(item.id) ? 'true' : undefined}
              disabled={!current && item.id !== 1}
              onClick={() => setStep(item.id)}
            >
              <span aria-hidden="true">{doneSteps.has(item.id) && step !== item.id ? '✓' : item.id}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>
      {step === 1 && (
        <StepOperadora
          fin={fin}
          convenio={current}
          markSaved={markSaved}
          onSaved={saved => { setConvenio(saved); setStep(2); }}
        />
      )}
      {step === 2 && current && <StepCredenciamento fin={fin} convenio={current} markSaved={markSaved} />}
      {step === 3 && current && <StepPlanos fin={fin} convenio={current} markSaved={markSaved} />}
      {step === 4 && current && <StepPrecos fin={fin} convenio={current} markSaved={markSaved} />}
    </DialogShell>
  );
}

function StepOperadora({ fin, convenio, onSaved, markSaved }) {
  const [form, setForm] = useState(() => ({
    name: convenio?.name || '',
    ans_registry: convenio?.ans_registry || '',
    cnpj: convenio?.cnpj ? formatCnpj(convenio.cnpj) : '',
    tiss_version: convenio?.tiss_version || '4.03.00',
    submission_channel: convenio?.submission_channel || 'portal',
    lot_due_day: convenio?.lot_due_day ? String(convenio.lot_due_day) : '',
    notes: convenio?.notes || '',
  }));
  const { busy, error, run } = useConvSaver(fin, markSaved);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const ans = onlyDigits(form.ans_registry);
  const day = form.lot_due_day ? Number(form.lot_due_day) : null;
  const problems = [
    !form.name.trim() && 'o nome',
    ans && !ANS_PATTERN.test(ans) && 'o registro ANS (6 números)',
    form.cnpj.trim() && !isValidCnpj(form.cnpj) && 'o CNPJ (os dois últimos números não conferem)',
    day != null && (day < 1 || day > 31) && 'o dia do envio (1 a 31)',
    !/^\d\.\d{2}\.\d{2}$/.test(form.tiss_version) && 'a versão TISS (ex.: 4.03.00)',
  ].filter(Boolean);

  async function save() {
    const saved = await run(() => saveConvenio({
      ...(convenio ? { id: convenio.id } : {}),
      name: form.name.trim(),
      ans_registry: ans || null,
      cnpj: form.cnpj.trim() || null,
      tiss_version: form.tiss_version,
      submission_channel: form.submission_channel,
      lot_due_day: day,
      notes: form.notes.trim() || null,
    }), convenio ? `${form.name.trim()} salva.` : `${form.name.trim()} cadastrada.`);
    if (saved) onSaved(saved);
  }

  async function toggleActive() {
    const saved = await run(() => saveConvenio({ id: convenio.id, active: !convenio.active }), convenio.active ? `${convenio.name} desativada.` : `${convenio.name} ativada.`);
    if (saved) onSaved(saved);
  }

  return (
    <div className="fin-conv-step">
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="conv-name">
          Nome da operadora
          <input id="conv-name" className="gt-select" maxLength={70} value={form.name} onChange={event => set({ name: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="conv-ans">
          Registro ANS
          <input id="conv-ans" className="gt-select" inputMode="numeric" maxLength={6} placeholder="6 números" value={form.ans_registry} onChange={event => set({ ans_registry: onlyDigits(event.target.value) })} />
          <small className="fin-field-note">Aparece na carteirinha e no site da ANS.</small>
        </label>
        <label className="gt-field" htmlFor="conv-cnpj">
          CNPJ da operadora
          <input id="conv-cnpj" className="gt-select" maxLength={18} placeholder="00.000.000/0000-00" value={form.cnpj} onChange={event => set({ cnpj: event.target.value.toUpperCase() })} onBlur={() => form.cnpj && set({ cnpj: formatCnpj(form.cnpj) })} />
          <small className="fin-field-note">Desde 07/2026 o CNPJ pode ter letras.</small>
        </label>
        <label className="gt-field" htmlFor="conv-version">
          Versão TISS
          <input id="conv-version" className="gt-select" value={form.tiss_version} onChange={event => set({ tiss_version: event.target.value.trim() })} />
          <small className="fin-field-note">A que a operadora informou; hoje a ANS está na 4.03.00.</small>
        </label>
      </div>
      <fieldset className="fin-fieldset">
        <legend>Como a clínica envia a cobrança</legend>
        <div className="fin-choices">
          {SUBMISSION_CHANNELS.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={form.submission_channel === option.id} onClick={() => set({ submission_channel: option.id })}>{option.label}</button>
          ))}
        </div>
      </fieldset>
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="conv-day">
          Envio do lote até o dia
          <input id="conv-day" className="gt-select" inputMode="numeric" maxLength={2} placeholder="opcional" value={form.lot_due_day} onChange={event => set({ lot_due_day: onlyDigits(event.target.value) })} />
        </label>
        <label className="gt-field" htmlFor="conv-notes">
          Observação
          <input id="conv-notes" className="gt-select" value={form.notes} onChange={event => set({ notes: event.target.value })} />
        </label>
      </div>
      {problems.length > 0 && form.name.trim() && <p className="fin-hint fin-hint--warn">Confira {problems.join(', ')}.</p>}
      <ErrorLine error={error} />
      <div className="fin-actions">
        {convenio && (
          <button type="button" className="gt-btn" disabled={busy} onClick={toggleActive}>{convenio.active === false ? 'Ativar' : 'Desativar'}</button>
        )}
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || problems.length > 0} onClick={save}>
          {busy ? 'Salvando…' : convenio ? 'Salvar e continuar' : 'Cadastrar e continuar'}
        </button>
      </div>
    </div>
  );
}

function StepCredenciamento({ fin, convenio, markSaved }) {
  const members = payableMembers(fin.data.members).filter(member => member.has_agenda !== false);
  const membersById = new Map(members.map(member => [member.id, member]));
  const own = fin.conv.credentials.filter(row => row.convenio_id === convenio.id);
  const hasClinic = own.some(row => row.contractor_kind === 'clinic');
  const [form, setForm] = useState(() => ({ kind: hasClinic ? 'professional' : 'clinic', professional_id: '', provider_code: '', valid_from: '' }));
  const { busy, error, run } = useConvSaver(fin, markSaved);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const taken = new Set(own.filter(row => row.contractor_kind === 'professional').map(row => row.professional_id));
  const free = members.filter(member => !taken.has(member.id));
  const codeOk = PROVIDER_CODE_PATTERN.test(form.provider_code.trim());
  const valid = codeOk && (form.kind === 'clinic' ? !hasClinic : Boolean(form.professional_id));

  async function add() {
    const saved = await run(() => saveCredential({
      convenio_id: convenio.id,
      contractor_kind: form.kind,
      professional_id: form.kind === 'professional' ? form.professional_id : null,
      provider_code: form.provider_code.trim(),
      valid_from: form.valid_from || null,
    }), 'Credenciamento salvo.');
    if (saved) setForm({ kind: 'professional', professional_id: '', provider_code: '', valid_from: '' });
  }

  return (
    <div className="fin-conv-step">
      <p className="fin-dialog-text">
        Quem a operadora contratou: a clínica, pelo CNPJ, ou um profissional em nome próprio, pelo CPF. O código do prestador vem no contrato ou no e-mail de credenciamento.
      </p>
      {own.length > 0 && (
        <div className="fin-list">
          {own.map(row => (
            <div key={row.id} className={`fin-row${row.active === false ? ' fin-row--void' : ''}`}>
              <div className="fin-row-main">
                <b>{row.contractor_kind === 'clinic' ? 'A clínica (CNPJ)' : membersById.get(row.professional_id)?.full_name || 'Profissional'}</b>
                <span>Código do prestador {row.provider_code}{row.valid_from ? ` · desde ${formatDay(row.valid_from)}` : ''}{row.active === false ? ' · desativado' : ''}</span>
              </div>
              <span />
              <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => saveCredential({ id: row.id, active: !row.active }), row.active ? 'Credenciamento desativado.' : 'Credenciamento ativado.')}>
                {row.active === false ? 'Ativar' : 'Desativar'}
              </button>
            </div>
          ))}
        </div>
      )}
      <fieldset className="fin-fieldset">
        <legend>{own.length ? 'Acrescentar credenciamento' : 'Contratado'}</legend>
        <div className="fin-choices">
          <button type="button" className="fin-choice" aria-pressed={form.kind === 'clinic'} disabled={hasClinic} onClick={() => set({ kind: 'clinic' })}>A clínica (CNPJ){hasClinic ? ' · já cadastrada' : ''}</button>
          <button type="button" className="fin-choice" aria-pressed={form.kind === 'professional'} onClick={() => set({ kind: 'professional' })}>Um profissional (CPF)</button>
        </div>
      </fieldset>
      <div className="fin-grid-2">
        {form.kind === 'professional' && (
          <label className="gt-field" htmlFor="conv-cred-pro">
            Profissional
            <select id="conv-cred-pro" className="gt-select" value={form.professional_id} onChange={event => set({ professional_id: event.target.value })}>
              <option value="">Escolha</option>
              {free.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
            </select>
          </label>
        )}
        <label className="gt-field" htmlFor="conv-cred-code">
          Código do prestador na operadora
          <input id="conv-cred-code" className="gt-select" maxLength={14} value={form.provider_code} onChange={event => set({ provider_code: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="conv-cred-from">
          Credenciada desde
          <input id="conv-cred-from" type="date" className="gt-select" value={form.valid_from} onChange={event => set({ valid_from: event.target.value })} />
        </label>
      </div>
      {form.provider_code.trim() && !codeOk && <p className="fin-hint fin-hint--warn">O código tem até 14 letras ou números (pode ter ponto, barra e traço).</p>}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || !valid} onClick={add}>{busy ? 'Salvando…' : 'Salvar credenciamento'}</button>
      </div>
    </div>
  );
}

function StepPlanos({ fin, convenio, markSaved }) {
  const own = fin.conv.plans.filter(row => row.convenio_id === convenio.id);
  const [name, setName] = useState('');
  const { busy, error, run } = useConvSaver(fin, markSaved);

  async function add() {
    const saved = await run(() => savePlan({ convenio_id: convenio.id, name: name.trim() }), `Plano ${name.trim()} salvo.`);
    if (saved) setName('');
  }

  return (
    <div className="fin-conv-step">
      <p className="fin-dialog-text">Os planos que a operadora vende (ex.: Enfermaria, Apartamento). Servem para escolher no convênio do paciente; a operadora que não separa por plano pode ficar sem.</p>
      {own.length > 0 && (
        <div className="fin-list">
          {own.map(row => (
            <div key={row.id} className={`fin-row${row.active === false ? ' fin-row--void' : ''}`}>
              <div className="fin-row-main"><b>{row.name}</b>{row.active === false && <span>desativado</span>}</div>
              <span />
              <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => savePlan({ id: row.id, active: !row.active }), row.active ? `${row.name} desativado.` : `${row.name} ativado.`)}>
                {row.active === false ? 'Ativar' : 'Desativar'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="fin-inline-add">
        <label className="gt-field" htmlFor="conv-plan-name">
          Nome do plano
          <input id="conv-plan-name" className="gt-select" maxLength={60} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && name.trim()) add(); }} />
        </label>
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || !name.trim()} onClick={add}>{busy ? 'Salvando…' : 'Acrescentar plano'}</button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** Busca na tabela 22 da ANS por código ou por palavras do termo. */
function TussSearch({ onPick }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle');
  const timer = useRef(null);
  const latest = useRef('');

  useEffect(() => () => clearTimeout(timer.current), []);

  // Busca ao digitar, com uma pausa curta; resposta de busca antiga é ignorada.
  function search(value) {
    setText(value);
    clearTimeout(timer.current);
    const query = value.trim();
    latest.current = query;
    if (query.length < 3) {
      setResults([]);
      setState('idle');
      return;
    }
    setState('loading');
    timer.current = setTimeout(() => {
      searchTussProcedures(query)
        .then(found => { if (latest.current === query) { setResults(found); setState('done'); } })
        .catch(err => { if (latest.current === query) { setResults([]); setState(err.message || 'Não foi possível buscar.'); } });
    }, 250);
  }

  return (
    <div className="fin-tuss">
      <label className="gt-field" htmlFor="conv-tuss-search">
        Buscar na tabela TUSS
        <input id="conv-tuss-search" className="gt-select" placeholder="Código ou palavras, ex.: psicoterapia individual" value={text} onChange={event => search(event.target.value)} />
      </label>
      {state === 'loading' && <p className="fin-hint">Buscando…</p>}
      {state === 'done' && results.length === 0 && <p className="fin-hint">Nada achado. Tente outra palavra ou o começo do código.</p>}
      {state !== 'idle' && state !== 'loading' && state !== 'done' && <p className="fin-hint fin-hint--warn">{state}</p>}
      {results.length > 0 && (
        <ul className="fin-tuss-results">
          {results.map(row => (
            <li key={row.code}>
              <button type="button" onClick={() => { onPick(row); search(''); }}>
                <span className="fin-num">{row.code}</span>
                {row.term}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EMPTY_PRICE = { discipline: '', appointment_type: '', tuss_table: '22', tuss_code: '', tuss_term: '', price: '' };

function PriceForm({ fin, convenio, price, onDone, markSaved }) {
  const [form, setForm] = useState(() => (price ? {
    discipline: price.discipline,
    appointment_type: price.appointment_type || '',
    tuss_table: price.tuss_table || '22',
    tuss_code: price.tuss_code || '',
    tuss_term: price.tuss_term || '',
    price: centsToInput(price.price_cents),
  } : EMPTY_PRICE));
  const { busy, error, run } = useConvSaver(fin, markSaved);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const cents = parseBRLInput(form.price);
  const codeOk = form.tuss_table === '22' ? TUSS_PATTERN.test(form.tuss_code) : OWN_CODE_PATTERN.test(form.tuss_code);
  const valid = form.discipline && cents != null && codeOk && (form.tuss_table === '22' || form.tuss_term.trim());

  async function save() {
    const saved = await run(() => saveConvenioPrice({
      ...(price ? { id: price.id } : { convenio_id: convenio.id }),
      discipline: form.discipline,
      appointment_type: form.appointment_type || null,
      tuss_table: form.tuss_table,
      tuss_code: form.tuss_code,
      tuss_term: form.tuss_term.trim().slice(0, 150) || null,
      price_cents: cents,
    }), 'Preço salvo.');
    if (saved) onDone();
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="conv-price-area">
          Área
          <select id="conv-price-area" className="gt-select" value={form.discipline} onChange={event => set({ discipline: event.target.value })}>
            <option value="">Escolha</option>
            {DISCIPLINES.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="conv-price-type">
          Tipo de atendimento
          <select id="conv-price-type" className="gt-select" value={form.appointment_type} onChange={event => set({ appointment_type: event.target.value })}>
            <option value="">Todos os tipos (valor da área)</option>
            {FINANCE_APPOINTMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="fin-fieldset">
        <legend>Código do procedimento</legend>
        <div className="fin-choices">
          {TUSS_TABLES.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={form.tuss_table === option.id} onClick={() => set({ tuss_table: option.id, tuss_code: '', tuss_term: '' })}>{option.label}</button>
          ))}
        </div>
      </fieldset>
      {form.tuss_table === '22' ? (
        form.tuss_code ? (
          <p className="fin-tuss-picked">
            <span className="fin-num">{form.tuss_code}</span> {form.tuss_term}
            <button type="button" className="fin-link" onClick={() => set({ tuss_code: '', tuss_term: '' })}>Trocar</button>
          </p>
        ) : <TussSearch onPick={row => set({ tuss_code: row.code, tuss_term: row.term.slice(0, 150) })} />
      ) : (
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor="conv-price-own-code">
            Código na tabela da operadora
            <input id="conv-price-own-code" className="gt-select" maxLength={10} value={form.tuss_code} onChange={event => set({ tuss_code: event.target.value.trim() })} />
          </label>
          <label className="gt-field" htmlFor="conv-price-own-term">
            Descrição
            <input id="conv-price-own-term" className="gt-select" maxLength={150} value={form.tuss_term} onChange={event => set({ tuss_term: event.target.value })} />
          </label>
        </div>
      )}
      <label className="gt-field fin-price-value" htmlFor="conv-price-value">
        Valor que a operadora paga
        <MoneyInput id="conv-price-value" value={form.price} onChange={value => set({ price: value })} />
      </label>
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || !valid} onClick={save}>{busy ? 'Salvando…' : 'Salvar preço'}</button>
      </div>
    </div>
  );
}

function StepPrecos({ fin, convenio, markSaved }) {
  const own = fin.conv.prices.filter(row => row.convenio_id === convenio.id);
  const [editing, setEditing] = useState(null);
  const { busy, error, run } = useConvSaver(fin, markSaved);

  return (
    <div className="fin-conv-step">
      <p className="fin-dialog-text">
        Quanto a operadora paga por área e tipo de atendimento, com o código que vai na guia. Procedimento sem código TUSS (ex.: avaliação neuropsicológica) entra pela tabela própria da operadora, com o código que ela usa.
      </p>
      {own.length === 0 && !editing && <EmptyNote>Nenhum preço nesta operadora ainda.</EmptyNote>}
      {own.length > 0 && (
        <div className="fin-list">
          {own.map(row => (editing?.id === row.id ? (
            <PriceForm key={row.id} fin={fin} convenio={convenio} price={row} onDone={() => setEditing(null)} markSaved={markSaved} />
          ) : (
            <div key={row.id} className={`fin-row${row.tuss_code ? '' : ' fin-row--todo'}`}>
              <div className="fin-row-main">
                <b><AreaTag discipline={row.discipline} /> {row.appointment_type ? typeLabel(row.appointment_type) : 'todos os tipos'}</b>
                <span>{procedureCodeLabel(row)}{row.tuss_term ? ` · ${row.tuss_term}` : ''}</span>
              </div>
              <span className="fin-amount fin-num">{formatBRL(row.price_cents)}</span>
              <span className="fin-row-actions">
                <button type="button" className="gt-btn gt-btn--sm" onClick={() => setEditing(row)}>Mudar</button>
                <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => deleteConvenioPrice(row.id), 'Preço tirado.')}>Tirar</button>
              </span>
            </div>
          )))}
        </div>
      )}
      <ErrorLine error={error} />
      {editing === 'new'
        ? <PriceForm fin={fin} convenio={convenio} price={null} onDone={() => setEditing(null)} markSaved={markSaved} />
        : !editing && <button type="button" className="gt-btn" onClick={() => setEditing('new')}>+ Acrescentar preço</button>}
    </div>
  );
}

// ---------- Solicitantes ----------

const EMPTY_REQUESTER = { name: '', council_code: '06', council_number: '', council_uf: '35', cbo_code: '' };

function cboOptions(fin) {
  return fin.conv.cbos.map(row => ({ id: row.code, label: `${row.code} · ${row.term}` }));
}

function RequesterForm({ fin, requester, onDone }) {
  const [form, setForm] = useState(() => (requester ? {
    name: requester.name,
    council_code: requester.council_code,
    council_number: requester.council_number,
    council_uf: requester.council_uf,
    cbo_code: requester.cbo_code,
  } : EMPTY_REQUESTER));
  const { busy, error, run } = useConvSaver(fin);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const options = useMemo(() => cboOptions(fin), [fin]);
  const numberOk = COUNCIL_NUMBER_PATTERN.test(form.council_number.trim());
  const valid = form.name.trim() && numberOk && form.cbo_code;

  async function save() {
    const saved = await run(() => saveRequester({
      ...(requester ? { id: requester.id } : {}),
      name: form.name.trim(),
      council_code: form.council_code,
      council_number: form.council_number.trim(),
      council_uf: form.council_uf,
      cbo_code: form.cbo_code,
    }), `${form.name.trim()} salvo.`);
    if (saved) onDone();
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="req-name">
          Nome
          <input id="req-name" className="gt-select" maxLength={70} value={form.name} onChange={event => set({ name: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="req-council">
          Conselho
          <select id="req-council" className="gt-select" value={form.council_code} onChange={event => set({ council_code: event.target.value })}>
            {TISS_COUNCILS.map(row => <option key={row.code} value={row.code}>{row.label}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="req-number">
          Número no conselho
          <input id="req-number" className="gt-select" maxLength={15} value={form.council_number} onChange={event => set({ council_number: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="req-uf">
          UF do conselho
          <select id="req-uf" className="gt-select" value={form.council_uf} onChange={event => set({ council_uf: event.target.value })}>
            {TISS_UFS.map(row => <option key={row.code} value={row.code}>{row.uf} · {row.label}</option>)}
          </select>
        </label>
      </div>
      <div className="gt-field">
        <span>Ocupação (CBO)</span>
        <SearchSelect id="req-cbo" value={form.cbo_code} onChange={value => set({ cbo_code: value || '' })} options={options} allowEmpty={false} placeholder="Buscar ocupação, ex.: psiquiatra" />
      </div>
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || !valid} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  );
}

export function Solicitantes({ fin }) {
  return <ConvGate fin={fin}><SolicitantesBody fin={fin} /></ConvGate>;
}

function SolicitantesBody({ fin }) {
  const [editing, setEditing] = useState(null);
  const { busy, error, run } = useConvSaver(fin);
  const cboById = new Map(fin.conv.cbos.map(row => [row.code, row.term]));
  const { requesters } = fin.conv;

  return (
    <section className="fin-section">
      {requesters.length === 0 && editing !== 'new' && (
        <EmptyNote>Nenhum solicitante. Cadastre quem pede o tratamento de fora da clínica (médico, por exemplo), com o conselho e o CBO que vão na guia.</EmptyNote>
      )}
      {editing === 'new' && <RequesterForm fin={fin} requester={null} onDone={() => setEditing(null)} />}
      <div className="fin-list">
        {requesters.map(row => (editing?.id === row.id ? (
          <RequesterForm key={row.id} fin={fin} requester={row} onDone={() => setEditing(null)} />
        ) : (
          <div key={row.id} className={`fin-row${row.active === false ? ' fin-row--void' : ''}`}>
            <div className="fin-row-main">
              <b>{row.name}</b>
              <span>{councilShort(row.council_code)} {row.council_number} {ufSigla(row.council_uf)} · {cboById.get(row.cbo_code) || `CBO ${row.cbo_code}`}{row.active === false ? ' · desativado' : ''}</span>
            </div>
            <span />
            <span className="fin-row-actions">
              <button type="button" className="gt-btn gt-btn--sm" onClick={() => setEditing(row)}>Mudar</button>
              <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => saveRequester({ id: row.id, active: !row.active }), row.active ? `${row.name} desativado.` : `${row.name} ativado.`)}>
                {row.active === false ? 'Ativar' : 'Desativar'}
              </button>
            </span>
          </div>
        )))}
      </div>
      <ErrorLine error={error} />
      {editing !== 'new' && <button type="button" className="gt-btn" onClick={() => setEditing('new')}>+ Cadastrar solicitante</button>}
    </section>
  );
}

// ---------- Dados para faturamento ----------

function ClinicBillingCard({ fin }) {
  const clinic = fin.conv.clinic;
  const [cnes, setCnes] = useState(clinic?.cnes || '');
  const { busy, error, run } = useConvSaver(fin);
  const digits = onlyDigits(cnes);
  const invalid = digits && !CNES_PATTERN.test(digits);
  if (!clinic) return null;

  return (
    <div className="fin-card">
      <h3>{clinic.name}</h3>
      <div className="fin-grid-2">
        <div className="gt-field">
          <span>CNPJ da clínica</span>
          <b className="fin-num">{clinic.cnpj || 'Sem CNPJ'}</b>
          <small className="fin-field-note">Muda em Gestão → Configurações → Instituição.</small>
        </div>
        <label className="gt-field" htmlFor="conv-cnes">
          CNES
          <input id="conv-cnes" className="gt-select" inputMode="numeric" maxLength={7} placeholder={`sem CNES vai ${CNES_NONE}`} value={cnes} onChange={event => setCnes(onlyDigits(event.target.value))} />
          <small className="fin-field-note">Cadastro Nacional de Estabelecimentos de Saúde. Sem ele, a guia leva {CNES_NONE}, como manda a ANS.</small>
        </label>
      </div>
      {invalid && <p className="fin-hint fin-hint--warn">O CNES tem 7 números.</p>}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || invalid || digits === (clinic.cnes || '')} onClick={() => run(() => saveClinicCnes(clinic.id, digits), digits ? 'CNES salvo.' : 'CNES tirado.')}>
          {busy ? 'Salvando…' : 'Salvar CNES'}
        </button>
      </div>
    </div>
  );
}

function BillingForm({ fin, member, info, onDone }) {
  const profession = member.profession || '';
  const [form, setForm] = useState(() => ({
    cpf: info?.cpf ? formatCpf(info.cpf) : '',
    council_code: info?.council_code || COUNCIL_BY_PROFESSION[profession] || '',
    council_number: info?.council_number || '',
    council_uf: info?.council_uf || '35',
    cbo_code: info?.cbo_code || CBO_BY_PROFESSION[profession] || '',
  }));
  const { busy, error, run } = useConvSaver(fin);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const options = useMemo(() => cboOptions(fin), [fin]);
  const cpfBad = form.cpf && !isValidCpf(form.cpf);
  const numberBad = form.council_number.trim() && !COUNCIL_NUMBER_PATTERN.test(form.council_number.trim());
  const suggested = !info && (COUNCIL_BY_PROFESSION[profession] || CBO_BY_PROFESSION[profession]);

  async function save() {
    const saved = await run(() => saveProfessionalBilling(member.id, form), `Dados de ${member.full_name} salvos.`);
    if (saved) onDone();
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="bill-cpf">
          CPF
          <input id="bill-cpf" className="gt-select" inputMode="numeric" maxLength={14} value={form.cpf} onChange={event => set({ cpf: event.target.value })} onBlur={() => form.cpf && set({ cpf: formatCpf(form.cpf) })} />
        </label>
        <label className="gt-field" htmlFor="bill-council">
          Conselho
          <select id="bill-council" className="gt-select" value={form.council_code} onChange={event => set({ council_code: event.target.value })}>
            <option value="">Escolha</option>
            {TISS_COUNCILS.map(row => <option key={row.code} value={row.code}>{row.label}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="bill-number">
          Número no conselho
          <input id="bill-number" className="gt-select" maxLength={15} placeholder={member.professional_registration || ''} value={form.council_number} onChange={event => set({ council_number: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="bill-uf">
          UF do conselho
          <select id="bill-uf" className="gt-select" value={form.council_uf} onChange={event => set({ council_uf: event.target.value })}>
            {TISS_UFS.map(row => <option key={row.code} value={row.code}>{row.uf} · {row.label}</option>)}
          </select>
        </label>
      </div>
      <div className="gt-field">
        <span>Ocupação (CBO)</span>
        <SearchSelect id="bill-cbo" value={form.cbo_code} onChange={value => set({ cbo_code: value || '' })} options={options} allowEmpty={false} placeholder="Buscar ocupação, ex.: psicólogo clínico" />
      </div>
      {suggested && <p className="fin-hint">Conselho e CBO sugeridos pela profissão do cadastro ({getProfession(profession).label}). Confira antes de salvar.</p>}
      {cpfBad && <p className="fin-hint fin-hint--warn">Os dois últimos números do CPF não conferem.</p>}
      {numberBad && <p className="fin-hint fin-hint--warn">O número do conselho tem até 15 letras ou números.</p>}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || cpfBad || numberBad} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  );
}

export function Faturamento({ fin }) {
  return <ConvGate fin={fin}><FaturamentoBody fin={fin} /></ConvGate>;
}

function FaturamentoBody({ fin }) {
  const [editing, setEditing] = useState('');
  const members = payableMembers(fin.data.members).filter(member => member.has_agenda !== false);
  const billingById = new Map(fin.conv.billing.map(row => [row.professional_id, row]));
  const cboById = new Map(fin.conv.cbos.map(row => [row.code, row.term]));

  return (
    <section className="fin-section">
      <ClinicBillingCard fin={fin} />
      <h3 className="fin-subtitle">Quem atende</h3>
      {members.length === 0 && <EmptyNote>Ninguém atendendo na Agenda ainda.</EmptyNote>}
      <div className="fin-list">
        {members.map(member => {
          const info = billingById.get(member.id) || null;
          if (editing === member.id) {
            return (
              <div key={member.id} className="fin-group">
                <div className="fin-group-head"><div className="fin-row-main"><b>{member.full_name}</b><span>{(member.disciplines || []).map(id => getDiscipline(id)?.label).filter(Boolean).join(', ')}</span></div></div>
                <BillingForm fin={fin} member={member} info={info} onDone={() => setEditing('')} />
              </div>
            );
          }
          const missing = professionalBillingMissing(info);
          return (
            <div key={member.id} className={`fin-row${missing.length ? ' fin-row--todo' : ''}`}>
              <div className="fin-row-main">
                <b>{member.full_name}</b>
                <span>
                  {info?.council_code ? `${councilShort(info.council_code)} ${info.council_number || ''} ${ufSigla(info.council_uf)}` : 'Sem conselho'}
                  {info?.cbo_code ? ` · ${cboById.get(info.cbo_code) || `CBO ${info.cbo_code}`}` : ''}
                </span>
              </div>
              <span className={`fin-pill ${missing.length ? 'fin-pill--warn' : 'fin-pill--ok'}`}>{missing.length ? `Falta ${missing.join(', ')}` : 'Completo'}</span>
              <button type="button" className={`gt-btn gt-btn--sm${missing.length ? ' gt-btn--primary' : ''}`} onClick={() => setEditing(member.id)}>{info ? 'Mudar' : 'Preencher'}</button>
            </div>
          );
        })}
      </div>
      <p className="fin-hint">CPF e conselho de quem atende vão na guia como executante. Só a administração vê estes dados.</p>
    </section>
  );
}
