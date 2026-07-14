// ============================================================
// Tela inicial da Revisora de curadoria (genérica por disciplina)
//
// À esquerda, o "bem-vindo" com a disciplina liberada (ela entra no
// workspace real, com pacientes, para validar a anamnese de ponta a
// ponta). À direita, o card de Curadoria com as abas DA SUA DISCIPLINA —
// clicar abre a superfície de curadoria em modo "propor".
//
// A disciplina vem do perfil (resolveReviewerDiscipline), não é chumbada:
// a revisora de acupuntura entra na Acupuntura; a de psicologia, na
// Psicologia, cada uma vendo só as seções da sua área.
// ============================================================

import { getDiscipline } from '../data/disciplines';
import { getReviewerDisplayName } from '../utils/reviewerDisplayName';
import { sectionsForDiscipline, isCurationSectionReady } from './panels/CurationSections';

const SECTION_ICONS = {
  points: 'point',
  'anamnese-knowledge': 'person',
  knowledge: 'book',
  'pdf-sources': 'document',
  'herbal-curation': 'leaf',
  'food-curation': 'food',
  'ai-corrections': 'spark',
  maps: 'pin',
  'anamnese-psic': 'person',
};

function ReviewerIcon({ name = 'folder' }) {
  const paths = {
    clinic: <><path d="M5 19c4.5-1.2 8.8-5.5 10-10l3-3" /><path d="m14 7 3 3" /><circle cx="8" cy="16" r="3" /></>,
    folder: <><path d="M3.5 7.5h6l2-2h9v13h-17z" /><path d="M3.5 9.5h17" /></>,
    point: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /></>,
    person: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" /></>,
    book: <><path d="M4 5.5c3.5-.7 6.2.1 8 2v12c-1.8-1.9-4.5-2.7-8-2z" /><path d="M20 5.5c-3.5-.7-6.2.1-8 2v12c1.8-1.9 4.5-2.7 8-2z" /></>,
    document: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></>,
    leaf: <><path d="M19.5 4.5C12 5 6.5 8.8 6.5 14a4.5 4.5 0 0 0 4.5 4.5c5.2 0 8-6.5 8.5-14z" /><path d="M4.5 20c2.5-4 5.5-7 10-10" /></>,
    food: <><path d="M5 11h14a7 7 0 0 1-14 0Z" /><path d="M8 8.5c0-1.5 1-2.5 2.5-2.5M12 8.5c0-2 1-3.5 3-4" /></>,
    pin: <><path d="M18 10c0 4.5-6 10-6 10S6 14.5 6 10a6 6 0 1 1 12 0Z" /><circle cx="12" cy="10" r="2" /></>,
    spark: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="m18.5 16 .6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6z" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name] || paths.folder}
    </svg>
  );
}

export function ReviewerHome({ therapistName, discipline = 'acupuntura', onEnterDiscipline, onOpenCuration, onSignOut }) {
  const meta = getDiscipline(discipline);
  const label = meta?.label || 'Atendimento';
  const reviewerName = getReviewerDisplayName(therapistName);
  const clinicGuide = discipline === 'psicologia'
    ? [
        'Crie ou escolha um paciente para começar a simulação.',
        'Abra a Anamnese e experimente as perguntas, marcações e recursos da tela.',
        'Percorra o fluxo como se fosse uma sessão e anote o que precisa ser ajustado.',
      ]
    : [
        'Crie ou escolha um paciente para começar a simulação.',
        'Preencha a Anamnese e experimente os campos, botões e abas do atendimento.',
        'Confira Evolução e Relatório como se fosse um atendimento real.',
      ];
  // Abas prontas para propor aparecem primeiro; as em preparação vão ao fim.
  const sections = [...sectionsForDiscipline(discipline)].sort(
    (a, b) => Number(isCurationSectionReady(b.id)) - Number(isCurationSectionReady(a.id)),
  );

  return (
    <main className="home-screen reviewer-home">
      <div className="reviewer-home-shell">
        <header className="home-hero reviewer-home-hero">
          <div>
            <h1>Olá, {reviewerName}, hora de revisar!</h1>
            <p>Primeiro, simule um atendimento para conhecer o sistema. Depois, revise o conteúdo e registre suas propostas.</p>
          </div>
          <button className="quiet-button reviewer-signout" type="button" onClick={onSignOut}>Sair</button>
        </header>

        <div className="home-grid reviewer-home-grid">
          {/* Bem-vindo / entrar na disciplina */}
          <section className="start-panel reviewer-clinic-card">
            <div className="reviewer-card-icon reviewer-card-icon-large">
              <ReviewerIcon name="clinic" />
            </div>
            <div>
              <p className="reviewer-eyebrow">1. Testar atendimento</p>
              <h2>{label}</h2>
              <p className="reviewer-card-copy">Faça uma simulação completa para entender como o profissional usa o sistema:</p>
              <ol className="reviewer-test-guide">
                {clinicGuide.map(step => <li key={step}>{step}</li>)}
              </ol>
              <p className="reviewer-test-note">
                Pode explorar à vontade: clique nos botões e navegue por todas as abas para conhecer o funcionamento.
              </p>
              <button className="primary-button" type="button" onClick={() => onEnterDiscipline?.(discipline)}>
                Começar teste
              </button>
            </div>
          </section>

          {/* Card de curadoria com as abas da disciplina */}
          <section className="start-panel reviewer-curation-card">
            <div className="reviewer-curation-head">
              <div className="reviewer-card-icon reviewer-card-icon-large">
                <ReviewerIcon name="folder" />
              </div>
              <div>
                <p className="reviewer-eyebrow">2. Revisar curadoria</p>
                <h2>Revisar e propor</h2>
                <p>Escolha uma área, revise o conteúdo e envie o que deve ser ajustado. O SuperAdm faz a aprovação final.</p>
              </div>
            </div>
            <div className="reviewer-section-list">
              {sections.map(item => {
                const ready = isCurationSectionReady(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="reviewer-section-row"
                    onClick={() => onOpenCuration?.(item.id)}
                  >
                    <span className="reviewer-card-icon">
                      <ReviewerIcon name={SECTION_ICONS[item.id]} />
                    </span>
                    <span className="reviewer-section-copy">
                      <b>{item.label}</b>
                      <small>{item.description}</small>
                    </span>
                    <span className={`curation-tab-flag ${ready ? 'is-ready' : 'is-soon'}`}>
                      {ready ? 'Editar' : 'Sugerir'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
