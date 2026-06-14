import fs from 'fs';
import path from 'path';

const FRONTEND_DIR = 'c:/Users/m/Downloads/Sistema Acup/frontend';

function resolvePath(subPath) {
  return path.join(FRONTEND_DIR, subPath);
}

// Função para buscar se um arquivo de imagem física existe para uma determinada página do PDF
function getPhysicalImageExists(sourceKey, pageNum) {
  if (!pageNum || !sourceKey) return false;

  // Formatadores de página comuns no disco para os PDFs locais:
  // As imagens das páginas dos PDFs auriculares ficam na pasta de cada fonte em .local-source-assets/pdf-sources/<sourceKey>/
  const formattedPage = String(pageNum).padStart(3, '0');
  const baseDir = resolvePath(`.local-source-assets/pdf-sources/${sourceKey}`);

  if (!fs.existsSync(baseDir)) return false;

  // Busca recursiva por arquivos correspondentes a "page-XXX" ou "page_XXX" ou "XXX"
  const checkFile = (dir) => {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        if (checkFile(itemPath)) return true;
      } else {
        const lowerName = item.toLowerCase();
        // Verifica se o nome do arquivo contém o número da página (com ou sem zeros à esquerda) e extensões de imagem
        if (/\.(webp|png|jpg|jpeg)$/i.test(item)) {
          if (lowerName.includes(`page-${pageNum}`) ||
              lowerName.includes(`page-${formattedPage}`) ||
              lowerName.includes(`_${pageNum}.`) ||
              lowerName.includes(`_${formattedPage}.`) ||
              lowerName === `${pageNum}.webp` ||
              lowerName === `${formattedPage}.webp`) {
            return true;
          }
        }
      }
    }
    return false;
  };

  return checkFile(baseDir);
}

async function main() {
  const modulePath = 'file:///' + resolvePath('src/knowledge/generated/auricular-pdf-points.js').replace(/\\/g, '/');

  let auricularPdfPoints;
  try {
    const mod = await import(modulePath);
    auricularPdfPoints = mod.auricularPdfPoints || [];
  } catch (e) {
    console.error('Erro ao importar auricular-pdf-points.js:', e);
    auricularPdfPoints = [];
  }

  // Lista dos 11 pontos auriculares basais cadastrados em knowledgeBase.js
  const baseAuriculars = [
    { slug: 'shen-men', name: 'Shen Men', actions: ['modulação central', 'reduzir ansiedade', 'analgesia', 'regular sono'], indications: ['ansiedade', 'dor', 'insônia', 'hiperreatividade'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 44 },
    { slug: 'subcortex', name: 'Subcórtex', actions: ['regulação neurovegetativa', 'modulação de dor e sono'], indications: ['dor crônica', 'ansiedade', 'insônia'], sourceKey: 'scavone-manual-auriculoterapia', pdfPage: 209 },
    { slug: 'figado', name: 'Fígado', actions: ['apoiar livre fluxo do Qi', 'regular tensão emocional'], indications: ['irritabilidade', 'estagnação', 'tensão'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 47 },
    { slug: 'baco', name: 'Baço', actions: ['regular Terra', 'apoiar digestão e umidade'], indications: ['fadiga', 'digestão lenta', 'umidade'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 45 },
    { slug: 'estomago', name: 'Estômago', actions: ['regular digestão', 'apetite e epigástrio'], indications: ['refluxo', 'náusea', 'fome alterada'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 45 },
    { slug: 'rim', name: 'Rim', actions: ['apoiar base energética', 'regular medo, lombar e essência'], indications: ['lombalgia', 'medo', 'cansaço profundo'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 49 },
    { slug: 'endocrino', name: 'Endócrino', actions: ['regulação hormonal e metabólica'], indications: ['padrões hormonais', 'metabolismo', 'umidade'], sourceKey: 'scavone-manual-auriculoterapia', pdfPage: 210 },
    { slug: 'ansiedade', name: 'Ansiedade', actions: ['apoio sintomático para ansiedade e agitação'], indications: ['ansiedade', 'agitação'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 44 },
    { slug: 'coracao', name: 'Coração', actions: ['regular Shen', 'ansiedade, palpitação e sono'], indications: ['palpitação', 'insônia', 'ansiedade'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 51 },
    { slug: 'sono', name: 'Sono', actions: ['regular sono e relaxamento'], indications: ['insônia', 'sono leve'], sourceKey: 'livro-acupuntura-auricular', pdfPage: 44 },
    { slug: 'fome', name: 'Fome', actions: ['regular apetite e compulsão'], indications: ['compulsão alimentar', 'fome aumentada', 'desejo por doce'], sourceKey: 'scavone-manual-auriculoterapia', pdfPage: 211 }
  ];

  // Mesclar tudo para ter todos os pontos únicos
  const allPoints = [];
  const addedSlugs = new Set();

  baseAuriculars.forEach(p => {
    const hasImage = getPhysicalImageExists(p.sourceKey, p.pdfPage);
    allPoints.push({
      name: p.name,
      actions: p.actions,
      indications: p.indications,
      hasImage,
      source: p.sourceKey,
      page: p.pdfPage,
      origin: 'Basal/Protocolo'
    });
    addedSlugs.add(p.slug);
  });

  auricularPdfPoints.forEach(p => {
    if (!addedSlugs.has(p.slug)) {
      const sourceKey = p.sourcePage?.sourceKey || p.sourceKey;
      const pageNum = p.sourcePage?.pdfPage || p.pdfPage;
      const hasImage = getPhysicalImageExists(sourceKey, pageNum);
      allPoints.push({
        name: p.name,
        actions: p.actions || [],
        indications: p.indications || [],
        hasImage,
        source: sourceKey,
        page: pageNum,
        origin: 'PDF Importado'
      });
      addedSlugs.add(p.slug);
    }
  });

  console.log(`TOTAL DE PONTOS AURICULARES MAPEADOS: ${allPoints.length}\n`);

  // Imprimir a lista no formato que o usuário quer:
  // Nome do Ponto | Tem Imagem | O que tem de importante (resumo)
  allPoints.forEach((p, idx) => {
    const actionsText = p.actions.slice(0, 2).join(', ');
    const indicationsText = p.indications.slice(0, 2).join(', ');
    const importancia = [actionsText, indicationsText].filter(Boolean).join('; ') || 'Ponto complementar de microssistema.';

    // Cortar para manter curto
    const importanciaCurta = importancia.substring(0, 110) + (importancia.length > 110 ? '...' : '');

    console.log(`${idx + 1}. **${p.name}** [Imagem: ${p.hasImage ? 'Sim' : 'Não'} | Fonte: ${p.source} p. ${p.page || '-'}] -> ${importanciaCurta}`);
  });
}

main().catch(err => console.error(err));
