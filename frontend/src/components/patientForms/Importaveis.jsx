import { useCallback, useEffect, useMemo, useState } from 'react';
import { SearchSelect } from '../ui/SearchSelect';
import { isDeleteConfirmationValid } from '../../utils/patientUi';
import {
  FORM_STATUS,
  assignmentStatus,
  buildResponsesCsv,
  markingShare,
  mergeQuestionColumns,
  safeFileName,
} from '../../utils/patientForms';
import { listClinicPatients } from '../../services/clinicPatientsService';
import {
  deleteAssignments,
  deletePatientForm,
  listAssignments,
  listPatientForms,
  readAssignmentAnswers,
  savePatientForm,
} from '../../services/patientPortalService';
import { PatientFormEditor } from './PatientFormEditor';
import { FormResponseDialog } from './FormResponseDialog';
import { SendFormPanel } from './SendFormPanel';
import { AssignmentList } from './AssignmentList';
import '../../styles/patientForms.css';

// ============================================================
// Gestão → Importáveis (só a administração)
//
// "Formulários": a clínica monta as entrevistas que hoje imprime
// (perguntas de marcar, com o que o paciente precisa digitar só onde
// faz falta), pré-visualiza e publica.
// "Envios e respostas": manda ao paciente com prazo, acompanha quem já
// respondeu, abre as respostas (papel timbrado / Word) e exporta a
// planilha de um formulário.
// O paciente responde na Área do Paciente (PatientPortalPage).
// ============================================================

const VIEWS = [
  { id: 'forms', label: 'Formulários' },
  { id: 'sends', label: 'Envios e respostas' },
];

const STATUS_FILTERS = [
  { id: '', label: 'Enviados' },
  { id: 'pending', label: 'Aguardando' },
  { id: 'in_progress', label: 'Respondendo' },
  { id: 'late', label: 'Atrasados' },
  { id: 'submitted', label: 'Respondidos' },
];

function day(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

function exportNote(count) {
  if (!count) return 'Ainda não há respostas enviadas deste formulário para exportar.';
  if (count === 1) return 'A planilha leva o único formulário respondido (dos filtros acima).';
  return `A planilha leva os ${count} formulários respondidos (dos filtros acima), um paciente por linha.`;
}

function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function Importaveis({ profile }) {
  const clinicId = profile?.clinic_id || null;
  const clinicName = profile?.clinic?.name || profile?.clinic_name || '';

  const [view, setView] = useState('forms');
  const [forms, setForms] = useState([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsError, setFormsError] = useState('');
  const [editing, setEditing] = useState(null); // null | { form }
  const [formNotice, setFormNotice] = useState('');
  const [deleteForm, setDeleteForm] = useState(null);
  const [deleteFormText, setDeleteFormText] = useState('');
  const [busyFormId, setBusyFormId] = useState('');

  const [assignments, setAssignments] = useState([]);
  const [assignLoading, setAssignLoading] = useState(true);
  const [assignError, setAssignError] = useState('');
  const [patients, setPatients] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [viewing, setViewing] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [sendsNotice, setSendsNotice] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadForms = useCallback(async () => {
    setFormsLoading(true);
    try {
      setForms(await listPatientForms());
      setFormsError('');
    } catch (err) {
      setFormsError(err.message);
    } finally {
      setFormsLoading(false);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    setAssignLoading(true);
    try {
      setAssignments(await listAssignments());
      setAssignError('');
    } catch (err) {
      setAssignError(err.message);
    } finally {
      setAssignLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([loadForms(), loadAssignments()]);
      try {
        const list = await listClinicPatients();
        if (!cancelled) setPatients(list);
      } catch {
        // Sem a lista, só o "Enviar formulário" fica sem nomes; o resto segue.
      }
    })();
    return () => { cancelled = true; };
  }, [loadForms, loadAssignments]);

  const patientById = useMemo(() => new Map(patients.map(patient => [patient.id, patient])), [patients]);
  const patientName = useCallback(id => patientById.get(id)?.name || 'Paciente', [patientById]);
  const sendCountByForm = useMemo(() => {
    const counts = new Map();
    for (const assignment of assignments) {
      if (assignment.form_id) counts.set(assignment.form_id, (counts.get(assignment.form_id) || 0) + 1);
    }
    return counts;
  }, [assignments]);

  // ---------- formulários ----------

  function handleSaved(row) {
    setForms(current => {
      const exists = current.some(item => item.id === row.id);
      const next = exists ? current.map(item => (item.id === row.id ? row : item)) : [row, ...current];
      return [...next].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    });
  }

  async function changeFormStatus(form, status) {
    setBusyFormId(form.id);
    setFormNotice('');
    try {
      const row = await savePatientForm({ ...form, id: form.id, status });
      handleSaved(row);
      setFormNotice(status === 'archived'
        ? `“${form.title}” foi arquivado: não aparece mais para envio. Os envios feitos continuam.`
        : `“${form.title}” voltou a ficar publicado.`);
    } catch (err) {
      setFormNotice(err.message);
    } finally {
      setBusyFormId('');
    }
  }

  async function duplicateForm(form) {
    setBusyFormId(form.id);
    setFormNotice('');
    try {
      const row = await savePatientForm({
        clinicId,
        title: `${form.title} (cópia)`.slice(0, 120),
        description: form.description,
        questions: form.questions,
        status: 'draft',
      });
      handleSaved(row);
      setEditing({ form: row });
    } catch (err) {
      setFormNotice(err.message);
    } finally {
      setBusyFormId('');
    }
  }

  async function handleDeleteForm(event) {
    event.preventDefault();
    if (!deleteForm || !isDeleteConfirmationValid(deleteFormText)) return;
    setBusyFormId(deleteForm.id);
    try {
      await deletePatientForm(deleteForm.id);
      setForms(current => current.filter(item => item.id !== deleteForm.id));
      setFormNotice(`“${deleteForm.title}” foi excluído. Os envios e as respostas recebidas continuam em “Envios e respostas”.`);
      setDeleteForm(null);
      setDeleteFormText('');
    } catch (err) {
      setFormNotice(err.message);
    } finally {
      setBusyFormId('');
    }
  }

  // ---------- envios ----------

  const queryText = patientQuery.trim().toLocaleLowerCase('pt-BR');
  const baseList = useMemo(() => assignments.filter(assignment => {
    if (assignment.status === 'cancelled' && statusFilter !== 'cancelled') return false;
    if (formFilter && assignment.form_id !== formFilter) return false;
    if (queryText && !patientName(assignment.patient_id).toLocaleLowerCase('pt-BR').includes(queryText)) return false;
    return true;
  }), [assignments, formFilter, queryText, patientName, statusFilter]);

  const counts = useMemo(() => {
    const result = { '': baseList.length, pending: 0, in_progress: 0, late: 0, submitted: 0 };
    for (const assignment of baseList) {
      const id = assignmentStatus(assignment).id;
      if (id in result) result[id] += 1;
    }
    return result;
  }, [baseList]);

  const visible = statusFilter
    ? baseList.filter(assignment => assignmentStatus(assignment).id === statusFilter)
    : baseList;
  const cancelledCount = assignments.filter(item => item.status === 'cancelled').length;
  const selected = visible.filter(item => selectedIds.has(item.id));
  const allSelected = visible.length > 0 && selected.length === visible.length;
  const selectedWithAnswers = selected.filter(item => item.status === 'submitted' || item.status === 'in_progress').length;

  function toggleSelected(id) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteAssignments(event) {
    event.preventDefault();
    if (!selected.length || !isDeleteConfirmationValid(deleteText)) return;
    setDeleting(true);
    setSendsNotice('');
    try {
      const removed = await deleteAssignments(selected.map(item => item.id));
      setSendsNotice(removed === selected.length
        ? (removed === 1 ? '1 envio excluído.' : `${removed} envios excluídos.`)
        : `Só ${removed} de ${selected.length} foram excluídos: os outros não existem mais ou você não tem permissão.`);
      setSelectedIds(new Set());
      setDeleteOpen(false);
      setDeleteText('');
      await loadAssignments();
    } catch (err) {
      setSendsNotice(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    const form = forms.find(item => item.id === formFilter);
    const answered = baseList.filter(item => item.status === 'submitted');
    if (!form || !answered.length) return;
    setExporting(true);
    setSendsNotice('');
    try {
      const answersById = await readAssignmentAnswers(answered.map(item => item.id));
      const columns = mergeQuestionColumns(answered.map(item => item.form_questions));
      const rows = answered.map(item => ({
        patientName: patientName(item.patient_id),
        sentAt: item.created_at,
        submittedAt: item.submitted_at,
        answers: answersById.get(item.id) || {},
      }));
      downloadText(buildResponsesCsv(columns, rows), `${safeFileName(form.title)}-respostas.csv`, 'text/csv;charset=utf-8');
    } catch (err) {
      setSendsNotice(err.message);
    } finally {
      setExporting(false);
    }
  }

  const answeredForExport = formFilter ? baseList.filter(item => item.status === 'submitted').length : 0;

  return (
    <section>
      <div className="gt-period-bar">
        <div className="gt-segmented" role="group" aria-label="Parte da aba Importáveis">
          {VIEWS.map(item => (
            <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {view === 'forms' && (
          <button type="button" className="gt-btn gt-btn--primary" onClick={() => setEditing({ form: null })}>
            + Novo formulário
          </button>
        )}
      </div>

      {view === 'forms' && (
        <>
          {formsError && <div className="gt-notice gt-notice-error" role="alert">{formsError}</div>}
          {formNotice && <div className="gt-notice" role="status">{formNotice}</div>}

          {deleteForm && (
            <form className="gt-delete-panel" onSubmit={handleDeleteForm} role="alertdialog" aria-labelledby="pq-delete-form-title">
              <h4 id="pq-delete-form-title">Excluir “{deleteForm.title}”?</h4>
              <p>
                O formulário sai da lista e não pode mais ser enviado. Quem já recebeu continua respondendo, e as
                respostas recebidas ficam em “Envios e respostas”. Não dá para desfazer. Confirme digitando <b>excluir</b>.
              </p>
              <label className="gt-field">
                Confirmação
                <input className="gt-input" value={deleteFormText} onChange={event => setDeleteFormText(event.target.value)} placeholder="Digite excluir" autoFocus />
              </label>
              <div className="gt-delete-actions">
                <button type="button" className="gt-btn gt-btn--sm" onClick={() => { setDeleteForm(null); setDeleteFormText(''); }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="gt-btn gt-btn--sm gt-btn--danger-solid"
                  disabled={!isDeleteConfirmationValid(deleteFormText) || busyFormId === deleteForm.id}
                >
                  {busyFormId === deleteForm.id ? 'Excluindo…' : 'Excluir definitivamente'}
                </button>
              </div>
            </form>
          )}

          {formsLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : forms.length === 0 ? (
            <p className="gt-empty">
              Nenhum formulário ainda. Clique em “Novo formulário” para montar a primeira entrevista.
            </p>
          ) : (
            <ul className="gt-list">
              {forms.map(form => {
                const share = markingShare(form.questions);
                const status = FORM_STATUS[form.status] || FORM_STATUS.draft;
                const sends = sendCountByForm.get(form.id) || 0;
                const busy = busyFormId === form.id;
                return (
                  <li key={form.id} className={`gt-card${form.status === 'published' ? ' gt-card-gold' : ''}`}>
                    <div className="gt-card-info">
                      <span className="gt-card-name">{form.title}</span>
                      <span className="gt-card-meta">
                        {share.total} {share.total === 1 ? 'pergunta' : 'perguntas'}
                        {share.total ? ` · ${share.percent}% de marcar` : ''}
                        {` · ${sends} ${sends === 1 ? 'envio' : 'envios'}`}
                        {` · atualizado em ${day(form.updated_at)}`}
                      </span>
                    </div>
                    <span className={`gt-badge gt-badge-${status.tone}`}>{status.label}</span>
                    <div className="pq-actions">
                      <button type="button" className="gt-btn gt-btn--sm" onClick={() => setEditing({ form })} disabled={busy}>
                        Editar
                      </button>
                      {form.status === 'published' && (
                        <button type="button" className="gt-btn gt-btn--sm" onClick={() => { setFormFilter(form.id); setView('sends'); }}>
                          Enviar
                        </button>
                      )}
                      <button type="button" className="gt-btn gt-btn--sm" onClick={() => duplicateForm(form)} disabled={busy}>
                        Duplicar
                      </button>
                      {form.status === 'published' && (
                        <button type="button" className="gt-btn gt-btn--sm" onClick={() => changeFormStatus(form, 'archived')} disabled={busy}>
                          Arquivar
                        </button>
                      )}
                      {form.status === 'archived' && (
                        <button type="button" className="gt-btn gt-btn--sm" onClick={() => changeFormStatus(form, 'published')} disabled={busy}>
                          Publicar de novo
                        </button>
                      )}
                      <button
                        type="button"
                        className="gt-btn gt-btn--sm gt-btn--danger"
                        onClick={() => { setDeleteForm(form); setDeleteFormText(''); }}
                        disabled={busy}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {view === 'sends' && (
        <>
          <h4 className="gt-group-title">Enviar formulário</h4>
          <SendFormPanel
            forms={forms}
            patients={patients}
            clinicName={clinicName}
            onSent={() => loadAssignments()}
          />

          <h4 className="gt-group-title" style={{ marginTop: 24 }}>Envios</h4>
          <div className="gt-stat-row">
            {STATUS_FILTERS.map(filter => (
              <button
                key={filter.id || 'todos'}
                type="button"
                className={`gt-stat${filter.id === 'late' ? ' gt-stat-warning' : ''}${statusFilter === filter.id ? ' gt-stat-active' : ''}`}
                onClick={() => setStatusFilter(current => (current === filter.id ? '' : filter.id))}
              >
                <span className="gt-stat-body"><b>{counts[filter.id]}</b><span>{filter.label}</span></span>
              </button>
            ))}
          </div>

          <div className="gt-filters">
            <div className="gt-field gt-field--grow">
              <label htmlFor="pq-filter-form">Formulário</label>
              <SearchSelect
                id="pq-filter-form"
                value={formFilter}
                onChange={setFormFilter}
                options={forms.map(form => ({ id: form.id, label: form.title }))}
                placeholder="Todos os formulários"
                emptyOptionLabel="Todos os formulários"
              />
            </div>
            <label className="gt-field gt-field--grow">
              Paciente
              <input
                className="gt-input"
                value={patientQuery}
                onChange={event => setPatientQuery(event.target.value)}
                placeholder="Buscar pelo nome"
              />
            </label>
            <button
              type="button"
              className="gt-btn"
              onClick={handleExport}
              disabled={!formFilter || !answeredForExport || exporting}
              title={!formFilter ? 'Escolha um formulário no filtro para exportar' : undefined}
            >
              {exporting ? 'Gerando planilha…' : 'Exportar planilha'}
            </button>
          </div>
          <p className="gt-filter-note">
            {formFilter
              ? exportNote(answeredForExport)
              : 'Para exportar a planilha, escolha um formulário no filtro.'}
            {cancelledCount > 0 && statusFilter !== 'cancelled' && (
              <>
                {' '}
                <button type="button" className="pq-link" onClick={() => setStatusFilter('cancelled')}>
                  Ver {cancelledCount === 1 ? '1 cancelado' : `${cancelledCount} cancelados`}
                </button>
              </>
            )}
          </p>

          {assignError && <div className="gt-notice gt-notice-error" role="alert">{assignError}</div>}
          {sendsNotice && <div className="gt-notice" role="status">{sendsNotice}</div>}

          {!assignLoading && visible.length > 0 && (
            <div className="gt-select-bar">
              <label className="gt-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelectedIds(allSelected ? new Set() : new Set(visible.map(item => item.id)))}
                />
                {selected.length ? `${selected.length} ${selected.length === 1 ? 'selecionado' : 'selecionados'}` : 'Selecionar todos'}
              </label>
              <button
                type="button"
                className="gt-btn gt-btn--sm gt-btn--danger"
                disabled={!selected.length || deleteOpen}
                onClick={() => { setDeleteOpen(true); setDeleteText(''); }}
              >
                Excluir
              </button>
            </div>
          )}

          {deleteOpen && selected.length > 0 && (
            <form className="gt-delete-panel" onSubmit={handleDeleteAssignments} role="alertdialog" aria-labelledby="pq-delete-sends-title">
              <h4 id="pq-delete-sends-title">
                Excluir {selected.length === 1 ? '1 envio' : `${selected.length} envios`}?
              </h4>
              <ul className="gt-delete-list">
                {selected.map(item => (
                  <li key={item.id}>
                    <b>{patientName(item.patient_id)}</b>
                    <span>{item.form_title}</span>
                    <span className={item.status === 'submitted' || item.status === 'in_progress' ? 'gt-delete-rated' : ''}>
                      {assignmentStatus(item).label}
                    </span>
                  </li>
                ))}
              </ul>
              {selectedWithAnswers > 0 && (
                <p className="gt-delete-warning">
                  {selectedWithAnswers === 1
                    ? '1 deles tem respostas do paciente, que vão junto.'
                    : `${selectedWithAnswers} deles têm respostas do paciente, que vão junto.`}
                </p>
              )}
              <p>
                O formulário some da Área do Paciente e da lista. Não dá para desfazer. Confirme digitando <b>excluir</b>.
              </p>
              <label className="gt-field">
                Confirmação
                <input className="gt-input" value={deleteText} onChange={event => setDeleteText(event.target.value)} placeholder="Digite excluir" autoFocus />
              </label>
              <div className="gt-delete-actions">
                <button type="button" className="gt-btn gt-btn--sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="gt-btn gt-btn--sm gt-btn--danger-solid"
                  disabled={!isDeleteConfirmationValid(deleteText) || deleting}
                >
                  {deleting ? 'Excluindo…' : 'Excluir definitivamente'}
                </button>
              </div>
            </form>
          )}

          {assignLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : (
            <AssignmentList
              assignments={visible}
              patientName={patientName}
              onView={setViewing}
              onChanged={loadAssignments}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              emptyLabel={assignments.length ? 'Nenhum envio nesse recorte.' : 'Nenhum formulário enviado ainda.'}
            />
          )}
        </>
      )}

      {editing && (
        <PatientFormEditor
          form={editing.form}
          clinicId={clinicId}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {viewing && (
        <FormResponseDialog
          assignment={viewing}
          patient={patientById.get(viewing.patient_id)}
          profile={profile}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

export default Importaveis;
