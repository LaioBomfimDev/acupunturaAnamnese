import { useEffect, useMemo, useState } from 'react';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { listClinicMembers, shortName } from '../../services/clinicMembersService';
import { getDiscipline } from '../../data/disciplines';
import { ESCALAS_HELP } from '../../data/screenHelp';
import { scaleDisciplinesFor } from '../../utils/instrumentAccess';
import { getInitials, patientAgeLabel } from '../../utils/patientUi';
import { ScreenHelp } from '../ui/ScreenHelp';
import { HubBackButton } from '../HubNav';
import { PatientInstrumentsPanel } from './PatientInstrumentsPanel';
import { InstrumentRiskAlerts } from './InstrumentRiskAlerts';
import '../../styles/instruments.css';

// ============================================================
// Tela "Escalas" do menu principal (13/10/2026, pedido da
// administradora: as escalas saíram de dentro da Psicologia para um
// destino próprio, ao lado de Agenda, Evoluções e Pacientes).
//
// Lista de pacientes à esquerda (matriculados na área; a busca procura
// em todos) e, à direita, as escalas do paciente escolhido, no mesmo
// acordeão da ficha e da Psicologia. No celular e no tablet a lista é a
// tela e o paciente aberto ocupa a tela, com "Voltar à lista" na faixa
// de baixo; quem decide o que aparece é o CSS.
//
// Quem vê a tela: utils/instrumentAccess.js. O que cada um lê de cada
// paciente continua decidido no banco (quem atende e a administração).
// Os alertas de risco ainda não vistos ficam no topo, como na tela inicial.
// ============================================================

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function ScalesScreen({ profile, initialPatient = null }) {
  const disciplines = scaleDisciplinesFor(profile);
  const [discipline, setDiscipline] = useState(disciplines[0] || null);
  const [patients, setPatients] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(initialPatient);
  // Recarrega os alertas do topo depois de cada carga das escalas
  // (marcou "Vi o alerta" lá dentro, o aviso de cima some).
  const [alertsKey, setAlertsKey] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  // Marcou "Vi o alerta" no topo: o paciente aberto recarrega as escalas.
  const [panelToken, setPanelToken] = useState(0);
  const userId = profile?.id || null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listClinicPatients(), listClinicMembers().catch(() => [])])
      .then(([rows, team]) => {
        if (cancelled) return;
        setPatients(rows);
        setMembers(team);
        setError('');
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Não foi possível carregar os pacientes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const memberName = useMemo(() => {
    const names = new Map(members.map(member => [member.id, shortName(member.full_name)]));
    return id => names.get(id) || null;
  }, [members]);

  const areaLabel = getDiscipline(discipline)?.label || 'área';
  const enrollmentOf = patient => (patient.enrollments || []).find(item => item.discipline === discipline) || null;
  const searching = normalize(query).length > 0;
  const rows = (searching
    ? patients.filter(patient => normalize(patient.name).includes(normalize(query)))
    : patients.filter(patient => enrollmentOf(patient)))
    .map(patient => {
      const enrollment = enrollmentOf(patient);
      return { patient, enrollment, mine: Boolean(userId && enrollment?.assigned_to === userId) };
    })
    .sort((a, b) => (Number(b.mine) - Number(a.mine)) || String(a.patient.name).localeCompare(String(b.patient.name), 'pt-BR'));
  const enrolledCount = patients.filter(patient => enrollmentOf(patient)).length;
  const mineCount = patients.filter(patient => userId && enrollmentOf(patient)?.assigned_to === userId).length;
  // O paciente vindo de um alerta chega só com id e nome: quando a lista
  // carrega, entra o cadastro completo (telefone, idade) no lugar.
  const current = selected ? (patients.find(patient => patient.id === selected.id) || selected) : null;
  const currentEnrollment = current ? enrollmentOf(current) : null;

  function choose(patient) {
    setSelected(patient);
  }

  if (!disciplines.length) {
    return (
      <div className="scales-screen">
        <div className="alert" role="alert">As escalas ficam com quem atende pacientes na Psicologia e com a administração.</div>
      </div>
    );
  }

  return (
    <div className="scales-screen">
      <div className="screen-title-row scales-title">
        <h2>Escalas</h2>
        <ScreenHelp topic={ESCALAS_HELP} />
      </div>

      <InstrumentRiskAlerts
        key={alertsKey}
        onOpen={alert => choose({ id: alert.patientId, name: alert.patientName })}
        onSeen={alert => { if (alert.patientId === current?.id) setPanelToken(token => token + 1); }}
      />

      {disciplines.length > 1 && (
        <div className="scales-areas" role="group" aria-label="Área das escalas">
          {disciplines.map(id => (
            <button
              key={id}
              type="button"
              aria-pressed={discipline === id}
              onClick={() => { setDiscipline(id); setSelected(null); }}
            >
              {getDiscipline(id)?.label || id}
            </button>
          ))}
        </div>
      )}

      <div className={`scales-layout${current ? ' has-patient' : ''}`}>
        <aside className="scales-patients" aria-label="Pacientes">
          <label className="scales-search">
            <span className="sr-only">Buscar paciente</span>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              type="search"
              value={query}
              placeholder="Buscar paciente pelo nome"
              onChange={event => setQuery(event.target.value)}
            />
          </label>

          <p className="small scales-list-note">
            {loading
              ? 'Carregando pacientes…'
              : searching
                ? `${rows.length === 1 ? '1 paciente encontrado' : `${rows.length} pacientes encontrados`} entre todos os pacientes.`
                : `${enrolledCount === 1 ? '1 paciente' : `${enrolledCount} pacientes`} com matrícula na ${areaLabel}${mineCount ? ` · ${mineCount} com você como responsável` : ''}. A busca procura em todos.`}
          </p>

          {error ? (
            <div className="scales-list-error">
              <div className="alert" role="alert">{error}</div>
              <button type="button" className="quiet-button" onClick={() => { setLoading(true); setReloadToken(token => token + 1); }}>
                Tentar de novo
              </button>
            </div>
          ) : !loading && rows.length === 0 ? (
            <p className="small area-empty">
              {searching ? 'Nenhum paciente com esse nome.' : `Nenhum paciente com matrícula na ${areaLabel} ainda. Busque pelo nome para abrir qualquer paciente.`}
            </p>
          ) : (
            <ul className="scales-patient-list">
              {rows.map(({ patient, enrollment, mine }) => {
                const responsible = enrollment?.assigned_to ? memberName(enrollment.assigned_to) : null;
                const age = patientAgeLabel(patient);
                return (
                  <li key={patient.id}>
                    <button
                      type="button"
                      className="scales-patient"
                      aria-current={current?.id === patient.id ? 'true' : undefined}
                      onClick={() => choose(patient)}
                    >
                      <span className="scales-avatar" aria-hidden="true">{getInitials(patient.name)}</span>
                      <span className="scales-patient-text">
                        <b>{patient.name}</b>
                        <span>
                          {[
                            age,
                            mine ? 'Você é responsável' : responsible ? `Responsável: ${responsible}` : enrollment ? areaLabel : 'Sem matrícula na área',
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {mine && <span className="scales-mine-tag">Seu</span>}
                      <span className="scales-patient-arrow" aria-hidden="true">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="scales-detail" aria-label={current ? `Escalas de ${current.name}` : 'Escalas do paciente'}>
          {current ? (
            <>
              <HubBackButton nested label="Voltar à lista" onClick={() => setSelected(null)} className="topbar-button scales-back" />
              <header className="scales-patient-head">
                <span className="scales-avatar is-large" aria-hidden="true">{getInitials(current.name)}</span>
                <div>
                  <h3>{current.name}</h3>
                  <p className="small">
                    {[
                      patientAgeLabel(current),
                      currentEnrollment
                        ? (currentEnrollment.assigned_to
                          ? `Responsável na ${areaLabel}: ${currentEnrollment.assigned_to === userId ? 'você' : (memberName(currentEnrollment.assigned_to) || 'definido')}`
                          : `Matriculado na ${areaLabel}, sem responsável escolhido`)
                        : `Sem matrícula na ${areaLabel}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </header>
              {/* forms-scope: o painel veste o mesmo kit da ficha e da Psicologia. */}
              <div className="forms-scope scales-panel">
                <PatientInstrumentsPanel
                  key={`${current.id}|${discipline}|${panelToken}`}
                  patient={current}
                  discipline={discipline}
                  currentUserId={userId}
                  clinicName={profile?.clinic?.name || profile?.clinic_name || ''}
                  onApplicationsLoaded={() => setAlertsKey(key => key + 1)}
                />
              </div>
            </>
          ) : (
            <div className="scales-empty">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19h16" />
                <path d="m4 15 4.5-4.5 3.5 3.5L20 6" />
                <circle cx="8.5" cy="10.5" r="1.2" />
                <circle cx="12" cy="14" r="1.2" />
                <circle cx="20" cy="6" r="1.4" />
              </svg>
              <h3>Escolha um paciente</h3>
              <p>
                As escalas abrem fechadas, com a última nota, a faixa, a data da primeira aplicação e das reaplicações.
                Abra uma para aplicar, enviar para casa e ver o gráfico da evolução.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ScalesScreen;
