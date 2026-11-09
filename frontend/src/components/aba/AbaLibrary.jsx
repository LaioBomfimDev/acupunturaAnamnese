import { useCallback, useEffect, useRef, useState } from 'react';
import { AbaConflictError, listLibrary, loadTeams, saveLibraryItem } from '../../services/abaService';
import { canWriteLibrary, findLibraryItem, isLibraryDuplicate, libraryErrorMessage, librarySavePayload, mergeAbaLibrary } from '../../utils/abaLibraryMerge';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import { AbaDialog } from './AbaDialog';
import { behaviorFunctionLabel, techniqueCategoryLabel, techniqueGoalLabel } from '../../utils/aba/catalog.js';
import {
  BEHAVIOR_FUNCTIONS, BEHAVIOR_PROCEDURES, COLLECTION_TYPES, PROMPT_FADING_STRATEGIES, PROMPT_LEVELS,
  REINFORCEMENT_SCHEDULES, TEACHING_STRATEGIES, TECHNIQUE_CATEGORIES, TECHNIQUE_GOALS, TIME_MEASURES,
} from '../../utils/aba/catalog.js';

const OBJECTIVE_FIELDS = {
  title: 'Título', category: 'Área', level: 'Nível', objective: 'Objetivo', target: 'Alvo', skill: 'Habilidade',
  suggestedFormat: 'Formato sugerido', suggestedPrompt: 'Ajuda sugerida', suggestedProcedure: 'Procedimento sugerido',
};
// `code` é identificador interno do catálogo: fica guardado no conteúdo, mas nunca aparece nem se edita (código cru).
const TECHNIQUE_FIELDS = {
  name: 'Nome', category: 'Categoria', whenToUse: 'Quando usar', howToApply: 'Como aplicar',
  example: 'Exemplo', caution: 'Cautelas', restricted: 'Restrito', goals: 'Objetivos',
  behaviorFunctions: 'Funções do comportamento', sortOrder: 'Ordem',
};
const CONFIG_FIELDS = {
  collection_type: 'Forma de coleta', teaching_format: 'Formato de ensino', reinforcement_schedule: 'Esquema de reforço',
  prompt_hierarchy: 'Hierarquia de ajuda', prompt_fading: 'Esvanecimento de ajuda',
  time_measure: 'Medida de tempo', procedure: 'Procedimento', token_economy: 'Economia de fichas', goal_direction: 'Direção do objetivo',
};
const SELECT_FIELDS = {
  goals: TECHNIQUE_GOALS, behaviorFunctions: BEHAVIOR_FUNCTIONS, collection_type: COLLECTION_TYPES,
  teaching_format: TEACHING_STRATEGIES, reinforcement_schedule: REINFORCEMENT_SCHEDULES,
  prompt_hierarchy: PROMPT_LEVELS.map(level => ({ value: level.response, label: level.label })),
  prompt_fading: PROMPT_FADING_STRATEGIES.map(value => ({ value, label: value })),
  time_measure: TIME_MEASURES, procedure: BEHAVIOR_PROCEDURES,
  goal_direction: [{ value: 'reduzir', label: 'Reduzir — o comportamento deve diminuir' },
    { value: 'aumentar', label: 'Aumentar — a resposta deve ficar mais frequente (DRH)' }],
};
const titleOf = entry => entry.content.title || entry.content.name;
// Códigos do catálogo (categoria, objetivos e funções da técnica) aparecem pelo rótulo pt-BR, como em Programas.
const categoryOf = entry => (entry.kind === 'tecnica' ? techniqueCategoryLabel(entry.content.category) : entry.content.category);
function shownValue(entry, key) {
  const value = entry.content[key];
  if (entry.kind === 'tecnica' && key === 'category') return techniqueCategoryLabel(value);
  if (entry.kind === 'tecnica' && key === 'goals') return value.map(techniqueGoalLabel).join(', ');
  if (entry.kind === 'tecnica' && key === 'behaviorFunctions') return value.map(behaviorFunctionLabel).join(', ');
  return Array.isArray(value) ? value.join(', ') : String(value);
}
const advice = 'Ponto de partida, não decisão clínica. Individualize o modelo e peça revisão da supervisão. Técnicas restritas nunca dispensam a revisão nominal do programa.';

export function LibraryContentFields({ content, fields, onChange, systemTechnique = false, technique = false }) {
  return Object.entries(fields).map(([key, label]) => {
    const value = content[key];
    const boolean = ['restricted', 'token_economy'].includes(key);
    const list = ['goals', 'behaviorFunctions', 'prompt_hierarchy'].includes(key);
    const number = ['level', 'sortOrder'].includes(key);
    const choices = key === 'category' && technique ? TECHNIQUE_CATEGORIES : SELECT_FIELDS[key];
    const unknown = choices ? (list ? value || [] : value == null ? [] : [value]).filter(item => !choices.some(choice => choice.value === item)) : [];
    return <label className="aba-field" key={key}>{label}
      {choices ? <select multiple={list} size={list ? 4 : undefined} value={list ? value || [] : value ?? ''}
        onChange={event => {
          const next = list ? [...event.target.selectedOptions].map(option => option.value) : event.target.value;
          onChange(key, next.length ? next : undefined);
        }}>
        {!list && <option value="">Não informado</option>}
        {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        {unknown.map((item, index) => <option key={item} value={item}>Valor anterior {index + 1} (fora do catálogo atual)</option>)}
      </select> : boolean ? <select value={value === undefined ? '' : String(value)} disabled={key === 'restricted' && systemTechnique}
        onChange={event => onChange(key, event.target.value === '' ? undefined : event.target.value === 'true')}>
        <option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option>
      </select> : number ? <input type="number" min="0" max="999999999" step="1" value={value ?? ''}
        onChange={event => onChange(key, event.target.value === '' ? undefined : Number(event.target.value))} />
        : <textarea rows={key === 'howToApply' || key === 'objective' ? 3 : 2} maxLength={list ? 3871 : key in CONFIG_FIELDS ? 1000 : 6000}
          value={list ? (value || []).join('\n') : value ?? ''} required={['title', 'name'].includes(key)}
          onChange={event => onChange(key, event.target.value === '' ? undefined : list ? event.target.value.split('\n') : event.target.value)} />}
    </label>;
  });
}

function LibraryEditor({ initial, onClose, onSaved }) {
  const [entry, setEntry] = useState(initial);
  const [id] = useState(() => initial.row?.id || crypto.randomUUID());
  const [content, setContent] = useState(() => structuredClone(initial.content));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [note, setNote] = useState('');
  const inFlight = useRef(false);
  const errorRef = useRef(null);
  useEffect(() => { errorRef.current?.focus(); }, [error]);
  const dirty = JSON.stringify(content) !== JSON.stringify(initial.content);
  const dismiss = useDismiss({ onClose, busy, guardUnsaved: true, unsaved: dirty });
  const change = (key, value) => setContent(current => {
    const next = { ...current };
    if (value === undefined) delete next[key]; else next[key] = value;
    return next;
  });
  async function reloadRevision() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const rows = await listLibrary();
      const latest = findLibraryItem(entry, rows);
      if (!latest) throw new Error('Modelo indisponível. Feche o editor e confira a biblioteca.');
      setEntry(current => ({ ...current, row: latest, status: latest.status }));
      setConflict(false); setDuplicate(false); setError('');
      setNote('Revisão recarregada. Seu texto foi mantido; confira antes de salvar sobre a versão atual.');
    } catch (failure) { setError(libraryErrorMessage(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (inFlight.current || conflict) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await saveLibraryItem(librarySavePayload(entry, content, { id, eventId: crypto.randomUUID() }));
      await onSaved();
    } catch (failure) {
      setError(libraryErrorMessage(failure));
      const exists = isLibraryDuplicate(failure, entry);
      setDuplicate(exists);
      setConflict(failure instanceof AbaConflictError || failure.code === '40001' || exists);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="aba-dialog-overlay" {...dismiss.backdropProps}>
    <section className="aba-dialog aba-dialog--wide forms-scope aba-library-editor" role="dialog" aria-modal="true" aria-labelledby="aba-library-editor-title" {...dismiss.panelProps}>
      <header className="aba-dialog-head"><h2 id="aba-library-editor-title">{entry.system ? 'Ajustar modelo do sistema' : entry.row ? 'Editar modelo da clínica' : 'Novo modelo da clínica'}</h2>
        <button type="button" className="aba-dialog-close" aria-label="Fechar" disabled={busy} onClick={dismiss.requestDismiss}>×</button></header>
      <div className="aba-dialog-body">
        <DismissPrompt dismiss={dismiss} />
        <p className="aba-note">Só modelos institucionais. Não escreva nomes, diagnósticos ou dados de pacientes.</p>
        {entry.system && entry.kind === 'tecnica' && <p>A marca “Restrito” é definida pelo sistema e não pode ser alterada pela clínica.</p>}
        <form className="aba-library-form" onSubmit={save}>
          <LibraryContentFields content={content} fields={entry.kind === 'objetivo' ? OBJECTIVE_FIELDS : TECHNIQUE_FIELDS}
            onChange={change} technique={entry.kind === 'tecnica'} systemTechnique={entry.system && entry.kind === 'tecnica'} />
          {entry.kind === 'tecnica' && <fieldset className="is-full"><legend>Configuração sugerida (opcional)</legend>
            <div className="aba-library-form"><LibraryContentFields content={content.suggestedConfig || {}} fields={CONFIG_FIELDS}
              onChange={(key, value) => {
                const next = { ...content.suggestedConfig };
                if (value === undefined) delete next[key]; else next[key] = value;
                change('suggestedConfig', Object.keys(next).length ? next : undefined);
              }} /></div></fieldset>}
          {note && <p className="aba-note is-full" role="status">{note}</p>}
          {error && <p className="aba-error is-full" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
          <div className="aba-form-actions is-full">
            {conflict && <button type="button" className="quiet-button" disabled={busy} onClick={() => void reloadRevision()}>{duplicate ? 'Recarregar' : 'Recarregar revisão'}</button>}
            <button type="button" className="quiet-button" disabled={busy} onClick={dismiss.requestDismiss}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={busy || conflict}>{busy ? 'Salvando…' : 'Salvar modelo'}</button>
          </div>
        </form>
      </div>
    </section>
  </div>;
}

export function AbaLibrary() {
  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('objetivo');
  const [statusFilter, setStatusFilter] = useState('disponiveis');
  const [limit, setLimit] = useState(12);
  const [editor, setEditor] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++request.current;
    const [library, permissions] = await Promise.allSettled([listLibrary(), loadTeams()]);
    if (token !== request.current) return;
    setRows(library.status === 'fulfilled' ? library.value : []);
    setError(library.status === 'rejected' ? 'Não foi possível carregar a biblioteca da clínica. Tente de novo.' : '');
    setTeams(permissions.status === 'fulfilled' ? permissions.value : null);
    setPermissionError(permissions.status === 'rejected' ? 'Não foi possível conferir quem pode alterar. Edição indisponível; tente de novo.' : '');
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); return () => { request.current += 1; }; }, [refresh]);
  const canWrite = canWriteLibrary(teams);
  const showArchived = canWrite && statusFilter === 'arquivados';
  const catalog = mergeAbaLibrary(rows, { canWrite, includeArchived: showArchived });
  const entries = catalog.entries.filter(entry => entry.kind === kind
    && (showArchived ? entry.status === 'arquivado' : entry.status !== 'arquivado')
    && `${titleOf(entry)} ${categoryOf(entry) || ''}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  async function saved() {
    setEditor(null); setConfirming(null); setMessage('Modelo salvo.');
    setLoading(true);
    await refresh();
  }
  async function changeStatus() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await saveLibraryItem(librarySavePayload(confirming.entry, confirming.entry.content, {
        id: confirming.id, eventId: confirming.eventId, status: confirming.status,
      }));
      await saved();
    } catch (failure) { setError(libraryErrorMessage(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="aba-page aba-library-page">
    <header className="aba-page-head"><div><p className="aba-eyebrow">Equipe</p><h2>Biblioteca da clínica</h2></div>
      {canWrite && !showArchived && !error && !loading && <button type="button" className="primary-button" onClick={() => setEditor({ kind, system: false, systemKey: null, status: 'ativo', row: null, content: {} })}>Novo {kind === 'objetivo' ? 'objetivo' : 'modelo de técnica'}</button>}
    </header>
    <p className="aba-note">{advice}</p>
    {permissionError && <p className="aba-error" role="alert">{permissionError} <button type="button" className="quiet-button" onClick={() => { setLoading(true); void refresh(); }}>Tentar de novo</button></p>}
    {!loading && !permissionError && !canWrite && <p className="aba-muted">Somente leitura. A administração e a supervisão de time ativo podem alterar modelos.</p>}
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Carregando a biblioteca…</p> : error && !confirming ? <div className="aba-error" role="alert">{error} <button type="button" className="quiet-button" onClick={() => { setLoading(true); void refresh(); }}>Tentar de novo</button></div> : <>
      <div className="aba-library-filters">
        <label className="aba-field">Buscar modelo<input value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} /></label>
        <label className="aba-field">Tipo<select value={kind} onChange={event => { setKind(event.target.value); setLimit(12); }}><option value="objetivo">Objetivos</option><option value="tecnica">Técnicas</option></select></label>
        {canWrite && <label className="aba-field">Mostrar<select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setLimit(12); }}><option value="disponiveis">Disponíveis</option><option value="arquivados">Arquivados</option></select></label>}
      </div>
      <p className="aba-muted">{entries.length} {entries.length === 1 ? 'modelo' : 'modelos'}</p>
      <div className="aba-library-grid">{entries.slice(0, limit).map(entry => <article className="aba-card" key={entry.key}>
        <div className="aba-chip-row"><span className="aba-tag">{entry.system ? 'Sistema' : 'Da clínica'}</span>
          {entry.status === 'oculto' && <span className="aba-tag">Oculto</span>}
          {entry.status === 'arquivado' && <span className="aba-tag">Arquivado</span>}
          {entry.content.restricted && <span className="aba-tag is-warn">Restrito</span>}
          {entry.row && entry.system && <span className="aba-tag">Ajustado pela clínica</span>}</div>
        <h3>{titleOf(entry)}</h3><p className="aba-muted">{categoryOf(entry)}</p>
        <p>{entry.content.objective || entry.content.whenToUse}</p>
        <details><summary>Ver modelo</summary><dl className="aba-library-details">{Object.entries(entry.kind === 'objetivo' ? OBJECTIVE_FIELDS : TECHNIQUE_FIELDS)
          .filter(([key]) => key !== 'restricted' && entry.content[key] != null).map(([key, label]) => <div key={key}><dt>{label.replace(/ \(uma? por linha\)$/, '')}</dt><dd>{shownValue(entry, key)}</dd></div>)}</dl></details>
        {canWrite && <div className="aba-button-row">
          {entry.status !== 'arquivado' && <button type="button" className="quiet-button" onClick={() => setEditor(entry)}>{entry.system ? 'Ajustar' : 'Editar'}</button>}
          <button type="button" className="quiet-button" onClick={() => { setError(''); setConfirming({ entry, id: entry.row?.id || crypto.randomUUID(), eventId: crypto.randomUUID(), status: entry.status !== 'ativo' ? 'ativo' : entry.system ? 'oculto' : 'arquivado' }); }}>{entry.status !== 'ativo' ? 'Reativar' : entry.system ? 'Ocultar' : 'Arquivar'}</button>
        </div>}
      </article>)}</div>
      {!entries.length && <p className="aba-empty">Nenhum modelo com esse filtro.</p>}
      {entries.length > limit && <button type="button" className="quiet-button" onClick={() => setLimit(current => current + 12)}>Mostrar mais modelos</button>}
    </>}
    {editor && <LibraryEditor initial={editor} onClose={() => setEditor(null)} onSaved={saved} />}
    {confirming && <AbaDialog title={confirming.status === 'oculto' ? 'Ocultar modelo?' : confirming.status === 'arquivado' ? 'Arquivar modelo?' : 'Reativar modelo?'} busy={busy} onClose={() => { setConfirming(null); setError(''); }}>
      <p>{titleOf(confirming.entry)}</p><p>{confirming.status === 'ativo' ? 'O modelo volta a aparecer em Programas.' : 'O modelo sai das opções de Programas. Os programas já gravados não mudam.'}</p>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => { setConfirming(null); setError(''); }}>Cancelar</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void changeStatus()}>Confirmar</button></div>
    </AbaDialog>}
  </div>;
}
