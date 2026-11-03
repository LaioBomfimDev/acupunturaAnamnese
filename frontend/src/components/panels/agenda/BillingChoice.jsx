import { useEffect, useEffectEvent, useState } from 'react';
import {
  checkConvenioPrice,
  listConvenioChoicesCached,
  listPatientCoverages,
} from '../../../services/convenioService';
import {
  PARTICULAR,
  billingWarnings,
  coverageChoices,
  coverageNote,
  defaultBilling,
} from '../../../utils/agendaBilling';
import { procedureCodeLabel } from '../../../utils/convenio';
import { formatBRL, todayInClinic } from '../../../utils/finance';

// ============================================================
// "Como paga" do agendamento (prévia A, 02/11/2026): logo abaixo de
// Paciente, Particular ou Convênio · <operadora>, um botão por operadora
// ativa na ficha. Nota em verde com plano, carteira e validade; valor e
// TUSS só para a administração; aviso em âmbar para carteira vencida e
// operadora sem preço para a área. O banco confere a carteira de novo.
//
// autoPick: no "Novo agendamento", trocar de paciente marca o convênio
// ativo da ficha. Na edição, o valor gravado manda.
// ============================================================

export function BillingChoice({
  idPrefix = 'ag-billing',
  patientId,
  discipline,
  disciplineLabel,
  appointmentType = null,
  value,
  onChange,
  canSeePrice = false,
  disabled = false,
  autoPick = true,
}) {
  // Resultado guardado com a chave do pedido: trocou o paciente (ou a
  // área/tipo), a chave muda e a tela trata como "conferindo" até a
  // resposta nova chegar, sem setState dentro do efeito.
  const [coverageResult, setCoverageResult] = useState({ key: null, status: 'idle', choices: [], error: '' });
  const [priceResult, setPriceResult] = useState({ key: null, check: null, error: '' });
  const [today] = useState(() => todayInClinic());
  const pickDefault = useEffectEvent(next => { if (autoPick) onChange(next); });

  useEffect(() => {
    let cancelled = false;
    if (!patientId) return () => { cancelled = true; };
    Promise.all([listPatientCoverages(patientId), listConvenioChoicesCached()])
      .then(([coverages, catalog]) => {
        if (cancelled) return;
        const choices = coverageChoices(coverages, catalog);
        setCoverageResult({ key: patientId, status: 'ready', choices, error: '' });
        pickDefault(defaultBilling(choices));
      })
      .catch(err => {
        if (cancelled) return;
        setCoverageResult({ key: patientId, status: 'error', choices: [], error: err.message || 'Não foi possível conferir o convênio do paciente.' });
        pickDefault(PARTICULAR);
      });
    return () => { cancelled = true; };
  }, [patientId]);

  const state = coverageResult.key === patientId
    ? coverageResult
    : { status: patientId ? 'loading' : 'idle', choices: [], error: '' };

  const isConvenio = value?.billingType === 'convenio';
  const choice = isConvenio
    ? state.choices.find(item => item.coverageId === value.coverageId)
      || state.choices.find(item => item.convenioId === value.convenioId)
      || null
    : null;

  const convenioId = isConvenio ? value.convenioId : null;
  const priceKey = convenioId && discipline ? `${convenioId}|${discipline}|${appointmentType || ''}` : null;
  useEffect(() => {
    let cancelled = false;
    if (!priceKey) return () => { cancelled = true; };
    const [convenio, area, type] = priceKey.split('|');
    checkConvenioPrice({ convenioId: convenio, discipline: area, type: type || null })
      .then(check => { if (!cancelled) setPriceResult({ key: priceKey, check, error: '' }); })
      .catch(err => { if (!cancelled) setPriceResult({ key: priceKey, check: null, error: err.message || 'Não foi possível conferir o preço da operadora.' }); });
    return () => { cancelled = true; };
  }, [priceKey]);
  const priceCheck = priceKey && priceResult.key === priceKey ? priceResult.check : null;
  const priceError = priceKey && priceResult.key === priceKey ? priceResult.error : '';

  if (!patientId) return null;

  const warnings = billingWarnings({ choice, today, priceCheck, disciplineLabel: disciplineLabel || discipline });
  // Convênio gravado com carteira que saiu da ficha: continua aparecendo
  // para não trocar sozinho para particular.
  const orphan = isConvenio && !choice && state.status === 'ready';

  return (
    <div className="ag-field ag-billing">
      <span className="agj-label" id={`${idPrefix}-label`}>Como paga</span>
      <div className="ag-seg ag-billing-seg" role="group" aria-labelledby={`${idPrefix}-label`}>
        <button
          type="button"
          className="ag-seg-btn"
          aria-pressed={!isConvenio}
          disabled={disabled}
          onClick={() => onChange(PARTICULAR)}
        >
          Particular
        </button>
        {state.choices.map(item => (
          <button
            key={item.coverageId}
            type="button"
            className="ag-seg-btn"
            aria-pressed={isConvenio && choice?.coverageId === item.coverageId}
            disabled={disabled}
            onClick={() => onChange({ billingType: 'convenio', convenioId: item.convenioId, coverageId: item.coverageId })}
          >
            Convênio · {item.convenioName}
          </button>
        ))}
        {orphan && (
          <button type="button" className="ag-seg-btn" aria-pressed="true" disabled>
            Convênio
          </button>
        )}
      </div>

      {state.status === 'loading' && <p className="ag-note">Conferindo o convênio do paciente…</p>}
      {state.status === 'error' && (
        <p className="ag-billing-warn" role="status">{state.error} O agendamento segue como particular.</p>
      )}
      {state.status === 'ready' && state.choices.length === 0 && !isConvenio && (
        <p className="ag-note">Sem convênio ativo na ficha. Para atender por convênio, cadastre na ficha do paciente (aba Cadastro).</p>
      )}
      {orphan && (
        <p className="ag-billing-warn" role="status">A carteira deste agendamento não está mais ativa na ficha. Escolha outra ou marque Particular.</p>
      )}

      {choice && (
        <p className="ag-billing-ok">
          {coverageNote(choice)}
          {canSeePrice && priceCheck?.hasPrice && (
            <> · {formatBRL(priceCheck.cents)} · {procedureCodeLabel({ tuss_table: priceCheck.tussTable, tuss_code: priceCheck.tussCode })}</>
          )}
        </p>
      )}
      {warnings.map(text => <p key={text} className="ag-billing-warn" role="status">{text}</p>)}
      {priceError && <p className="ag-billing-warn" role="status">{priceError}</p>}
    </div>
  );
}

export default BillingChoice;
