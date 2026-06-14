import fs from 'fs';
import path from 'path';

const FRONTEND_DIR = 'c:/Users/m/Downloads/Sistema Acup/frontend';

function resolvePath(subPath) {
  return path.join(FRONTEND_DIR, subPath);
}

async function main() {
  console.log('=== ANALISANDO FONTES PDF E IMAGENS ASSOCIADAS ===\n');

  const pdfIndex = JSON.parse(fs.readFileSync(resolvePath('.local-source-assets/pdf-sources/source-index.local.json'), 'utf-8'));
  const sourceLinks = JSON.parse(fs.readFileSync(resolvePath('.local-source-assets/pdf-sources/source-candidate-links.local.json'), 'utf-8'));
  const auricularLinks = JSON.parse(fs.readFileSync(resolvePath('.local-source-assets/pdf-sources/auricular-candidate-links.local.json'), 'utf-8'));

  console.log(`- PDFs Cadastrados no Índice de Fontes: ${pdfIndex.counts?.sources}`);
  console.log(`- Total de páginas de PDF registradas nos arquivos de links:`);
  console.log(`  * Sistêmicos (source-candidate-links): ${sourceLinks.links?.length || 0} links de correspondência`);
  console.log(`  * Auriculares (auricular-candidate-links): ${auricularLinks.links?.length || 0} links de correspondência`);
  console.log('');

  // 1. Verificar imagens renderizadas fisicamente no disco para cada PDF
  console.log('1. IMAGENS RENDERIZADAS FISICAMENTE NO DISCO PARA CADA PDF:');

  // Para o Atlas Ednéa Martins (sistêmicos)
  const atlasPagesPath = resolvePath('.local-source-assets/atlas-ednea/pages');
  let atlasImgCount = 0;
  if (fs.existsSync(atlasPagesPath)) {
    atlasImgCount = fs.readdirSync(atlasPagesPath).filter(f => f.endsWith('.webp') || f.endsWith('.png') || f.endsWith('.jpg')).length;
  }
  console.log(`- atlas-ednea (Atlas Ednea Martins - pasta dedicada): ${atlasImgCount} imagens .webp`);

  pdfIndex.sources.forEach(src => {
    // A pasta de cada PDF fica dentro de .local-source-assets/pdf-sources/<key>/
    const srcDir = resolvePath(`.local-source-assets/pdf-sources/${src.key}`);
    let imgCount = 0;
    if (fs.existsSync(srcDir)) {
      // Verificar se possui arquivos de imagem recursivamente ou numa pasta "pages"
      const findImages = (dir) => {
        let count = 0;
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            count += findImages(itemPath);
          } else if (/\.(webp|png|jpg|jpeg)$/i.test(item)) {
            count++;
          }
        });
        return count;
      };
      imgCount = findImages(srcDir);
    }
    console.log(`- ${src.key} (${src.title}): ${imgCount} imagens renderizadas encontradas localmente`);
  });
  console.log('');

  // 2. Mapeamento de links ativos no frontend
  console.log('2. CONEXÃO DE IMAGENS NOS LINKS DE PONTOS (JSON):');
  const allLinks = [...(sourceLinks.links || []), ...(auricularLinks.links || [])];

  // Agrupar links por fonte e ver quantos têm imageUrl ou url de imagem válida
  const linksBySource = {};
  pdfIndex.sources.forEach(src => {
    linksBySource[src.key] = {
      totalLinks: 0,
      linksWithImageUrl: 0,
      imageUrlsUsed: new Set()
    };
  });
  // Adicionar o atlas-ednea-martins caso apareça
  linksBySource['atlas-ednea-martins'] = { totalLinks: 0, linksWithImageUrl: 0, imageUrlsUsed: new Set() };

  allLinks.forEach(link => {
    const srcKey = link.sourceKey || link.source?.key;
    if (srcKey) {
      if (!linksBySource[srcKey]) {
        linksBySource[srcKey] = { totalLinks: 0, linksWithImageUrl: 0, imageUrlsUsed: new Set() };
      }
      linksBySource[srcKey].totalLinks++;
      const imgUrl = link.imageUrl || link.page?.imageUrl || link.page?.url;
      if (imgUrl) {
        linksBySource[srcKey].linksWithImageUrl++;
        linksBySource[srcKey].imageUrlsUsed.add(imgUrl);
      }
    }
  });

  Object.entries(linksBySource).forEach(([key, stats]) => {
    console.log(`- ${key}:`);
    console.log(`  * Total de trechos vinculados a pontos: ${stats.totalLinks}`);
    console.log(`  * Trechos com imagem configurada no JSON: ${stats.linksWithImageUrl} (usando ${stats.imageUrlsUsed.size} arquivos de imagem únicos)`);
  });
  console.log('');

  // 3. Identificar PDFs não sendo usados para imagens ou trechos
  console.log('3. UTILIZAÇÃO DE CADA FONTE PDF:');
  pdfIndex.sources.forEach(src => {
    const stats = linksBySource[src.key] || { totalLinks: 0, linksWithImageUrl: 0, imageUrlsUsed: new Set() };
    const hasText = stats.totalLinks > 0;
    const hasImages = stats.linksWithImageUrl > 0;

    let usageStatus = 'NÃO UTILIZADO';
    if (hasText && hasImages) {
      usageStatus = 'TOTALMENTE UTILIZADO (Texto + Imagens)';
    } else if (hasText) {
      usageStatus = 'PARCIALMENTE UTILIZADO (Apenas Trechos de Texto, sem Imagens nos detalhes)';
    }

    console.log(`- ${src.key} (${src.title}):`);
    console.log(`  * Status: ${usageStatus}`);
  });
}

main().catch(err => console.error(err));
