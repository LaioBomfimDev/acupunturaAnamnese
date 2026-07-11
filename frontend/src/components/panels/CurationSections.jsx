// ============================================================
// Superfície de curadoria compartilhada
//
// Renderiza o painel de cada seção de curadoria a partir de um id.
// Usado pelo SuperAdmPanel (mode 'approve') e pela tela da Acupunturista
// Revisora (mode 'propose'). O `actor` carrega papel, rótulo e modo.
//
// Seções já integradas ao envio de propostas ao SuperAdm (modo propor):
//   anamnese-knowledge, points
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

// eslint-disable-next-line react-refresh/only-export-components
export const CURATION_SECTIONS = [
  { id: 'points', label: 'Pontos comuns/ocultos', description: 'Base completa e promoção' },
  { id: 'anamnese-knowledge', label: 'Conhecimento da Anamnese', description: 'Achados e padrões' },
  { id: 'knowledge', label: 'Alimentação', description: 'Biblioteca Viva' },
  { id: 'pdf-sources', label: 'Fontes PDF', description: 'Pontos não respondidos' },
  { id: 'herbal-curation', label: 'Curadoria de ervas', description: 'Fonte e segurança' },
  { id: 'food-curation', label: 'Curadoria de alimentos', description: 'Dietoterapia educativa' },
  { id: 'ai-instructions', label: 'Instruções da IA', description: 'Diretrizes que a IA segue' },
  { id: 'ai-corrections', label: 'Correções da IA', description: 'Ensino e aprovação' },
  { id: 'maps', label: 'Calibração de Mapa', description: 'Coordenadas dos pontos' },
];

// Seções cujo modo "propor" já envia para a fila do SuperAdm.
const PROPOSE_READY = new Set(['anamnese-knowledge', 'points']);

export function CurationSections({ activeSection, actor = { role: 'super_admin', label: 'SuperAdm', mode: 'approve' } }) {
  const isPropose = actor?.mode === 'propose';
  const notReady = isPropose && !PROPOSE_READY.has(activeSection);

  return (
    <>
      {notReady && (
        <div className="inline-notice inline-error" style={{ marginBottom: 12 }}>
          Nesta aba o envio direto ao SuperAdm ainda está em implementação. Use
          <b> Pontos comuns/ocultos </b> e <b> Conhecimento da Anamnese </b> para propor
          alterações que chegam à fila de aprovação.
        </div>
      )}

      {activeSection === 'points' ? (
        <CurationPointsBrowser actor={actor} />
      ) : activeSection === 'anamnese-knowledge' ? (
        <AnamneseKnowledgePanel actor={actor} />
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
    </>
  );
}
