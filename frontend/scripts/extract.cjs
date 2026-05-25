const fs = require('fs');
const path = require('path');

const htmlFile = path.join(__dirname, '..', '..', 'Reability_MTC_V13_Sistema_Mestre_COMPLETO.html');
const publicDir = path.join(__dirname, '..', 'public');

console.log('Lendo:', htmlFile);
const html = fs.readFileSync(htmlFile, 'utf8');
console.log('Tamanho do HTML:', html.length, 'bytes');

// Extrai pulse map - busca simples pela string
const pulseIdx = html.indexOf('const PULSE_MAP_IMAGE=');
if (pulseIdx !== -1) {
  const start = html.indexOf('"', pulseIdx) + 1;
  const end = html.indexOf('";', start);
  const dataUrl = html.substring(start, end);
  console.log('Pulse map encontrado, tamanho:', dataUrl.length);
  const b64 = dataUrl.replace('data:image/jpeg;base64,', '');
  fs.writeFileSync(path.join(publicDir, 'pulse-map.jpg'), Buffer.from(b64, 'base64'));
  console.log('pulse-map.jpg salvo!');
} else {
  console.log('PULSE_MAP_IMAGE nao encontrado');
}

// Extrai tongue map
const tongueIdx = html.indexOf('const TONGUE_MAP_IMAGE=');
if (tongueIdx !== -1) {
  const start = html.indexOf('"', tongueIdx) + 1;
  const end = html.indexOf('";', start);
  const dataUrl = html.substring(start, end);
  console.log('Tongue map encontrado, tamanho:', dataUrl.length);
  const b64 = dataUrl.replace('data:image/jpeg;base64,', '');
  fs.writeFileSync(path.join(publicDir, 'tongue-map.jpg'), Buffer.from(b64, 'base64'));
  console.log('tongue-map.jpg salvo!');
} else {
  console.log('TONGUE_MAP_IMAGE nao encontrado');
}

console.log('Concluido!');
