import fs from 'fs';
import path from 'path';

// Diretórios principais
const FRONTEND_DIR = 'c:/Users/m/Downloads/Sistema Acup/frontend';

function resolvePath(subPath) {
  return path.join(FRONTEND_DIR, subPath);
}

// Helper para ler arquivos de forma segura
function readTextFile(subPath) {
  const p = resolvePath(subPath);
  if (fs.existsSync(p)) {
    return fs.readFileSync(p, 'utf-8');
  }
  return '';
}

function readJsonFile(subPath) {
  const text = readTextFile(subPath);
  if (text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`Erro ao fazer parse de ${subPath}:`, e);
    }
  }
  return null;
}

// Helper de normalização
function normalizeCode(code) {
  if (!code) return '';
  if (code.startsWith('auricular:')) return code;
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function main() {
  console.log('=== INICIANDO EXTRACAO DE DADOS CLINICOS COM METODOS SEGUROS ===\n');

  // ==========================================
  // 1. CARREGAR FONTES DE DADOS
  // ==========================================
  const mapLocationsJs = readTextFile('src/knowledge/mapLocations.js');
  const knowledgeBaseJs = readTextFile('src/knowledge/knowledgeBase.js');
  const highConfidenceJs = readTextFile('src/knowledge/generated/high-confidence-map-locations.js');
  const mediumConfidenceJs = readTextFile('src/knowledge/generated/medium-confidence-map-locations.js');
  const auricularPdfPointsJs = readTextFile('src/knowledge/generated/auricular-pdf-points.js');

  const sourceIndexLocal = readJsonFile('.local-source-assets/atlas-ednea/source-index.local.json');
  const sourceIndexPublic = readJsonFile('public/knowledge/source-assets/atlas-ednea/source-index.json');
  const acupointsEnriched = readJsonFile('src/knowledge/generated/km-agent/acupoints.enriched.json');

  // ==========================================
  // 2. ANALISAR PONTOS CURADOS (VISTOS E ATIVOS NO FRONTEND)
  // ==========================================
  // Extrair pontos de knowledgeBase.js por regex
  // Vamos buscar todos os blocos de acupoint({...}) e auricularPoint({...})
  const acupointsInCode = [];
  const acupointsRegex = /acupoint\(\{\s*code:\s*'([^']+)'/g;
  let match;
  while ((match = acupointsRegex.exec(knowledgeBaseJs)) !== null) {
    acupointsInCode.push(normalizeCode(match[1]));
  }

  const auricularsInCode = [];
  // auricularPoint({ slug: '...' })
  const auricularsRegex = /slug:\s*'([^']+)'/g;
  // Apenas a lista auricularPoints
  const auricularPointsSection = knowledgeBaseJs.substring(
    knowledgeBaseJs.indexOf('export const auricularPoints ='),
    knowledgeBaseJs.indexOf('export const patternDefinitions =')
  );
  while ((match = auricularsRegex.exec(auricularPointsSection)) !== null) {
    auricularsInCode.push(match[1]);
  }

  // Contagem de pontos auriculares gerados a partir do PDF (que não colidem com os basais)
  // em auricular-pdf-points.js
  const pdfAuricularSlugs = [];
  const pdfAurRegex = /slug:\s*'([^']+)'/g;
  while ((match = pdfAurRegex.exec(auricularPdfPointsJs)) !== null) {
    pdfAuricularSlugs.push(match[1]);
  }
  // Os basais estão em baseAuricularSlugs no code:
  const baseAuricularSlugs = new Set(['shen-men', 'subcortex', 'figado', 'baco', 'estomago', 'rim', 'endocrino', 'ansiedade', 'coracao', 'sono', 'fome']);
  const uniquePdfAuriculars = pdfAuricularSlugs.filter(slug => !baseAuricularSlugs.has(slug));

  const totalSistemicoAtivo = acupointsInCode.length;
  const totalAuricularAtivo = baseAuricularSlugs.size + uniquePdfAuriculars.length;
  const totalCuratedAtivos = totalSistemicoAtivo + totalAuricularAtivo;

  console.log('--- 1. PONTOS ATIVOS NA BASE CURADA (VISTOS E CARREGADOS) ---');
  console.log(`- Total de pontos sistêmicos curados (cadastrados na mão): ${totalSistemicoAtivo}`);
  console.log(`- Total de pontos auriculares curados: ${totalAuricularAtivo}`);
  console.log(`  * Basais/Protocolos: ${baseAuricularSlugs.size}`);
  console.log(`  * Importados de PDFs auriculares: ${uniquePdfAuriculars.length}`);
  console.log(`- Total geral de pontos ativos na base curada: ${totalCuratedAtivos}`);
  console.log('');

  // ==========================================
  // 3. ANALISAR PONTOS COM COORDENADAS NOS MAPAS
  // ==========================================
  const mapUniquePoints = new Set();
  const mapLocationsSistemico = new Set();
  const mapLocationsAuricular = new Set();

  // A. Do pointLocations em mapLocations.js
  // Vamos dar match em { code: '...', ... } ou { code: "...", ... }
  const pointLocRegex = /code:\s*'([^']+)'/g;
  while ((match = pointLocRegex.exec(mapLocationsJs)) !== null) {
    const code = match[1];
    if (code.startsWith('auricular:')) {
      mapLocationsAuricular.add(code);
    } else {
      mapLocationsSistemico.add(normalizeCode(code));
    }
    mapUniquePoints.add(normalizeCode(code));
  }

  // B. Do high-confidence-map-locations.js
  // ROWS = [["BL1", ...]]
  const highConfidenceRowsRegex = /"([A-Z0-9-]+)",/g;
  const highConfidenceCodes = [];
  while ((match = highConfidenceRowsRegex.exec(highConfidenceJs)) !== null) {
    const code = normalizeCode(match[1]);
    highConfidenceCodes.push(code);
    mapUniquePoints.add(code);
    mapLocationsSistemico.add(code);
  }

  // C. Do medium-confidence-map-locations.js
  const mediumConfidenceCodes = [];
  while ((match = highConfidenceRowsRegex.exec(mediumConfidenceJs)) !== null) {
    const code = normalizeCode(match[1]);
    mediumConfidenceCodes.push(code);
    mapUniquePoints.add(code);
    mapLocationsSistemico.add(code);
  }

  // D. Do auricularPdfMapLocations em auricular-pdf-points.js
  // auricularPdfMapLocations é derivado de auricularPdfPoints
  // onde cada auricularPdfPoints vira auricular:slug
  pdfAuricularSlugs.forEach(slug => {
    const code = `auricular:${slug}`;
    mapUniquePoints.add(code);
    mapLocationsAuricular.add(code);
  });

  console.log('--- 2. PONTOS NOS MAPAS ---');
  console.log(`- Total de pontos cadastrados nos mapas (com coordenadas): ${mapUniquePoints.size}`);
  console.log(`  * Pontos sistêmicos no mapa: ${mapLocationsSistemico.size}`);
  console.log(`  * Pontos auriculares no mapa: ${mapLocationsAuricular.size}`);
  console.log(`- Total de rascunhos de alta confiança injetados nos mapas: ${highConfidenceCodes.length}`);
  console.log(`- Total de rascunhos de média confiança injetados nos mapas: ${mediumConfidenceCodes.length}`);
  console.log('');

  // ==========================================
  // 4. CONEXÃO COM AS ANAMNESES (FORMULÁRIOS)
  // ==========================================
  // O motor de recomendação (pointRecommendationEngine.js) define EVIDENCE_RULES
  // que usam regex para buscar termos de queixas, dor, sono, etc., no texto do ponto
  // (ações, indicações, sintomas).
  // Também mapeamos a partir de padrões (síndromes).

  // Vamos buscar em acupointsEnriched (KM-Agent) quantos pontos têm indicações ou sintomas
  // e quantos na base curada ativa estão referenciados de fato.

  // Vamos contar quantos pontos sistêmicos curados em knowledgeBase.js possuem indicações ou sintomas
  // Podemos ver isso analisando os blocos no knowledgeBaseJs
  // Vamos fazer um parser simplificado dos blocos de acupoint
  const acupointBlocks = knowledgeBaseJs.split('acupoint({');
  let sistemicoComConexao = 0;
  acupointBlocks.slice(1).forEach(block => {
    // Verificar se possui indicações, relatedSymptoms, relatedPatterns
    const hasIndications = block.includes('indications:');
    const hasSymptoms = block.includes('relatedSymptoms:');
    const hasPatterns = block.includes('relatedPatterns:');
    if (hasIndications || hasSymptoms || hasPatterns) {
      sistemicoComConexao++;
    }
  });

  // Pontos auriculares em knowledgeBase.js e auricular-pdf-points.js
  // Vamos contar quantos têm indications ou relatedPatterns
  const auricularBlocks = knowledgeBaseJs.split('auricularPoint({');
  let auricularComConexao = 0;
  auricularBlocks.slice(1).forEach(block => {
    const hasIndications = block.includes('indications:');
    const hasPatterns = block.includes('relatedPatterns:');
    if (hasIndications || hasPatterns) {
      auricularComConexao++;
    }
  });

  // Também no auricular-pdf-points.js
  const pdfAuricularBlocks = auricularPdfPointsJs.split('{\n    slug:');
  pdfAuricularBlocks.slice(1).forEach(block => {
    const hasIndications = block.includes('indications:');
    const hasPatterns = block.includes('relatedPatterns:');
    if (hasIndications || hasPatterns) {
      auricularComConexao++;
    }
  });

  const totalComConexaoAnamnese = sistemicoComConexao + auricularComConexao;

  console.log('--- 3. CONEXÃO COM AS ANAMNESES ---');
  console.log(`- Pontos sistêmicos na base curada conectados à anamnese (com indicações, sintomas ou padrões): ${sistemicoComConexao}`);
  console.log(`- Pontos auriculares conectados à anamnese (com indicações ou padrões): ${auricularComConexao}`);
  console.log(`- Total de pontos curados conectados à anamnese: ${totalComConexaoAnamnese} de ${totalCuratedAtivos} (${((totalComConexaoAnamnese / totalCuratedAtivos) * 100).toFixed(1)}%)`);
  console.log('  * Nota: Quando respondido algum sintoma ou síndrome na anamnese, o motor de busca clínicas cruza esses termos com os pontos, acionando-os para recomendação.');
  console.log('');

  // ==========================================
  // 5. PONTOS COM IMAGENS DE PDF CONECTADAS
  // ==========================================
  const bestIndex = sourceIndexLocal || sourceIndexPublic;
  let totalAtlas = 0;
  let withPdf = 0;
  let withImg = 0;
  let rendered = 0;

  if (bestIndex) {
    totalAtlas = bestIndex.counts?.total || 0;
    withPdf = bestIndex.counts?.withPdfPages || 0;
    withImg = bestIndex.counts?.withImages || 0;
    rendered = bestIndex.counts?.renderedPages || 0;
  }

  // Validar fisicamente se os arquivos WebP existem no diretório de páginas renderizadas
  const pagesDir = resolvePath('.local-source-assets/atlas-ednea/pages');
  let physicalFilesCount = 0;
  if (fs.existsSync(pagesDir)) {
    const files = fs.readdirSync(pagesDir);
    physicalFilesCount = files.filter(f => f.endsWith('.webp')).length;
  }

  console.log('--- 4. IMAGENS DO PDF CONECTADAS (ATLAS EDNÉA MARTINS) ---');
  console.log(`- Total de pontos indexados no Atlas: ${totalAtlas}`);
  console.log(`- Pontos com referências de páginas do PDF (com link): ${withPdf}`);
  console.log(`- Pontos com imagens associadas localmente nos detalhes: ${withImg}`);
  console.log(`- Páginas renderizadas no Atlas indexadas: ${rendered}`);
  console.log(`- Arquivos de imagem WebP físicos de páginas no disco: ${physicalFilesCount}`);
  console.log('');

  // ==========================================
  // 6. COMPARAÇÃO: PONTOS CARREGADOS (VISTOS) VS NÃO CARREGADOS (PENDENTES)
  // ==========================================
  // "Carregados/Vistos": base curada do frontend
  // "Pendentes/Não carregados": rascunhos do KM-Agent pendentes de curadoria
  const totalKmAgentPoints = acupointsEnriched ? acupointsEnriched.length : 0;

  // Quais pontos do total (sistêmicos) ainda não foram importados/aprovados em knowledgeBase.js?
  // knowledgeBase.js tem 33 sistêmicos curados na base ativa
  const pendentesRevisaoSistemico = totalKmAgentPoints - totalSistemicoAtivo;

  console.log('--- 5. PONTOS CARREGADOS (VISTOS) VS PENDENTES (NÃO CARREGADOS) ---');
  console.log(`- Total de rascunhos de pontos sistêmicos no KM-Agent (base bruta): ${totalKmAgentPoints}`);
  console.log(`- Pontos sistêmicos carregados (Vistos na base ativa): ${totalSistemicoAtivo}`);
  console.log(`- Pontos sistêmicos NÃO carregados na base ativa (rascunhos pendentes de revisão): ${pendentesRevisaoSistemico}`);

  // Quantos desses pendentes já têm coordenadas draft no mapa?
  const uniquePendentesOnMap = new Set();
  const uniquePendentesNoMap = new Set();

  if (acupointsEnriched) {
    const curatedSet = new Set(acupointsInCode);
    acupointsEnriched.forEach(item => {
      const code = normalizeCode(item.code);
      if (!curatedSet.has(code)) {
        // É um pendente. Ele está no mapa?
        if (mapUniquePoints.has(code)) {
          uniquePendentesOnMap.add(code);
        } else {
          uniquePendentesNoMap.add(code);
        }
      }
    });
  }

  console.log(`  * Rascunhos pendentes que JÁ possuem coordenadas e aparecem nos mapas: ${uniquePendentesOnMap.size}`);
  console.log(`  * Rascunhos pendentes SEM qualquer coordenada nos mapas: ${uniquePendentesNoMap.size}`);
  console.log(`- Pontos auriculares carregados na base ativa: ${totalAuricularAtivo}`);
  console.log(`- Pontos auriculares rascunho de PDFs locais: ${uniquePdfAuriculars.length}`);

  console.log('\n=== FIM DA ANALISE ===');
}

main().catch(err => {
  console.error(err);
});
