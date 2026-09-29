// ============================================================
// Peças comuns das páginas públicas (sem login): confirmação de
// agendamento e pesquisa de satisfação. Mesmo traço dos ícones da
// Agenda (SVG inline, currentColor, sem lib) e as mesmas classes
// .cf-* de styles/confirmPage.css.
// ============================================================

function Svg({ size = 18, children }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconPerson = () => (
  <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></Svg>
);

export const IconStethoscope = ({ size }) => (
  <Svg size={size}>
    <path d="M5 3v5a5 5 0 0 0 10 0V3" />
    <path d="M10 13v2a5 5 0 0 0 10 0v-1" />
    <circle cx="20" cy="12" r="2" />
  </Svg>
);

export const IconBuilding = ({ size }) => (
  <Svg size={size}>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M16 9h2a2 2 0 0 1 2 2v10" />
    <path d="M2 21h20" />
    <path d="M8 7h4M8 11h4M8 15h4" />
  </Svg>
);

export const IconDoor = () => (
  <Svg><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" /><path d="M3 21h18" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /></Svg>
);

export const IconClock = () => (
  <Svg size={15}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);

export const IconExternal = () => (
  <Svg size={13}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></Svg>
);

export const IconSend = () => (
  <Svg size={17}><path d="M21 3 10 14" /><path d="M21 3l-7 18-4-7-7-4 18-7z" /></Svg>
);

export const IconCheckBold = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconLinkOff = () => (
  <Svg size={26}>
    <path d="M9 17H7a5 5 0 0 1 0-10h2" />
    <path d="M15 7h2a5 5 0 0 1 4 8" />
    <path d="M8 12h4" />
    <path d="m3 3 18 18" />
  </Svg>
);

export const IconCalendarOff = () => (
  <Svg size={26}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M7.5 3v4M16.5 3v4" />
    <path d="m9.5 13.5 5 5M14.5 13.5l-5 5" />
  </Svg>
);

/** Estado de tela inteira (link inválido, encerrado, obrigado). */
export function PublicStateMessage({ tone = 'neutral', icon, title, children }) {
  return (
    <div className="cf-state">
      <span className={`cf-state-icon cf-state-icon--${tone}`}>{icon}</span>
      <h1>{title}</h1>
      {children && <p className="cf-note">{children}</p>}
    </div>
  );
}

export function PublicLoading({ children = 'Carregando…' }) {
  return (
    <div className="cf-loading" role="status">
      <span className="cf-spinner" aria-hidden="true" />
      <p className="cf-note">{children}</p>
    </div>
  );
}

/**
 * Bloquinho de calendário + data por extenso (saída de
 * describeAppointmentWhen). A pesquisa esconde o horário: ali importa
 * o dia do atendimento avaliado.
 */
export function PublicWhenBlock({ when, showTime = true }) {
  if (!when) return null;
  return (
    <section className="cf-when" aria-label="Data do atendimento">
      <div className="cf-date-tile" aria-hidden="true">
        <span className="cf-date-month">{when.month}</span>
        <span className="cf-date-day">{when.day}</span>
      </div>
      <div className="cf-when-text">
        {when.relative && <span className="cf-when-chip">{when.relative}</span>}
        <p className="cf-when-date">{when.dateLong}</p>
        {showTime && (
          <p className="cf-when-time">
            <IconClock />
            {when.timeRange}
          </p>
        )}
      </div>
    </section>
  );
}
