import { sameColor } from '../../utils/colorOptions';

// Miniatura da tela (barra, aba ativa, botão primário) na cor escolhida.
// palette = buildReportAccentPalette(cor).
export function AppColorPreview({ palette, title }) {
  return (
    <div className="gt-custom-preview gt-custom-preview-app" aria-hidden="true">
      <div className="gt-custom-app-bar">
        <span className="gt-custom-app-dot" style={{ background: palette.accent }} />
        <b>{title}</b>
      </div>
      <div className="gt-custom-app-tabs">
        <span style={{ color: palette.shade, borderColor: palette.accent }}>Agenda</span>
        <span>Pacientes</span>
        <span>Gestão</span>
      </div>
      <span className="gt-custom-app-button" style={{ background: palette.shade }}>
        Novo agendamento
      </span>
    </div>
  );
}

// Miniatura da página que o paciente abre pelo link, com os textos reais
// de ConfirmAppointmentPage / SurveyPage. kind = 'confirmation' | 'survey'.
export function LinkPagePreview({ palette, kind, clinicName }) {
  const survey = kind === 'survey';
  return (
    <div
      className="gt-custom-preview gt-link-preview"
      style={{ '--link-accent': palette.accent, '--link-shade': palette.shade }}
      aria-hidden="true"
    >
      <span className="gt-link-preview-clinic">{clinicName}</span>
      <b>{survey ? 'Como foi seu atendimento?' : 'Confirme sua consulta'}</b>
      {survey ? (
        <span className="gt-link-preview-stars">
          {[1, 2, 3, 4, 5].map(star => (
            <svg key={star} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M12 2.8l2.83 5.73 6.32.92-4.58 4.46 1.08 6.3L12 17.24l-5.65 2.97 1.08-6.3-4.58-4.46 6.32-.92z"
                fill={star <= 4 ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </span>
      ) : (
        <span className="gt-link-preview-when">
          <i><small>out</small>08</i>
          <span>Quinta-feira, 8 de outubro<small>14:00 às 14:50</small></span>
        </span>
      )}
      <span className="gt-link-preview-button">
        {survey ? 'Enviar avaliação' : 'Confirmar presença'}
      </span>
    </div>
  );
}

// Bolinhas da paleta curada — sem seletor livre de hex.
export function ColorPresets({ options, value, onChange, label }) {
  return (
    <div className="clinic-color-presets" role="radiogroup" aria-label={label}>
      {options.map(option => {
        const selected = sameColor(value, option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={`clinic-color-preset${selected ? ' selected' : ''}`}
            style={{ background: option.value }}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {selected && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l5 5L20 6" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
