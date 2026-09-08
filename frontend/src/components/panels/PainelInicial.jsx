import { useEffect, useState } from 'react';
import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { checklists } from '../../data/checklists';
import { usePatient } from '../../hooks/PatientContext';
import { getPatientAge } from '../../hooks/useClinicState';
import { getPatientAuditLog } from '../../services/clinicalAuditService';

function formatBirthDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function getPatientInitials(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'P';
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
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
  evolucoes: evolucoesProp,
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
  const [auditState, setAuditState] = useState({ patientId: null, items: [], error: '' });
  const [patientForm, setPatientForm] = useState({
    name: selectedPatient?.name || '',
    phone: selectedPatient?.phone || '',
    age: getPatientAge(selectedPatient),
    cpf: selectedPatient?.cpf || '',
    imageConsent: selectedPatient?.image_consent === true,
  });
  // Mesclado (legado + patient_evolutions) quando App.jsx passa o prop —
  // ver utils/evolutionHistory.
  const evolucoes = Array.isArray(evolucoesProp)
    ? evolucoesProp
    : (Array.isArray(state.evolucoes) ? state.evolucoes : []);
  const ultimaEvolucao = evolucoes[evolucoes.length - 1];
  const ultimaEvolucaoFoiFalta = Boolean(ultimaEvolucao) && ultimaEvolucao.attendanceStatus
    && ultimaEvolucao.attendanceStatus !== 'attended';
  const patientAge = getPatientAge(selectedPatient) || state.idade;
  const patientBirthDate = formatBirthDate(selectedPatient?.birth_date);
  const patientName = selectedPatient?.name || state.nome || 'Novo atendimento';
  const canDelete = deleteText.trim().toLowerCase() === 'excluir' || deleteText.trim() === 'DELETE';
  const checklistCount =
    getSelectedCount(selectedMap, 'queixaEstruturada') +
    getSelectedCount(selectedMap, 'sono') +
    getSelectedCount(selectedMap, 'digestao') +
    getSelectedCount(selectedMap, 'gineco') +
    getSelectedCount(selectedMap, 'urogenital') +
    getSelectedCount(selectedMap, 'dor') +
    getSelectedCount(selectedMap, 'lingua') +
    getSelectedCount(selectedMap, 'linguaOrgao') +
    getSelectedCount(selectedMap, 'pulso');
  const auditLog = auditState.patientId === selectedPatient?.id ? auditState.items : [];

  useEffect(() => {
    let cancelled = false;
    const patientId = selectedPatient?.id;
    if (!patientId) return () => { cancelled = true; };

    getPatientAuditLog(patientId)
      .then(items => {
        if (!cancelled) setAuditState({ patientId, items, error: '' });
      })
      .catch(error => {
        if (!cancelled) {
          setAuditState({
            patientId,
            items: [],
            error: error?.message || 'Não foi possível carregar a auditoria clínica.',
          });
        }
      });

    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  function addLog(action) {
    const patientId = selectedPatient?.id;
    if (!patientId) return;
    setAuditState(previous => ({
      patientId,
      error: previous.patientId === patientId ? previous.error : '',
      items: [
        {
          id: `session-${Date.now()}`,
          action,
          at: new Date().toISOString(),
          source: 'session',
        },
        ...(previous.patientId === patientId ? previous.items : []),
      ].slice(0, 50),
    }));
  }

  function openEdit() {
    setPatientForm({
      name: selectedPatient?.name || '',
      phone: selectedPatient?.phone || '',
      age: getPatientAge(selectedPatient),
      cpf: selectedPatient?.cpf || '',
      imageConsent: selectedPatient?.image_consent === true,
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
        cpf: patientForm.cpf,
        imageConsent: patientForm.imageConsent,
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
    if (onConfirmPendingChanges && !onConfirmPendingChanges('Existem alterações ainda não salvas. Arquivar e solicitar exclusão mesmo assim?')) return;
    setSaving(true);
    try {
      addLog('Solicitação de exclusão registrada; paciente arquivado');
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

  async function handleManualSave() {
    await onSave?.();
    addLog('Salvamento manual solicitado');
  }

  return (
    <Panel title="Painel inicial">
      <div className="summary-hero">
        <div className="patient-summary-main">
          <div className="patient-summary-avatar" aria-hidden="true">
            {getPatientInitials(patientName)}
          </div>
          <div className="patient-summary-content">
            <p className="small">Paciente selecionado</p>
            <h2>{patientName}</h2>
            <div className="patient-summary-meta" aria-label="Dados do paciente">
              <span>
                <b>Telefone</b>
                {selectedPatient?.phone || 'Sem telefone'}
              </span>
              <span>
                <b>Idade</b>
                {patientAge ? `${patientAge} anos` : 'Não informada'}
              </span>
              <span>
                <b>Nascimento</b>
                {patientBirthDate || 'Não informado'}
              </span>
            </div>
          </div>
        </div>
        <div className="summary-actions" aria-label="Ações do paciente">
          <button
            className="summary-action summary-action-primary"
            type="button"
            onClick={() => onNavigate?.('Anamnese')}
          >
            <span>Continuar anamnese</span>
            <small>Ficha clínica</small>
          </button>
          <button className="summary-action" type="button" onClick={() => onNavigate?.('Evolução')}>
            <span>Registrar evolução</span>
            <small>Nova sessão</small>
          </button>
          <button className="summary-action" type="button" onClick={() => onNavigate?.('Relatório')}>
            <span>Ver relatório</span>
            <small>Prévia atual</small>
          </button>
          <button className="summary-action summary-action-secondary" type="button" onClick={openEdit}>
            <span>Editar cadastro</span>
            <small>Dados pessoais</small>
          </button>
          <button
            className="summary-action summary-action-secondary"
            type="button"
            onClick={handlePatientSwitch}
          >
            <span>Trocar paciente</span>
            <small>Voltar à lista</small>
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
          <label>
            CPF
            <input
              value={patientForm.cpf}
              onChange={e => setPatientForm(f => ({ ...f, cpf: e.target.value }))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </label>
          <label className="patient-consent">
            <input
              type="checkbox"
              checked={patientForm.imageConsent}
              onChange={e => setPatientForm(f => ({ ...f, imageConsent: e.target.checked }))}
            />
            <span>Autorizo o uso de imagem do paciente para fins clínicos/educacionais.</span>
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
            ultimaEvolucaoFoiFalta ? (
              <>
                <p><b>Sessão {ultimaEvolucao.sessao}</b> • {ultimaEvolucao.data}</p>
                <p><b>{ultimaEvolucao.attendanceStatus === 'no_show' ? 'Faltou' : 'Falta justificada'}</b></p>
                <p>{ultimaEvolucao.observacao || 'Sem observações adicionais.'}</p>
              </>
            ) : (
              <>
                <p><b>Sessão {ultimaEvolucao.sessao}</b> • {ultimaEvolucao.data}</p>
                <p>Dor {ultimaEvolucao.dor || '-'} • Sono {ultimaEvolucao.sono || '-'} • Ansiedade {ultimaEvolucao.ansiedade || '-'}</p>
                <p>{ultimaEvolucao.obs || ultimaEvolucao.intercorrencia || 'Sem observações adicionais.'}</p>
              </>
            )
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
            <b>Protegido no servidor</b>
            <p>Exportação clínica em JSON sem criptografia foi desativada. Recuperação e retenção seguem o plano operacional do banco.</p>
          </div>

          <div className="security-card audit-card">
            <span>Auditoria recente</span>
            {auditState.error && <p>{auditState.error}</p>}
            {auditLog.length === 0 ? (
              <p>Nenhuma ação importante registrada ainda.</p>
            ) : (
              <ul>
                {auditLog.slice(0, 4).map(item => (
                  <li key={item.id}>
                    <b>{item.action}</b>
                    <small>{formatDateTime(item.at)}</small>
                    {item.source === 'session' && <small> nesta sessão</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="patient-danger-zone">
          <div>
            <p className="small">Ações administrativas</p>
            <h3>Arquivar ou solicitar exclusão</h3>
            <p>Arquivar remove o paciente da lista ativa. Solicitar exclusão também registra o pedido para análise, sem apagar prontuários automaticamente.</p>
          </div>
          <div className="danger-actions">
            <button className="tag" type="button" onClick={handleArchive} disabled={saving}>
              Arquivar paciente
            </button>
            <button className="danger-button" type="button" onClick={() => setDangerOpen(open => !open)}>
              Solicitar exclusão
            </button>
          </div>
          {dangerOpen && (
            <div className="delete-confirm">
              <label>
                Para arquivar e registrar a solicitação, digite <b>excluir</b> ou <b>DELETE</b>.
                <input
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  placeholder="excluir"
                />
              </label>
              <button className="danger-button" type="button" onClick={handleDelete} disabled={!canDelete || saving}>
                Arquivar e solicitar exclusão
              </button>
            </div>
          )}
        </div>
      </section>
    </Panel>
  );
}
