import { useEffect, useMemo, useRef, useState } from 'react';
import { APPOINTMENT_MODALITIES, APPOINTMENT_TYPES, registerCompletedAppointment } from '../../../services/appointmentService';
import { toDayKey } from '../../../utils/agenda';
import {
  COMPLETED_APPOINTMENT_LABEL,
  COMPLETED_MAX_DAYS_BACK,
  canChooseProfessional,
  combineDayAndTime,
  completedDayRange,
  disciplinesForProfessional,
  validateCompletedStart,
} from '../../../utils/completedAppointment';
import { usePatient } from '../../../hooks/PatientContext';
import { SearchSelect } from '../../ui/SearchSelect';
import '../../../styles/agenda.css';

// ============================================================
// Registrar atendimento realizado — o paciente veio e foi atendido sem
// ter sido marcado. Um formulário só, aberto pela tela Evoluções (quem
// atende) e pela Agenda (a recepção, que não entra em Evoluções). As
// regras moram em utils/completedAppointment.js.
//
// Quem abre monta o componente só enquanto ele está aberto: o estado
// inicial (profissional, dia e hora sugeridos) nasce da equipe já
// carregada e do relógio daquele instante.
// ============================================================

const DURATIONS = [20, 30, 45, 60, 90, 120, 180, 240];

const EMPTY_QUICK = { open: false, name: '', phone: '', birthDate: '' };

/** Uma hora atrás, arredondado para a meia hora: o palpite mais comum. */
function defaultStart(now) {
  const start = new Date(now.getTime() - 60 * 60000);
  start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
  return start;
}

function timeLabel(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function RegisterCompletedDialog({
  profile,
  patients = [],
  members = [],
  disciplines = [],
  knownAppointments = null,
  afterNote = '',
  submitLabel = 'Registrar atendimento',
  onClose,
  onPatientCreated,
  onCreated,
}) {
  const { createPatient } = usePatient();
  const [now] = useState(() => new Date());
  const range = completedDayRange(now);
  const chooses = canChooseProfessional(profile);

  // Quem atende de verdade. Admin puro (has_agenda false) não recebe
  // atendimento, igual ao seletor da Agenda.
  const professionals = useMemo(
    () => members.filter(member => member.has_agenda !== false),
    [members],
  );

  const [patientId, setPatientId] = useState('');
  const [quick, setQuick] = useState(EMPTY_QUICK);
  const [professionalId, setProfessionalId] = useState(() => (
    !chooses || professionals.some(member => member.id === profile?.id)
      ? (profile?.id || '')
      : (professionals[0]?.id || '')
  ));
  const [discipline, setDiscipline] = useState('');
  const [dayKey, setDayKey] = useState(() => toDayKey(defaultStart(now)));
  const [time, setTime] = useState(() => timeLabel(defaultStart(now)));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [modality, setModality] = useState('presencial');
  const [appointmentType, setAppointmentType] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // O recado fica no topo e o botão, no pé: sem rolar, quem clicou em
  // "Registrar" não vê por que não gravou.
  const errorRef = useRef(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  const professional = professionals.find(member => member.id === professionalId)
    || (professionalId === profile?.id ? { id: profile?.id, disciplines: profile?.disciplines } : null);
  const disciplineOptions = disciplinesForProfessional(disciplines, professional);
  const disciplineValue = disciplineOptions.some(item => item.id === discipline)
    ? discipline
    : (disciplineOptions[0]?.id || '');

  const patientOptions = useMemo(
    () => patients.map(patient => ({ id: patient.id, label: patient.name || 'Paciente', avatar: true })),
    [patients],
  );
  const professionalOptions = useMemo(
    () => professionals.map(member => ({
      id: member.id,
      label: member.id === profile?.id ? `${member.full_name || 'Você'} (você)` : member.full_name,
    })),
    [professionals, profile?.id],
  );

  async function handleQuickCreate() {
    setError('');
    const name = quick.name.trim();
    if (!name) {
      setError('Informe o nome do paciente.');
      return;
    }
    if (!disciplineValue) {
      setError('Escolha a área antes de cadastrar: é ela que decide quem enxerga o paciente.');
      return;
    }
    setSaving(true);
    try {
      const created = await createPatient(
        { name, phone: quick.phone.trim() || null, birthDate: quick.birthDate || null },
        disciplineValue,
      );
      onPatientCreated?.(created);
      setPatientId(created.id);
      setQuick(EMPTY_QUICK);
    } catch (err) {
      setError(err.message || 'Não foi possível cadastrar o paciente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (quick.open) {
      setError('Finalize o cadastro do paciente (ou cancele) antes de registrar.');
      return;
    }
    if (!patientId) {
      setError('Selecione o paciente.');
      return;
    }
    if (!professionalId) {
      setError('Selecione o profissional que atendeu.');
      return;
    }
    if (!disciplineValue) {
      setError('Esse profissional não tem nenhuma área disponível aqui.');
      return;
    }

    const start = combineDayAndTime(dayKey, time);
    const problem = validateCompletedStart(start, new Date());
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    try {
      const created = await registerCompletedAppointment(
        {
          patientId,
          professionalId,
          discipline: disciplineValue,
          appointmentType: appointmentType || null,
          modality,
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + durationMinutes * 60000).toISOString(),
          note,
        },
        { knownAppointments },
      );
      onCreated?.(created);
    } catch (err) {
      setError(err.message || 'Não foi possível registrar o atendimento.');
    } finally {
      setSaving(false);
    }
  }

  const disciplineLabel = disciplineOptions.find(item => item.id === disciplineValue)?.label || disciplineValue;

  return (
    <div className="ag-dialog-overlay" role="dialog" aria-modal="true" aria-label={COMPLETED_APPOINTMENT_LABEL}>
      <div className="ag-dialog-panel">
        <div className="ag-dialog-head">
          <h3 className="ag-dialog-title">{COMPLETED_APPOINTMENT_LABEL}</h3>
          <button type="button" className="ag-chip-btn" onClick={onClose} disabled={saving}>Fechar</button>
        </div>

        <form className="ag-dialog-body agc-body" onSubmit={handleSubmit}>
          <p className="ag-note">
            Para o paciente que foi atendido sem estar na Agenda. O atendimento entra como
            <b> Atendido</b> e confirmado, fica marcado como lançado depois e vale para os
            últimos {COMPLETED_MAX_DAYS_BACK} dias. {afterNote}
          </p>

          {error && <div className="ag-alert" role="alert" ref={errorRef}>{error}</div>}

          <div className="ag-field">
            <label htmlFor="agc-patient">Paciente</label>
            <SearchSelect
              id="agc-patient"
              value={patientId}
              onChange={setPatientId}
              options={patientOptions}
              allowEmpty={false}
              placeholder="Digite o nome…"
              emptyLabel="Nenhum paciente com esse nome."
              disabled={saving || quick.open}
            />
            {!quick.open && (
              <button type="button" className="agd-linkbtn" onClick={() => setQuick(prev => ({ ...prev, open: true }))}>
                Paciente novo? Cadastrar aqui
              </button>
            )}
          </div>

          {quick.open && (
            <div className="ag-quick">
              <p className="ag-form-title">Cadastrar paciente</p>
              <div className="ag-field">
                <label htmlFor="agc-qp-name">Nome</label>
                <input
                  id="agc-qp-name"
                  className="ag-input"
                  type="text"
                  value={quick.name}
                  onChange={e => setQuick(prev => ({ ...prev, name: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="ag-row">
                <div className="ag-field">
                  <label htmlFor="agc-qp-phone">Telefone</label>
                  <input
                    id="agc-qp-phone"
                    className="ag-input"
                    type="tel"
                    value={quick.phone}
                    onChange={e => setQuick(prev => ({ ...prev, phone: e.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="ag-field">
                  <label htmlFor="agc-qp-birth">Nascimento</label>
                  <input
                    id="agc-qp-birth"
                    className="ag-input"
                    type="date"
                    value={quick.birthDate}
                    onChange={e => setQuick(prev => ({ ...prev, birthDate: e.target.value }))}
                    disabled={saving}
                  />
                </div>
              </div>
              <p className="ag-note">
                O cadastro entra na área <b>{disciplineLabel}</b>, a do atendimento. É ela que decide
                quem enxerga o paciente. O restante da ficha se completa na anamnese.
              </p>
              <div className="ag-warn-actions">
                <button type="button" className="ag-btn" onClick={() => setQuick(EMPTY_QUICK)} disabled={saving}>
                  Cancelar
                </button>
                <button type="button" className="ag-btn ag-btn--primary" onClick={handleQuickCreate} disabled={saving}>
                  {saving ? 'Cadastrando…' : 'Cadastrar e selecionar'}
                </button>
              </div>
            </div>
          )}

          {chooses ? (
            <div className="ag-field">
              <label htmlFor="agc-professional">Profissional que atendeu</label>
              <SearchSelect
                id="agc-professional"
                value={professionalId}
                onChange={id => setProfessionalId(id)}
                options={professionalOptions}
                allowEmpty={false}
                placeholder="Digite o nome…"
                disabled={saving}
              />
            </div>
          ) : (
            <div className="ag-field">
              <span className="agj-label">Profissional que atendeu</span>
              <p className="agc-fixed">{profile?.full_name || 'Você'} (você)</p>
            </div>
          )}

          <div className="ag-row">
            <div className="ag-field">
              <label htmlFor="agc-discipline">Área</label>
              <select
                id="agc-discipline"
                className="ag-select"
                value={disciplineValue}
                onChange={e => setDiscipline(e.target.value)}
                disabled={saving || quick.open}
                required
              >
                {disciplineOptions.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="ag-field">
              <label htmlFor="agc-type">Tipo</label>
              <select
                id="agc-type"
                className="ag-select"
                value={appointmentType}
                onChange={e => setAppointmentType(e.target.value)}
                disabled={saving}
              >
                <option value="">Não classificado</option>
                {APPOINTMENT_TYPES.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ag-row">
            <div className="ag-field">
              <label htmlFor="agc-day">Dia</label>
              <input
                id="agc-day"
                className="ag-input"
                type="date"
                min={range.min}
                max={range.max}
                value={dayKey}
                onChange={e => setDayKey(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="ag-field">
              <label htmlFor="agc-time">Início</label>
              <input
                id="agc-time"
                className="ag-input"
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                disabled={saving}
                required
              />
            </div>
          </div>

          <div className="ag-row">
            <div className="ag-field">
              <label htmlFor="agc-duration">Duração</label>
              <select
                id="agc-duration"
                className="ag-select"
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                disabled={saving}
              >
                {DURATIONS.map(minutes => (
                  <option key={minutes} value={minutes}>{minutes} min</option>
                ))}
              </select>
            </div>
            <div className="ag-field">
              <span className="agj-label">Modalidade</span>
              <div className="ag-seg" role="group" aria-label="Modalidade do atendimento">
                {APPOINTMENT_MODALITIES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="ag-seg-btn"
                    aria-pressed={modality === item.id}
                    onClick={() => setModality(item.id)}
                    disabled={saving}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ag-field">
            <label htmlFor="agc-note">Observação da recepção</label>
            <input
              id="agc-note"
              className="ag-input"
              type="text"
              placeholder="Encaixe, veio sem marcar…"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="ag-dialog-actions">
            <button type="button" className="ag-btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="ag-btn ag-btn--primary" disabled={saving}>
              {saving ? 'Registrando…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RegisterCompletedDialog;
