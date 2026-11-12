import { useEffect, useState } from 'react';

// Barra do "mini Word" da caixa de conteúdo dos Documentos timbrados.
// Só o básico: negrito, itálico, sublinhado, título, subtítulo, listas,
// desfazer/refazer e limpar formatação. Sem cor, fonte nem alinhamento
// (decisão de 12/11/2026): o documento sai no padrão da instituição, e a
// limpeza (normalizeImportedHtml) apagaria esses estilos de qualquer jeito.
// Tudo o que a barra gera (<b>, <i>, <u>, <h2>, <h3>, <ul>, <ol>) passa
// pela limpeza e sai igual na prévia, no PDF e no Word baixado.

const DOC_INLINE_COMMANDS = [
  { command: 'bold', label: 'N', title: 'Negrito (Ctrl+B)', className: 'doc-tb-bold' },
  { command: 'italic', label: 'I', title: 'Itálico (Ctrl+I)', className: 'doc-tb-italic' },
  { command: 'underline', label: 'S', title: 'Sublinhado (Ctrl+U)', className: 'doc-tb-underline' },
];

const DOC_BLOCK_COMMANDS = [
  { tag: 'h2', label: 'Título', title: 'Título' },
  { tag: 'h3', label: 'Subtítulo', title: 'Subtítulo' },
];

const DOC_LIST_COMMANDS = [
  { command: 'insertUnorderedList', label: '• Lista', title: 'Lista com marcadores' },
  { command: 'insertOrderedList', label: '1. Lista', title: 'Lista numerada' },
];

const HEADING_TAGS = DOC_BLOCK_COMMANDS.map(item => item.tag);

function currentBlockTag() {
  const value = String(document.queryCommandValue('formatBlock') || '');
  return value.replace(/[<>]/g, '').toLowerCase();
}

function readState() {
  const state = { block: currentBlockTag() };
  [...DOC_INLINE_COMMANDS, ...DOC_LIST_COMMANDS].forEach(({ command }) => {
    state[command] = document.queryCommandState(command);
  });
  return state;
}

// O Chrome cria a lista dentro do parágrafo (<p><ul>…</ul></p>), que não é
// HTML válido e vira parágrafos vazios em volta dela. Tira a lista de
// dentro do <p>, guardando o cursor (mover o nó apagaria a seleção).
function liftListsOutOfParagraphs(editor) {
  const selection = document.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const saved = range && [range.startContainer, range.startOffset, range.endContainer, range.endOffset];
  editor.querySelectorAll('p > ul, p > ol').forEach(list => {
    const paragraph = list.parentElement;
    const onlyList = [...paragraph.childNodes].every(node => node === list
      || node.nodeName === 'BR'
      || (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()));
    if (onlyList) paragraph.replaceWith(list);
  });
  if (saved) {
    const restored = document.createRange();
    restored.setStart(saved[0], saved[1]);
    restored.setEnd(saved[2], saved[3]);
    selection.removeAllRanges();
    selection.addRange(restored);
  }
}

export function DocEditorToolbar({ editorRef, onChange }) {
  const [active, setActive] = useState({});

  // O botão fica marcado quando o cursor está num trecho com aquela
  // formatação. Só lê a seleção quando ela está dentro da caixa.
  // Lê logo depois do evento (setTimeout, não requestAnimationFrame, que
  // para com a aba escondida): ao voltar de "Editar conteúdo" o navegador
  // devolve o cursor depois do evento, e a leitura na hora ficava velha.
  useEffect(() => {
    const editor = editorRef.current;
    let frame = 0;
    function refresh() {
      clearTimeout(frame);
      frame = setTimeout(() => {
        const selection = document.getSelection();
        if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
        setActive(readState());
      }, 0);
    }
    document.addEventListener('selectionchange', refresh);
    editor?.addEventListener('focus', refresh);
    return () => {
      clearTimeout(frame);
      document.removeEventListener('selectionchange', refresh);
      editor?.removeEventListener('focus', refresh);
    };
  }, [editorRef]);

  function run(command, value) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    // Formatação por tag (<b>, <u>), nunca por style: a limpeza tira o
    // style e o sublinhado sumiria.
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand(command, false, value);
    if (command === 'insertUnorderedList' || command === 'insertOrderedList') liftListsOutOfParagraphs(editor);
    setActive(readState());
    onChange?.();
  }

  function toggleBlock(tag) {
    run('formatBlock', currentBlockTag() === tag ? '<p>' : `<${tag}>`);
  }

  function clearFormatting() {
    run('removeFormat');
    if (HEADING_TAGS.includes(currentBlockTag())) run('formatBlock', '<p>');
  }

  // mousedown sem padrão: clicar no botão não tira a seleção da caixa.
  const keepSelection = event => event.preventDefault();

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Formatação do texto">
      <div className="doc-tb-group">
        {DOC_INLINE_COMMANDS.map(item => (
          <button
            key={item.command}
            type="button"
            className={`doc-tb-button ${item.className}`}
            title={item.title}
            aria-label={item.title}
            aria-pressed={Boolean(active[item.command])}
            onMouseDown={keepSelection}
            onClick={() => run(item.command)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="doc-tb-group">
        {DOC_BLOCK_COMMANDS.map(item => (
          <button
            key={item.tag}
            type="button"
            className="doc-tb-button"
            title={item.title}
            aria-pressed={active.block === item.tag}
            onMouseDown={keepSelection}
            onClick={() => toggleBlock(item.tag)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="doc-tb-group">
        {DOC_LIST_COMMANDS.map(item => (
          <button
            key={item.command}
            type="button"
            className="doc-tb-button"
            title={item.title}
            aria-label={item.title}
            aria-pressed={Boolean(active[item.command])}
            onMouseDown={keepSelection}
            onClick={() => run(item.command)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="doc-tb-group">
        <button type="button" className="doc-tb-button" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" onMouseDown={keepSelection} onClick={() => run('undo')}>↶</button>
        <button type="button" className="doc-tb-button" title="Refazer (Ctrl+Y)" aria-label="Refazer" onMouseDown={keepSelection} onClick={() => run('redo')}>↷</button>
        <button type="button" className="doc-tb-button" title="Limpar formatação do trecho selecionado" onMouseDown={keepSelection} onClick={clearFormatting}>Limpar formatação</button>
      </div>
    </div>
  );
}
