import { patientIndependence, programIndependence, reductionLatestValue } from '../../utils/aba/calculations.js';
import { reviewStatusLabel } from '../../utils/aba/labels.js';
import { AbaIcon } from './AbaIcon';
import { IndependenceRing } from './IndependenceRing';

// Painel do paciente na área ABA: independência geral e por programa
// (os anéis), a última sessão e os atalhos para coletar e ver resultados.
export function AbaPatientPanel({ patient, data, onCollect, onPrograms, onResults, onSessions }) {
  const finished = data.sessions.filter(session => session.status !== 'em_andamento');
  const stats = patientIndependence(patient.id, data.programs, finished);
  const programs = data.programs.filter(program => !program.archivedAt);
  const acquisition = programs.filter(program => program.type === 'aquisicao');
  const reduction = programs.filter(program => program.type === 'reducao');
  const last = [...finished].sort((left, right) => (right.startAt || 0) - (left.startAt || 0))[0];
  const draft = data.sessions.find(session => session.status === 'em_andamento' && session.therapistId === data.permissions.userId);
  const pendingReview = finished.filter(session => ['pending_review', 'corrected_pending_review'].includes(session.reviewStatus)).length;

  return (
    <div className="aba-page">
      <section className="aba-card aba-overall">
        <IndependenceRing percentage={stats.percentage} />
        <div className="aba-overall-body">
          <p className="aba-eyebrow">Independência geral</p>
          <h2>{stats.percentage === null ? 'Sem dados registrados' : `${stats.percentage}% de respostas independentes`}</h2>
          <p className="aba-muted">{stats.independent} independentes ÷ {stats.filled} tentativas preenchidas. Tentativa em branco, recusa e não aplicável ficam fora; não é média entre sessões.</p>
          <p className="aba-muted">
            {data.team ? `${data.team.name} · supervisão ${data.professionalName(data.team.supervisorId)}` : 'Ainda sem time: a administração escolhe o time em Times.'}
          </p>
          <div className="aba-button-row">
            <button type="button" className="primary-button" onClick={onCollect}>
              <AbaIcon name="play" /> {draft ? 'Continuar coleta' : 'Iniciar coleta'}
            </button>
            <button type="button" className="quiet-button" onClick={onResults}><AbaIcon name="chart" /> Resultados</button>
            <button type="button" className="quiet-button" onClick={onSessions}>
              Sessões{pendingReview && data.permissions.canSupervise ? ` · ${pendingReview} para revisar` : ''}
            </button>
          </div>
        </div>
      </section>

      <section className="aba-card">
        <div className="aba-section-head">
          <div><p className="aba-eyebrow">Por programa</p><h3>Independência em aquisição</h3></div>
          {data.permissions.canSupervise && <button type="button" className="quiet-button" onClick={onPrograms}><AbaIcon name="target" /> Programas</button>}
        </div>
        <div className="aba-program-progress">
          {acquisition.map(program => {
            const programStats = programIndependence(program.id, finished);
            return (
              <article key={program.id}>
                <IndependenceRing percentage={programStats.percentage} size="small" />
                <div>
                  <h4>{program.name}</h4>
                  <p>{program.target}</p>
                  <small>{programStats.independent} independentes / {programStats.filled} preenchidas · {program.status}</small>
                </div>
              </article>
            );
          })}
          {!acquisition.length && <p className="aba-empty">Nenhum programa de aquisição ainda.</p>}
        </div>
      </section>

      {reduction.length > 0 && (
        <section className="aba-card">
          <div className="aba-section-head"><div><p className="aba-eyebrow">Redução</p><h3>Comportamentos-alvo</h3></div><small className="aba-muted">Independência não se aplica</small></div>
          <div className="aba-reduction-grid">
            {reduction.map(program => {
              const latest = reductionLatestValue(program.id, finished);
              return (
                <article key={program.id}>
                  <AbaIcon name="activity" size={20} />
                  <div><small>{program.measure}</small><h4>{program.name}</h4><p>{program.target}</p></div>
                  <strong>{latest ? `${latest.value} ${program.unit}` : 'Sem dados'}</strong>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {last && (
        <section className="aba-card">
          <div className="aba-section-head"><div><p className="aba-eyebrow">Última sessão</p><h3>{new Date(`${last.date}T12:00:00`).toLocaleDateString('pt-BR')} · {data.professionalName(last.therapistId)}</h3></div></div>
          <p className="aba-muted">{last.location} · {last.records.length} {last.records.length === 1 ? 'programa' : 'programas'} · {reviewStatusLabel(last.reviewStatus)}</p>
        </section>
      )}
    </div>
  );
}

export default AbaPatientPanel;
