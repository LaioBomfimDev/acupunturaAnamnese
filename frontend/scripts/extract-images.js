/**
 * Script para extrair as imagens base64 do HTML original
 * e salvar como arquivos reais em public/
 * Execute: node scripts/extract-images.js
 */

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.resolve(__dirname, '../../Reability_MTC_V13_Sistema_Mestre_COMPLETO.html');
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(htmlPath)) {
  console.error('❌ HTML original não encontrado em:', htmlPath);
  process.exit(1);
}

console.log('📖 Lendo HTML original...');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extrai PULSE_MAP_IMAGE
const pulseMatch = html.match(/const PULSE_MAP_IMAGE\s*=\s*"(data:image\/[^"]+)"/);
if (pulseMatch) {
  const base64Data = pulseMatch[1].replace(/^data:image\/\w+;base64,/, '');
  const ext = pulseMatch[1].match(/data:image\/(\w+)/)[1];
  const outPath = path.join(publicDir, `pulse-map.${ext}`);
  fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
  console.log(`✅ pulse-map.${ext} salvo em public/`);
} else {
  console.warn('⚠️  PULSE_MAP_IMAGE não encontrado');
}

// Extrai TONGUE_MAP_IMAGE
const tongueMatch = html.match(/const TONGUE_MAP_IMAGE\s*=\s*"(data:image\/[^"]+)"/);
if (tongueMatch) {
  const base64Data = tongueMatch[1].replace(/^data:image\/\w+;base64,/, '');
  const ext = tongueMatch[1].match(/data:image\/(\w+)/)[1];
  const outPath = path.join(publicDir, `tongue-map.${ext}`);
  fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
  console.log(`✅ tongue-map.${ext} salvo em public/`);
} else {
  console.warn('⚠️  TONGUE_MAP_IMAGE não encontrado');
}

console.log('\n🎉 Extração concluída!');
