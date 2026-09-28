// Utilitários das abas próprias de Fisioterapia e Nutrição (fora do
// arquivo de componentes para não quebrar o fast refresh do Vite).

let entryCounter = 0;

/** Id local de linha (medida, exame, escala). Não é id de banco. */
export function newEntryId(prefix) {
  entryCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${entryCounter}`;
}

export function todayLabel() {
  return new Date().toLocaleDateString('pt-BR');
}
