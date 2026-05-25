import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { FieldInput } from '../ui/FieldInput';
import { checklists } from '../../data/checklists';
import { usePatient } from '../../hooks/PatientContext';
import { getPatientAge } from '../../hooks/useClinicState';

export function Anamnese({ state, selectedMap, onToggle, onUpdate, onFillTestAnswers }) {
  const { selectedPatient, updatePatient } = usePatient();
  const [showGineco, setShowGineco] = useState(false);
  const [editingPatient, setEditingPatient] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientForm, setPatientForm] = useState({
    name: selectedPatient?.name || '',
    phone: selectedPatient?.phone || '',
    age: getPatientAge(selectedPatient),
  });

  function openPatientEdit() {
    setPatientForm({
      name: selectedPatient?.name || '',
      phone: selectedPatient?.phone || '',
      age: getPatientAge(selectedPatient),
    });
    setEditingPatient(true);
  }

  async function handlePatientSubmit(e) {
    e.preventDefault();
    if (!selectedPatient || !patientForm.name.trim()) return;

    setSavingPatient(true);
    try {
      const updated = await updatePatient(selectedPatient.id, patientForm);
      onUpdate('nome', updated.name || '');
      onUpdate('contato', updated.phone || '');
      onUpdate('idade', getPatientAge(updated));
      setEditingPatient(false);
    } finally {
      setSavingPatient(false);
    }
  }

  return (
    <Panel title="Anamnese clínica avançada">
      <div className="box">
        <div className="anamnese-intro">
          <p>
            <b>Objetivo do módulo:</b> organizar queixa, etiologia provável, hábitos, fatores emocionais,
            clima, sono, digestão, dor e segurança clínica para iniciar o raciocínio energético ainda durante a anamnese.
          </p>
          {onFillTestAnswers && (
            <button className="tag" type="button" onClick={onFillTestAnswers}>
              Preencher teste aleatório
            </button>
          )}
        </div>
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>1. Identificação</h3>
      <div className="identity-panel">
        <div className="identity-grid">
          <div>
            <span>Nome</span>
            <b>{selectedPatient?.name || state.nome || 'Paciente não selecionado'}</b>
          </div>
          <div>
            <span>Contato</span>
            <b>{selectedPatient?.phone || state.contato || 'Não informado'}</b>
          </div>
          <div>
            <span>Idade</span>
            <b>{getPatientAge(selectedPatient) || state.idade ? `${getPatientAge(selectedPatient) || state.idade} anos` : 'Não informada'}</b>
          </div>
        </div>
        <button className="tag" onClick={openPatientEdit}>Editar cadastro</button>
      </div>

      {editingPatient && (
        <form className="inline-edit" onSubmit={handlePatientSubmit}>
          <label>
            Nome completo
            <input
              value={patientForm.name}
              onChange={e => setPatientForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Telefone
            <input
              value={patientForm.phone}
              onChange={e => setPatientForm(f => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label>
            Idade
            <input
              type="number"
              min="0"
              max="130"
              value={patientForm.age || ''}
              onChange={e => setPatientForm(f => ({ ...f, age: e.target.value }))}
            />
          </label>
          <div className="inline-edit-actions">
            <button className="tag active" type="submit" disabled={savingPatient}>
              {savingPatient ? 'Salvando...' : 'Salvar cadastro'}
            </button>
            <button className="tag" type="button" onClick={() => setEditingPatient(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="form-grid">
        <FieldInput label="Sexo" field="sexo" value={state.sexo} onChange={onUpdate} />
        <FieldInput label="Profissão" field="profissao" value={state.profissao} onChange={onUpdate} />
        <FieldInput label="Data do atendimento" field="data" value={state.data} onChange={onUpdate} />
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>2. Queixa principal</h3>
      <FieldInput label="Queixa principal" field="queixa" value={state.queixa} onChange={onUpdate} textarea />
      <FieldInput label="História da queixa / evolução / fatores de piora e melhora" field="historia" value={state.historia} onChange={onUpdate} textarea />
      <h4>Características da queixa</h4>
      <CheckGrid group="queixaEstruturada" items={checklists.queixaEstruturada} selectedMap={selectedMap} onToggle={onToggle} />

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>3. Sono e emoções</h3>
      <div className="alert" style={{ background: '#f8fbff', borderColor: '#c9d8ef', color: '#061F3A' }}>
        Registro único: sono e emoções serão usados pela IA para Shen, Fígado, Coração, Baço, Rim e relação Yin/Yang.
      </div>
      <h4>Sono</h4>
      <CheckGrid group="sono" items={checklists.sono} selectedMap={selectedMap} onToggle={onToggle} />
      <h4>Emoções predominantes</h4>
      <CheckGrid group="emocoes" items={checklists.emocoes} selectedMap={selectedMap} onToggle={onToggle} />
      <FieldInput label="Observações sobre sono, sonhos, rotina e estado emocional" field="obsSonoEmocoes" value={state.obsSonoEmocoes} onChange={onUpdate} textarea />

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>4. Digestão, eliminação e hidratação</h3>
      <div className="form-grid">
        <FieldInput label="Consumo de água" field="agua" value={state.agua} onChange={onUpdate} />
      </div>
      <FieldInput label="Observações digestivas relevantes" field="obsDigestao" value={state.obsDigestao} onChange={onUpdate} textarea />
      <h4>Digestão</h4>
      <CheckGrid group="digestao" items={checklists.digestao} selectedMap={selectedMap} onToggle={onToggle} />
      <h4>Fezes / Bristol / eliminação</h4>
      <CheckGrid group="fezes" items={checklists.fezes} selectedMap={selectedMap} onToggle={onToggle} />

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>5. Dor e sinais físicos</h3>
      <div className="form-grid two">
        <FieldInput label="Localização principal da dor" field="dorLocal" value={state.dorLocal} onChange={onUpdate} />
        <FieldInput label="Escala de dor 0–10" field="escalaDor" value={state.escalaDor} onChange={onUpdate} />
      </div>
      <h4>Características da dor</h4>
      <CheckGrid group="dor" items={checklists.dor} selectedMap={selectedMap} onToggle={onToggle} />
      <h4>Relação climática</h4>
      <CheckGrid group="clima" items={checklists.clima} selectedMap={selectedMap} onToggle={onToggle} />
      <FieldInput label="Observações sobre dor, postura, irradiação, exames ou limitações funcionais" field="obsDor" value={state.obsDor} onChange={onUpdate} textarea />

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>6. Histórico clínico integrado</h3>
      <CheckGrid group="historico" items={checklists.historico} selectedMap={selectedMap} onToggle={onToggle} />
      <FieldInput label="Medicamentos, exames, diagnósticos prévios e observações médicas" field="medicacoes" value={state.medicacoes} onChange={onUpdate} textarea />
      <h4>Medicamentos, substâncias e estimulantes</h4>
      <CheckGrid group="substanciasUso" items={checklists.substanciasUso} selectedMap={selectedMap} onToggle={onToggle} />

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        7. Ginecológico / hormonal
        <button className="tag" onClick={() => setShowGineco(!showGineco)} style={{ fontSize: 13, margin: 0 }}>
          {showGineco ? 'Ocultar módulo' : 'Exibir módulo ginecológico'}
        </button>
      </h3>
      {!showGineco && (
        <p className="small">Módulo condicional: marque abaixo apenas quando for clinicamente necessário. Módulo ginecológico oculto para reduzir tempo de preenchimento.</p>
      )}
      {showGineco && (
        <CheckGrid group="gineco" items={checklists.gineco} selectedMap={selectedMap} onToggle={onToggle} />
      )}

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>8. Segurança clínica</h3>
      <div className="alert">Marque sinais que exigem cautela, adaptação técnica ou encaminhamento.</div>
      <CheckGrid group="seguranca" items={checklists.seguranca} cols={2} selectedMap={selectedMap} onToggle={onToggle} />
    </Panel>
  );
}
