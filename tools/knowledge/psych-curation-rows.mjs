// Fonte única das linhas de psych_curation_items, a partir do rascunho curado
// (psych-anamnese-draft.json). Usado pelo gerador de SQL e pelo seed node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'psych-anamnese-draft.json');

export function buildRows() {
  const draft = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const rows = [];
  for (const r of draft.risk || []) {
    rows.push({ kind: 'risk', label: r.label, sources: r.sources || [],
      meta: { priority: r.priority, summary: r.summary, draft: r.draft, screening: r.screening, observe: r.observe, reminder: r.reminder } });
  }
  for (const a of draft.axis || []) {
    rows.push({ kind: 'axis', label: a.label, sources: a.sources || [],
      meta: { framework: a.framework, summary: a.summary, draft: a.draft, explore: a.explore } });
  }
  for (const c of draft.checklist || []) {
    rows.push({ kind: 'checklist', label: c.label, sources: c.sources || [],
      meta: { category: c.category, summary: c.summary, examples: c.examples } });
  }
  for (const block of draft.questionnaire || []) {
    for (const q of block.questions || []) {
      rows.push({ kind: 'question', label: q, sources: [], meta: { block: block.block, draft: q } });
    }
  }
  return rows;
}
