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
