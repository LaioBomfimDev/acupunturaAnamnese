import { useState } from 'react';
import {
  PSYCHOLOGY_WELCOME_PATHS,
  getPsychologyIntakeProfile,
  getPsychologyProfilesForPath,
  isPsychologyPathEligible,
} from '../../data/psychologyIntakeProfiles';
import {
  PSYCHOLOGY_INTERVIEW_TABS,
  PSYCHOLOGY_TABS,
  anamnesePathOfTab,
} from '../../data/psychologyAnamnese';
import { INTERVIEW_SLOTS, interviewsForSlot } from '../../data/clinicalInterviews';
import { CLINICAL_INSTRUMENTS } from '../../data/clinicalInstruments';
import { summarizeRoute } from '../../utils/formRoute';
import { getInitials } from '../../utils/patientUi';
import { NavIcon } from '../Sidebar';
import '../../styles/psychologyWelcome.css';

// ============================================================
// Boas-vindas da Psicologia (Painel) e escolha do percurso.
// Visual de 16/10/2026 (prévias A + C escolhidas pela administradora):
// faixa do paciente na cor da tela (A), três atalhos com os números da
// anamnese (C, a mesma conta do "Pede atenção" do menu) e cartões
// grandes (A). Os cartões são os mesmos itens dos grupos Infantil, Adulto
// e Avaliação do menu (`menuGroups`, vindos da própria lista do menu,
// com os mesmos ícones): anamnese escolhe o percurso aqui; os demais
// abrem a parte.
// `fixedPath` (16/10/2026): aberto pela aba "Anamnese infantil" ou
// "Anamnese adulto" do menu, já começa na escolha daquele percurso.
// ============================================================

const PATH_TEXT = 'Escolha o percurso deste atendimento. Anamnese e avaliação são registros separados, '
  + 'mas permanecem vinculados ao mesmo paciente.';

// Sem a lista do menu, só as duas anamneses (como antes).
const DEFAULT_GROUPS = [
  { title: null, tabs: [PSYCHOLOGY_TABS.ANAMNESE_INFANTIL, PSYCHOLOGY_TABS.ANAMNESE_ADULTO] },
];

const PSYCHOLOGY_SCALE_COUNT = CLINICAL_INSTRUMENTS
  .filter(instrument => (instrument.disciplines || []).includes('psicologia')).length;

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

/** Linha de baixo do cartão de cada item do menu que não é anamnese. */
function tabDescription(tab, session) {
  const slot = PSYCHOLOGY_INTERVIEW_TABS[tab];
  if (slot) {
    const respondent = INTERVIEW_SLOTS[slot]?.respondent;
    const waiting = interviewsForSlot('psicologia', slot).length === 0;
    return [respondent ? `Quem responde: ${respondent}.` : '', waiting ? 'Aguardando o modelo da clínica.' : '']
      .filter(Boolean).join(' ');
  }
  if (tab === PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES) {
    const questions = Array.isArray(session?.complementaryQuestions) ? session.complementaryQuestions : [];
    if (!questions.length) return 'Nenhuma pergunta ainda.';
    const answered = questions.filter(item => String(item.answer || '').trim()).length;
    return `${answered} de ${questions.length} ${plural(questions.length, 'respondida', 'respondidas')}.`;
  }
  if (tab === PSYCHOLOGY_TABS.ESCALAS) {
    return `${PSYCHOLOGY_SCALE_COUNT} ${plural(PSYCHOLOGY_SCALE_COUNT, 'escala', 'escalas')} para aplicar no consultório ou enviar para casa.`;
  }
  return '';
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
  menuGroups = null,
}) {
  const [intakePath, setIntakePath] = useState(fixedPath);
  const currentProfile = getPsychologyIntakeProfile(session?.intakeProfile);
  const fixedLabel = PSYCHOLOGY_WELCOME_PATHS.find(path => path.id === fixedPath)?.label || '';
  const name = selectedPatient?.name || 'Paciente';
  const meta = [ageLabel(patientAge), 'Psicologia'].filter(Boolean).join(' · ');
  const groups = Array.isArray(menuGroups) && menuGroups.length ? menuGroups : DEFAULT_GROUPS;
  const numbers = new Map(groups.flatMap(group => group.tabs)
    .map((tab, index) => [tab, String(index + 1).padStart(2, '0')]));

  function renderCard(tab) {
    const number = numbers.get(tab);
    const pathId = anamnesePathOfTab(tab);
    const path = pathId ? PSYCHOLOGY_WELCOME_PATHS.find(item => item.id === pathId) : null;

    if (path) {
      const eligible = isPsychologyPathEligible(path.id, patientAge);
      const inUse = currentProfile?.path === path.id;
      return (
        <button
          key={tab}
          type="button"
          className={`psi-welcome-card${inUse ? ' in-use' : ''}`}
          disabled={!eligible}
          onClick={() => setIntakePath(path.id)}
        >
          <span className="psi-welcome-art"><NavIcon name={tab} /></span>
          <span className="psi-welcome-num" aria-hidden="true">{number}</span>
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
    }

    const description = tabDescription(tab, session);
    return (
      <button key={tab} type="button" className="psi-welcome-card" onClick={() => onOpenTab?.(tab)}>
        <span className="psi-welcome-art"><NavIcon name={tab} /></span>
        <span className="psi-welcome-num" aria-hidden="true">{number}</span>
        <b>{tab}</b>
        {description && <small>{description}</small>}
        <span className="psi-welcome-cta">Abrir →</span>
      </button>
    );
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
          <div className="psi-welcome-groups" aria-label="Percursos e partes da Psicologia">
            {groups.map(group => (
              <section
                key={group.title || 'percursos'}
                className={`psi-welcome-group${group.tabs.length > 2 ? ' psi-welcome-group--wide' : ''}`}
                aria-label={group.title || 'Percursos de Psicologia'}
              >
                {group.title && <p className="psi-welcome-group-title">{group.title}</p>}
                <div className="psi-welcome-grid">
                  {group.tabs.map(renderCard)}
                </div>
              </section>
            ))}
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
