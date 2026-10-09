// ============================================================
// Gera supabase/functions/_shared/clinicalInstruments.ts a partir de
// frontend/src/data/clinicalInstruments.js (fonte das escalas).
//
// A Edge Function da Área do Paciente monta as perguntas e calcula a nota
// com a definição oficial, nunca com o que vem do aparelho do paciente.
// Mudou uma escala (pergunta, ponto, faixa, versão)? Rode:
//   node frontend/scripts/sync-instrument-mirror.mjs
// O teste tests/regression/patient-instruments.test.mjs falha se os dois
// lados ficarem diferentes.
// ============================================================

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../src/data/clinicalInstruments.js');
export const MIRROR_TARGET = path.resolve(here, '../../supabase/functions/_shared/clinicalInstruments.ts');

/** Só o que o servidor usa: montar as perguntas e calcular. */
export function serverView(instrument) {
  return {
    id: instrument.id,
    version: instrument.version,
    shortName: instrument.shortName,
    name: instrument.name,
    instructions: instrument.instructions,
    items: instrument.items.map(item => ({
      id: item.id,
      text: item.text,
      options: item.options.map(option => ({ value: option.value, label: option.label })),
      ...(item.risk ? { risk: { fromValue: item.risk.fromValue, message: item.risk.message, homeMessage: item.risk.homeMessage } } : {}),
    })),
    extraItems: (instrument.extraItems || []).map(item => ({
      id: item.id,
      text: item.text,
      options: item.options.map(option => ({ value: option.value, label: option.label })),
      ...(item.showWhen ? { showWhen: item.showWhen } : {}),
    })),
    scoring: { ...instrument.scoring },
    bands: instrument.bands.map(band => ({ id: band.id, label: band.label, min: band.min, max: band.max })),
  };
}

/** Texto do arquivo gerado (o teste compara com o que está no disco). */
export async function buildInstrumentMirror() {
  const { CLINICAL_INSTRUMENTS, INSTRUMENT_HISTORY } = await import(pathToFileURL(source).href);
  const current = CLINICAL_INSTRUMENTS.map(serverView);
  const history = Object.fromEntries(Object.entries(INSTRUMENT_HISTORY).map(([key, value]) => [key, serverView(value)]));
  const body = `// ============================================================
// GERADO por frontend/scripts/sync-instrument-mirror.mjs a partir de
// frontend/src/data/clinicalInstruments.js. Não edite à mão: mude a
// fonte e rode o script. Só o que a Edge Function usa para montar as
// perguntas e calcular a nota (tests/regression/patient-instruments).
// ============================================================

import type { Instrument } from './instrumentScoring.ts';

export type ServerInstrument = Instrument & {
  shortName: string;
  name: string;
  instructions: string;
};

export const CLINICAL_INSTRUMENTS: ServerInstrument[] = ${JSON.stringify(current, null, 2)};

/** Versões antigas: chave \`\${id}@\${version}\`. */
export const INSTRUMENT_HISTORY: Record<string, ServerInstrument> = ${JSON.stringify(history, null, 2)};

/** A versão exata da aplicação; null se não existir (o servidor não adivinha). */
export function getServerInstrument(id: string, version: number): ServerInstrument | null {
  const current = CLINICAL_INSTRUMENTS.find(item => item.id === id) || null;
  if (current && current.version === Number(version)) return current;
  return INSTRUMENT_HISTORY[\`\${id}@\${version}\`] || null;
}
`;
  return { body, count: current.length };
}

// Só grava quando rodado direto: o teste importa sem escrever nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { body, count } = await buildInstrumentMirror();
  await writeFile(MIRROR_TARGET, body, 'utf8');
  console.log(`gerado ${path.relative(process.cwd(), MIRROR_TARGET)} (${count} escalas)`);
}
