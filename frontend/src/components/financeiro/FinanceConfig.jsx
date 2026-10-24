import { useState } from 'react';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import {
  deletePackageModel,
  saveCategory,
  saveFinanceSettings,
  savePackageModel,
  savePayoutRules,
  savePerson,
  savePrices,
  saveRecurring,
} from '../../services/financeiroService';
import {
  FINANCE_APPOINTMENT_TYPES,
  PAYOUT_BASIS,
  PAYOUT_MODES,
  RECURRING_FREQUENCIES,
  WEEKDAYS,
  baseRuleOf,
  centsToInput,
  describeRecurring,
  describeRule,
  formatBRL,
  formatDay,
  labelOf,
  packageSizeInfo,
  parseBRLInput,
  payableMembers,
  resolvePrice,
  simulateClosedPackage,
  typeLabel,
} from '../../utils/finance';
import { AreaTag, EmptyNote, MoneyInput } from './FinanceFields';

// ============================================================
// Configuração do Financeiro: começo das contas, valores, modelos de
// pacote, como cada um recebe e saídas fixas. Mudança aqui vale para o
// que acontecer depois: o valor de atendimento já feito fica gravado.
// ============================================================

function useSaver(fin) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action, message, after) {
    setBusy(true);
    setError('');
    try {
      await action();
      fin.notify(message);
      fin.reload();
      after?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function ErrorLine({ error }) {
  return error ? <p className="gt-notice gt-notice-error" role="alert">{error}</p> : null;
}

/** Primeira vez: a partir de quando conta e quando o repasse conta. */
export function StartCard({ fin, onDone = null }) {
  const settings = fin.data.settings;
  const [startsOn, setStartsOn] = useState(settings?.starts_on || fin.today);
  const [basis, setBasis] = useState(settings?.payout_basis || 'on_payment');
  const { busy, error, run } = useSaver(fin);

  return (
    <section className="fin-card fin-start" aria-label="Começo das contas">
      <h3>{settings ? 'Começo das contas' : 'Antes de começar'}</h3>
      <p>
        A partir de quando o financeiro conta? Atendimento feito antes dessa data não vira “a receber”.
        Depois de salvar, todo atendimento que virar Atendido ganha o valor da tabela na hora.
      </p>
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="fin-start-date">
          Começar a contar a partir de
          <input id="fin-start-date" type="date" className="gt-select" value={startsOn} onChange={event => setStartsOn(event.target.value)} />
        </label>
        <fieldset className="fin-fieldset">
          <legend>Quando o repasse do profissional passa a contar</legend>
          <div className="fin-choices">
            {PAYOUT_BASIS.map(option => (
              <button key={option.id} type="button" className="fin-choice" aria-pressed={basis === option.id} onClick={() => setBasis(option.id)}>{option.label}</button>
            ))}
          </div>
        </fieldset>
      </div>
      {settings && startsOn > settings.starts_on && (
        <p className="fin-hint fin-hint--warn">Data mais tarde: atendimento avulso antes dela e ainda não pago sai de “A receber”.</p>
      )}
      <ErrorLine error={error} />
      <div className="fin-actions">
        {onDone && <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Fechar</button>}
        <button
          type="button"
          className="gt-btn gt-btn--primary"
          disabled={busy || !startsOn}
          onClick={() => run(() => saveFinanceSettings({ startsOn, payoutBasis: basis }), settings ? 'Começo das contas salvo.' : `Financeiro contando a partir de ${formatDay(startsOn)}.`, onDone)}
        >
          {busy ? 'Salvando…' : settings ? 'Salvar' : 'Começar a contar'}
        </button>
      </div>
    </section>
  );
}

function SettingsStrip({ fin }) {
  const [open, setOpen] = useState(false);
  const settings = fin.data.settings;
  if (!settings) return null;
  if (open) return <StartCard fin={fin} onDone={() => setOpen(false)} />;
  return (
    <p className="fin-strip">
      Contando desde <b>{formatDay(settings.starts_on)}</b> · repasse {labelOf(PAYOUT_BASIS, settings.payout_basis).toLocaleLowerCase('pt-BR')}
      <button type="button" className="fin-link" onClick={() => setOpen(true)}>Mudar</button>
    </p>
  );
}

// ---------- Valores dos atendimentos ----------

const DEFAULT_ROW = { id: '', label: 'Valor padrão da área' };

function priceKey(discipline, type) {
  return `${discipline}:${type || ''}`;
}

function PriceGrid({ fin, professional }) {
  const scopeId = professional?.id || null;
  const areas = professional
    ? DISCIPLINES.filter(area => (professional.disciplines || []).includes(area.id))
    : DISCIPLINES;
  const own = fin.data.prices.filter(row => (row.professional_id || null) === scopeId);
  const [cells, setCells] = useState(() => Object.fromEntries(own.map(row => [priceKey(row.discipline, row.appointment_type), centsToInput(row.price_cents)])));
  // Celular e tablet: uma área por vez (o CSS esconde as outras colunas).
  const [mobileArea, setMobileArea] = useState(areas[0]?.id || '');
  const otherArea = id => (areas.length > 1 && id !== mobileArea ? 'is-other-area' : undefined);
  const { busy, error, run } = useSaver(fin);
  const others = fin.data.prices.filter(row => (row.professional_id || null) !== scopeId);

  const rows = [DEFAULT_ROW, ...FINANCE_APPOINTMENT_TYPES];
  const invalid = Object.entries(cells).filter(([, text]) => text.trim() && parseBRLInput(text) == null).map(([key]) => key);
  const original = Object.fromEntries(own.map(row => [priceKey(row.discipline, row.appointment_type), centsToInput(row.price_cents)]));
  const dirty = JSON.stringify(Object.fromEntries(Object.entries(cells).filter(([, value]) => value.trim()))) !== JSON.stringify(original);

  function inherited(discipline, type) {
    // O que valeria sem esta célula: o resto da tabela, sem ela.
    const withoutCell = [
      ...others,
      ...Object.entries(cells)
        .filter(([key, text]) => key !== priceKey(discipline, type) && parseBRLInput(text) != null)
        .map(([key, text]) => {
          const [area, rowType] = key.split(':');
          return { discipline: area, appointment_type: rowType || null, professional_id: scopeId, price_cents: parseBRLInput(text) };
        }),
    ];
    return resolvePrice(withoutCell, { discipline, type: type || '__padrao__', professionalId: professional?.id || '__ninguem__' });
  }

  function save() {
    const payload = Object.entries(cells)
      .filter(([, text]) => text.trim())
      .map(([key, text]) => {
        const [discipline, type] = key.split(':');
        return { discipline, appointmentType: type || null, priceCents: parseBRLInput(text) };
      });
    run(() => savePrices(scopeId, payload), professional ? `Valores de ${professional.full_name} salvos.` : 'Valores da instituição salvos.');
  }

  if (professional && areas.length === 0) {
    return <EmptyNote>{professional.full_name} não tem área liberada no cadastro.</EmptyNote>;
  }

  return (
    <div className="fin-card">
      {areas.length > 1 && (
        <div className="fin-choices fin-area-pick" role="group" aria-label="Área">
          {areas.map(area => (
            <button key={area.id} type="button" className="fin-choice" aria-pressed={mobileArea === area.id} onClick={() => setMobileArea(area.id)}>{area.label}</button>
          ))}
        </div>
      )}
      <div className="fin-table-scroll">
        <table className="fin-table fin-prices">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              {areas.map(area => <th key={area.id} scope="col" className={otherArea(area.id)}><AreaTag discipline={area.id} /></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id || 'padrao'}>
                <th scope="row">{row.label}</th>
                {areas.map(area => {
                  const key = priceKey(area.id, row.id);
                  const text = cells[key] ?? '';
                  const fallback = inherited(area.id, row.id || null);
                  const placeholder = fallback.cents == null
                    ? (row.id ? 'padrão' : 'sem valor')
                    : `${fallback.source?.startsWith('inst') && professional ? 'instituição' : 'padrão'} ${formatBRL(fallback.cents)}`;
                  return (
                    <td key={area.id} className={otherArea(area.id)}>
                      <span className={`fin-cell${text.trim() ? ' fin-cell--set' : ''}${professional && text.trim() ? ' fin-cell--own' : ''}${invalid.includes(key) ? ' fin-cell--invalid' : ''}`}>
                        <MoneyInput
                          id={`fin-price-${scopeId || 'inst'}-${key}`}
                          value={text}
                          placeholder={placeholder}
                          ariaLabel={`${row.label}, ${area.label}`}
                          onChange={value => setCells(current => ({ ...current, [key]: value }))}
                        />
                      </span>
                      {text.trim() && parseBRLInput(text) === 0 && <small className="fin-cell-note">não cobra</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fin-hint">
        Campo vazio usa o valor padrão da área{professional ? ' (o da pessoa, se tiver; senão, o da instituição)' : ''}. R$ 0 quer dizer que aquele tipo não é cobrado.
        {professional ? ' Preencha só o que é diferente da instituição.' : ''} Valor novo vale para os atendimentos que virarem Atendido daqui para frente.
      </p>
      {invalid.length > 0 && <p className="fin-hint fin-hint--warn">Algum valor não está no formato certo (ex.: 150 ou 133,33).</p>}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn gt-btn--primary" disabled={busy || invalid.length > 0 || !dirty} onClick={save}>
          {busy ? 'Salvando…' : 'Salvar valores'}
        </button>
      </div>
    </div>
  );
}

export function ValoresConfig({ fin }) {
  const [scope, setScope] = useState('');
  const attending = payableMembers(fin.data.members).filter(member => member.has_agenda !== false);
  const professional = attending.find(member => member.id === scope) || null;
  const withOwn = new Set(fin.data.prices.filter(row => row.professional_id).map(row => row.professional_id));

  return (
    <section className="fin-section">
      <SettingsStrip fin={fin} />
      <div className="fin-choices" role="group" aria-label="De quem são os valores">
        <button type="button" className="fin-choice" aria-pressed={!scope} onClick={() => setScope('')}>Valores da instituição</button>
        {attending.map(member => (
          <button key={member.id} type="button" className="fin-choice" aria-pressed={scope === member.id} onClick={() => setScope(member.id)}>
            {member.full_name}{withOwn.has(member.id) ? ' · próprio' : ''}
          </button>
        ))}
      </div>
      <PriceGrid key={scope || 'inst'} fin={fin} professional={professional} />
    </section>
  );
}

// ---------- Modelos de pacote ----------

const EMPTY_MODEL = {
  name: '',
  discipline: '',
  kind: 'counted',
  sessions: '10',
  sessions_max: '',
  total: '',
  appointment_types: [],
  max_installments: '3',
  allow_per_session: true,
  over_plan: 'free',
  active: true,
};

function ModelForm({ fin, model, onDone }) {
  const [form, setForm] = useState(() => (model ? {
    ...model,
    sessions: String(model.sessions),
    sessions_max: model.sessions_max ? String(model.sessions_max) : '',
    total: centsToInput(model.total_cents),
    max_installments: String(model.max_installments),
  } : EMPTY_MODEL));
  const { busy, error, run } = useSaver(fin);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const totalCents = parseBRLInput(form.total);
  const sessions = Number.parseInt(form.sessions, 10);
  const sessionsMax = form.kind === 'closed' && form.sessions_max ? Number.parseInt(form.sessions_max, 10) : null;
  const name = form.name.trim() || (form.kind === 'counted' && sessions ? `Pacote de ${sessions} sessões` : '');
  const maxInstallments = Number.parseInt(form.max_installments, 10);
  const valid = form.discipline && name && totalCents > 0 && sessions >= 1 && sessions <= 100
    && (!sessionsMax || sessionsMax >= sessions) && maxInstallments >= 1 && maxInstallments <= 24;
  const single = form.discipline ? resolvePrice(fin.data.prices.filter(row => !row.professional_id), { discipline: form.discipline, type: form.appointment_types[0] || 'session' }).cents : null;
  const info = totalCents && sessions ? packageSizeInfo({ totalCents, sessions, singleCents: single }) : null;

  function save() {
    const row = {
      ...(model?.id ? { id: model.id } : {}),
      name,
      discipline: form.discipline,
      kind: form.kind,
      sessions,
      sessions_max: sessionsMax,
      total_cents: totalCents,
      appointment_types: form.appointment_types,
      max_installments: maxInstallments,
      allow_per_session: form.allow_per_session,
      over_plan: form.over_plan,
      active: form.active,
    };
    run(() => savePackageModel(row), `Pacote salvo: ${name}.`, onDone);
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-grid-3">
        <label className="gt-field" htmlFor="fin-model-area">
          Área
          <select id="fin-model-area" className="gt-select" value={form.discipline} onChange={event => set({ discipline: event.target.value })}>
            <option value="">Escolher</option>
            {DISCIPLINES.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-model-kind">
          Tipo
          <select id="fin-model-kind" className="gt-select" value={form.kind} onChange={event => set({ kind: event.target.value })}>
            <option value="counted">Sessões contadas</option>
            <option value="closed">Valor fechado (sessões previstas)</option>
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-model-total">
          Valor total
          <MoneyInput id="fin-model-total" value={form.total} onChange={total => set({ total })} />
        </label>
        <label className="gt-field" htmlFor="fin-model-sessions">
          {form.kind === 'closed' ? 'Sessões previstas (de)' : 'Sessões'}
          <input id="fin-model-sessions" className="gt-select" inputMode="numeric" value={form.sessions} onChange={event => set({ sessions: event.target.value.replace(/\D/g, '') })} />
        </label>
        {form.kind === 'closed' && (
          <label className="gt-field" htmlFor="fin-model-max">
            até (opcional)
            <input id="fin-model-max" className="gt-select" inputMode="numeric" value={form.sessions_max} onChange={event => set({ sessions_max: event.target.value.replace(/\D/g, '') })} />
          </label>
        )}
        <label className="gt-field" htmlFor="fin-model-name">
          Nome {form.kind === 'counted' ? '(opcional)' : ''}
          <input id="fin-model-name" className="gt-select" value={form.name} placeholder={form.kind === 'counted' ? name || 'Pacote de 10 sessões' : 'Ex.: Avaliação neuropsicológica'} onChange={event => set({ name: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="fin-model-installments">
          Parcelas até
          <input id="fin-model-installments" className="gt-select" inputMode="numeric" value={form.max_installments} onChange={event => set({ max_installments: event.target.value.replace(/\D/g, '') })} />
        </label>
      </div>
      {info && (
        <p className="fin-hint">
          {formatBRL(info.perSession)} por sessão{form.kind === 'closed' ? ' na previsão inicial' : ''}
          {info.discountPercent != null && single ? ` · ${info.discountPercent > 0 ? `${info.discountPercent}% abaixo` : 'igual ou acima'} do avulso (${formatBRL(single)})` : ''}.
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
              aria-pressed={form.appointment_types.includes(type.id)}
              onClick={() => set({ appointment_types: form.appointment_types.includes(type.id) ? form.appointment_types.filter(id => id !== type.id) : [...form.appointment_types, type.id] })}
            >
              {type.label}
            </button>
          ))}
        </div>
        <p className="fin-hint">{form.appointment_types.length ? 'Só os tipos marcados.' : 'Nenhum marcado: qualquer atendimento da área gasta o pacote.'}</p>
      </fieldset>
      <div className="fin-choices" role="group" aria-label="Opções do pacote">
        <button type="button" className="fin-choice" aria-pressed={form.allow_per_session} onClick={() => set({ allow_per_session: !form.allow_per_session })}>Pode pagar a cada sessão</button>
        {form.kind === 'closed' && (
          <>
            <button type="button" className="fin-choice" aria-pressed={form.over_plan === 'free'} onClick={() => set({ over_plan: 'free' })}>Passou do previsto: não cobra</button>
            <button type="button" className="fin-choice" aria-pressed={form.over_plan === 'single'} onClick={() => set({ over_plan: 'single' })}>Passou do previsto: cobra como avulso</button>
          </>
        )}
      </div>
      {form.kind === 'closed' && totalCents > 0 && sessions > 0 && <ClosedSimulation totalCents={totalCents} planned={sessions} max={sessionsMax || sessions + 4} />}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar pacote'}</button>
      </div>
    </div>
  );
}

/** Simulação: a previsão muda depois da 3ª sessão. */
function ClosedSimulation({ totalCents, planned, max }) {
  const [newPlanned, setNewPlanned] = useState(Math.min(max, planned + 2));
  const changeAfter = Math.min(3, planned);
  const shares = simulateClosedPackage({ totalCents, planned, changeAfter, newPlanned, sessions: Math.max(newPlanned, planned) + 1 });
  return (
    <div className="fin-sim">
      <label htmlFor="fin-sim-new">
        Simulação: depois da {changeAfter}ª sessão, a previsão muda para <b>{newPlanned}</b>
      </label>
      <input id="fin-sim-new" type="range" min={changeAfter} max={Math.max(max, planned + 4)} value={newPlanned} onChange={event => setNewPlanned(Number(event.target.value))} />
      <ol className="fin-sim-sessions">
        {shares.map((cents, index) => (
          <li key={index} className={index < changeAfter ? 'is-before' : cents === 0 ? 'is-free' : ''}>{index + 1}ª {formatBRL(cents)}</li>
        ))}
      </ol>
    </div>
  );
}

export function ModelosConfig({ fin }) {
  const [editing, setEditing] = useState(null);
  const { busy, error, run } = useSaver(fin);
  const models = [...fin.data.models].sort((a, b) => a.discipline.localeCompare(b.discipline) || a.sessions - b.sessions);
  const institution = fin.data.prices.filter(row => !row.professional_id);
  const settings = fin.data.settings;

  return (
    <section className="fin-section">
      <SettingsStrip fin={fin} />
      <div className="fin-toolbar">
        <button type="button" className="gt-btn gt-btn--primary" onClick={() => setEditing({ ...EMPTY_MODEL })}>+ Novo modelo</button>
        {settings && models.length === 0 && (
          <button
            type="button"
            className="gt-btn"
            disabled={busy}
            aria-pressed={settings.packages_reviewed}
            onClick={() => run(() => saveFinanceSettings({ startsOn: settings.starts_on, payoutBasis: settings.payout_basis, packagesReviewed: !settings.packages_reviewed }), settings.packages_reviewed ? 'Pacotes voltaram para a conferência.' : 'Marcado: a clínica não vende pacote.')}
          >
            {settings.packages_reviewed ? 'Desmarcar “não vendemos pacote”' : 'A clínica não vende pacote'}
          </button>
        )}
      </div>
      <ErrorLine error={error} />
      {editing && !editing.id && <ModelForm fin={fin} model={null} onDone={() => setEditing(null)} />}
      {models.length === 0 && !editing ? <EmptyNote>Nenhum modelo ainda. Modelo é o pacote pronto para vender: 4, 6, 8 ou 10 sessões, ou um valor fechado como a avaliação neuropsicológica.</EmptyNote> : (
        <div className="fin-list">
          {models.map(model => {
            if (editing?.id === model.id) return <ModelForm key={model.id} fin={fin} model={model} onDone={() => setEditing(null)} />;
            const single = resolvePrice(institution, { discipline: model.discipline, type: model.appointment_types[0] || 'session' }).cents;
            const info = packageSizeInfo({ totalCents: model.total_cents, sessions: model.sessions, singleCents: single });
            return (
              <div key={model.id} className={`fin-row${model.active ? '' : ' fin-row--void'}`}>
                <div className="fin-row-main">
                  <b>{model.name}</b>
                  <span>
                    <AreaTag discipline={model.discipline} /> · {model.kind === 'closed'
                      ? `valor fechado, ${model.sessions}${model.sessions_max ? ` a ${model.sessions_max}` : ''} sessões previstas`
                      : `${model.sessions} sessões`}
                    {' · '}{formatBRL(info.perSession)} por sessão{info.discountPercent > 0 ? `, ${info.discountPercent}% abaixo do avulso` : ''}
                  </span>
                  <span className="fin-row-sub">
                    {model.appointment_types.length ? `Gastam: ${model.appointment_types.map(typeLabel).join(', ')}` : 'Qualquer atendimento da área'}
                    {' · '}{model.max_installments > 1 ? `até ${model.max_installments} vezes` : 'à vista'}{model.allow_per_session ? ' ou a cada sessão' : ''}
                    {!model.active && ' · desativado'}
                  </span>
                </div>
                <b className="fin-num fin-amount">{formatBRL(model.total_cents)}</b>
                <span className="fin-row-actions">
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => setEditing(model)}>Editar</button>
                  <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => savePackageModel({ id: model.id, active: !model.active }), model.active ? 'Modelo desativado.' : 'Modelo ativado.')}>
                    {model.active ? 'Desativar' : 'Ativar'}
                  </button>
                  {!fin.data.packages.some(row => row.model_id === model.id) && (
                    <button type="button" className="fin-link" disabled={busy} onClick={() => run(() => deletePackageModel(model.id), 'Modelo excluído.')}>Excluir</button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="fin-hint">Mudar um modelo não muda pacote já vendido: a venda guarda os valores do dia.</p>
    </section>
  );
}

// ---------- Como cada um recebe ----------

function RuleEditor({ fin, member, onDone }) {
  const rules = fin.data.rules.filter(row => row.professional_id === member.id);
  const base = baseRuleOf(rules, member.id);
  const salary = fin.data.recurring.find(row => row.professional_id === member.id && row.active !== false && row.category_id === fin.salaryCategory?.id);
  const [mode, setMode] = useState(base?.mode || 'percent');
  const [percent, setPercent] = useState(base?.mode === 'percent' ? String(Number(base.percent)).replace('.', ',') : '');
  const [amount, setAmount] = useState(base?.mode === 'per_appointment' ? centsToInput(base.amount_cents) : '');
  const [salaryAmount, setSalaryAmount] = useState(salary ? centsToInput(salary.amount_cents) : '');
  const [salaryDay, setSalaryDay] = useState(salary ? String(salary.day_of_month) : '5');
  const [exceptions, setExceptions] = useState(() => rules.filter(row => row !== base).map(row => ({
    discipline: row.discipline,
    type: row.appointment_type || '',
    mode: row.mode,
    value: row.mode === 'percent' ? String(Number(row.percent)).replace('.', ',') : centsToInput(row.amount_cents),
  })));
  const { busy, error, run } = useSaver(fin);
  const areas = DISCIPLINES.filter(area => (member.disciplines || []).includes(area.id));

  const parsePercent = text => {
    const value = Number(String(text).replace(',', '.'));
    return text !== '' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  };
  const exceptionRows = exceptions.map(row => ({
    discipline: row.discipline,
    appointmentType: row.type || null,
    mode: row.mode,
    percent: row.mode === 'percent' ? parsePercent(row.value) : null,
    amountCents: row.mode === 'per_appointment' ? parseBRLInput(row.value) : null,
  }));
  const baseValid = mode === 'percent' ? parsePercent(percent) != null
    : mode === 'per_appointment' ? parseBRLInput(amount) != null
      : mode === 'salary' ? parseBRLInput(salaryAmount) > 0 && Number(salaryDay) >= 1 && Number(salaryDay) <= 31
        : true;
  const exceptionsValid = exceptionRows.every(row => row.discipline && (row.mode === 'percent' ? row.percent != null : row.amountCents != null));
  const keys = exceptionRows.map(row => `${row.discipline}:${row.appointmentType || ''}`);
  const duplicated = new Set(keys).size !== keys.length;
  const valid = baseValid && (mode === 'salary' || mode === 'none' || (exceptionsValid && !duplicated));

  async function persist() {
    const rows = [{
      mode,
      percent: mode === 'percent' ? parsePercent(percent) : null,
      amountCents: mode === 'per_appointment' ? parseBRLInput(amount) : null,
    }];
    if (mode === 'percent' || mode === 'per_appointment') rows.push(...exceptionRows);
    await savePayoutRules(member.id, rows);
    if (mode === 'salary') {
      await saveRecurring({
        ...(salary ? { id: salary.id } : {}),
        description: `Salário · ${member.full_name}`,
        category_id: fin.salaryCategory?.id,
        professional_id: member.id,
        amount_cents: parseBRLInput(salaryAmount),
        frequency: 'monthly',
        day_of_month: Number(salaryDay),
        weekday: null,
        starts_on: salary?.starts_on || fin.data.settings?.starts_on || fin.today,
        active: true,
      });
    } else if (salary) {
      await saveRecurring({ id: salary.id, active: false });
    }
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-choices" role="group" aria-label={`Como ${member.full_name} recebe`}>
        {PAYOUT_MODES.map(option => (
          <button key={option.id} type="button" className="fin-choice" aria-pressed={mode === option.id} onClick={() => setMode(option.id)}>{option.label}</button>
        ))}
      </div>
      {mode === 'percent' && (
        <label className="gt-field fin-narrow" htmlFor={`fin-rule-percent-${member.id}`}>
          Percentual do valor do atendimento
          <span className="fin-money-input"><input id={`fin-rule-percent-${member.id}`} className="gt-select" inputMode="decimal" value={percent} onChange={event => setPercent(event.target.value)} /><span aria-hidden="true">%</span></span>
        </label>
      )}
      {mode === 'per_appointment' && (
        <label className="gt-field fin-narrow" htmlFor={`fin-rule-amount-${member.id}`}>
          Valor por atendimento feito
          <MoneyInput id={`fin-rule-amount-${member.id}`} value={amount} onChange={setAmount} />
        </label>
      )}
      {mode === 'salary' && (
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor={`fin-salary-${member.id}`}>
            Salário
            <MoneyInput id={`fin-salary-${member.id}`} value={salaryAmount} onChange={setSalaryAmount} />
          </label>
          <label className="gt-field" htmlFor={`fin-salary-day-${member.id}`}>
            Pago todo dia
            <input id={`fin-salary-day-${member.id}`} className="gt-select" inputMode="numeric" value={salaryDay} onChange={event => setSalaryDay(event.target.value.replace(/\D/g, ''))} />
          </label>
          <p className="fin-hint">Vira saída fixa: aparece em “A pagar” no dia.</p>
        </div>
      )}
      {mode === 'none' && <p className="fin-hint">Sócio ou dono: os atendimentos entram nas contas da clínica, sem repasse.</p>}
      {(mode === 'percent' || mode === 'per_appointment') && (
        <fieldset className="fin-fieldset">
          <legend>Exceções por área ou tipo</legend>
          {exceptions.map((row, index) => (
            <div key={index} className="fin-exception">
              <select className="gt-select" aria-label="Área" value={row.discipline || ''} onChange={event => setExceptions(current => current.map((item, position) => (position === index ? { ...item, discipline: event.target.value } : item)))}>
                <option value="">Área</option>
                {areas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
              </select>
              <select className="gt-select" aria-label="Tipo" value={row.type} onChange={event => setExceptions(current => current.map((item, position) => (position === index ? { ...item, type: event.target.value } : item)))}>
                <option value="">Todos os tipos</option>
                {FINANCE_APPOINTMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
              <select className="gt-select" aria-label="Jeito" value={row.mode} onChange={event => setExceptions(current => current.map((item, position) => (position === index ? { ...item, mode: event.target.value, value: '' } : item)))}>
                <option value="percent">%</option>
                <option value="per_appointment">R$ por atendimento</option>
              </select>
              <input className="gt-select fin-small-input" aria-label="Valor" inputMode="decimal" value={row.value} onChange={event => setExceptions(current => current.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)))} />
              <button type="button" className="gt-btn gt-btn--sm" onClick={() => setExceptions(current => current.filter((_, position) => position !== index))}>Tirar</button>
            </div>
          ))}
          {areas.length > 0 ? (
            <button type="button" className="fin-link" onClick={() => setExceptions(current => [...current, { discipline: areas[0].id, type: '', mode, value: '' }])}>+ Exceção</button>
          ) : <p className="fin-hint">Sem área liberada no cadastro.</p>}
          {duplicated && <p className="fin-hint fin-hint--warn">A mesma área e tipo aparecem duas vezes.</p>}
        </fieldset>
      )}
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" disabled={!valid || busy} onClick={() => run(persist, `Jeito de receber de ${member.full_name} salvo.`, onDone)}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

const EMPTY_PERSON = { name: '', role_label: '', pay: 'service', amount: '', weekday: '5', day: '5' };

function PersonForm({ fin, person, onDone }) {
  const current = person ? fin.data.recurring.find(row => row.person_id === person.id && row.active !== false) : null;
  const [form, setForm] = useState(() => (person ? {
    name: person.name,
    role_label: person.role_label || '',
    pay: current ? current.frequency : 'service',
    amount: current ? centsToInput(current.amount_cents) : '',
    weekday: current?.weekday != null ? String(current.weekday) : '5',
    day: current?.day_of_month != null ? String(current.day_of_month) : '5',
  } : EMPTY_PERSON));
  const { busy, error, run } = useSaver(fin);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const cents = parseBRLInput(form.amount);
  const valid = form.name.trim() && (form.pay === 'service' || cents > 0);

  async function persist() {
    const saved = await savePerson({ ...(person ? { id: person.id } : {}), name: form.name.trim(), role_label: form.role_label.trim() || null, active: true });
    const label = form.role_label.trim() ? `${form.role_label.trim()} · ${form.name.trim()}` : form.name.trim();
    if (form.pay === 'service') {
      if (current) await saveRecurring({ id: current.id, active: false });
      return;
    }
    await saveRecurring({
      ...(current ? { id: current.id } : {}),
      description: label,
      category_id: fin.salaryCategory?.id,
      person_id: saved.id,
      amount_cents: cents,
      frequency: form.pay,
      day_of_month: form.pay === 'monthly' ? Number(form.day) : null,
      weekday: form.pay === 'monthly' ? null : Number(form.weekday),
      starts_on: current?.starts_on || fin.data.settings?.starts_on || fin.today,
      active: true,
    });
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="fin-person-name">
          Nome
          <input id="fin-person-name" className="gt-select" value={form.name} onChange={event => set({ name: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="fin-person-role">
          Função
          <input id="fin-person-role" className="gt-select" value={form.role_label} placeholder="Ex.: Diarista, Técnico de TI" onChange={event => set({ role_label: event.target.value })} />
        </label>
      </div>
      <div className="fin-choices" role="group" aria-label="Como recebe">
        <button type="button" className="fin-choice" aria-pressed={form.pay === 'service'} onClick={() => set({ pay: 'service' })}>Por serviço (lança quando paga)</button>
        {RECURRING_FREQUENCIES.map(option => (
          <button key={option.id} type="button" className="fin-choice" aria-pressed={form.pay === option.id} onClick={() => set({ pay: option.id })}>{option.label}</button>
        ))}
      </div>
      {form.pay !== 'service' && (
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor="fin-person-amount">
            Valor {form.pay === 'monthly' ? 'por mês' : 'por vez'}
            <MoneyInput id="fin-person-amount" value={form.amount} onChange={amount => set({ amount })} />
          </label>
          {form.pay === 'monthly' ? (
            <label className="gt-field" htmlFor="fin-person-day">
              Todo dia
              <input id="fin-person-day" className="gt-select" inputMode="numeric" value={form.day} onChange={event => set({ day: event.target.value.replace(/\D/g, '') })} />
            </label>
          ) : (
            <label className="gt-field" htmlFor="fin-person-weekday">
              Dia da semana
              <select id="fin-person-weekday" className="gt-select" value={form.weekday} onChange={event => set({ weekday: event.target.value })}>
                {WEEKDAYS.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <p className="fin-hint">Sem login e sem acesso a nada: serve só para registrar o pagamento.</p>
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" disabled={!valid || busy} onClick={() => run(persist, `${form.name.trim()} salvo.`, onDone)}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  );
}

export function RecebimentoConfig({ fin }) {
  const [editing, setEditing] = useState('');
  const [personEditing, setPersonEditing] = useState(null);
  const { busy, error, run } = useSaver(fin);
  const members = payableMembers(fin.data.members);
  const settings = fin.data.settings;

  return (
    <section className="fin-section">
      <SettingsStrip fin={fin} />
      {settings && (
        <fieldset className="fin-fieldset">
          <legend>Quando o repasse do profissional passa a contar</legend>
          <div className="fin-choices">
            {PAYOUT_BASIS.map(option => (
              <button
                key={option.id}
                type="button"
                className="fin-choice"
                aria-pressed={settings.payout_basis === option.id}
                disabled={busy}
                onClick={() => option.id !== settings.payout_basis && run(() => saveFinanceSettings({ startsOn: settings.starts_on, payoutBasis: option.id }), `Repasse: ${option.label.toLocaleLowerCase('pt-BR')}.`)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <ErrorLine error={error} />
      <h3 className="fin-subtitle">Equipe</h3>
      <div className="fin-list">
        {members.map(member => {
          const rules = fin.data.rules.filter(row => row.professional_id === member.id);
          const base = baseRuleOf(rules, member.id);
          if (editing === member.id) {
            return (
              <div key={member.id} className="fin-group">
                <div className="fin-group-head"><div className="fin-row-main"><b>{member.full_name}</b><span>{(member.disciplines || []).map(id => getDiscipline(id)?.label).filter(Boolean).join(', ') || 'sem área'}</span></div></div>
                <RuleEditor fin={fin} member={member} onDone={() => setEditing('')} />
              </div>
            );
          }
          return (
            <div key={member.id} className={`fin-row${!base && member.has_agenda !== false ? ' fin-row--todo' : ''}`}>
              <div className="fin-row-main">
                <b>{member.full_name}</b>
                <span>{member.has_agenda === false ? 'não atende na Agenda' : (member.disciplines || []).map(id => getDiscipline(id)?.label).filter(Boolean).join(', ')}</span>
              </div>
              <span className="fin-rule">{describeRule(base, rules.filter(row => row !== base))}</span>
              <button type="button" className={`gt-btn gt-btn--sm${base ? '' : ' gt-btn--primary'}`} onClick={() => setEditing(member.id)}>{base ? 'Mudar' : 'Configurar'}</button>
            </div>
          );
        })}
      </div>
      <p className="fin-hint">Mudança vale para os atendimentos de agora em diante; o repasse de atendimento já feito fica como estava.</p>

      <h3 className="fin-subtitle">Pessoas que recebem e não usam o sistema</h3>
      {personEditing === 'new' && <PersonForm fin={fin} person={null} onDone={() => setPersonEditing(null)} />}
      <div className="fin-list">
        {fin.data.people.map(person => {
          if (personEditing?.id === person.id) return <PersonForm key={person.id} fin={fin} person={person} onDone={() => setPersonEditing(null)} />;
          const rec = fin.data.recurring.find(row => row.person_id === person.id && row.active !== false);
          return (
            <div key={person.id} className={`fin-row${person.active ? '' : ' fin-row--void'}`}>
              <div className="fin-row-main">
                <b>{person.name}</b>
                <span>{person.role_label || 'Sem função'}{person.active ? '' : ' · desativada'}</span>
              </div>
              <span className="fin-rule">{rec ? `${formatBRL(rec.amount_cents)} · ${describeRecurring(rec)}` : 'Por serviço'}</span>
              <span className="fin-row-actions">
                <button type="button" className="gt-btn gt-btn--sm" onClick={() => setPersonEditing(person)}>Mudar</button>
                <button
                  type="button"
                  className="gt-btn gt-btn--sm"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await savePerson({ id: person.id, active: !person.active });
                    if (person.active && rec) await saveRecurring({ id: rec.id, active: false });
                  }, person.active ? `${person.name} desativada.` : `${person.name} ativada.`)}
                >
                  {person.active ? 'Desativar' : 'Ativar'}
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {personEditing !== 'new' && (
        <button type="button" className="gt-btn" onClick={() => setPersonEditing('new')}>+ Cadastrar pessoa</button>
      )}
    </section>
  );
}

// ---------- Saídas fixas e categorias ----------

const EMPTY_RECURRING = { description: '', category_id: '', amount: '', varies: false, frequency: 'monthly', day: '5', weekday: '5', starts_on: '' };

function RecurringForm({ fin, rec, onDone }) {
  const categories = fin.data.categories.filter(row => row.active);
  const [form, setForm] = useState(() => (rec ? {
    description: rec.description,
    category_id: rec.category_id,
    amount: centsToInput(rec.amount_cents),
    varies: rec.amount_cents == null,
    frequency: rec.frequency,
    day: rec.day_of_month != null ? String(rec.day_of_month) : '5',
    weekday: rec.weekday != null ? String(rec.weekday) : '5',
    starts_on: rec.starts_on,
  } : { ...EMPTY_RECURRING, category_id: categories.find(row => !row.system_key)?.id || '', starts_on: fin.data.settings?.starts_on || fin.today }));
  const { busy, error, run } = useSaver(fin);
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const cents = form.varies ? null : parseBRLInput(form.amount);
  const valid = form.description.trim() && form.category_id && (form.varies || cents > 0) && form.starts_on
    && (form.frequency !== 'monthly' || (Number(form.day) >= 1 && Number(form.day) <= 31));

  function save() {
    run(() => saveRecurring({
      ...(rec ? { id: rec.id } : {}),
      description: form.description.trim(),
      category_id: form.category_id,
      amount_cents: cents,
      frequency: form.frequency,
      day_of_month: form.frequency === 'monthly' ? Number(form.day) : null,
      weekday: form.frequency === 'monthly' ? null : Number(form.weekday),
      starts_on: form.starts_on,
      active: true,
    }), `Saída fixa salva: ${form.description.trim()}.`, onDone);
  }

  return (
    <div className="fin-card fin-form">
      <div className="fin-grid-3">
        <label className="gt-field" htmlFor="fin-rec-description">
          Descrição
          <input id="fin-rec-description" className="gt-select" value={form.description} placeholder="Ex.: Aluguel" onChange={event => set({ description: event.target.value })} />
        </label>
        <label className="gt-field" htmlFor="fin-rec-category">
          Categoria
          <select id="fin-rec-category" className="gt-select" value={form.category_id} onChange={event => set({ category_id: event.target.value })}>
            {categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-rec-amount">
          Valor
          <MoneyInput id="fin-rec-amount" value={form.amount} onChange={amount => set({ amount })} disabled={form.varies} placeholder={form.varies ? 'muda todo mês' : '0'} />
        </label>
        <label className="gt-field" htmlFor="fin-rec-frequency">
          Quando
          <select id="fin-rec-frequency" className="gt-select" value={form.frequency} onChange={event => set({ frequency: event.target.value })}>
            {RECURRING_FREQUENCIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {form.frequency === 'monthly' ? (
          <label className="gt-field" htmlFor="fin-rec-day">
            Todo dia
            <input id="fin-rec-day" className="gt-select" inputMode="numeric" value={form.day} onChange={event => set({ day: event.target.value.replace(/\D/g, '') })} />
          </label>
        ) : (
          <label className="gt-field" htmlFor="fin-rec-weekday">
            Dia da semana
            <select id="fin-rec-weekday" className="gt-select" value={form.weekday} onChange={event => set({ weekday: event.target.value })}>
              {WEEKDAYS.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </label>
        )}
        <label className="gt-field" htmlFor="fin-rec-start">
          A partir de
          <input id="fin-rec-start" type="date" className="gt-select" value={form.starts_on} onChange={event => set({ starts_on: event.target.value })} />
        </label>
      </div>
      <label className="fin-toggle" htmlFor="fin-rec-varies">
        <input id="fin-rec-varies" type="checkbox" checked={form.varies} onChange={event => set({ varies: event.target.checked })} />
        O valor muda todo mês (luz, água): escrevo quando pagar
      </label>
      <ErrorLine error={error} />
      <div className="fin-actions">
        <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar saída fixa'}</button>
      </div>
    </div>
  );
}

export function SaidasFixasConfig({ fin }) {
  const [editing, setEditing] = useState(null);
  const [newCategory, setNewCategory] = useState('');
  const { busy, error, run } = useSaver(fin);
  const settings = fin.data.settings;
  const recurring = [...fin.data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.description.localeCompare(b.description, 'pt-BR'));
  const fromPayroll = rec => Boolean(rec.professional_id || rec.person_id);

  return (
    <section className="fin-section">
      <SettingsStrip fin={fin} />
      <h3 className="fin-subtitle">Categorias de saída</h3>
      <div className="fin-choices" role="group" aria-label="Categorias">
        {fin.data.categories.map(row => (
          <button
            key={row.id}
            type="button"
            className="fin-choice"
            aria-pressed={row.active}
            disabled={busy || Boolean(row.system_key)}
            title={row.system_key ? 'Categoria do sistema: não desativa' : row.active ? 'Clique para desativar' : 'Clique para ativar'}
            onClick={() => run(() => saveCategory({ id: row.id, active: !row.active }), row.active ? `Categoria “${row.name}” desativada.` : `Categoria “${row.name}” ativada.`)}
          >
            {row.name}
          </button>
        ))}
      </div>
      <div className="fin-inline">
        <input className="gt-select" aria-label="Nova categoria" placeholder="Nova categoria" value={newCategory} onChange={event => setNewCategory(event.target.value)} />
        <button type="button" className="gt-btn gt-btn--sm" disabled={busy || !newCategory.trim()} onClick={() => run(() => saveCategory({ name: newCategory.trim(), sort_order: 90 }), `Categoria “${newCategory.trim()}” criada.`, () => setNewCategory(''))}>+ Nova categoria</button>
      </div>
      <p className="fin-hint">Categoria desativada some da lista de lançar saída; o que já foi lançado nela continua.</p>

      <h3 className="fin-subtitle">Saídas fixas</h3>
      <p className="fin-hint">Aparecem sozinhas em “A pagar” no dia. Salário e pessoas sem login entram aqui pelo “Como cada um recebe”.</p>
      <div className="fin-toolbar">
        <button type="button" className="gt-btn gt-btn--primary" onClick={() => setEditing('new')}>+ Saída fixa</button>
        {settings && (
          <button
            type="button"
            className="gt-btn"
            disabled={busy || settings.expenses_reviewed}
            onClick={() => run(() => saveFinanceSettings({ startsOn: settings.starts_on, payoutBasis: settings.payout_basis, expensesReviewed: true }), 'Saídas fixas conferidas.')}
          >
            {settings.expenses_reviewed ? 'Saídas conferidas ✓' : 'Conferi as saídas fixas'}
          </button>
        )}
      </div>
      <ErrorLine error={error} />
      {editing === 'new' && <RecurringForm fin={fin} rec={null} onDone={() => setEditing(null)} />}
      {recurring.length === 0 && editing !== 'new' ? <EmptyNote>Nenhuma saída fixa ainda: aluguel, internet, contador, luz…</EmptyNote> : (
        <div className="fin-list">
          {recurring.map(rec => {
            if (editing?.id === rec.id) return <RecurringForm key={rec.id} fin={fin} rec={rec} onDone={() => setEditing(null)} />;
            return (
              <div key={rec.id} className={`fin-row${rec.active ? '' : ' fin-row--void'}`}>
                <div className="fin-row-main">
                  <b>{rec.description}</b>
                  <span>{fin.categoriesById.get(rec.category_id)?.name} · {describeRecurring(rec)} · desde {formatDay(rec.starts_on)}{rec.active ? '' : ' · desativada'}</span>
                </div>
                <b className="fin-num fin-amount">{rec.amount_cents != null ? formatBRL(rec.amount_cents) : 'muda todo mês'}</b>
                <span className="fin-row-actions">
                  {fromPayroll(rec) ? (
                    <button type="button" className="fin-link" onClick={() => fin.open('recebimento')}>Mudar em Como cada um recebe</button>
                  ) : (
                    <>
                      <button type="button" className="gt-btn gt-btn--sm" onClick={() => setEditing(rec)}>Editar</button>
                      <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => saveRecurring({ id: rec.id, active: !rec.active }), rec.active ? 'Saída fixa desativada.' : 'Saída fixa ativada.')}>
                        {rec.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
