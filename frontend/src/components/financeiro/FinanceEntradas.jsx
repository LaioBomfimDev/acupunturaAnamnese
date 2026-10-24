import { useMemo, useState } from 'react';
import { shortName } from '../../services/clinicMembersService';
import {
  closePackage,
  registerReceipt,
  updatePackagePlan,
  voidPackage,
  voidReceipt,
} from '../../services/financeiroService';
import {
  PAYMENT_PLANS,
  allocateReceipt,
  centsToInput,
  formatBRL,
  formatDay,
  formatShortDay,
  groupReceivablesByPatient,
  inRange,
  labelOf,
  methodLabel,
  parseBRLInput,
  typeLabel,
} from '../../utils/finance';
import { AreaTag, DueTag, EmptyNote, MethodPicker, MoneyInput } from './FinanceFields';
import { AdjustDialog, SellPackageDialog, VoidDialog } from './FinanceDialogs';

// ============================================================
// Entradas: A receber, Recebidos e Pacotes.
// ============================================================

function patientName(fin, id) {
  return fin.patientsById.get(id)?.name || 'Paciente arquivado';
}

function professionalName(fin, id) {
  const member = fin.membersById.get(id);
  return member ? shortName(member.full_name) : '';
}

/** O que é o item, em uma linha. */
function itemTitle(item) {
  if (item.kind === 'charge') return `${typeLabel(item.appointmentType)} de ${formatShortDay(item.dueOn)}`;
  if (item.kind === 'installment') return `${item.packageName} · parcela ${item.installmentNumber} de ${item.installments}`;
  if (item.kind === 'rest') return `${item.packageName} · restante do pacote`;
  return `${item.packageName} · sessão ${item.sessionNumber} de ${item.sessionsPlanned}`;
}

function ReceiveForm({ fin, items, onDone }) {
  const [selected, setSelected] = useState(() => new Set(items.map(item => item.key)));
  const chosen = items.filter(item => selected.has(item.key));
  const chosenTotal = chosen.reduce((total, item) => total + item.openCents, 0);
  const [splits, setSplits] = useState([{ method: 'pix', amount: centsToInput(chosenTotal) }]);
  const [receivedOn, setReceivedOn] = useState(fin.today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsedSplits = splits.map(split => ({ method: split.method, amountCents: parseBRLInput(split.amount) }));
  const splitTotal = parsedSplits.reduce((total, split) => total + (split.amountCents || 0), 0);
  const invalidSplit = parsedSplits.some(split => !split.amountCents || split.amountCents <= 0);
  const overpaid = splitTotal > chosenTotal;
  const valid = chosen.length > 0 && !invalidSplit && !overpaid && receivedOn && receivedOn <= fin.today;

  function toggle(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    // Uma forma só: o valor acompanha o que está marcado.
    if (splits.length === 1) {
      const total = items.filter(item => next.has(item.key)).reduce((sum, item) => sum + item.openCents, 0);
      setSplits([{ ...splits[0], amount: centsToInput(total) }]);
    }
  }

  function updateSplit(index, patch) {
    setSplits(current => current.map((split, position) => (position === index ? { ...split, ...patch } : split)));
  }

  async function save() {
    const { rows, error: allocationError } = allocateReceipt(chosen, parsedSplits);
    if (allocationError) { setError(allocationError); return; }
    setBusy(true);
    setError('');
    try {
      await registerReceipt({ patientId: items[0].patientId, receivedOn, rows, note });
      fin.notify(`Recebimento registrado: ${formatBRL(splitTotal)} de ${patientName(fin, items[0].patientId)}.`);
      fin.reload();
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fin-receive">
      <div className="fin-receive-items">
        <p className="fin-label">O que está sendo pago</p>
        {items.map(item => (
          <label key={item.key} className="fin-check" htmlFor={`fin-rc-${item.key}`}>
            <input id={`fin-rc-${item.key}`} type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
            <span>{itemTitle(item)}</span>
            <b className="fin-num">{formatBRL(item.openCents)}</b>
          </label>
        ))}
        <p className="fin-total">Marcado <b className="fin-num">{formatBRL(chosenTotal)}</b></p>
      </div>
      <div className="fin-receive-pay">
        {splits.map((split, index) => (
          <div key={index} className="fin-split">
            <MethodPicker value={split.method} onChange={method => updateSplit(index, { method })} label={`Forma de pagamento ${index + 1}`} />
            <div className="fin-split-row">
              <MoneyInput id={`fin-split-${index}`} value={split.amount} onChange={amount => updateSplit(index, { amount })} ariaLabel={`Valor na forma ${index + 1}`} />
              {splits.length > 1 && (
                <button type="button" className="gt-btn gt-btn--sm" onClick={() => setSplits(current => current.filter((_, position) => position !== index))}>Tirar</button>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="fin-link" onClick={() => setSplits(current => [...current, { method: 'dinheiro', amount: chosenTotal > splitTotal ? centsToInput(chosenTotal - splitTotal) : '' }])}>
          + Dividir em outra forma
        </button>
        <label className="gt-field" htmlFor="fin-rc-date">
          Data do recebimento
          <input id="fin-rc-date" type="date" className="gt-select" value={receivedOn} max={fin.today} onChange={event => setReceivedOn(event.target.value)} />
        </label>
        <label className="gt-field" htmlFor="fin-rc-note">
          Observação (opcional)
          <input id="fin-rc-note" className="gt-select" value={note} onChange={event => setNote(event.target.value)} />
        </label>
        {overpaid && <p className="fin-hint fin-hint--warn">O valor passa do que está marcado ({formatBRL(chosenTotal)}).</p>}
        {splitTotal > 0 && splitTotal < chosenTotal && !overpaid && (
          <p className="fin-hint">Pagamento parcial: cobre primeiro o mais antigo. Fica faltando {formatBRL(chosenTotal - splitTotal)}.</p>
        )}
        {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
        <div className="fin-actions">
          <button type="button" className="gt-btn" onClick={onDone} disabled={busy}>Fechar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>
            {busy ? 'Registrando…' : `Registrar ${formatBRL(splitTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const RECEIVABLE_FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'late', label: 'Em atraso' },
  { id: 'next', label: 'Hoje e depois' },
  { id: 'missing', label: 'Sem valor' },
];

export function AReceber({ fin }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openPatient, setOpenPatient] = useState('');
  const [adjusting, setAdjusting] = useState(null);
  const [selling, setSelling] = useState(false);
  const { items, missingPrice, credits } = fin.receivables;

  const counts = {
    all: items.length,
    late: items.filter(item => item.late).length,
    next: items.filter(item => !item.late).length,
    missing: missingPrice.length,
  };
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  const matches = id => !needle || patientName(fin, id).toLocaleLowerCase('pt-BR').includes(needle);
  const visible = items.filter(item => (filter === 'late' ? item.late : filter === 'next' ? !item.late : true) && matches(item.patientId));
  const groups = groupReceivablesByPatient(visible);
  const chargeById = new Map(fin.data.charges.map(row => [row.id, row]));
  const paidByCharge = useMemo(() => {
    const map = new Map();
    for (const row of fin.data.receipts) {
      if (row.voided_at || !row.charge_id) continue;
      map.set(row.charge_id, (map.get(row.charge_id) || 0) + row.amount_cents);
    }
    return map;
  }, [fin.data.receipts]);

  return (
    <section className="fin-section">
      <div className="fin-toolbar">
        <div className="fin-choices" role="group" aria-label="Mostrar">
          {RECEIVABLE_FILTERS.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
              {option.label} <b className="fin-num">{counts[option.id]}</b>
            </button>
          ))}
        </div>
        <input className="gt-select fin-search" aria-label="Buscar paciente" placeholder="Buscar paciente" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="gt-btn" onClick={() => setSelling(true)}>+ Vender pacote</button>
      </div>

      {credits.size > 0 && (
        <p className="gt-notice">
          Crédito de paciente: {[...credits.entries()].map(([id, cents]) => `${patientName(fin, id)} (${formatBRL(cents)})`).join(', ')}.
          É pagamento de atendimento que deixou de valer. Para usar, anule o recebimento em “Recebidos” e lance de novo no atendimento certo.
        </p>
      )}

      {filter === 'missing' ? (
        missingPrice.length === 0 ? <EmptyNote>Todo atendimento feito tem valor. Atendimento sem valor aparece aqui quando a tabela não tem preço para a área e o tipo.</EmptyNote> : (
          <div className="fin-list">
            {missingPrice.filter(charge => matches(charge.patient_id)).map(charge => (
              <div key={charge.id} className="fin-row">
                <div className="fin-row-main">
                  <b>{patientName(fin, charge.patient_id)}</b>
                  <span><AreaTag discipline={charge.discipline} /> · {typeLabel(charge.appointment_type)} de {formatShortDay(charge.service_on)} · {professionalName(fin, charge.professional_id)}</span>
                </div>
                <span className="gt-badge gt-badge-pending">sem valor</span>
                <button type="button" className="gt-btn gt-btn--sm gt-btn--primary" onClick={() => setAdjusting({ charge, paid: 0 })}>Definir valor</button>
              </div>
            ))}
          </div>
        )
      ) : groups.length === 0 ? (
        <EmptyNote>{items.length ? 'Nada com esse filtro.' : 'Nada a receber. Atendimento feito e não pago e parcela de pacote aparecem aqui.'}</EmptyNote>
      ) : (
        <div className="fin-list">
          {groups.map(group => (
            <div key={group.patientId} className={`fin-group${group.lateCents > 0 ? ' fin-group--late' : ''}`}>
              <div className="fin-group-head">
                <div className="fin-row-main">
                  <b>{patientName(fin, group.patientId)}</b>
                  <span>{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}{group.lateCents > 0 ? ` · ${formatBRL(group.lateCents)} em atraso` : ''}</span>
                </div>
                <b className="fin-num fin-amount">{formatBRL(group.openCents)}</b>
                <button
                  type="button"
                  className={`gt-btn gt-btn--sm${openPatient === group.patientId ? '' : ' gt-btn--primary'}`}
                  aria-expanded={openPatient === group.patientId}
                  onClick={() => setOpenPatient(current => (current === group.patientId ? '' : group.patientId))}
                >
                  {openPatient === group.patientId ? 'Fechar' : 'Receber'}
                </button>
              </div>
              <ul className="fin-items">
                {group.items.map(item => {
                  const charge = item.kind === 'charge' ? chargeById.get(item.chargeId) : null;
                  return (
                    <li key={item.key}>
                      <AreaTag discipline={item.discipline} />
                      <span className="fin-item-title">{itemTitle(item)}{item.professionalId ? ` · ${professionalName(fin, item.professionalId)}` : ''}</span>
                      <DueTag dueOn={item.dueOn} today={fin.today} />
                      <span className="fin-num">
                        {formatBRL(item.openCents)}
                        {item.openCents < item.totalCents && <small> de {formatBRL(item.totalCents)}</small>}
                      </span>
                      {charge && (
                        <button type="button" className="fin-link" onClick={() => setAdjusting({ charge, paid: paidByCharge.get(charge.id) || 0 })}>Mudar valor</button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {openPatient === group.patientId && (
                <ReceiveForm fin={fin} items={group.items} onDone={() => setOpenPatient('')} />
              )}
            </div>
          ))}
        </div>
      )}

      {adjusting && <AdjustDialog fin={fin} charge={adjusting.charge} paidCents={adjusting.paid} onClose={() => setAdjusting(null)} />}
      {selling && <SellPackageDialog fin={fin} onClose={() => setSelling(false)} />}
    </section>
  );
}

export function Recebidos({ fin }) {
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const chargeById = new Map(fin.data.charges.map(row => [row.id, row]));
  const packageById = new Map(fin.data.packages.map(row => [row.id, row]));

  const groups = new Map();
  for (const row of fin.data.receipts) {
    if (!inRange(row.received_on, fin.month)) continue;
    if (row.voided_at && !showVoided) continue;
    const group = groups.get(row.group_id) || { id: row.group_id, rows: [], receivedOn: row.received_on, patientId: row.patient_id, voided: Boolean(row.voided_at), reason: row.void_reason };
    group.rows.push(row);
    groups.set(row.group_id, group);
  }
  const list = [...groups.values()].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));
  const totals = new Map();
  for (const group of list) {
    if (group.voided) continue;
    for (const row of group.rows) totals.set(row.method, (totals.get(row.method) || 0) + row.amount_cents);
  }

  const describe = row => {
    if (row.charge_id) {
      const charge = chargeById.get(row.charge_id);
      return charge ? `${typeLabel(charge.appointment_type)} de ${formatShortDay(charge.service_on)}` : 'Atendimento';
    }
    return packageById.get(row.package_id)?.name || 'Pacote';
  };

  return (
    <section className="fin-section">
      <div className="fin-toolbar">
        <div className="fin-totals">
          {[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([method, cents]) => (
            <span key={method} className="fin-total-chip">{methodLabel(method)} <b className="fin-num">{formatBRL(cents)}</b></span>
          ))}
          {totals.size === 0 && <span className="fin-hint">Nada recebido em {fin.month.label}.</span>}
        </div>
        <label className="fin-toggle" htmlFor="fin-show-voided">
          <input id="fin-show-voided" type="checkbox" checked={showVoided} onChange={event => setShowVoided(event.target.checked)} />
          Mostrar anulados
        </label>
      </div>
      {list.length === 0 ? <EmptyNote>Nenhum recebimento em {fin.month.label}.</EmptyNote> : (
        <div className="fin-list">
          {list.map(group => {
            const total = group.rows.reduce((sum, row) => sum + row.amount_cents, 0);
            const methods = [...new Set(group.rows.map(row => methodLabel(row.method)))].join(' + ');
            const what = [...new Set(group.rows.map(describe))].join(', ');
            return (
              <div key={group.id} className={`fin-row${group.voided ? ' fin-row--void' : ''}`}>
                <span className="fin-date">{formatShortDay(group.receivedOn)}</span>
                <div className="fin-row-main">
                  <b>{patientName(fin, group.patientId)}</b>
                  <span>{what} · {methods}</span>
                  {group.voided && <span className="fin-void-reason">Anulado: {group.reason}</span>}
                </div>
                <b className="fin-num fin-amount">{formatBRL(total)}</b>
                {!group.voided && (
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => setVoiding({ id: group.id, total, patientId: group.patientId })}>Anular</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {voiding && (
        <VoidDialog
          title="Anular recebimento"
          description={`${formatBRL(voiding.total)} de ${patientName(fin, voiding.patientId)}. O que ele pagava volta para “A receber”.`}
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            await voidReceipt(voiding.id, reason);
            fin.notify('Recebimento anulado.');
            fin.reload();
            setVoiding(null);
          }}
        />
      )}
    </section>
  );
}

function PackageCard({ fin, pkg, onVoid }) {
  const charges = fin.data.charges.filter(row => row.package_id === pkg.id && !row.voided_at);
  const sessions = charges.filter(row => row.source === 'appointment');
  const used = charges.reduce((total, row) => total + (row.price_cents || 0), 0);
  const paid = fin.data.receipts.filter(row => row.package_id === pkg.id && !row.voided_at).reduce((total, row) => total + row.amount_cents, 0);
  const total = pkg.total_cents - pkg.discount_cents;
  const rest = total - used;
  const [planInput, setPlanInput] = useState(String(pkg.sessions_planned));
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const progress = Math.min(100, Math.round((sessions.length / pkg.sessions_planned) * 100));
  const planLabel = pkg.payment_plan === 'installments'
    ? `Parcelado em ${pkg.installments} vezes`
    : labelOf(PAYMENT_PLANS, pkg.payment_plan);

  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      await action();
      setClosing(false);
      fin.notify(message);
      fin.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`fin-package${pkg.status !== 'active' ? ' fin-package--closed' : ''}`}>
      <header className="fin-package-head">
        <div className="fin-row-main">
          <b>{patientName(fin, pkg.patient_id)}</b>
          <span><AreaTag discipline={pkg.discipline} /> · {pkg.name}{pkg.professional_id ? ` · ${professionalName(fin, pkg.professional_id)}` : ''}</span>
        </div>
        <span className={`gt-badge ${pkg.status === 'active' ? 'gt-badge-success' : 'gt-badge-neutral'}`}>
          {pkg.status === 'active' ? 'Ativo' : pkg.status === 'completed' ? 'Encerrado' : 'Anulado'}
        </span>
      </header>
      <div className="fin-progress" role="img" aria-label={`${sessions.length} de ${pkg.sessions_planned} sessões`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      <dl className="fin-package-facts">
        <div><dt>Sessões</dt><dd>{sessions.length} de {pkg.sessions_planned}{pkg.kind === 'closed' ? ' previstas' : ''}</dd></div>
        <div><dt>Valor</dt><dd className="fin-num">{formatBRL(total)}{pkg.discount_cents > 0 && <small> (desconto {formatBRL(pkg.discount_cents)})</small>}</dd></div>
        <div><dt>Pago</dt><dd className="fin-num">{formatBRL(paid)}</dd></div>
        <div><dt>Pagamento</dt><dd>{planLabel}</dd></div>
        <div><dt>Vendido</dt><dd>{formatDay(pkg.sold_on)}</dd></div>
      </dl>
      {pkg.status === 'voided' && <p className="fin-void-reason">Anulado: {pkg.void_reason}</p>}
      {pkg.status === 'active' && (
        <div className="fin-package-actions">
          {pkg.kind === 'closed' && (
            <span className="fin-inline">
              <label htmlFor={`fin-plan-${pkg.id}`}>Previstas</label>
              <input id={`fin-plan-${pkg.id}`} className="gt-select fin-small-input" inputMode="numeric" value={planInput} onChange={event => setPlanInput(event.target.value.replace(/\D/g, ''))} />
              <button
                type="button"
                className="gt-btn gt-btn--sm"
                disabled={busy || Number(planInput) === pkg.sessions_planned || !Number(planInput)}
                onClick={() => run(() => updatePackagePlan(pkg.id, Number(planInput)), `Previsão mudou para ${planInput} sessões. As próximas sessões já usam a conta nova.`)}
              >
                Mudar previsão
              </button>
            </span>
          )}
          {!closing ? (
            <button type="button" className="gt-btn gt-btn--sm" onClick={() => setClosing(true)} disabled={busy}>Encerrar pacote</button>
          ) : (
            <span className="fin-inline fin-closing">
              {rest > 0 ? <span>Faltam {formatBRL(rest)} do valor:</span> : <span>O valor já foi todo usado.</span>}
              {rest > 0 && (
                <button type="button" className="gt-btn gt-btn--sm gt-btn--primary" disabled={busy} onClick={() => run(() => closePackage(pkg.id, 'charge_rest'), 'Pacote encerrado: o restante ficou a receber.')}>
                  Cobrar o restante
                </button>
              )}
              <button type="button" className="gt-btn gt-btn--sm" disabled={busy} onClick={() => run(() => closePackage(pkg.id, 'discount_rest'), rest > 0 ? 'Pacote encerrado com desconto do restante.' : 'Pacote encerrado.')}>
                {rest > 0 ? 'Dar desconto do restante' : 'Encerrar'}
              </button>
              <button type="button" className="fin-link" onClick={() => setClosing(false)}>Voltar</button>
            </span>
          )}
          {sessions.length === 0 && paid === 0 && (
            <button type="button" className="fin-link" onClick={() => onVoid(pkg)}>Anular venda</button>
          )}
        </div>
      )}
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </article>
  );
}

const PACKAGE_FILTERS = [
  { id: 'active', label: 'Ativos', empty: 'Nenhum pacote ativo.' },
  { id: 'completed', label: 'Encerrados', empty: 'Nenhum pacote encerrado.' },
  { id: 'voided', label: 'Anulados', empty: 'Nenhuma venda anulada.' },
];

export function Pacotes({ fin }) {
  const [filter, setFilter] = useState('active');
  const [selling, setSelling] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const counts = Object.fromEntries(PACKAGE_FILTERS.map(option => [option.id, fin.data.packages.filter(row => row.status === option.id).length]));
  const list = fin.data.packages
    .filter(row => row.status === filter)
    .sort((a, b) => b.sold_on.localeCompare(a.sold_on));

  return (
    <section className="fin-section">
      <div className="fin-toolbar">
        <div className="fin-choices" role="group" aria-label="Mostrar">
          {PACKAGE_FILTERS.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
              {option.label} <b className="fin-num">{counts[option.id]}</b>
            </button>
          ))}
        </div>
        <button type="button" className="gt-btn gt-btn--primary" onClick={() => setSelling(true)}>+ Vender pacote</button>
      </div>
      <p className="fin-hint">A sessão entra no pacote sozinha: mesmo paciente, mesma área e um tipo que o pacote cobre. Falta não gasta sessão.</p>
      {list.length === 0 ? <EmptyNote>{PACKAGE_FILTERS.find(option => option.id === filter).empty}</EmptyNote> : (
        <div className="fin-packages">
          {list.map(pkg => <PackageCard key={pkg.id} fin={fin} pkg={pkg} onVoid={setVoiding} />)}
        </div>
      )}
      {selling && <SellPackageDialog fin={fin} onClose={() => setSelling(false)} />}
      {voiding && (
        <VoidDialog
          title="Anular venda do pacote"
          description={`${voiding.name} de ${patientName(fin, voiding.patient_id)}. Só dá para anular antes da primeira sessão e do primeiro pagamento.`}
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            await voidPackage(voiding.id, reason);
            fin.notify('Venda anulada.');
            fin.reload();
            setVoiding(null);
          }}
        />
      )}
    </section>
  );
}
