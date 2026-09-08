import { useEffect, useMemo, useState } from 'react';
import { getStatusLabel } from '../../utils/agenda';
import { listMissedAppointments, listPatientsAwaitingReturn } from '../../services/appointmentService';
import { listClinicMembers, shortName } from '../../services/clinicMembersService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { listClinicAccessLogs } from '../../services/clinicAccessLogService';
import {
  buildSurveyLink,
  createSatisfactionSurvey,
  listSatisfactionSurveys,
} from '../../services/satisfactionSurveyService';
import '../../styles/gestao.css';

// ============================================================
// Gestão da instituição — relatórios operacionais
//
// Ferramenta da clínica inteira, igual Agenda e Documentos timbrados:
// não depende de disciplina nem de paciente selecionado.
// ============================================================

const SECTIONS = [
  { id: 'faltosos', label: 'Faltosos' },
  { id: 'retornos', label: 'Retornos' },
  { id: 'acessos', label: 'Acessos' },
  { id: 'pesquisa', label: 'Pesquisa de satisfação' },
];

const ACCESS_ACTION_LABELS = { login: 'Entrou', logout: 'Saiu' };

const RETURN_THRESHOLD_OPTIONS = [15, 30, 45, 60, 90];

function toDayInput(date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toDayInput(from), to: toDayInput(to) };
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dia = date.toLocaleDateString('pt-BR');
  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

export function RelatoriosGestao({ profile }) {
  const clinicId = profile?.clinic_id || null;
  const [section, setSection] = useState('faltosos');
  const [range, setRange] = useState(defaultRange);
  const [professionalId, setProfessionalId] = useState('');
  const [patientQuery, setPatientQuery] = useState('');

  const [members, setMembers] = useState([]);
  const [patients, setPatients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [returnThreshold, setReturnThreshold] = useState(30);
  const [returnItems, setReturnItems] = useState([]);
  const [returnLoading, setReturnLoading] = useState(true);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    if (section !== 'retornos') return undefined;
    let cancelled = false;

    (async () => {
      setReturnLoading(true);
      try {
        const [team, clinicPatients, awaiting] = await Promise.all([
          members.length ? Promise.resolve(members) : listClinicMembers(),
          patients.length ? Promise.resolve(patients) : listClinicPatients(),
          listPatientsAwaitingReturn({ minDays: returnThreshold }),
        ]);
        if (cancelled) return;
        if (!members.length) setMembers(team);
        if (!patients.length) setPatients(clinicPatients);
        setReturnItems(awaiting);
        setReturnError('');
      } catch (err) {
        if (cancelled) return;
        setReturnError(err.message || 'Não foi possível carregar os retornos pendentes.');
        setReturnItems([]);
      } finally {
        if (!cancelled) setReturnLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, returnThreshold]);

  const [accessItems, setAccessItems] = useState([]);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    if (section !== 'acessos') return undefined;
    let cancelled = false;

    (async () => {
      setAccessLoading(true);
      try {
        const logs = await listClinicAccessLogs({ limit: 100 });
        if (cancelled) return;
        setAccessItems(logs);
        setAccessError('');
      } catch (err) {
        if (cancelled) return;
        setAccessError(err.message || 'Não foi possível carregar os acessos.');
        setAccessItems([]);
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [section]);

  const [surveyPatientId, setSurveyPatientId] = useState('');
  const [surveyGenerating, setSurveyGenerating] = useState(false);
  const [surveyGeneratedLink, setSurveyGeneratedLink] = useState('');
  const [surveyCopied, setSurveyCopied] = useState(false);
  const [surveyError, setSurveyError] = useState('');
  const [surveys, setSurveys] = useState([]);
  const [surveysLoading, setSurveysLoading] = useState(true);
  const [surveysError, setSurveysError] = useState('');

  useEffect(() => {
    if (section !== 'pesquisa') return undefined;
    let cancelled = false;

    (async () => {
      setSurveysLoading(true);
      try {
        const [clinicPatients, list] = await Promise.all([
          patients.length ? Promise.resolve(patients) : listClinicPatients(),
          listSatisfactionSurveys({ limit: 100 }),
        ]);
        if (cancelled) return;
        if (!patients.length) setPatients(clinicPatients);
        setSurveys(list);
        setSurveysError('');
      } catch (err) {
        if (cancelled) return;
        setSurveysError(err.message || 'Não foi possível carregar as pesquisas.');
        setSurveys([]);
      } finally {
        if (!cancelled) setSurveysLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  async function handleGenerateSurvey(e) {
    e.preventDefault();
    if (!surveyPatientId) return;
    setSurveyError('');
    setSurveyGeneratedLink('');
    setSurveyCopied(false);
    setSurveyGenerating(true);
    try {
      const created = await createSatisfactionSurvey({ patientId: surveyPatientId, clinicId });
      const link = buildSurveyLink(created.token);
      setSurveyGeneratedLink(link);
      setSurveys(prev => [created, ...prev]);
    } catch (err) {
      setSurveyError(err.message || 'Não foi possível gerar a pesquisa.');
    } finally {
      setSurveyGenerating(false);
    }
  }

  async function handleCopySurveyLink() {
    if (!surveyGeneratedLink) return;
    try {
      await navigator.clipboard.writeText(surveyGeneratedLink);
      setSurveyCopied(true);
    } catch {
      setSurveyCopied(false);
    }
  }

  // Snapshot congelado na montagem: comparar expiração contra Date.now()
  // direto no render seria impuro (resultado mudaria a cada render sem
  // motivo). A lista não precisa "expirar ao vivo" na tela.
  const [now] = useState(() => Date.now());

  function surveyStatus(survey) {
    if (survey.responded_at) return { label: `Nota ${survey.rating}/5`, tone: 'login' };
    if (new Date(survey.expires_at).getTime() < now) return { label: 'Expirada', tone: 'logout' };
    return { label: 'Aguardando resposta', tone: 'excused' };
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [team, clinicPatients, missed] = await Promise.all([
          listClinicMembers(),
          listClinicPatients(),
          listMissedAppointments({
            from: new Date(`${range.from}T00:00:00`).toISOString(),
            to: new Date(`${range.to}T23:59:59`).toISOString(),
            professionalId: professionalId || null,
          }),
        ]);
        if (cancelled) return;
        setMembers(team);
        setPatients(clinicPatients);
        setItems(missed);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Não foi possível carregar o relatório.');
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [range.from, range.to, professionalId]);

  function patientName(id) {
    return patients.find(item => item.id === id)?.name || 'Paciente';
  }

  function professionalName(id) {
    const found = members.find(item => item.id === id);
    return found ? shortName(found.full_name) : 'profissional';
  }

  const filtered = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    const list = query
      ? items.filter(item => patientName(item.patient_id).toLowerCase().includes(query))
      : items;
    return [...list].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, patientQuery, patients]);

  return (
    <div className="gt">
      <div className="gt-tabs" role="tablist" aria-label="Relatórios de gestão">
        {SECTIONS.map(item => (
          <button
            key={item.id}
            type="button"
            className="gt-tab"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'faltosos' && (
        <section>
          <p className="gt-note">
            Atendimentos marcados como &quot;não compareceu&quot; ou &quot;faltou com
            aviso&quot; no período. Busque pelo nome do paciente para ver só as
            faltas dele — data, horário e status de cada uma.
          </p>

          <div className="gt-filters">
            <div className="gt-field">
              <label htmlFor="gt-from">De</label>
              <input
                id="gt-from"
                type="date"
                className="gt-input"
                value={range.from}
                onChange={e => setRange(prev => ({ ...prev, from: e.target.value }))}
              />
            </div>
            <div className="gt-field">
              <label htmlFor="gt-to">Até</label>
              <input
                id="gt-to"
                type="date"
                className="gt-input"
                value={range.to}
                onChange={e => setRange(prev => ({ ...prev, to: e.target.value }))}
              />
            </div>
            {members.length > 1 && (
              <div className="gt-field">
                <label htmlFor="gt-prof">Profissional</label>
                <select
                  id="gt-prof"
                  className="gt-select"
                  value={professionalId}
                  onChange={e => setProfessionalId(e.target.value)}
                >
                  <option value="">Toda a equipe</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{member.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            <input
              type="text"
              className="gt-search"
              placeholder="Buscar paciente pelo nome…"
              value={patientQuery}
              onChange={e => setPatientQuery(e.target.value)}
              aria-label="Buscar paciente pelo nome"
            />
          </div>

          {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}

          {loading ? (
            <p className="gt-empty">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="gt-empty">Nenhuma falta no período.</p>
          ) : (
            <ul className="gt-list">
              {filtered.map(appointment => (
                <li key={appointment.id} className="gt-card">
                  <div className="gt-card-info">
                    <span className="gt-card-name">{patientName(appointment.patient_id)}</span>
                    <span className="gt-card-meta">
                      {[
                        formatWhen(appointment.starts_at),
                        professionalName(appointment.professional_id),
                        appointment.discipline,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className={`gt-badge gt-badge-${appointment.status}`}>
                    {getStatusLabel(appointment.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === 'retornos' && (
        <section>
          <p className="gt-note">
            Pacientes cujo último atendimento não teve retorno agendado depois.
            Ajuste o limite mínimo de dias para focar em quem está esperando há mais tempo.
          </p>

          <div className="gt-filters">
            <div className="gt-field">
              <label htmlFor="gt-threshold">Dias sem retorno (mín.)</label>
              <select
                id="gt-threshold"
                className="gt-select"
                value={returnThreshold}
                onChange={e => setReturnThreshold(Number(e.target.value))}
              >
                {RETURN_THRESHOLD_OPTIONS.map(option => (
                  <option key={option} value={option}>{option} dias</option>
                ))}
              </select>
            </div>
          </div>

          {returnError && <div className="gt-notice gt-notice-error" role="alert">{returnError}</div>}

          {returnLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : returnItems.length === 0 ? (
            <p className="gt-empty">Ninguém passou de {returnThreshold} dias sem retorno.</p>
          ) : (
            <ul className="gt-list">
              {returnItems.map(item => (
                <li key={item.patient_id} className="gt-card">
                  <div className="gt-card-info">
                    <span className="gt-card-name">{item.patient_name || patientName(item.patient_id)}</span>
                    <span className="gt-card-meta">
                      {[
                        `último atendimento ${formatWhen(item.last_attended_at)}`,
                        professionalName(item.professional_id),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className="gt-badge gt-badge-excused">{item.days_since} dias</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === 'acessos' && (
        <section>
          <p className="gt-note">
            Login e logout de quem acessa o sistema nesta instituição.
            Visível só para administrador da clínica.
          </p>

          {accessError && <div className="gt-notice gt-notice-error" role="alert">{accessError}</div>}

          {accessLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : accessItems.length === 0 ? (
            <p className="gt-empty">Nenhum acesso registrado ainda.</p>
          ) : (
            <ul className="gt-list">
              {accessItems.map(log => (
                <li key={log.id} className="gt-card">
                  <div className="gt-card-info">
                    <span className="gt-card-name">{log.actor_name || 'Usuário'}</span>
                    <span className="gt-card-meta">{formatWhen(log.created_at)}</span>
                  </div>
                  <span className={`gt-badge gt-badge-${log.action}`}>
                    {ACCESS_ACTION_LABELS[log.action] || log.action}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === 'pesquisa' && (
        <section>
          <p className="gt-note">
            Gere um link com nota de 1 a 5 e comentário livre. O paciente
            responde sem login — copie o link e envie pelo canal que a
            clínica já usa. O link expira em 14 dias ou assim que respondido.
          </p>

          <form className="gt-filters" onSubmit={handleGenerateSurvey}>
            <div className="gt-field gt-field--grow">
              <label htmlFor="gt-survey-patient">Paciente</label>
              <select
                id="gt-survey-patient"
                className="gt-select"
                value={surveyPatientId}
                onChange={e => setSurveyPatientId(e.target.value)}
                required
              >
                <option value="">Selecione…</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>{patient.name}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="gt-btn gt-btn--primary"
              disabled={!surveyPatientId || !clinicId || surveyGenerating}
            >
              {surveyGenerating ? 'Gerando…' : 'Gerar link'}
            </button>
          </form>

          {surveyError && <div className="gt-notice gt-notice-error" role="alert">{surveyError}</div>}

          {surveyGeneratedLink && (
            <div className="gt-notice gt-survey-link">
              <code>{surveyGeneratedLink}</code>
              <button type="button" className="gt-btn gt-btn--sm" onClick={handleCopySurveyLink}>
                {surveyCopied ? 'Copiado!' : 'Copiar link'}
              </button>
            </div>
          )}

          {surveysError && <div className="gt-notice gt-notice-error" role="alert">{surveysError}</div>}

          {surveysLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : surveys.length === 0 ? (
            <p className="gt-empty">Nenhuma pesquisa gerada ainda.</p>
          ) : (
            <ul className="gt-list">
              {surveys.map(survey => {
                const status = surveyStatus(survey);
                return (
                  <li key={survey.id} className="gt-card">
                    <div className="gt-card-info">
                      <span className="gt-card-name">{patientName(survey.patient_id)}</span>
                      <span className="gt-card-meta">
                        {[
                          `enviada ${formatWhen(survey.created_at)}`,
                          survey.comment ? `"${survey.comment}"` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <span className={`gt-badge gt-badge-${status.tone}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default RelatoriosGestao;
