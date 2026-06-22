import { useState } from 'react';
import { Panel } from '../ui/Panel';
import {
  buildRehabilitationAssessment,
  createEmptyRehabilitationAssessment,
  formatOptionalMetric,
  normalizeRehabilitationState,
} from '../../services/rehabilitationService';

function MetricInput({ label, field, value, onChange, min, max, step = '0.1', suffix = '' }) {
  return (
    <label>
      {label}{suffix ? ` (${suffix})` : ''}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(field, event.target.value)}
      />
    </label>
  );
}

export function Reabilitacao({ state, onUpdate }) {
  const rehabilitation = normalizeRehabilitationState(state.reabilitacao);
  const [form, setForm] = useState(() => createEmptyRehabilitationAssessment());
  const [error, setError] = useState('');

  function updateForm(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
  }

  function updateRehabilitation(next) {
    onUpdate('reabilitacao', {
      ...rehabilitation,
      ...next,
    });
  }

  function activate() {
    updateRehabilitation({ ativa: true });
  }

  function deactivate() {
    updateRehabilitation({ ativa: false });
  }

  function saveAssessment() {
    const { assessment, validation } = buildRehabilitationAssessment(
      form,
      rehabilitation.avaliacoes.length + 1,
    );
    if (!validation.ok) {
      setError(validation.errors.form || Object.values(validation.errors)[0]);
      return;
    }

    updateRehabilitation({
      ativa: true,
      avaliacoes: [...rehabilitation.avaliacoes, assessment],
    });
    setForm(createEmptyRehabilitationAssessment());
    setError('');
  }

  function removeAssessment(index) {
    const avaliacoes = rehabilitation.avaliacoes
      .filter((_, currentIndex) => currentIndex !== index)
      .map((assessment, currentIndex) => ({ ...assessment, avaliacao: currentIndex + 1 }));
    updateRehabilitation({ avaliacoes });
  }

  return (
    <Panel title="Reabilitação funcional — opcional">
      <div className="box">
        <b>Uso sob decisão profissional.</b>{' '}
        Este painel não participa do raciocínio MTC, não interpreta resultados e não substitui avaliação médica ou fisioterapêutica.
      </div>

      {!rehabilitation.ativa ? (
        <div className="box">
          <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Avaliação não ativada</h3>
          <p className="small">Ative apenas quando fizer sentido acompanhar funcionalidade ou resposta à reabilitação deste paciente.</p>
          <button type="button" className="tag active" onClick={activate}>
            Ativar avaliação de reabilitação
          </button>
        </div>
      ) : (
        <>
          <div className="warning-soft">
            <p><b>Avaliação ativa para este paciente.</b> Registre somente medidas efetivamente realizadas.</p>
            <button type="button" className="tag" onClick={deactivate}>Desativar exibição do módulo</button>
            <p className="small">Os registros já salvos serão preservados.</p>
          </div>

          <div className="box">
            <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Nova avaliação funcional</h3>
            <div className="form-grid">
              <label>
                Data
                <input value={form.data} onChange={event => updateForm('data', event.target.value)} />
              </label>
              <MetricInput label="Dor em repouso" field="dorRepouso" value={form.dorRepouso} onChange={updateForm} min="0" max="10" suffix="0–10" />
              <MetricInput label="Dor em movimento" field="dorMovimento" value={form.dorMovimento} onChange={updateForm} min="0" max="10" suffix="0–10" />
              <MetricInput label="Mudança percebida global" field="mudancaGlobal" value={form.mudancaGlobal} onChange={updateForm} min="-5" max="5" step="1" suffix="-5 a +5" />
              <MetricInput label="TUG" field="tugSegundos" value={form.tugSegundos} onChange={updateForm} min="0" max="600" suffix="segundos" />
              <MetricInput label="Sentar e levantar 5x" field="sentarLevantar5xSegundos" value={form.sentarLevantar5xSegundos} onChange={updateForm} min="0" max="600" suffix="segundos" />
              <MetricInput label="Equilíbrio unipodal direito" field="equilibrioDireitoSegundos" value={form.equilibrioDireitoSegundos} onChange={updateForm} min="0" max="600" suffix="segundos" />
              <MetricInput label="Equilíbrio unipodal esquerdo" field="equilibrioEsquerdoSegundos" value={form.equilibrioEsquerdoSegundos} onChange={updateForm} min="0" max="600" suffix="segundos" />
              <MetricInput label="Distância dedos-solo" field="dedosSoloCm" value={form.dedosSoloCm} onChange={updateForm} min="-100" max="300" suffix="cm" />
            </div>

            <label style={{ display: 'block', marginTop: 10 }}>
              Objetivo funcional / atividade relevante
              <textarea value={form.objetivoFuncional} onChange={event => updateForm('objetivoFuncional', event.target.value)} placeholder="Ex.: caminhar até o mercado sem pausa" />
            </label>
            <label style={{ display: 'block' }}>
              Amplitude de movimento medida
              <textarea value={form.amplitudeMovimento} onChange={event => updateForm('amplitudeMovimento', event.target.value)} placeholder="Ex.: flexão de ombro direito: 120°" />
            </label>
            <label style={{ display: 'block' }}>
              Observações da avaliação
              <textarea value={form.observacoes} onChange={event => updateForm('observacoes', event.target.value)} />
            </label>
            <p className="small">Mudança percebida global: -5 = muito pior, 0 = sem mudança, +5 = completamente recuperado. O sistema apenas registra a informação.</p>
            {error && <div className="alert">{error}</div>}
            <button type="button" className="tag active" onClick={saveAssessment}>Registrar avaliação</button>
          </div>

          <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Histórico funcional</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Avaliação</th>
                  <th>Dor</th>
                  <th>Mudança percebida</th>
                  <th>Medidas funcionais</th>
                  <th>Objetivo / observações</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rehabilitation.avaliacoes.length === 0 ? (
                  <tr><td colSpan={6}>Nenhuma avaliação funcional registrada.</td></tr>
                ) : rehabilitation.avaliacoes.map((assessment, index) => (
                  <tr key={`${assessment.avaliacao}-${assessment.data}-${index}`}>
                    <td><b>{assessment.avaliacao}</b><br /><span className="small">{assessment.data}</span></td>
                    <td>Rep.: {formatOptionalMetric(assessment.dorRepouso)}<br />Mov.: {formatOptionalMetric(assessment.dorMovimento)}</td>
                    <td>{formatOptionalMetric(assessment.mudancaGlobal)}</td>
                    <td>
                      TUG: {formatOptionalMetric(assessment.tugSegundos, ' s')}<br />
                      5x: {formatOptionalMetric(assessment.sentarLevantar5xSegundos, ' s')}<br />
                      Equilíbrio D/E: {formatOptionalMetric(assessment.equilibrioDireitoSegundos, ' s')} / {formatOptionalMetric(assessment.equilibrioEsquerdoSegundos, ' s')}<br />
                      Dedos-solo: {formatOptionalMetric(assessment.dedosSoloCm, ' cm')}
                    </td>
                    <td>
                      {assessment.objetivoFuncional || '—'}
                      {assessment.amplitudeMovimento && <><br /><span className="small">ADM: {assessment.amplitudeMovimento}</span></>}
                      {assessment.observacoes && <><br /><span className="small">{assessment.observacoes}</span></>}
                    </td>
                    <td><button type="button" className="tag" onClick={() => removeAssessment(index)}>Excluir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
