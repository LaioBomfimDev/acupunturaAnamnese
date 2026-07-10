// ============================================================
// UI: Quick-word chips — botões que "escrevem por você".
// Cada chip apenda a palavra na caixa de texto do campo (a regra
// de separador/capitalização fica em appendQuickWord, no data
// file da disciplina). Pedido do dono do produto: máximo de
// clique, mínimo de digitação.
// ============================================================

export function QuickWordChips({ words, onPick }) {
  if (!Array.isArray(words) || words.length === 0) return null;
  return (
    <div className="quick-words" role="group" aria-label="Atalhos de texto">
      {words.map(word => (
        <button
          key={word}
          type="button"
          className="quick-word-chip"
          onClick={() => onPick(word)}
          title={`Adicionar "${word}" ao texto`}
        >
          + {word}
        </button>
      ))}
    </div>
  );
}
