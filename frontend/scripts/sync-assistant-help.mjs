// ============================================================
// Gera supabase/functions/_shared/assistantHelpCorpus.ts a partir dos
// textos do "Como funciona" (frontend/src/data/screenHelp.js), via
// frontend/src/utils/assistantHelp.js.
//
// A assistente (Edge Function clinic-assistant) responde dúvidas sobre o
// sistema com esses textos. Mudou um texto de ajuda? Rode:
//   node frontend/scripts/sync-assistant-help.mjs
// O teste tests/regression/clinic-assistant.test.mjs falha se os dois
// lados ficarem diferentes.
// ============================================================

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../src/utils/assistantHelp.js');
export const HELP_MIRROR_TARGET = path.resolve(here, '../../supabase/functions/_shared/assistantHelpCorpus.ts');

/** Texto do arquivo gerado (o teste compara com o que está no disco). */
export async function buildAssistantHelpMirror() {
  const { buildAssistantHelpTopics } = await import(pathToFileURL(source).href);
  const topics = buildAssistantHelpTopics();
  return `// ============================================================
// GERADO por frontend/scripts/sync-assistant-help.mjs a partir de
// frontend/src/data/screenHelp.js. Não edite à mão: mude a fonte e
// rode o script (tests/regression/clinic-assistant.test.mjs).
// ============================================================

export type AssistantHelpTopic = { id: string; title: string; text: string };

export const ASSISTANT_HELP_TOPICS: AssistantHelpTopic[] = ${JSON.stringify(topics, null, 2)};
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(HELP_MIRROR_TARGET, await buildAssistantHelpMirror(), 'utf8');
  console.log(`Gerado: ${path.relative(process.cwd(), HELP_MIRROR_TARGET)}`);
}
