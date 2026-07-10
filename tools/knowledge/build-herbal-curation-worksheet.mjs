#!/usr/bin/env node
/**
 * build-herbal-curation-worksheet.mjs
 *
 * Gera uma PLANILHA DE CURADORIA para um subconjunto de ervas de baixo risco
 * do catálogo `plant-catalog.local.json` (E-book Ervas Medicinais). É o
 * equivalente, para dietoterapia/ervas, do `build-quarantine-curation-worksheet.mjs`
 * dos pontos: prepara o trabalho para o acupunturista APROVAR/EDITAR, sem nunca
 * aplicar nada aos dados clínicos (gate humano inegociável — AGENTS.md §0).
 *
 * O que faz:
 *   - seleciona os `plantId` de um OVERLAY curado (abaixo), redigido à mão a
 *     partir do texto real da fonte (partes usadas, indicações e toxicologia);
 *   - para cada erva, mostra lado a lado o trecho da fonte e a SÍNTESE
 *     EDUCATIVA + CAUTELAS já redigidas na linguagem segura da política
 *     (`docs/nutricao-ervas/01-politica-de-liberacao-e-seguranca.md`);
 *   - sugere um status de liberação (`educativo_aprovado` ou
 *     `restrito_profissional`) como PROPOSTA — a decisão é da profissional.
 *
 * O que NÃO faz:
 *   - não inventa associação MTC: o E-book é fonte botânica/uso popular e não
 *     traz `traditionalMtcAssociations`; o campo fica vazio de propósito;
 *   - não escreve dose, preparo terapêutico nem cardápio;
 *   - não altera `herbal-curation-seed-decisions.local.json` nem
 *     `localStorage`; não libera nada ao paciente.
 *
 * Uso: node tools/knowledge/build-herbal-curation-worksheet.mjs
 * Saída: docs/herbal-curation-worksheet.md  +  .json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const CATALOG_PATH = path.join(
  root, 'frontend', '.local-source-assets', 'pdf-sources', 'ebook-ervas-medicinais', 'plant-catalog.local.json',
);
const OUT_MD = path.join(root, 'docs', 'herbal-curation-worksheet.md');
const OUT_JSON = path.join(root, 'docs', 'herbal-curation-worksheet.json');

export const HERBAL_DISCLAIMER = 'O uso de plantas medicinais e fitoterápicos pode apresentar contraindicações, toxicidade e interações medicamentosas. Este conteúdo é educativo e não orienta uso, preparo, dose ou combinação sem avaliação profissional.';

/**
 * Overlay curado por `plantId`. Cada síntese foi redigida a partir do texto
 * real da fonte (ver trecho mostrado na planilha), convertendo linguagem de
 * "cura/indicado" para "uso tradicional descrito na fonte" e trazendo a
 * cautela em primeiro lugar.
 *
 * tier:
 *   A — erva culinária de baixo risco, atóxica nas doses usuais → proposta
 *       `educativo_aprovado` (cautela padrão);
 *   B — culinária/tradicional que exige CAUTELA REFORÇADA (abortivo,
 *       embriotóxico, pressão, sedação) → proposta `educativo_aprovado` só se
 *       a cautela dominante for aceita, senão `restrito_profissional`;
 *   C — uso terapêutico específico (não é tempero simples) → proposta
 *       `restrito_profissional` até avaliação individual.
 */
export const CURATED = {
  // ---- Tier A: culinárias de baixo risco -------------------------------------
  'gengibre-zingiber-officinale-p209': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Rizoma de uso culinário e tradicional. A fonte associa o uso a queixas digestivas e respiratórias, como náusea, enjoo, cólicas do estômago e do intestino e resfriados. Conteúdo educativo para conversar com a profissional; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte relata que o uso externo indevido ou abusivo pode provocar queimaduras. Tolerância, quantidade, gestação, lactação, uso de medicamentos e condições de saúde precisam ser avaliados com a profissional antes de qualquer uso.',
  },
  'camomila-chamomilla-recutita-p094': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Capítulos florais de uso tradicional em desconfortos digestivos e como calmante, como embaraços gástricos, cólicas e náuseas. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte a considera atóxica em pessoas saudáveis, mas relata rinite alérgica em pessoas sensíveis à camomila e recomenda que gestantes e lactantes evitem o uso. Avaliar tolerância, alergias e medicamentos com a profissional.',
  },
  'funcho-foeniculum-vulgare-p205': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Sementes e frutos de uso culinário e tradicional em queixas digestivas, como constipações estomacais e intestinais, cólicas e azia. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte relata que quantidade elevada (acima de 20 g por litro) pode ter efeito convulsivante. Não usar de forma concentrada; gestação, lactação, epilepsia e medicamentos devem ser avaliados com a profissional.',
  },
  'hortela-comum-mentha-villosa-p226': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Folhas de uso culinário e tradicional em atonia digestiva e desconfortos gástricos. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte relata que o uso prolongado ou a ingestão antes de dormir pode resultar em insônia. Tolerância, gestação, lactação e medicamentos devem ser avaliados com a profissional.',
  },
  'coentro-coriandrum-sativum-p149': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Frutos, folhas e raízes de uso culinário; a fonte associa o uso tradicional a afecções gastrintestinais e à acidez estomacal. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte relata que, em excesso, pode causar lesões renais. Quantidade, condições renais e medicamentos devem ser avaliados com a profissional.',
  },
  'malva-comum-malva-parviflora-p264': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Infusão de uso tradicional em afecções das mucosas da boca e da garganta, geralmente em gargarejos. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A identificação botânica correta da malva é essencial, pois há espécies semelhantes. Tolerância, gestação, lactação e medicamentos devem ser avaliados com a profissional.',
  },
  'alcachofra-cynara-scolymus-p012': {
    tier: 'A', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Folhas de uso alimentar e tradicional associadas, na fonte, a digestão e a funções hepáticas e biliares. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte relata que pode reduzir a lactação. Lactantes devem ter cautela; condições hepáticas e biliares e uso de medicamentos devem ser avaliados com a profissional.',
  },

  // ---- Tier B: culinárias/tradicionais com cautela reforçada ------------------
  'alecrim-rosmarinus-officinalis-p014': {
    tier: 'B', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Folhas de uso culinário e tradicional associadas, na fonte, a cansaço físico e mental e a queixas digestivas. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'Atenção: em altas doses a fonte descreve toxicidade, efeito abortivo e embriotóxico e possível gastroenterite ou nefrite. Gestantes devem evitar. Dose, condições renais e medicamentos devem ser avaliados com a profissional.',
    reviewNote: 'Cautela de gestação/abortivo é dominante. Aprovar como educativo só se a ficha exibir essa cautela em destaque; caso contrário, manter restrito.',
  },
  'canela-cheirosa-cinnamomum-zeylanicum-p105': {
    tier: 'B', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Casca de uso culinário e tradicional em desconfortos digestivos e em sensação de frio nas extremidades. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'Atenção: a fonte descreve a planta como embriotóxica e abortiva, desaconselhada a gestantes e a pessoas febris. Gestação, febre e medicamentos devem ser avaliados com a profissional.',
    reviewNote: 'Cautela de gestação/abortivo é dominante. Uso como tempero em quantidade usual difere de uso concentrado; a ficha deve deixar isso explícito.',
  },
  'salvia-salvia-officinalis-p348': {
    tier: 'B', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Ramos e folhas de uso culinário e tradicional em inflamações da garganta e da boca. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte a considera atóxica nas doses usuais, mas recomenda que gestantes evitem e alerta que doses elevadas podem aumentar a pressão arterial. Gestação, pressão e medicamentos devem ser avaliados com a profissional.',
    reviewNote: 'Cautela de gestação e de pressão arterial. Adequada a educativo com essas cautelas em destaque.',
  },
  'acafrao-da-india-curcuma-longa-p001': {
    tier: 'B', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Rizoma de uso culinário como tempero (cúrcuma) e de uso tradicional associado, na fonte, a digestão e circulação. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'A fonte relata que doses altas podem causar embriaguez, sono e delírio. O uso como tempero em quantidade usual difere de uso concentrado. Gestação, uso de medicamentos e condições de saúde devem ser avaliados com a profissional.',
    reviewNote: 'Sem menção de interação medicamentosa específica na fonte; não acrescentar interações não rastreadas (ex.: anticoagulantes) sem fonte própria revisada.',
  },
  'capim-limao-cymbopogon-citratus-p108': {
    tier: 'B', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Folhas de uso tradicional como calmante e em desconfortos digestivos e cólicas. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'Atenção: a fonte relata que doses concentradas podem provocar aborto, baixar demais a pressão e causar desmaios. Não usar concentrado; gestação, pressão arterial e medicamentos devem ser avaliados com a profissional.',
    reviewNote: 'Cautela de gestação/abortivo e de hipotensão. Aprovar como educativo só com essas cautelas em destaque.',
  },
  'salvia-do-rio-grande-lippia-alba-p351': {
    tier: 'B', suggestedStatus: 'educativo_aprovado',
    educationalSummary: 'Folhas de uso tradicional como calmante e em desconfortos digestivos; a fonte registra em estudo efeito hipnótico e ansiolítico. Conteúdo educativo; não orienta uso, dose ou preparo.',
    cautionSummary: 'Pela ação sedativa relatada, há risco ao combinar com medicamentos que causam sonolência ou ao operar veículos e máquinas. Gestação, lactação e medicamentos devem ser avaliados com a profissional.',
    reviewNote: 'Cautela de sedação e de interação com depressores do SNC. Verificar identificação (Lippia alba tem vários quimiotipos).',
  },

  // ---- Tier C: uso terapêutico específico → restrito -------------------------
  'boldo-do-reino-coleus-barbatus-p076': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Folhas de uso tradicional associado, na fonte, a queixas hepáticas e digestivas. Conteúdo de estudo; uso terapêutico específico depende de avaliação individual.',
    cautionSummary: 'Uso ligado a fígado e vias biliares exige avaliação de condições hepáticas, gestação, lactação e medicamentos. Manter restrito à avaliação individual.',
    reviewNote: 'Não é tempero de baixo risco; uso tradicional é terapêutico (fígado/vesícula). Sugerido restrito até auditoria completa.',
  },
  'carqueja-bacharis-articulata-p119': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Parte aérea de uso tradicional associado, na fonte, a queixas digestivas e hepáticas. Conteúdo de estudo; uso terapêutico depende de avaliação individual.',
    cautionSummary: 'A fonte traz alegações amplas (inclusive sobre fertilidade) e atividade biológica; exige avaliação de gestação, lactação, glicemia e medicamentos. Manter restrito à avaliação individual.',
    reviewNote: 'Alegações de fertilidade e atividade biológica pedem cautela; não é uso culinário simples.',
  },
  'cidreira-hedyosmum-brasiliense-p138': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Folhas de uso tradicional como calmante e em desconfortos diversos. Conteúdo de estudo; uso depende de avaliação individual.',
    cautionSummary: 'Há confusão popular entre várias plantas chamadas "cidreira"; a identificação botânica precisa ser confirmada antes de qualquer uso. Manter restrito à avaliação individual.',
    reviewNote: 'Risco de troca de espécie (nome popular "cidreira" ambíguo). Confirmar identidade botânica antes de considerar educativo.',
  },
  'espinheira-santa-maytenus-ilicifolia-p186': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Folhas de uso tradicional associado, na fonte, a queixas gástricas como úlceras e gastrite. Conteúdo de estudo; uso terapêutico depende de avaliação individual.',
    cautionSummary: 'A fonte traz alegações fortes (inclusive anticancerígena) que não devem ser expostas ao paciente; pode reduzir a lactação segundo a literatura. Manter restrito à avaliação individual.',
    reviewNote: 'Uso terapêutico gástrico e alegações fortes na fonte. Não liberar como educativo geral.',
  },
  'guaco-mikania-glomerata-p218': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Folhas de uso tradicional associado, na fonte, a queixas respiratórias e tosse; a farmacologia registra efeito broncodilatador. Conteúdo de estudo; uso depende de avaliação individual.',
    cautionSummary: 'A cumarina presente pode interagir com anticoagulantes; uso respiratório terapêutico exige avaliação de medicamentos e condições de saúde. Manter restrito à avaliação individual.',
    reviewNote: 'Interação com anticoagulantes (cumarina) é área de dano real. Restrito até auditoria de interações.',
  },
  'hortela-vique-mentha-arvensis-p232': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Folhas de uso tradicional em queixas respiratórias e digestivas; rica em mentol. Conteúdo de estudo; uso depende de avaliação individual.',
    cautionSummary: 'O alto teor de mentol pede cautela em bebês e crianças pequenas e em pessoas com refluxo. Identificação e uso devem ser avaliados com a profissional. Manter restrito à avaliação individual.',
    reviewNote: 'Mentol em concentração alta; cautela pediátrica. Restrito até auditoria de grupos vulneráveis.',
  },
  'salsaparrilha-smilax-spp-p346': {
    tier: 'C', suggestedStatus: 'restrito_profissional',
    educationalSummary: 'Raiz de uso tradicional associado, na fonte, a doenças de pele e do trato urinário. Conteúdo de estudo; uso terapêutico depende de avaliação individual.',
    cautionSummary: 'Identificação apenas por gênero (Smilax spp.) na fonte; a espécie e a parte usada precisam ser confirmadas. Uso terapêutico exige avaliação individual. Manter restrito.',
    reviewNote: 'Identidade botânica incompleta (spp.). Não liberar como educativo sem confirmar espécie.',
  },
};

const TIER_SECTIONS = {
  A: {
    title: 'Tier A — culinárias de baixo risco',
    subtitle: 'Proposta: educativo aprovado, com cautela padrão',
  },
  B: {
    title: 'Tier B — culinárias com cautela reforçada',
    subtitle: 'Proposta: educativo aprovado só com a cautela dominante em destaque',
  },
  C: {
    title: 'Tier C — uso terapêutico específico',
    subtitle: 'Proposta: restrito à profissional até avaliação individual',
  },
};

// Os 6 checks de segurança do painel (herbalPlantCuration.js). A planilha
// mostra quais a fonte já sustenta e quais dependem de conferência humana.
const SAFETY_CHECKS = [
  'botanicalIdentityConfirmed',
  'partUsedConfirmed',
  'toxicologyReviewed',
  'interactionsReviewed',
  'vulnerableGroupsReviewed',
  'sourceScopeConfirmed',
];

function loadCatalog(catalog) {
  if (catalog) return catalog;
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

export function buildHerbalWorksheet({ catalog } = {}) {
  const pkg = loadCatalog(catalog);
  const byId = new Map((pkg.items || []).map(item => [item.id, item]));

  const entries = Object.entries(CURATED).map(([plantId, curated]) => {
    const plant = byId.get(plantId);
    if (!plant) throw new Error(`Planta não encontrada no catálogo: ${plantId}`);
    const s = plant.sourceSections || {};
    const hasParts = Boolean(s.partsUsed?.text);
    const hasToxicology = Boolean(s.toxicology?.text);

    return {
      plantId,
      commonName: plant.commonName,
      scientificName: plant.scientificNameSource || plant.scientificNameLookup || '',
      botanicalFamily: plant.botanicalFamily || '',
      sourcePdfPages: plant.sourcePdfPages || [],
      tier: curated.tier,
      suggestedStatus: curated.suggestedStatus,
      educationalSummary: curated.educationalSummary,
      cautionSummary: curated.cautionSummary,
      reviewNote: curated.reviewNote || null,
      // trechos da fonte, para conferência lado a lado
      source: {
        partsUsed: s.partsUsed?.text || '',
        traditionalIndications: s.traditionalIndications?.text || '',
        toxicology: s.toxicology?.text || '',
      },
      // Nenhuma associação MTC é proposta: a fonte não a fornece.
      mtcAssociation: {
        available: (plant.traditionalMtcAssociations || []).length > 0,
        status: plant.traditionalMtcAssociationStatus || 'not_available_in_source',
      },
      // pré-aferição dos checks: a fonte sustenta parte usada e toxicologia;
      // identidade, interações, grupos vulneráveis e escopo são conferência humana.
      safetyReadiness: {
        botanicalIdentityConfirmed: false,
        partUsedConfirmed: hasParts,
        toxicologyReviewed: hasToxicology,
        interactionsReviewed: false,
        vulnerableGroupsReviewed: false,
        sourceScopeConfirmed: false,
      },
    };
  });

  entries.sort((a, b) => (a.tier + a.commonName).localeCompare(b.tier + b.commonName, 'pt-BR'));

  const byStatus = entries.reduce((acc, e) => ((acc[e.suggestedStatus] = (acc[e.suggestedStatus] || 0) + 1), acc), {});
  return {
    schemaVersion: 'sistema-acup-herbal-curation-worksheet.v1',
    generatedAt: new Date().toISOString(),
    disclaimer: HERBAL_DISCLAIMER,
    policy: {
      appliesToClinicalData: false,
      requiresProfessionalAudit: true,
      inventedMtcAssociations: false,
      note: 'Material de revisão. Nenhuma decisão foi gravada; a profissional aprova ou edita no painel do SuperAdm.',
    },
    counts: {
      total: entries.length,
      educativoAprovadoProposto: byStatus.educativo_aprovado || 0,
      restritoProfissionalProposto: byStatus.restrito_profissional || 0,
    },
    entries,
  };
}

function cell(v) {
  return String(v || '').replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '/').trim() || '—';
}

const STATUS_LABEL = {
  educativo_aprovado: 'educativo aprovado (proposto)',
  restrito_profissional: 'restrito à profissional (proposto)',
};

const CHECK_LABEL = {
  botanicalIdentityConfirmed: 'Espécie botânica confirmada',
  partUsedConfirmed: 'Parte usada confirmada',
  toxicologyReviewed: 'Toxicologia revisada',
  interactionsReviewed: 'Interações revisadas',
  vulnerableGroupsReviewed: 'Grupos vulneráveis revisados',
  sourceScopeConfirmed: 'Escopo educativo conferido',
};

function renderMd(ws) {
  const L = [];
  L.push('# Planilha de curadoria — ervas de baixo risco (dietoterapia)');
  L.push('');
  L.push('## Versão redigida para aprovação profissional');
  L.push('');
  L.push('> Material de REVISÃO. Nada aqui foi aplicado aos dados clínicos nem liberado ao paciente.');
  L.push('> A síntese educativa e as cautelas foram redigidas a partir do texto real da fonte (E-book Ervas Medicinais), mostrado em cada ficha.');
  L.push('> Não há associação MTC: a fonte não a fornece; não inventar. Nenhuma dose, preparo terapêutico ou cardápio.');
  L.push('> Fluxo: a acupunturista revisa, edita se necessário e marca o status + os 6 checks de segurança no `HerbalPlantCurationPanel` (SuperAdm).');
  L.push('> Regras: `docs/nutricao-ervas/01-politica-de-liberacao-e-seguranca.md` e `docs/plano-dietoterapia.md`.');
  L.push('');
  L.push(`**Aviso obrigatório de cada ficha de erva:** ${ws.disclaimer}`);
  L.push('');
  L.push(`**Resumo:** ${ws.counts.total} ervas | ${ws.counts.educativoAprovadoProposto} propostas como educativo aprovado | ${ws.counts.restritoProfissionalProposto} propostas como restrito à profissional.`);
  L.push('');

  const byTier = { A: [], B: [], C: [] };
  for (const e of ws.entries) byTier[e.tier].push(e);

  for (const tier of ['A', 'B', 'C']) {
    const section = TIER_SECTIONS[tier];
    L.push(`## ${section.title}`);
    L.push('');
    L.push(`_${section.subtitle}_`);
    L.push('');
    for (const e of byTier[tier]) {
      const pages = e.sourcePdfPages.length ? `PDF p. ${e.sourcePdfPages.join(', ')}` : 'página não informada';
      L.push(`### ${e.commonName} — _${e.scientificName}_`);
      L.push('');
      L.push(`- Família: ${e.botanicalFamily || '—'} · Fonte: E-book Ervas Medicinais, ${pages}`);
      L.push(`- Status proposto: **${STATUS_LABEL[e.suggestedStatus]}**`);
      L.push(`- Associação MTC: ${e.mtcAssociation.available ? 'ver ficha' : 'não consta na fonte (não preencher)'}`);
      L.push('');
      L.push('| campo | conteúdo |');
      L.push('| --- | --- |');
      L.push(`| Síntese educativa | ${cell(e.educationalSummary)} |`);
      L.push(`| Cautelas (vêm primeiro) | ${cell(e.cautionSummary)} |`);
      L.push(`| Fonte · parte usada | ${cell(e.source.partsUsed)} |`);
      L.push(`| Fonte · indicações tradicionais | ${cell(e.source.traditionalIndications)} |`);
      L.push(`| Fonte · toxicologia | ${cell(e.source.toxicology)} |`);
      L.push('');
      const checks = SAFETY_CHECKS
        .map(k => `${e.safetyReadiness[k] ? '[x]' : '[ ]'} ${CHECK_LABEL[k]}`)
        .join(' · ');
      L.push(`**Checks de segurança** (marcados = já sustentados pela fonte; vazios = conferência humana): ${checks}`);
      if (e.reviewNote) {
        L.push('');
        L.push(`**Nota de curadoria:** ${e.reviewNote}`);
      }
      L.push('');
    }
  }
  return L.join('\n');
}

export function run() {
  const ws = buildHerbalWorksheet();
  fs.writeFileSync(OUT_JSON, JSON.stringify(ws, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_MD, renderMd(ws), 'utf8');
  return ws;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const ws = run();
  const byTier = ws.entries.reduce((a, e) => ((a[e.tier] = (a[e.tier] || 0) + 1), a), {});
  console.log(`[herbal-worksheet] ${ws.counts.total} ervas | tier A=${byTier.A || 0} B=${byTier.B || 0} C=${byTier.C || 0}`);
  console.log(`[herbal-worksheet] educativo=${ws.counts.educativoAprovadoProposto} restrito=${ws.counts.restritoProfissionalProposto}`);
  console.log(`[herbal-worksheet] ${path.relative(root, OUT_MD)}`);
}
