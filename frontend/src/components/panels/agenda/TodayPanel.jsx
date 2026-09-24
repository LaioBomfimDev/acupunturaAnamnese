import { getStatusLabel } from '../../../utils/agenda';
import { getDiscipline } from '../../../data/disciplines';
import { IconCheck } from './AgendaIcons';

// ============================================================
// Painel "Hoje" — a lista do dia
//
// Três grupos, na ordem: a atender, atendidos, e quem não compareceu ou
// cancelou. Sem sala de espera e sem atraso: a agenda registra só o
// resultado do atendimento. Quem já confirmou presença ganha o V verde.
//
// Cada cartão tem NO MÁXIMO duas ações — quem está com fila não lê
// menu. O resto (Cancelado pelo paciente, Confirmado, editar, mover)
// mora no detalhe do agendamento, a um toque de distância.
// ============================================================

function hora(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function QueueCard({
  item,
  tone,
  patientName,
  patientPending,
  professionalName,
  showProfessional,
  onOpen,
  actions,
}) {
  const { appointment } = item;
  const pending = Boolean(patientPending?.(appointment.patient_id));

  return (
    <li className={`agh-card agh-card--${tone}${pending ? ' agh-card--pending' : ''}`}>
      <button type="button" className="agh-open" onClick={() => onOpen(appointment)}>
        <span className="agh-top">
          <span className="agh-hour">{hora(appointment.starts_at)}</span>
          {item.confirmed && tone === 'next' && (
            <span className="agh-confirmed">
              <IconCheck /> Confirmado
            </span>
          )}
          {tone !== 'next' && (
            <span className="agh-done">{getStatusLabel(appointment.status)}</span>
          )}
        </span>

        <span className="agh-name">
          <span
            className="agh-discipline-dot"
            style={{ background: getDiscipline(appointment.discipline)?.color }}
            aria-hidden="true"
          />
          {patientName(appointment.patient_id)}
        </span>

        <span className="agh-meta">
          {[
            appointment.discipline,
            showProfessional ? professionalName(appointment.professional_id) : null,
            appointment.room,
          ].filter(Boolean).join(' · ')}
        </span>
      </button>

      {actions.length > 0 && (
        <div className="agh-actions">
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              className={`ag-btn${action.primary ? ' ag-btn--primary' : ''}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Bloco({ titulo, itens, vazio, children }) {
  return (
    <section className="agh-block">
      <h4 className="agh-block-title">
        {titulo} <span>{itens.length}</span>
      </h4>
      {itens.length === 0 ? <p className="agh-empty">{vazio}</p> : <ul className="agh-list">{children}</ul>}
    </section>
  );
}

export function TodayPanel({
  queue,
  patientName,
  patientPending,
  professionalName,
  showProfessional = false,
  saving,
  onOpen,
  onStatus,
  onStart,
  canStart,
}) {
  const { aAtender, atendidos, ausentes, resumo, bloqueios } = queue;
  const cardProps = { patientName, patientPending, professionalName, showProfessional, onOpen };

  return (
    <div className="agh">
      <div className="agh-summary">
        <span className="agh-stat">
          <b>{resumo.total}</b> {resumo.total === 1 ? 'atendimento' : 'atendimentos'}
        </span>
        {resumo.confirmados > 0 && (
          <span className="agh-stat agh-stat--confirmed">
            <b>{resumo.confirmados}</b> {resumo.confirmados === 1 ? 'confirmado' : 'confirmados'}
          </span>
        )}
        {resumo.atendidos > 0 && (
          <span className="agh-stat"><b>{resumo.atendidos}</b> {resumo.atendidos === 1 ? 'atendido' : 'atendidos'}</span>
        )}
        {resumo.ausentes > 0 && (
          <span className="agh-stat">
            <b>{resumo.ausentes}</b> {resumo.ausentes === 1 ? 'ausência' : 'ausências'}
          </span>
        )}
        {bloqueios > 0 && (
          <span className="agh-stat">{bloqueios} {bloqueios === 1 ? 'bloqueio' : 'bloqueios'}</span>
        )}
      </div>

      {resumo.total === 0 ? (
        <p className="ag-empty">Nenhum atendimento marcado neste dia.</p>
      ) : (
        <>
          <Bloco titulo="A atender" itens={aAtender} vazio="Nada mais a atender neste dia.">
            {aAtender.map(item => (
              <QueueCard
                key={item.appointment.id}
                item={item}
                tone="next"
                {...cardProps}
                actions={canStart(item.appointment)
                  ? [
                    { label: 'Iniciar atendimento', primary: true, disabled: saving, onClick: () => onStart(item.appointment) },
                    { label: 'Atendido', disabled: saving, onClick: () => onStatus(item.appointment, 'attended') },
                  ]
                  : [
                    { label: 'Atendido', primary: true, disabled: saving, onClick: () => onStatus(item.appointment, 'attended') },
                    { label: 'Não compareceu', disabled: saving, onClick: () => onStatus(item.appointment, 'no_show') },
                  ]}
              />
            ))}
          </Bloco>

          {atendidos.length > 0 && (
            <Bloco titulo="Atendidos" itens={atendidos} vazio="">
              {atendidos.map(item => (
                <QueueCard key={item.appointment.id} item={item} tone="done" {...cardProps} actions={[]} />
              ))}
            </Bloco>
          )}

          {ausentes.length > 0 && (
            <Bloco titulo="Não compareceram ou cancelaram" itens={ausentes} vazio="">
              {ausentes.map(item => (
                <QueueCard key={item.appointment.id} item={item} tone="absent" {...cardProps} actions={[]} />
              ))}
            </Bloco>
          )}
        </>
      )}
    </div>
  );
}

export default TodayPanel;
