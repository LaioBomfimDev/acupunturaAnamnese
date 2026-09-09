import { getStatusLabel } from '../../../utils/agenda';
import { humanMinutes } from '../../../utils/agendaToday';
import { getDiscipline } from '../../../data/disciplines';

// ============================================================
// Painel "Hoje" — a fila da recepção
//
// A tela que fica aberta no balcão. Ela responde três perguntas, nessa
// ordem de urgência: quem está esperando, quem está atrasado, quem vem
// agora. Já atendido desce para o fim e fica sem ação.
//
// Cada cartão tem NO MÁXIMO duas ações. Uma recepção com fila não lê
// menu: ela toca no botão grande. O resto das ações mora no detalhe do
// agendamento, a um toque de distância.
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
  professionalName,
  showProfessional,
  onOpen,
  actions,
}) {
  const { appointment } = item;

  return (
    <li className={`agh-card agh-card--${tone}`}>
      <button type="button" className="agh-open" onClick={() => onOpen(appointment)}>
        <span className="agh-top">
          <span className="agh-hour">{hora(appointment.starts_at)}</span>
          {item.waitingMinutes !== null && (
            <span className="agh-wait">esperando há {humanMinutes(item.waitingMinutes)}</span>
          )}
          {item.lateMinutes !== null && (
            <span className="agh-late">{humanMinutes(item.lateMinutes)} de atraso</span>
          )}
          {item.confirmed && item.lateMinutes === null && item.waitingMinutes === null && (
            <span className="agh-confirmed">confirmado</span>
          )}
          {tone === 'done' && (
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
  isToday,
  dateLabel,
  patientName,
  professionalName,
  showProfessional = false,
  saving,
  onOpen,
  onCheckIn,
  onUndoCheckIn,
  onConfirm,
  onStatus,
  onStart,
  canStart,
}) {
  const { aguardando, atrasados, proximos, concluidos, resumo, bloqueios } = queue;

  return (
    <div className="agh">
      <div className="agh-summary">
        <span className="agh-stat">
          <b>{resumo.total}</b> {resumo.total === 1 ? 'atendimento' : 'atendimentos'}
        </span>
        {resumo.aguardando > 0 && (
          <span className="agh-stat agh-stat--wait">
            <b>{resumo.aguardando}</b> na sala
          </span>
        )}
        {resumo.atrasados > 0 && (
          <span className="agh-stat agh-stat--late">
            <b>{resumo.atrasados}</b> atrasado(s)
          </span>
        )}
        {resumo.atendidos > 0 && (
          <span className="agh-stat"><b>{resumo.atendidos}</b> atendido(s)</span>
        )}
        {resumo.faltas > 0 && (
          <span className="agh-stat"><b>{resumo.faltas}</b> falta(s)</span>
        )}
        {resumo.esperaMaxima > 0 && (
          <span className="agh-stat">espera máxima {humanMinutes(resumo.esperaMaxima)}</span>
        )}
        {bloqueios > 0 && (
          <span className="agh-stat">{bloqueios} bloqueio(s)</span>
        )}
      </div>

      {!isToday && (
        <p className="agd-banner">
          Esta fila é de <b>{dateLabel}</b>, não de hoje. Os tempos de espera
          e atraso são calculados a partir de agora, então só fazem sentido
          no dia corrente.
        </p>
      )}

      {resumo.total === 0 ? (
        <p className="ag-empty">Nenhum atendimento marcado neste dia.</p>
      ) : (
        <>
          <Bloco titulo="Na sala de espera" itens={aguardando} vazio="Ninguém aguardando.">
            {aguardando.map(item => (
              <QueueCard
                key={item.appointment.id}
                item={item}
                tone="waiting"
                patientName={patientName}
                professionalName={professionalName}
                showProfessional={showProfessional}
                onOpen={onOpen}
                actions={[
                  ...(canStart(item.appointment)
                    ? [{ label: 'Iniciar atendimento', primary: true, disabled: saving, onClick: () => onStart(item.appointment) }]
                    : []),
                  { label: 'Atendeu', disabled: saving, onClick: () => onStatus(item.appointment, 'attended') },
                ]}
              />
            ))}
          </Bloco>

          <Bloco titulo="Atrasados" itens={atrasados} vazio="Ninguém atrasado.">
            {atrasados.map(item => (
              <QueueCard
                key={item.appointment.id}
                item={item}
                tone="late"
                patientName={patientName}
                professionalName={professionalName}
                showProfessional={showProfessional}
                onOpen={onOpen}
                actions={[
                  { label: 'Chegou', primary: true, disabled: saving, onClick: () => onCheckIn(item.appointment) },
                  { label: 'Não veio', disabled: saving, onClick: () => onStatus(item.appointment, 'no_show') },
                ]}
              />
            ))}
          </Bloco>

          <Bloco titulo="A seguir" itens={proximos} vazio="Nada mais marcado para hoje.">
            {proximos.map(item => (
              <QueueCard
                key={item.appointment.id}
                item={item}
                tone="next"
                patientName={patientName}
                professionalName={professionalName}
                showProfessional={showProfessional}
                onOpen={onOpen}
                actions={[
                  { label: 'Chegou', primary: true, disabled: saving, onClick: () => onCheckIn(item.appointment) },
                  item.confirmed
                    ? { label: 'Desfazer confirmação', disabled: saving, onClick: () => onConfirm(item.appointment, true) }
                    : { label: 'Confirmou', disabled: saving, onClick: () => onConfirm(item.appointment, false) },
                ]}
              />
            ))}
          </Bloco>

          {concluidos.length > 0 && (
            <Bloco titulo="Encerrados" itens={concluidos} vazio="">
              {concluidos.map(item => (
                <QueueCard
                  key={item.appointment.id}
                  item={item}
                  tone="done"
                  patientName={patientName}
                  professionalName={professionalName}
                  showProfessional={showProfessional}
                  onOpen={onOpen}
                  actions={
                    // Desfazer chegada existe porque a recepção erra de
                    // linha; sem isso a correção seria mexer no status na
                    // mão e deixar o carimbo de chegada mentindo.
                    item.checkedIn && item.appointment.status !== 'attended'
                      ? [{ label: 'Desfazer chegada', disabled: saving, onClick: () => onUndoCheckIn(item.appointment) }]
                      : []
                  }
                />
              ))}
            </Bloco>
          )}
        </>
      )}
    </div>
  );
}

export default TodayPanel;
