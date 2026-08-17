// ============================================================
// Conferência do pacote de sessões
//
// Existe porque criar dez agendamentos de uma vez é a ação mais
// irreversível da agenda: se sair errado, são dez correções na mão.
// A lista aparece ANTES de gravar, com as datas atípicas e os conflitos
// nomeados — e é ela que faz o papel da confirmação dupla no caso da
// série.
//
// Nenhuma data é removida sozinha: feriado e sábado ficam na lista,
// marcados, e a pessoa decide. Pular por conta própria seria o sistema
// escolhendo pela clínica.
// ============================================================

function dataLonga(date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
}

function hora(date) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function SeriesPreview({ items, summary, saving, onConfirm, onCancel, patientName }) {
  return (
    <div className="ags" role="alertdialog" aria-label="Conferir as sessões do pacote">
      <p className="ags-title">
        {summary.total} {summary.total === 1 ? 'sessão' : 'sessões'}
        {summary.primeira && summary.ultima && (
          <span className="ags-range">
            {' '}· {dataLonga(summary.primeira)} a {dataLonga(summary.ultima)}
          </span>
        )}
      </p>

      {(summary.excecoes > 0 || summary.conflitos > 0) && (
        <p className="ags-flags">
          {summary.excecoes > 0 && (
            <span className="ags-flag ags-flag--warn">
              {summary.excecoes} fora do padrão
            </span>
          )}
          {summary.conflitos > 0 && (
            <span className="ags-flag ags-flag--danger">
              {summary.conflitos} em conflito
            </span>
          )}
        </p>
      )}

      <ol className="ags-list">
        {items.map(item => (
          <li
            key={item.key + item.number}
            className={`ags-item${item.conflict ? ' ags-item--conflict' : ''}${item.isException ? ' ags-item--warn' : ''}`}
          >
            <span className="ags-num">{item.number}</span>
            <span className="ags-when">
              <b>{dataLonga(item.start)}</b>
              <small>{hora(item.start)}–{hora(item.end)}</small>
            </span>
            <span className="ags-why">
              {item.conflict && (
                <span className="ags-why-danger">
                  Já ocupado{item.conflict.patient_id ? ` por ${patientName(item.conflict.patient_id)}` : ''}
                </span>
              )}
              {item.isException && <span className="ags-why-warn">{item.reason}</span>}
            </span>
          </li>
        ))}
      </ol>

      {summary.conflitos > 0 && (
        <p className="ags-note">
          As sessões em conflito não serão criadas — o banco recusa dois
          pacientes no mesmo horário. As demais entram normalmente, e
          depois é só remarcar as que faltarem.
        </p>
      )}

      {summary.excecoes > 0 && (
        <p className="ags-note">
          As datas fora do padrão <b>serão criadas</b> e ficam registradas
          como exceção, com o motivo. Se preferir evitá-las, ajuste os dias
          da semana antes de confirmar.
        </p>
      )}

      <div className="ag-warn-actions">
        <button type="button" className="ag-btn" onClick={onCancel} disabled={saving}>
          Voltar e ajustar
        </button>
        <button type="button" className="ag-btn ag-btn--primary" onClick={onConfirm} disabled={saving}>
          {saving ? 'Criando…' : `Criar ${summary.total - summary.conflitos} sessões`}
        </button>
      </div>
    </div>
  );
}

export default SeriesPreview;
