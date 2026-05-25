const fs = require('fs');
const path = require('path');

const htmlFile = path.join(__dirname, '..', '..', 'Reability_MTC_V13_Sistema_Mestre_COMPLETO.html');
const publicDir = path.join(__dirname, '..', 'public');

console.log('Lendo HTML...');
const html = fs.readFileSync(htmlFile, 'utf8');

// Extrai BODY_PROTOCOL_IMAGE
const bodyIdx = html.indexOf('const BODY_PROTOCOL_IMAGE=');
if (bodyIdx !== -1) {
  const start = html.indexOf('"', bodyIdx) + 1;
  const end = html.indexOf('";', start);
  const dataUrl = html.substring(start, end);
  console.log('Body protocol map encontrado, tamanho:', dataUrl.length);
  const parts = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (parts) {
    fs.writeFileSync(path.join(publicDir, `body-protocol.${parts[1]}`), Buffer.from(parts[2], 'base64'));
    console.log(`body-protocol.${parts[1]} salvo!`);
  }
} else {
  console.log('BODY_PROTOCOL_IMAGE nao encontrado - pode ter outro nome');
  // Tenta encontrar variações
  const alt = ['BODY_MAP','bodyMap','BODY_IMAGE'];
  alt.forEach(name => {
    const idx = html.indexOf(`const ${name}=`);
    if (idx !== -1) console.log(`Encontrado: ${name} na posicao ${idx}`);
  });
}

// Extrai EAR_PROTOCOL_IMAGE
const earIdx = html.indexOf('const EAR_PROTOCOL_IMAGE=');
if (earIdx !== -1) {
  const start = html.indexOf('"', earIdx) + 1;
  const end = html.indexOf('";', start);
  const dataUrl = html.substring(start, end);
  console.log('Ear protocol map encontrado, tamanho:', dataUrl.length);
  const parts = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (parts) {
    fs.writeFileSync(path.join(publicDir, `ear-protocol.${parts[1]}`), Buffer.from(parts[2], 'base64'));
    console.log(`ear-protocol.${parts[1]} salvo!`);
  }
} else {
  console.log('EAR_PROTOCOL_IMAGE nao encontrado - pode ter outro nome');
  const alt = ['EAR_MAP','earMap','EAR_IMAGE'];
  alt.forEach(name => {
    const idx = html.indexOf(`const ${name}=`);
    if (idx !== -1) console.log(`Encontrado: ${name} na posicao ${idx}`);
  });
}

// Lista todas as constantes de imagem
console.log('\n--- Todas as constantes de imagem no HTML ---');
const matches = html.matchAll(/const ([A-Z_]+IMAGE)=/g);
for (const m of matches) {
  console.log(m[1]);
}
