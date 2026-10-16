import { useState } from 'react';
import {
  PSYCHOLOGY_WELCOME_PATHS,
  getPsychologyIntakeProfile,
  getPsychologyProfilesForPath,
  isPsychologyPathEligible,
} from '../../data/psychologyIntakeProfiles';
import { PSYCHOLOGY_TABS } from '../../data/psychologyAnamnese';
import { summarizeRoute } from '../../utils/formRoute';
import { getInitials } from '../../utils/patientUi';
import '../../styles/psychologyWelcome.css';

// ============================================================
// Boas-vindas da Psicologia (Painel) e escolha do percurso.
// Visual de 16/10/2026 (prévias A + C escolhidas pela administradora):
// faixa do paciente na cor da tela (A), três atalhos com os números da
// anamnese (C, a mesma conta do "Pede atenção" do menu) e os percursos
// em cartões grandes (A).
// `fixedPath` (16/10/2026): aberto pela aba "Anamnese infantil" ou
// "Anamnese adulto" do menu, já começa na escolha daquele percurso.
// ============================================================

const PATH_TEXT = 'Escolha o percurso deste atendimento. Anamnese e avaliação são registros separados, '
  + 'mas permanecem vinculados ao mesmo paciente.';

function PathGlyph({ path }) {
  return path === 'infantojuvenil' ? (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="14" r="6" />
      <path d="M14 40c0-7 4-12 10-12s10 5 10 12" />
      <path d="M17 26l-5-4M31 26l5-4" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="12" r="6.5" />
      <path d="M12 42c0-9 5.5-15 12-15s12 6 12 15" />
      <path d="M24 27v15" />
    </svg>
  );
}

function ageLabel(age) {
  const text = String(age ?? '').trim();
  return /^\d+$/.test(text) ? `${text} ${text === '1' ? 'ano' : 'anos'}` : '';
}

function profileDescription(profile) {
  return profile.ageGroup === 'infantojuvenil'
    ? 'Acompanhada por responsável; cada resposta identifica seu informante.'
    : 'Roteiro adulto longitudinal com campos e atalhos de digitação.';
}

function plural(count, one, many) {
  return count === 1 ? one : many;
}

// Os três atalhos (prévia C): anamnese pelo roteiro, partes completas e
// perguntas complementares. Cada um abre a parte certa.
function WelcomeShortcuts({ route, session, onOpenTab }) {
  const { done, total } = summarizeRoute(route);
  const partsDone = route.filter(part => part.total > 0 && part.done >= part.total).length;
  const questions = Array.isArray(session?.complementaryQuestions) ? session.complementaryQuestions : [];
  const answered = questions.filter(item => String(item.answer || '').trim()).length;
  const tiles = [
    {
      id: 'anamnese',
      label: 'Anamnese',
      value: done,
      sub: `de ${total} ${plural(total, 'item', 'itens')}`,
      bar: total ? Math.round((done / total) * 100) : 0,
      link: 'Abrir anamnese',
      tab: PSYCHOLOGY_TABS.ANAMNESE,
    },
    {
      id: 'partes',
      label: 'Partes completas',
      value: partsDone,
      sub: `de ${route.length}`,
      link: 'Ver o roteiro',
      tab: PSYCHOLOGY_TABS.ANAMNESE,
    },
    {
      id: 'perguntas',
      label: 'Perguntas complementares',
      value: answered,
      sub: `de ${questions.length} ${plural(questions.length, 'respondida', 'respondidas')}`,
      link: 'Abrir perguntas',
      tab: PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES,
    },
  ];
  return (
    <div className="psi-welcome-tiles">
      {tiles.map(tile => (
        <button key={tile.id} type="button" className="psi-welcome-tile" onClick={() => onOpenTab?.(tile.tab)}>
          <span className="psi-welcome-tile-label">{tile.label}</span>
          <span className="psi-welcome-tile-value">
            {tile.value}
            <small> {tile.sub}</small>
          </span>
          {tile.bar !== undefined && (
            <span className="psi-welcome-bar" aria-hidden="true"><i style={{ width: `${tile.bar}%` }} /></span>
          )}
          <span className="psi-welcome-tile-link">{tile.link} →</span>
        </button>
      ))}
    </div>
  );
}

export function PsychologyPathChooser({
  session,
  selectedPatient,
  patientAge,
  onSelectIntakeProfile,
  onFillTestAnswers,
  fixedPath = null,
  route = null,
  onOpenTab,
}) {
  const [intakePath, setIntakePath] = useState(fixedPath);
  const currentProfile = getPsychologyIntakeProfile(session?.intakeProfile);
  const fixedLabel = PSYCHOLOGY_WELCOME_PATHS.find(path => path.id === fixedPath)?.label || '';
  const name = selectedPatient?.name || 'Paciente';
  const meta = [ageLabel(patientAge), 'Psicologia'].filter(Boolean).join(' · ');

  function choosePath(path) {
    setIntakePath(path.id);
  }

  return (
    <div className="psi-welcome">
      <section className="psi-welcome-hero" aria-label="Paciente selecionado">
        <span className="psi-welcome-avatar" aria-hidden="true">{getInitials(name)}</span>
        <div className="psi-welcome-who">
          <p className="psi-welcome-eyebrow">Paciente selecionado</p>
          <h2>{name}</h2>
          {meta && <p className="psi-welcome-meta">{meta}</p>}
        </div>
        <div className="psi-welcome-current">
          <span className="psi-welcome-pill">{currentProfile ? currentProfile.label : 'Anamnese ainda não definida'}</span>
          {currentProfile && onOpenTab && (
            <button type="button" className="psi-welcome-go" onClick={() => onOpenTab(PSYCHOLOGY_TABS.ANAMNESE)}>
              Continuar anamnese →
            </button>
          )}
        </div>
      </section>

      {!fixedPath && currentProfile && Array.isArray(route) && route.length > 0 && (
        <WelcomeShortcuts route={route} session={session} onOpenTab={onOpenTab} />
      )}

      <section className="psi-welcome-body">
        <div className="psi-welcome-body-head">
          <div>
            <h3>{fixedPath ? fixedLabel : 'Escolha o percurso'}</h3>
            <p className="psi-welcome-text">{PATH_TEXT}</p>
          </div>
          {onFillTestAnswers && (
            <button className="tag" type="button" onClick={onFillTestAnswers}>
              Preencher teste aleatório
            </button>
          )}
        </div>

        {!intakePath ? (
          <div className="psi-welcome-grid" aria-label="Percursos de Psicologia">
            {PSYCHOLOGY_WELCOME_PATHS.map((path, index) => {
              const eligible = isPsychologyPathEligible(path.id, patientAge);
              const inUse = currentProfile?.path === path.id;
              return (
                <button
                  key={path.id}
                  type="button"
                  className={`psi-welcome-card${inUse ? ' in-use' : ''}`}
                  disabled={!eligible}
                  onClick={() => choosePath(path)}
                >
                  <span className="psi-welcome-art"><PathGlyph path={path.id} /></span>
                  <span className="psi-welcome-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {inUse && <span className="psi-welcome-badge">Em uso</span>}
                  <b>{path.label}</b>
                  <small>{path.description}</small>
                  {eligible ? (
                    <span className="psi-welcome-cta">Escolher →</span>
                  ) : (
                    <span className="psi-path-warning">
                      {patientAge <= 17 ? 'Disponível a partir de 18 anos.' : 'Disponível até 17 anos.'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="psi-welcome-step">
            {!fixedPath && (
              <button type="button" className="psi-welcome-back" onClick={() => setIntakePath(null)}>← Voltar</button>
            )}
            <div>
              <p className="app-eyebrow">Segunda etapa</p>
              <h4>{intakePath === 'infantojuvenil' ? 'Escolha a anamnese infantil' : 'Escolha a anamnese adulta'}</h4>
              <p className="small">
                Esta escolha direciona perguntas específicas de sexo clínico. Não presume anatomia,
                desenvolvimento reprodutivo nem diagnóstico.
              </p>
            </div>
            <div className="psi-welcome-grid">
              {getPsychologyProfilesForPath(intakePath).map(profile => {
                const inUse = currentProfile?.id === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={`psi-welcome-card psi-welcome-card--profile${inUse ? ' in-use' : ''}`}
                    onClick={() => onSelectIntakeProfile?.(profile.id)}
                  >
                    {inUse && <span className="psi-welcome-badge">Em uso</span>}
                    <b>{profile.label}</b>
                    <small>{profileDescription(profile)}</small>
                    <span className="psi-welcome-cta">{inUse ? 'Abrir →' : 'Escolher →'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
