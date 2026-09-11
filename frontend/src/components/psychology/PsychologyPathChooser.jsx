import { useState } from 'react';
import { Panel } from '../ui/Panel';
import {
  PSYCHOLOGY_WELCOME_PATHS,
  getPsychologyIntakeProfile,
  getPsychologyProfilesForPath,
  isPsychologyPathEligible,
} from '../../data/psychologyIntakeProfiles';

export function PsychologyPathChooser({
  session,
  selectedPatient,
  patientAge,
  onSelectIntakeProfile,
  onOpenEvolution,
  onFillTestAnswers,
}) {
  const [intakePath, setIntakePath] = useState(null);
  const currentProfile = getPsychologyIntakeProfile(session?.intakeProfile);

  function choosePath(path) {
    setIntakePath(path.id);
  }

  return (
    <Panel title="Boas-vindas — Psicologia">
      <div className="psi-path-hero">
        <p className="app-eyebrow">Paciente selecionado</p>
        <h2>{selectedPatient?.name || 'Paciente'}</h2>
        <p>
          Escolha o percurso deste atendimento. Anamnese e avaliação são registros separados,
          mas permanecem vinculados ao mesmo paciente.
        </p>
        {onFillTestAnswers && (
          <button className="tag" type="button" onClick={onFillTestAnswers}>
            Preencher teste aleatório
          </button>
        )}
      </div>

      {!intakePath ? (
        <div className="psi-path-grid" aria-label="Percursos de Psicologia">
          {PSYCHOLOGY_WELCOME_PATHS.map(path => {
            const eligible = isPsychologyPathEligible(path.id, patientAge);
            return (
              <button
                key={path.id}
                type="button"
                className="psi-path-card"
                disabled={!eligible}
                onClick={() => choosePath(path)}
              >
                <span className="psi-path-card-icon" aria-hidden="true">
                  {path.id === 'infantojuvenil' ? '01' : '02'}
                </span>
                <b>{path.label}</b>
                <small>{path.description}</small>
                {!eligible && (
                  <span className="psi-path-warning">
                    {patientAge <= 17 ? 'Disponível a partir de 18 anos.' : 'Disponível até 17 anos.'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="psi-path-step">
          <button type="button" className="tag" onClick={() => setIntakePath(null)}>← Voltar</button>
          <div>
            <p className="app-eyebrow">Segunda etapa</p>
            <h3>{intakePath === 'infantojuvenil' ? 'Escolha a anamnese infantil' : 'Escolha a anamnese adulta'}</h3>
            <p className="small">
              Esta escolha direciona perguntas específicas de sexo clínico. Não presume anatomia,
              desenvolvimento reprodutivo nem diagnóstico.
            </p>
          </div>
          <div className="psi-path-grid psi-path-grid-secondary">
            {getPsychologyProfilesForPath(intakePath).map(profile => (
              <button
                key={profile.id}
                type="button"
                className={`psi-path-card${currentProfile?.id === profile.id ? ' active' : ''}`}
                onClick={() => onSelectIntakeProfile?.(profile.id)}
              >
                <b>{profile.label}</b>
                <small>
                  {profile.ageGroup === 'infantojuvenil'
                    ? 'Acompanhada por responsável; cada resposta identifica seu informante.'
                    : 'Roteiro adulto longitudinal com campos e atalhos de digitação.'}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cards summary-cards psi-path-summary">
        <div className="card">
          <p className="small">Anamnese selecionada</p>
          <h3>{currentProfile?.shortLabel || 'Ainda não definida'}</h3>
        </div>
        <button type="button" className="card psi-path-evolution-card" onClick={onOpenEvolution}>
          <p className="small">Acompanhamento</p>
          <h3>Registrar evolução</h3>
        </button>
      </div>
    </Panel>
  );
}
