import { useState } from 'react';

// ============================================================
// UI: Quick-word chips — botões que "escrevem por você".
// Cada chip apenda a palavra na caixa de texto do campo (a regra
// de separador/capitalização fica em appendQuickWord, no data
// file da disciplina). Pedido do dono do produto: máximo de
// clique, mínimo de digitação.
//
// onAddWord (opcional): quando presente, mostra um chip "+" final que
// vira um campo de texto pra criar um atalho novo, compartilhado com
// a clínica inteira (mas isolado por disciplina+campo — ver
// hooks/useCustomQuickWords.js).
// ============================================================

export function QuickWordChips({ words, onPick, onAddWord }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const hasWords = Array.isArray(words) && words.length > 0;
  if (!hasWords && !onAddWord) return null;

  function submitDraft() {
    const trimmed = draft.trim();
    if (trimmed) onAddWord(trimmed);
    setDraft('');
    setAdding(false);
  }

  return (
    <div className="quick-words" role="group" aria-label="Atalhos de texto">
      {words?.map(word => (
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
      {onAddWord && (adding ? (
        <input
          autoFocus
          className="quick-word-chip-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submitDraft();
            if (e.key === 'Escape') { setDraft(''); setAdding(false); }
          }}
          onBlur={submitDraft}
          placeholder="Novo atalho"
        />
      ) : (
        <button
          type="button"
          className="quick-word-chip quick-word-chip-add"
          onClick={() => setAdding(true)}
          title="Criar atalho novo (compartilhado com a clínica)"
        >
          +
        </button>
      ))}
    </div>
  );
}
