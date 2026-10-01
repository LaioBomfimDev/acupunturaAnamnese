import { useEffect, useMemo, useState } from 'react';
import { listAppointments } from '../../services/appointmentService';
import { EVOLUTION_REVIEW_LIMIT, listEvolutionReviewRows } from '../../services/patientEvolutionService';
import { shortName } from '../../services/clinicMembersService';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import { ATTENDANCE_LABELS } from '../../utils/evolutionQueue';
import { canAdvanceSurveyPeriod, shiftSurveyPeriod, surveyPeriodLabel, surveyPeriodRange } from '../../utils/gestaoSurveys';
import {
  EVOLUTION_REVIEW_START,
  atendimentosLabel,
  buildEvolutionReview,
  canGoBackEvolutionReview,
  canSeeTeamEvolutions,
  correctionsLabel,
  evolutionReviewByProfessional,
  evolutionReviewStats,
  filterEvolutionReview,
  groupEvolutionReviewByDay,
  isBeforeEvolutionReview,
  pendingDaysLabel,
  pendingLabel,
} from '../../utils/evolutionReview';
import { SearchSelect } from '../ui/SearchSelect';
import { PanelLoading } from '../ui/PanelLoading';

// ============================================================
// Evoluções > "Ver evoluções" — conferência das evoluções feitas.
//
// Mostra SE cada atendimento concluído foi evoluído e QUANDO a evolução
// foi escrita, nunca o texto: o conteúdo clínico continua só na ficha
// do paciente. A administração vê a equipe inteira; o profissional, só
// os próprios atendimentos.
//
// Desenho de 2026-10-01 (pedido da administradora): tela inteira, letra
// e botões grandes, filtros numa barra só (busca, profissional, área,
// período) e só dois números — atendimentos concluídos e falta evoluir.
//
// Período por semana (domingo a sábado) ou mês, pela data do
// atendimento — o mesmo recorte da Pesquisa de satisfação na Gestão.
// ============================================================

const PERIOD_MODES = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
];

function hora(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diaHora(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dia = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} às ${hora(iso)}`;
}

function diaLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function EvolutionsReview({ profile, patients, members }) {
  const teamView = canSeeTeamEvolutions(profile);
  const [now] = useState(() => new Date());
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [onlyPending, setOnlyPending] = useState(false);
  const [professionalId, setProfessionalId] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [query, setQuery] = useState('');

  const range = useMemo(() => surveyPeriodRange(mode, anchor), [mode, anchor]);
  const rangeKey = `${range.start.getTime()}-${range.end.getTime()}`;
  const [result, setResult] = useState({ key: null, appointments: [], evolutions: [], error: '' });
  const loading = result.key !== rangeKey;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listAppointments({ from: range.start.toISOString(), to: new Date(range.end.getTime() - 1).toISOString() }),
      listEvolutionReviewRows({ from: range.start.toISOString(), to: range.end.toISOString() }),
    ]).then(([appointments, evolutions]) => {
      if (!cancelled) setResult({ key: rangeKey, appointments, evolutions, error: '' });
    }).catch(err => {
      if (!cancelled) {
        setResult({
          key: rangeKey,
          appointments: [],
          evolutions: [],
          error: err?.message || 'Não foi possível carregar as evoluções do período.',
        });
      }
    });
    return () => { cancelled = true; };
  }, [range, rangeKey]);

  const patientsById = useMemo(
    () => new Map((patients || []).map(patient => [patient.id, patient])),
    [patients],
  );

  const rows = useMemo(
    () => buildEvolutionReview(result.appointments, result.evolutions, {
      now,
      onlyProfessionalId: teamView ? null : profile?.id,
    }),
    [result, now, teamView, profile?.id],
  );

  function patientName(id) {
    return patientsById.get(id)?.name || 'Paciente';
  }

  function professionalName(id) {
    if (id === profile?.id) return 'Você';
    const found = (members || []).find(member => member.id === id);
    return found ? shortName(found.full_name) : 'Profissional';
  }

  // Os dois números e o quadro da equipe seguem profissional e área; a
  // busca e "Falta evoluir" só recortam a lista.
  const scoped = filterEvolutionReview(rows, { professionalId, discipline });
  const stats = evolutionReviewStats(scoped);
  const byProfessional = evolutionReviewByProfessional(filterEvolutionReview(rows, { discipline }));
  const visible = filterEvolutionReview(scoped, { onlyPending, query, nameOf: patientName });
  const areas = DISCIPLINES.filter(item => rows.some(row => row.discipline === item.id));
  // Só quem atendeu no período: recepção e admin que não atende ficam fora.
  const professionalOptions = [...new Set(rows.map(row => row.professionalId))].map(id => ({
    id,
    label: (members || []).find(member => member.id === id)?.full_name || professionalName(id),
  }));
  const filtersActive = Boolean(onlyPending || professionalId || discipline || query.trim());
  const truncated = result.appointments.length >= 2000 || result.evolutions.length >= EVOLUTION_REVIEW_LIMIT;
  const columns = teamView ? 6 : 5;

  function changeMode(next) {
    setMode(next);
    setAnchor(new Date());
  }

  function clearFilters() {
    setOnlyPending(false);
    setProfessionalId('');
    setDiscipline('');
    setQuery('');
  }

  function renderList() {
    if (loading) return <PanelLoading />;
    if (isBeforeEvolutionReview(range)) {
      return (
        <p className="evs-review-empty">
          A conferência começa em {EVOLUTION_REVIEW_START.toLocaleDateString('pt-BR')}, quando a evolução
          entrou em uso no sistema.
        </p>
      );
    }
    if (rows.length === 0) return <p className="evs-review-empty">Nenhum atendimento concluído neste período.</p>;
    if (visible.length === 0) {
      return (
        <p className="evs-review-empty">
          Nenhum atendimento com esses filtros.{' '}
          <button type="button" className="evs-review-link" onClick={clearFilters}>Limpar filtros</button>
        </p>
      );
    }

    return (
      <div className="evs-review-table-wrap">
        <table className="evs-review-grid">
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Paciente</th>
              {teamView && <th scope="col">Profissional</th>}
              <th scope="col">Área</th>
              <th scope="col">Atendimento</th>
              <th scope="col">Evolução</th>
            </tr>
          </thead>
          {groupEvolutionReviewByDay(visible).map(([dayKey, dayRows]) => (
            <tbody key={dayKey}>
              <tr className="evs-review-dayrow">
                <th scope="rowgroup" colSpan={columns}>
                  {diaLabel(dayRows[0].appointment.starts_at)}
                  <span className="evs-review-day-count">{atendimentosLabel(dayRows.length)}</span>
                </th>
              </tr>
              {dayRows.map(row => (
                <tr key={row.id} className={row.evolved ? 'is-evolved' : 'is-pending'}>
                  <td className="evs-review-c-hora">{hora(row.appointment.starts_at)}</td>
                  <td className="evs-review-c-paciente">
                    <b>{patientName(row.appointment.patient_id)}</b>
                    {row.lateEntry && <small>atendimento lançado depois</small>}
                  </td>
                  {teamView && <td className="evs-review-c-prof">{professionalName(row.professionalId)}</td>}
                  <td className="evs-review-c-area">{getDiscipline(row.discipline)?.label || row.discipline}</td>
                  <td className="evs-review-c-status">
                    <span className={`evs-status evs-status--${row.attendanceStatus}`}>
                      {ATTENDANCE_LABELS[row.attendanceStatus] || row.attendanceStatus}
                    </span>
                  </td>
                  <td className="evs-review-c-evo">
                    {row.evolved ? (
                      <>
                        <span className="evs-review-badge evs-review-badge--done">Evoluído</span>
                        <small>
                          em {diaHora(row.evolution.registrado_em)}
                          {row.corrections > 0 && ` · ${correctionsLabel(row.corrections)}`}
                        </small>
                      </>
                    ) : (
                      <span className="evs-review-badge evs-review-badge--pending">{pendingLabel(row.pendingDays)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    );
  }

  return (
    <div className="evs-review">
      <div className="evs-review-toolbar">
        <div className="evs-review-field evs-review-field--search">
          <label className="evs-review-label" htmlFor="evs-review-busca">Paciente</label>
          <div className="evs-review-search">
            <IconSearch />
            <input
              id="evs-review-busca"
              type="text"
              autoComplete="off"
              placeholder="Buscar pelo nome"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') setQuery(''); }}
            />
            {query && (
              <button type="button" className="evs-review-clear" aria-label="Limpar busca" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>
        </div>

        {teamView && professionalOptions.length > 1 && (
          <div className="evs-review-field">
            <label className="evs-review-label" htmlFor="evs-review-prof">Profissional</label>
            <SearchSelect
              id="evs-review-prof"
              value={professionalId}
              onChange={setProfessionalId}
              options={professionalOptions}
              placeholder="Toda a equipe"
              emptyOptionLabel="Toda a equipe"
            />
          </div>
        )}

        {areas.length > 1 && (
          <div className="evs-review-field">
            <label className="evs-review-label" htmlFor="evs-review-area">Área</label>
            <select
              id="evs-review-area"
              className="evs-review-select"
              value={discipline}
              onChange={event => setDiscipline(event.target.value)}
            >
              <option value="">Todas as áreas</option>
              {areas.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
        )}

        <div className="evs-review-field evs-review-field--period">
          <span className="evs-review-label" id="evs-review-periodo">Período</span>
          <div className="evs-review-period" role="group" aria-labelledby="evs-review-periodo">
            <div className="evs-review-segmented">
              {PERIOD_MODES.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mode === option.id}
                  onClick={() => changeMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="evs-review-arrow"
              onClick={() => setAnchor(prev => shiftSurveyPeriod(mode, prev, -1))}
              disabled={!canGoBackEvolutionReview(range)}
              aria-label={mode === 'week' ? 'Semana anterior' : 'Mês anterior'}
            >
              ‹
            </button>
            <span className="evs-review-period-label" aria-live="polite">{surveyPeriodLabel(mode, anchor)}</span>
            <button
              type="button"
              className="evs-review-arrow"
              onClick={() => setAnchor(prev => shiftSurveyPeriod(mode, prev, 1))}
              disabled={!canAdvanceSurveyPeriod(mode, anchor, now)}
              aria-label={mode === 'week' ? 'Próxima semana' : 'Próximo mês'}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {result.error && <div className="evs-error" role="alert">{result.error}</div>}
      {truncated && (
        <p className="evs-note">
          O período tem mais atendimentos do que a tela carrega de uma vez. Veja por semana para conferir tudo.
        </p>
      )}

      <div className="evs-review-stats">
        <button
          type="button"
          className="evs-review-stat"
          aria-pressed={!onlyPending}
          onClick={() => setOnlyPending(false)}
        >
          <span className="evs-review-stat-label">Atendimentos concluídos</span>
          <b>{loading ? '–' : stats.total}</b>
          <small>{loading ? '' : `${stats.evolved} ${stats.evolved === 1 ? 'evoluído' : 'evoluídos'}`}</small>
        </button>
        <button
          type="button"
          className="evs-review-stat evs-review-stat--pending"
          aria-pressed={onlyPending}
          onClick={() => setOnlyPending(prev => !prev)}
        >
          <span className="evs-review-stat-label">Falta evoluir</span>
          <b>{loading ? '–' : stats.pending}</b>
          <small>
            {loading ? '' : stats.pending ? `mais antiga: ${pendingDaysLabel(stats.oldestPendingDays)}` : 'nada pendente'}
          </small>
        </button>
      </div>

      {teamView && !loading && byProfessional.length > 1 && (
        <section className="evs-review-team" aria-label="Por profissional">
          <h3>Por profissional</h3>
          <div className="evs-review-table-wrap">
            <table className="evs-review-table">
              <thead>
                <tr>
                  <th scope="col">Profissional</th>
                  <th scope="col">Concluídos</th>
                  <th scope="col">Evoluídos</th>
                  <th scope="col">Falta evoluir</th>
                  <th scope="col">Pendente mais antiga</th>
                </tr>
              </thead>
              <tbody>
                {byProfessional.map(item => (
                  <tr key={item.id} className={professionalId === item.id ? 'is-selected' : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="evs-review-prof"
                        aria-pressed={professionalId === item.id}
                        onClick={() => setProfessionalId(prev => (prev === item.id ? '' : item.id))}
                      >
                        {professionalName(item.id)}
                      </button>
                    </th>
                    <td>{item.total}</td>
                    <td>{item.evolved}</td>
                    <td className={item.pending ? 'evs-review-cell--pending' : undefined}>{item.pending}</td>
                    <td>{pendingDaysLabel(item.oldestPendingDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="evs-review-hint">Clique no nome para ver só os atendimentos daquele profissional.</p>
        </section>
      )}

      <section className="evs-review-results" aria-label="Atendimentos">
        <div className="evs-review-results-head">
          <h3>{onlyPending ? 'Falta evoluir' : 'Atendimentos'}</h3>
          {!loading && (
            <span>
              {filtersActive ? `${visible.length} de ${atendimentosLabel(rows.length)}` : atendimentosLabel(rows.length)}
            </span>
          )}
          {filtersActive && (
            <button type="button" className="evs-review-link" onClick={clearFilters}>Limpar filtros</button>
          )}
        </div>
        {renderList()}
      </section>
    </div>
  );
}
