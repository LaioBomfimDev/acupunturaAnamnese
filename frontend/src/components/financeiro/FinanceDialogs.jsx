import { useId, useMemo, useState } from 'react';
import { DismissPrompt } from '../ui/DismissPrompt';
import { SearchSelect } from '../ui/SearchSelect';
import { useDismiss } from '../../hooks/useDismiss';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import {
  adjustCharge,
  registerExpense,
  sellPackage,
} from '../../services/financeiroService';
import {
  FINANCE_APPOINTMENT_TYPES,
  PAYMENT_PLANS,
  addDays,
  centsToInput,
  formatBRL,
  formatShortDay,
  packageSizeInfo,
  parseBRLInput,
  resolvePrice,
  splitInstallments,
} from '../../utils/finance';
import { MethodPicker, MoneyInput } from './FinanceFields';

// ============================================================
// Janelas do Financeiro. Todas fecham com Esc, clique fora e ×
// (hooks/useDismiss); formulário com algo digitado pergunta antes de
// descartar, e "salvando" segura a janela aberta.
// ============================================================

function DialogShell({ title, onClose, busy, guard = true, children, footer }) {
  const titleId = useId();
  const dismiss = useDismiss({ onClose, busy, guardUnsaved: guard });
  return (
    <div className="fin-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} {...dismiss.backdropProps}>
      <div className="fin-dialog" {...dismiss.panelProps}>
        <header className="fin-dialog-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="fin-dialog-close" aria-label="Fechar" onClick={onClose} disabled={busy}>×</button>
        </header>
        <DismissPrompt dismiss={dismiss} />
        <div className="fin-dialog-body">{children}</div>
        <footer className="fin-dialog-foot">{footer}</footer>
      </div>
    </div>
  );
}

/** Anular com motivo: recebimento, saída ou venda de pacote. */
export function VoidDialog({ title, description, confirmLabel = 'Anular', onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = reason.trim().length >= 3;

  async function confirm() {
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err.message || 'Não foi possível anular.');
      setBusy(false);
    }
  }

  return (
    <DialogShell
      title={title}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--danger-solid" onClick={confirm} disabled={!valid || busy}>
            {busy ? 'Anulando…' : confirmLabel}
          </button>
        </>
      )}
    >
      <p className="fin-dialog-text">{description}</p>
      <label className="gt-field" htmlFor="fin-void-reason">
        Motivo (fica guardado com o lançamento)
        <textarea id="fin-void-reason" className="gt-select" rows={3} value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      <p className="fin-hint">Nada se apaga: o lançamento fica riscado, fora das contas, com quem anulou e quando.</p>
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </DialogShell>
  );
}

/** Mudar (ou definir) o valor de um atendimento avulso, com motivo. */
export function AdjustDialog({ fin, charge, paidCents = 0, onClose }) {
  const [value, setValue] = useState(centsToInput(charge.price_cents));
  const [reason, setReason] = useState(charge.price_cents == null ? 'Sem valor na tabela' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cents = parseBRLInput(value);
  const valid = cents != null && cents >= paidCents && reason.trim().length >= 3;

  async function save() {
    setBusy(true);
    setError('');
    try {
      await adjustCharge(charge.id, cents, reason.trim());
      fin.notify(`Valor do atendimento salvo: ${formatBRL(cents)}.`);
      fin.reload();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <DialogShell
      title={charge.price_cents == null ? 'Definir valor' : 'Mudar valor'}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar valor'}</button>
        </>
      )}
    >
      <label className="gt-field" htmlFor="fin-adjust-value">
        Valor deste atendimento
        <MoneyInput id="fin-adjust-value" value={value} onChange={setValue} />
      </label>
      {paidCents > 0 && <p className="fin-hint">Já foi pago {formatBRL(paidCents)}: o valor não fica abaixo disso.</p>}
      <label className="gt-field" htmlFor="fin-adjust-reason">
        Motivo
        <input id="fin-adjust-reason" className="gt-select" value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: desconto combinado" />
      </label>
      <p className="fin-hint">Muda só este atendimento. A tabela de valores continua igual.</p>
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </DialogShell>
  );
}

/** Vender pacote para um paciente. */
export function SellPackageDialog({ fin, onClose, initialPatientId = '' }) {
  const models = fin.data.models.filter(row => row.active);
  const [patientId, setPatientId] = useState(initialPatientId);
  const [modelId, setModelId] = useState('');
  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [kind, setKind] = useState('counted');
  const [sessions, setSessions] = useState('10');
  const [sessionsMax, setSessionsMax] = useState(null);
  const [total, setTotal] = useState('');
  const [types, setTypes] = useState([]);
  const [plan, setPlan] = useState('upfront');
  const [installments, setInstallments] = useState('2');
  const [maxInstallments, setMaxInstallments] = useState(12);
  const [allowPerSession, setAllowPerSession] = useState(true);
  const [firstDue, setFirstDue] = useState(fin.today);
  const [overPlan, setOverPlan] = useState('free');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const patientOptions = useMemo(() => fin.data.patients
    .map(row => ({ id: row.id, label: row.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [fin.data.patients]);
  const areaProfessionals = fin.data.members.filter(member => member.is_active !== false
    && member.has_agenda !== false && (member.disciplines || []).includes(discipline));

  function applyModel(id) {
    setModelId(id);
    const model = models.find(row => row.id === id);
    if (!model) return;
    setName(model.name);
    setDiscipline(model.discipline);
    setKind(model.kind);
    setSessions(String(model.sessions));
    setSessionsMax(model.sessions_max);
    setTotal(centsToInput(model.total_cents));
    setTypes(model.appointment_types || []);
    setMaxInstallments(model.max_installments);
    setAllowPerSession(model.allow_per_session);
    setOverPlan(model.over_plan);
    if (model.max_installments < 2 && plan === 'installments') setPlan('upfront');
    if (!model.allow_per_session && plan === 'per_session') setPlan('upfront');
  }

  const totalCents = parseBRLInput(total);
  const sessionCount = Number.parseInt(sessions, 10);
  const installmentCount = plan === 'installments' ? Number.parseInt(installments, 10) : 1;
  const single = discipline ? resolvePrice(fin.data.prices, { discipline, type: types[0] || 'session', professionalId: professionalId || null }).cents : null;
  const info = totalCents && sessionCount > 0 ? packageSizeInfo({ totalCents, sessions: sessionCount, singleCents: single }) : null;
  const parts = totalCents && plan !== 'per_session' && installmentCount >= 1 ? splitInstallments(totalCents, installmentCount) : [];
  const valid = patientId && name.trim() && discipline && totalCents > 0 && sessionCount >= 1 && sessionCount <= 100
    && (plan !== 'installments' || (installmentCount >= 2 && installmentCount <= maxInstallments));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await sellPackage({
        patientId,
        modelId: modelId || null,
        name: name.trim(),
        discipline,
        professionalId: professionalId || null,
        kind,
        sessions: sessionCount,
        totalCents,
        appointmentTypes: types,
        paymentPlan: plan,
        installments: installmentCount,
        firstDue: plan === 'per_session' ? null : firstDue,
        overPlan,
        note,
      });
      fin.notify(`Pacote vendido: ${name.trim()}, ${formatBRL(totalCents)}.`);
      fin.reload();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <DialogShell
      title="Vender pacote"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>{busy ? 'Salvando…' : 'Vender pacote'}</button>
        </>
      )}
    >
      <label className="gt-field" htmlFor="fin-sell-patient">
        Paciente
        <SearchSelect id="fin-sell-patient" value={patientId} onChange={setPatientId} options={patientOptions} allowEmpty={false} placeholder="Buscar paciente pelo nome" />
      </label>
      {models.length > 0 && (
        <label className="gt-field" htmlFor="fin-sell-model">
          Modelo de pacote
          <select id="fin-sell-model" className="gt-select" value={modelId} onChange={event => applyModel(event.target.value)}>
            <option value="">Sem modelo (preencher aqui)</option>
            {models.map(row => (
              <option key={row.id} value={row.id}>{getDiscipline(row.discipline)?.label} · {row.name} · {formatBRL(row.total_cents)}</option>
            ))}
          </select>
        </label>
      )}
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="fin-sell-name">
          Nome do pacote
          <input id="fin-sell-name" className="gt-select" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Pacote de 10 sessões" />
        </label>
        <label className="gt-field" htmlFor="fin-sell-area">
          Área
          <select id="fin-sell-area" className="gt-select" value={discipline} onChange={event => { setDiscipline(event.target.value); setProfessionalId(''); }}>
            <option value="">Escolher</option>
            {DISCIPLINES.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-sell-kind">
          Tipo
          <select id="fin-sell-kind" className="gt-select" value={kind} onChange={event => setKind(event.target.value)}>
            <option value="counted">Sessões contadas</option>
            <option value="closed">Valor fechado (sessões previstas)</option>
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-sell-sessions">
          {kind === 'closed' ? 'Sessões previstas' : 'Sessões'}
          <input id="fin-sell-sessions" className="gt-select" inputMode="numeric" value={sessions} onChange={event => setSessions(event.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="gt-field" htmlFor="fin-sell-total">
          Valor total
          <MoneyInput id="fin-sell-total" value={total} onChange={setTotal} />
        </label>
        <label className="gt-field" htmlFor="fin-sell-professional">
          Profissional
          <select id="fin-sell-professional" className="gt-select" value={professionalId} onChange={event => setProfessionalId(event.target.value)} disabled={!discipline}>
            <option value="">Qualquer profissional da área</option>
            {areaProfessionals.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
      </div>
      {kind === 'closed' && sessionsMax && <p className="fin-hint">O modelo prevê de {sessions} a {sessionsMax} sessões. A previsão muda depois, no próprio pacote.</p>}
      {info && (
        <p className="fin-hint">
          {kind === 'closed' ? 'Começa em ' : ''}{formatBRL(info.perSession)} por sessão
          {info.discountPercent != null && info.discountPercent > 0 ? ` · ${info.discountPercent}% abaixo do avulso (${formatBRL(single)})` : ''}.
        </p>
      )}

      <fieldset className="fin-fieldset">
        <legend>Que atendimentos gastam o pacote</legend>
        <div className="fin-choices">
          {FINANCE_APPOINTMENT_TYPES.map(type => (
            <button
              key={type.id}
              type="button"
              className="fin-choice"
              aria-pressed={types.includes(type.id)}
              onClick={() => setTypes(current => (current.includes(type.id) ? current.filter(id => id !== type.id) : [...current, type.id]))}
            >
              {type.label}
            </button>
          ))}
        </div>
        <p className="fin-hint">{types.length ? 'Só os tipos marcados.' : 'Nenhum marcado: qualquer atendimento da área gasta o pacote.'}</p>
      </fieldset>

      <fieldset className="fin-fieldset">
        <legend>Como o paciente vai pagar</legend>
        <div className="fin-choices">
          {PAYMENT_PLANS.map(option => {
            const disabled = (option.id === 'installments' && maxInstallments < 2) || (option.id === 'per_session' && !allowPerSession);
            return (
              <button key={option.id} type="button" className="fin-choice" aria-pressed={plan === option.id} disabled={disabled} onClick={() => setPlan(option.id)}>
                {option.label}
              </button>
            );
          })}
        </div>
        {plan === 'installments' && (
          <label className="gt-field" htmlFor="fin-sell-installments">
            Em quantas vezes (até {maxInstallments})
            <input id="fin-sell-installments" className="gt-select" inputMode="numeric" value={installments} onChange={event => setInstallments(event.target.value.replace(/\D/g, ''))} />
          </label>
        )}
        {plan !== 'per_session' && (
          <label className="gt-field" htmlFor="fin-sell-first">
            {plan === 'installments' ? 'Primeira parcela vence em' : 'Vence em'}
            <input id="fin-sell-first" type="date" className="gt-select" value={firstDue} onChange={event => setFirstDue(event.target.value)} />
          </label>
        )}
        {parts.length > 1 && (
          <p className="fin-hint">
            {parts.map((cents, index) => `${index + 1}ª ${formatBRL(cents)} em ${formatShortDay(addMonths(firstDue, index))}`).join(' · ')}
          </p>
        )}
        {plan === 'per_session' && (
          <p className="fin-hint">Cada sessão feita cobra a parte dela: o que falta do valor ÷ as sessões que faltam.</p>
        )}
      </fieldset>

      {kind === 'closed' && (
        <fieldset className="fin-fieldset">
          <legend>Se passar do previsto</legend>
          <div className="fin-choices">
            <button type="button" className="fin-choice" aria-pressed={overPlan === 'free'} onClick={() => setOverPlan('free')}>Não cobra (valor fechado)</button>
            <button type="button" className="fin-choice" aria-pressed={overPlan === 'single'} onClick={() => setOverPlan('single')}>Cobra como avulso</button>
          </div>
        </fieldset>
      )}

      <label className="gt-field" htmlFor="fin-sell-note">
        Observação (opcional)
        <input id="fin-sell-note" className="gt-select" value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <p className="fin-hint">Sessão desta área já atendida hoje e ainda não paga entra no pacote.</p>
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </DialogShell>
  );
}

function addMonths(day, amount) {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}

/** Lançar saída avulsa: já paga ou a pagar. */
export function ExpenseDialog({ fin, onClose, preset = null }) {
  const categories = fin.data.categories.filter(row => row.active);
  const [categoryId, setCategoryId] = useState(preset?.categoryId || categories[0]?.id || '');
  const [description, setDescription] = useState(preset?.description || '');
  const [payee, setPayee] = useState(preset?.professionalId ? `p:${preset.professionalId}` : preset?.personId ? `x:${preset.personId}` : '');
  const [amount, setAmount] = useState(preset?.amountCents ? centsToInput(preset.amountCents) : '');
  const [paidNow, setPaidNow] = useState(true);
  const [paidOn, setPaidOn] = useState(fin.today);
  const [dueOn, setDueOn] = useState(addDays(fin.today, 7));
  const [method, setMethod] = useState('pix');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cents = parseBRLInput(amount);
  const valid = categoryId && description.trim() && cents > 0 && (paidNow ? paidOn && paidOn <= fin.today && method : dueOn);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await registerExpense({
        categoryId,
        description: description.trim(),
        amountCents: cents,
        paidOn: paidNow ? paidOn : null,
        method,
        dueOn: paidNow ? null : dueOn,
        professionalId: payee.startsWith('p:') ? payee.slice(2) : null,
        personId: payee.startsWith('x:') ? payee.slice(2) : null,
        note,
      });
      fin.notify(paidNow ? `Saída lançada: ${formatBRL(cents)}.` : `Conta a pagar lançada para ${formatShortDay(dueOn)}.`);
      fin.reload();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <DialogShell
      title={preset?.title || 'Lançar saída'}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>{busy ? 'Salvando…' : 'Lançar'}</button>
        </>
      )}
    >
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="fin-exp-category">
          Categoria
          <select id="fin-exp-category" className="gt-select" value={categoryId} onChange={event => setCategoryId(event.target.value)}>
            {categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-exp-amount">
          Valor
          <MoneyInput id="fin-exp-amount" value={amount} onChange={setAmount} />
        </label>
      </div>
      <label className="gt-field" htmlFor="fin-exp-description">
        Descrição
        <input id="fin-exp-description" className="gt-select" value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Conserto do ar-condicionado" />
      </label>
      <label className="gt-field" htmlFor="fin-exp-payee">
        Para quem (opcional)
        <select id="fin-exp-payee" className="gt-select" value={payee} onChange={event => setPayee(event.target.value)}>
          <option value="">Ninguém da lista</option>
          <optgroup label="Equipe">
            {fin.data.members.filter(member => member.is_active !== false).map(member => <option key={member.id} value={`p:${member.id}`}>{member.full_name}</option>)}
          </optgroup>
          {fin.data.people.some(row => row.active) && (
            <optgroup label="Pessoas sem login">
              {fin.data.people.filter(row => row.active).map(row => <option key={row.id} value={`x:${row.id}`}>{row.name}{row.role_label ? ` · ${row.role_label}` : ''}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <div className="fin-choices" role="group" aria-label="Situação">
        <button type="button" className="fin-choice" aria-pressed={paidNow} onClick={() => setPaidNow(true)}>Já foi paga</button>
        <button type="button" className="fin-choice" aria-pressed={!paidNow} onClick={() => setPaidNow(false)}>A pagar</button>
      </div>
      {paidNow ? (
        <>
          <label className="gt-field" htmlFor="fin-exp-paid">
            Paga em
            <input id="fin-exp-paid" type="date" className="gt-select" value={paidOn} max={fin.today} onChange={event => setPaidOn(event.target.value)} />
          </label>
          <MethodPicker value={method} onChange={setMethod} />
        </>
      ) : (
        <label className="gt-field" htmlFor="fin-exp-due">
          Vence em
          <input id="fin-exp-due" type="date" className="gt-select" value={dueOn} onChange={event => setDueOn(event.target.value)} />
        </label>
      )}
      <label className="gt-field" htmlFor="fin-exp-note">
        Observação (opcional)
        <input id="fin-exp-note" className="gt-select" value={note} onChange={event => setNote(event.target.value)} />
      </label>
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </DialogShell>
  );
}
