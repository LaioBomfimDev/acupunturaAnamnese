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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hasWords = Array.isArray(words) && words.length > 0;
  if (!hasWords && !onAddWord) return null;

  // onAddWord grava no Supabase antes de confirmar — se falhar (sessão
  // caiu, sem internet, etc.) mantém o rascunho e avisa aqui, em vez de
  // fingir que salvou e sumir sem explicação no próximo carregamento.
  async function submitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) { setAdding(false); setError(''); return; }
    setSaving(true);
    try {
      await onAddWord(trimmed);
      setDraft('');
      setAdding(false);
      setError('');
    } catch {
      setError('Não foi possível salvar este atalho. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
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
            disabled={saving}
            onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter') submitDraft();
              if (e.key === 'Escape') { setDraft(''); setAdding(false); setError(''); }
            }}
            onBlur={submitDraft}
            placeholder={saving ? 'Salvando…' : 'Novo atalho'}
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
      {error && <span className="quick-word-chip-error" role="alert">{error}</span>}
    </div>
  );
}
