import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { checklists } from '../../data/checklists';
import { usePatient } from '../../hooks/PatientContext';
import { getPatientAge } from '../../hooks/useClinicState';
import { appendPatientAuditLog, readPatientAuditLog } from '../../utils/patientAuditLog';

function formatBirthDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function getSelectedCount(selectedMap, group) {
  return Object.keys(selectedMap)
    .filter(key => key.startsWith(`${group}:`) && selectedMap[key])
    .length;
}

function formatDateTime(value) {
  if (!value) return 'Ainda não registrado';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ainda não registrado';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PainelInicial({
  state,
  selectedMap,
  onToggle,
  onUpdate,
  analysis,
  selectedPatient,
  onNavigate,
  hasPendingChanges,
  lastSavedAt,
  saveStatus,
  onSave,
  onConfirmPendingChanges,
}) {
  const { clearSelection, updatePatient, archivePatient, deletePatient } = usePatient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [auditState, setAuditState] = useState(() => ({
    patientId: selectedPatient?.id,
    items: readPatientAuditLog(selectedPatient?.id),
  }));
  const [patientForm, setPatientForm] = useState({
    name: selectedPatient?.name || '',
    phone: selectedPatient?.phone || '',
    age: getPatientAge(selectedPatient),
  });
  const evolucoes = Array.isArray(state.evolucoes) ? state.evolucoes : [];
  const ultimaEvolucao = evolucoes[evolucoes.length - 1];
  const patientAge = getPatientAge(selectedPatient) || state.idade;
  const patientBirthDate = formatBirthDate(selectedPatient?.birth_date);
  const canDelete = deleteText.trim().toLowerCase() === 'excluir' || deleteText.trim() === 'DELETE';
  const checklistCount =
    getSelectedCount(selectedMap, 'queixaEstruturada') +
    getSelectedCount(selectedMap, 'sono') +
    getSelectedCount(selectedMap, 'digestao') +
    getSelectedCount(selectedMap, 'dor') +
    getSelectedCount(selectedMap, 'lingua') +
    getSelectedCount(selectedMap, 'pulso');
  const auditLog = auditState.patientId === selectedPatient?.id
    ? auditState.items
    : readPatientAuditLog(selectedPatient?.id);

  function addLog(action) {
    setAuditState({
      patientId: selectedPatient?.id,
      items: appendPatientAuditLog(selectedPatient?.id, action),
    });
  }

  function openEdit() {
    setPatientForm({
      name: selectedPatient?.name || '',
      phone: selectedPatient?.phone || '',
      age: getPatientAge(selectedPatient),
    });
    setEditing(true);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!selectedPatient || !patientForm.name.trim()) return;

    setSaving(true);
    try {
      const updated = await updatePatient(selectedPatient.id, {
        name: patientForm.name.trim(),
        phone: patientForm.phone.trim(),
        age: patientForm.age,
      });
      onUpdate?.('nome', updated.name || '');
      onUpdate?.('contato', updated.phone || '');
      onUpdate?.('idade', getPatientAge(updated));
      addLog('Cadastro do paciente atualizado');
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!selectedPatient) return;
    if (onConfirmPendingChanges && !onConfirmPendingChanges('Existem alterações ainda não salvas. Arquivar mesmo assim?')) return;
    setSaving(true);
    try {
      addLog('Paciente arquivado');
      await archivePatient(selectedPatient.id);
      onNavigate?.('Tela inicial');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPatient || !canDelete) return;
    if (onConfirmPendingChanges && !onConfirmPendingChanges('Existem alterações ainda não salvas. Excluir mesmo assim?')) return;
    setSaving(true);
    try {
      addLog('Exclusão definitiva confirmada');
      await deletePatient(selectedPatient.id);
      setDeleteText('');
      onNavigate?.('Tela inicial');
    } finally {
      setSaving(false);
    }
  }

  function handlePatientSwitch() {
    if (onConfirmPendingChanges && !onConfirmPendingChanges('Existem alterações ainda não salvas. Trocar paciente mesmo assim?')) return;
    clearSelection();
    onNavigate?.('Tela inicial');
  }

  function handleExportBackup() {
    if (!selectedPatient) return;
    const backup = {
      exported_at: new Date().toISOString(),
      patient: selectedPatient,
      clinical_state: state,
      selected_map: selectedMap,
      analysis,
      audit_log: auditLog,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = String(selectedPatient.name || 'paciente').replace(/[^\w-]+/g, '_').toLowerCase();
    link.href = url;
    link.download = `backup-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addLog('Backup do paciente exportado');
  }

  async function handleManualSave() {
    await onSave?.();
    addLog('Salvamento manual solicitado');
  }

  return (
    <Panel title="Painel inicial">
      <div className="summary-hero">
        <div>
          <p className="small">Paciente selecionado</p>
          <h2>{selectedPatient?.name || state.nome || 'Novo atendimento'}</h2>
          <p>
            {selectedPatient?.phone || 'Sem telefone'}
            {patientAge ? ` • ${patientAge} anos` : ''}
            {patientBirthDate ? ` • nasc. ${patientBirthDate}` : ''}
          </p>
        </div>
        <div className="summary-actions">
          <button className="tag" onClick={openEdit}>
            Editar cadastro
          </button>
          <button className="primary-button" onClick={() => onNavigate?.('Anamnese')}>
            Continuar anamnese
          </button>
          <button className="tag" onClick={() => onNavigate?.('Evolução')}>
            Registrar evolução
          </button>
          <button className="tag" onClick={() => onNavigate?.('Relatório')}>
            Ver relatório
          </button>
          <button
            className="tag"
            onClick={handlePatientSwitch}
          >
            Trocar paciente
          </button>
        </div>
      </div>

      {editing && (
        <form className="patient-management-form" onSubmit={handleEditSubmit}>
          <label>
            Nome completo
            <input
              value={patientForm.name}
              onChange={e => setPatientForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Telefone
            <input
              value={patientForm.phone}
              onChange={e => setPatientForm(f => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label>
            Idade
            <input
              type="number"
              min="0"
              max="130"
              value={patientForm.age || ''}
              onChange={e => setPatientForm(f => ({ ...f, age: e.target.value }))}
            />
          </label>
          <div className="inline-edit-actions">
            <button className="tag active" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar cadastro'}
            </button>
            <button className="tag" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {analysis.safety.length > 0 && (
        <div className="clinical-alerts" role="alert">
          <div className="clinical-alerts-head">
            <span className="clinical-alert-icon" aria-hidden="true">!</span>
            <div>
              <p className="small">Alertas clínicos</p>
              <h3>Revisar antes de atender</h3>
            </div>
            <span className="clinical-alert-count">
              {analysis.safety.length} alerta{analysis.safety.length > 1 ? 's' : ''}
            </span>
          </div>
          <ul className="clinical-alert-list">
            {analysis.safety.map(item => (
              <li key={item}>
                <span>{item.replace(/^⚠\s*/, '')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cards summary-cards">
        <div className="card">
          <p className="small">Queixa principal</p>
          <h3>{state.queixa || 'Ainda não preenchida'}</h3>
        </div>
        <div className="card">
          <p className="small">Hipótese atual</p>
          <h3>{analysis.main}</h3>
        </div>
        <div className="card">
          <p className="small">Evoluções</p>
          <h3>{evolucoes.length} registro(s)</h3>
        </div>
      </div>

      <div className="summary-grid">
        <div className="box">
          <h3>Resumo clínico</h3>
          <p><b>História:</b> {state.historia || 'Aguardando anamnese.'}</p>
          <p><b>Achados marcados:</b> {checklistCount}</p>
          <p><b>Objetivo terapêutico:</b> {analysis.protocol.goal}</p>
        </div>
        <div className="box">
          <h3>Última evolução</h3>
          {ultimaEvolucao ? (
            <>
              <p><b>Sessão {ultimaEvolucao.sessao}</b> • {ultimaEvolucao.data}</p>
              <p>Dor {ultimaEvolucao.dor || '-'} • Sono {ultimaEvolucao.sono || '-'} • Ansiedade {ultimaEvolucao.ansiedade || '-'}</p>
              <p>{ultimaEvolucao.obs || ultimaEvolucao.intercorrencia || 'Sem observações adicionais.'}</p>
            </>
          ) : (
            <p>Nenhuma evolução registrada para este paciente.</p>
          )}
        </div>
      </div>

      <h3>Objetivos terapêuticos</h3>
      <CheckGrid
        group="objetivos"
        items={checklists.objetivos}
        selectedMap={selectedMap}
        onToggle={onToggle}
      />

      <section className="data-security-section">
        <div className="data-security-head">
          <div>
            <p className="small">Dados e segurança</p>
            <h3>Salvamento, backup e gestão do paciente</h3>
          </div>
          <span className={`security-status ${hasPendingChanges ? 'pending' : 'saved'}`}>
            {hasPendingChanges ? 'Alterações pendentes' : 'Dados salvos'}
          </span>
        </div>

        <div className="security-grid">
          <div className="security-card">
            <span>Status do prontuário</span>
            <b>{saveStatus === 'saving' ? 'Salvando agora' : hasPendingChanges ? 'Aguardando auto-save' : 'Sincronizado'}</b>
            <p>Último salvamento: {formatDateTime(lastSavedAt)}</p>
            <button className="tag active" type="button" onClick={handleManualSave} disabled={saving || saveStatus === 'saving'}>
              Salvar agora
            </button>
          </div>

          <div className="security-card">
            <span>Backup</span>
            <b>Exportar paciente</b>
            <p>Gera um arquivo JSON com cadastro, ficha clínica, seleções, análise e histórico local.</p>
            <button className="tag" type="button" onClick={handleExportBackup}>
              Exportar backup
            </button>
          </div>

          <div className="security-card audit-card">
            <span>Histórico recente</span>
            {auditLog.length === 0 ? (
              <p>Nenhuma ação importante registrada ainda.</p>
            ) : (
              <ul>
                {auditLog.slice(0, 4).map(item => (
                  <li key={item.id}>
                    <b>{item.action}</b>
                    <small>{formatDateTime(item.at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="patient-danger-zone">
          <div>
            <p className="small">Ações administrativas</p>
            <h3>Arquivar ou excluir paciente</h3>
            <p>Arquivar remove o paciente da lista ativa. Excluir remove definitivamente o cadastro e registros vinculados.</p>
          </div>
          <div className="danger-actions">
            <button className="tag" type="button" onClick={handleArchive} disabled={saving}>
              Arquivar paciente
            </button>
            <button className="danger-button" type="button" onClick={() => setDangerOpen(open => !open)}>
              Excluir paciente
            </button>
          </div>
          {dangerOpen && (
            <div className="delete-confirm">
              <label>
                Para excluir definitivamente, digite <b>excluir</b> ou <b>DELETE</b>.
                <input
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  placeholder="excluir"
                />
              </label>
              <button className="danger-button" type="button" onClick={handleDelete} disabled={!canDelete || saving}>
                Confirmar exclusão definitiva
              </button>
            </div>
          )}
        </div>
      </section>
    </Panel>
  );
}
