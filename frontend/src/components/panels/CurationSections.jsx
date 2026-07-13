// ============================================================
// Superfície de curadoria compartilhada
//
// Renderiza o painel de cada seção de curadoria a partir de um id.
// Usado pelo SuperAdmPanel (mode 'approve') e pelas telas de Revisora
// (mode 'propose'). O `actor` carrega papel, rótulo, modo e disciplina.
//
// As seções são FILTRADAS por disciplina (sectionsForDiscipline): a
// revisora de acupuntura vê as seções de MTC; a de psicologia vê a
// curadoria da anamnese de psicologia. O SuperAdm vê todas.
//
// Seções já integradas ao envio de propostas ao SuperAdm (modo propor):
//   anamnese-knowledge, points, anamnese-psic
// As demais renderizam normalmente; no modo propor exibem um aviso de
// que o envio ao SuperAdm ainda não está ligado nelas (follow-up).
// ============================================================

import { KnowledgeAdminPanel } from './KnowledgeAdminPanel';
import { PdfSourceLearningPanel } from './PdfSourceLearningPanel';
import { AnamneseKnowledgePanel } from './AnamneseKnowledgePanel';
import { AiInstructionsPanel } from './AiInstructionsPanel';
import { AICorrectionsPanel } from './AICorrectionsPanel';
import { HerbalPlantCurationPanel } from './HerbalPlantCurationPanel';
import { FoodCurationPanel } from './FoodCurationPanel';
import { MapCoordinateEditor } from './MapCoordinateEditor';
import { CurationPointsBrowser } from './CurationPointsBrowser';
import { PsychAnamneseCurationPanel } from './PsychAnamneseCurationPanel';
import { CurationGuide } from './CurationGuide';
import { CurationObservation } from './CurationObservation';

// Cada seção declara a quais disciplinas pertence. Sem `disciplines`
// (ou 'all') aparece em qualquer disciplina.
// eslint-disable-next-line react-refresh/only-export-components
export const CURATION_SECTIONS = [
  { id: 'points', label: 'Pontos comuns/ocultos', description: 'Base completa e promoção', disciplines: ['acupuntura'] },
  { id: 'anamnese-knowledge', label: 'Conhecimento da Anamnese', description: 'Achados e padrões', disciplines: ['acupuntura'] },
  { id: 'knowledge', label: 'Alimentação', description: 'Biblioteca Viva', disciplines: ['acupuntura'] },
  { id: 'pdf-sources', label: 'Fontes PDF', description: 'Pontos não respondidos', disciplines: ['acupuntura'] },
  { id: 'herbal-curation', label: 'Curadoria de ervas', description: 'Fonte e segurança', disciplines: ['acupuntura'] },
  { id: 'food-curation', label: 'Curadoria de alimentos', description: 'Dietoterapia educativa', disciplines: ['acupuntura'] },
  { id: 'ai-instructions', label: 'Instruções da IA', description: 'Diretrizes que a IA segue', disciplines: ['acupuntura'] },
  { id: 'ai-corrections', label: 'Correções da IA', description: 'Ensino e aprovação', disciplines: ['acupuntura'] },
  { id: 'maps', label: 'Calibração de Mapa', description: 'Coordenadas dos pontos', disciplines: ['acupuntura'] },
  { id: 'anamnese-psic', label: 'Curadoria da Anamnese', description: 'Risco, eixos e checklist (Psicologia)', disciplines: ['psicologia'] },
];

// Seções cujo modo "propor" já envia para a fila do SuperAdm.
const PROPOSE_READY = new Set(['anamnese-knowledge', 'points', 'anamnese-psic']);

// eslint-disable-next-line react-refresh/only-export-components
export function isCurationSectionReady(id) {
  return PROPOSE_READY.has(id);
}

/**
 * Seções visíveis para uma disciplina. O SuperAdm (discipline ausente)
 * vê todas; uma revisora vê apenas as da sua disciplina.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function sectionsForDiscipline(discipline) {
  if (!discipline) return CURATION_SECTIONS;
  return CURATION_SECTIONS.filter(s => !s.disciplines || s.disciplines.includes(discipline));
}

export function CurationSections({ activeSection, actor = { role: 'super_admin', label: 'SuperAdm', mode: 'approve' } }) {
  const isPropose = actor?.mode === 'propose';
  const ready = PROPOSE_READY.has(activeSection);

  // No modo revisora, abas ainda sem edição estruturada mostram o guia +
  // a caixa "sugerir correção" (proposta em texto) — sem o painel técnico
  // do SuperAdm, para não confundir.
  if (isPropose && !ready) {
    const sectionLabel = CURATION_SECTIONS.find(s => s.id === activeSection)?.label || '';
    return (
      <div className="curation-guided" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CurationGuide sectionId={activeSection} ready={false} sectionLabel={sectionLabel} />
        <CurationObservation section={activeSection} actor={actor} />
      </div>
    );
  }

  return (
    <div className={isPropose ? 'curation-guided' : undefined}>
      {isPropose && <CurationGuide sectionId={activeSection} ready={ready} />}

      {activeSection === 'points' ? (
        <CurationPointsBrowser actor={actor} />
      ) : activeSection === 'anamnese-knowledge' ? (
        <AnamneseKnowledgePanel actor={actor} />
      ) : activeSection === 'anamnese-psic' ? (
        <PsychAnamneseCurationPanel actor={actor} />
      ) : activeSection === 'knowledge' ? (
        <KnowledgeAdminPanel />
      ) : activeSection === 'pdf-sources' ? (
        <PdfSourceLearningPanel />
      ) : activeSection === 'herbal-curation' ? (
        <HerbalPlantCurationPanel />
      ) : activeSection === 'food-curation' ? (
        <FoodCurationPanel />
      ) : activeSection === 'ai-instructions' ? (
        <AiInstructionsPanel />
      ) : activeSection === 'ai-corrections' ? (
        <AICorrectionsPanel />
      ) : activeSection === 'maps' ? (
        <MapCoordinateEditor
          approvalActorRole={actor?.role || 'super_admin'}
          approvalActorLabel={actor?.label || 'SuperAdm'}
        />
      ) : null}
    </div>
  );
}
