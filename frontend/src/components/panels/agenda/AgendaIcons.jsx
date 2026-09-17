// ============================================================
// Ícones minúsculos do card de agendamento (modalidade, confirmado).
// SVG inline com currentColor: sem lib externa, sem emoji — segue o
// tom profissional do resto da agenda.
// ============================================================

export function IconVideo(props) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l6-3v10l-6-3" />
    </svg>
  );
}

export function IconPin(props) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 22s7-7.05 7-12a7 7 0 1 0-14 0c0 4.95 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// Categorias de bloqueio (reunião / entrevista / outro): mesma cor
// neutra do resto do bloqueio, o token de cor é fixo de propósito —
// diferenciar por ícone, não inventar tom novo fora da paleta.
export function IconUsers(props) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M2 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M15.5 4.5a3 3 0 0 1 0 6" />
      <path d="M16 14.3c2.8.4 4.8 2.4 4.8 5.7" />
    </svg>
  );
}

export function IconMic(props) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4M9 22h6" />
    </svg>
  );
}

export function IconTag(props) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 11.5V4h7.5L21 14.5 13.5 22 3 11.5z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ============================================================
// Ícones da barra de ferramentas da Agenda (visão/ações/filtros).
// Maiores que os de cima (16px) porque vivem em botão/seletor de
// toque, não em chip de card — mesmo traço fino, mesmo sem lib.
// ============================================================

export function IconToday(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconCalendarDay(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7.5 3v4" />
      <path d="M16.5 3v4" />
      <rect x="9" y="12.5" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCalendarWeek(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7.5 3v4" />
      <path d="M16.5 3v4" />
      <rect x="5.5" y="12.5" width="13" height="4" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCalendarMonth(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7.5 3v4" />
      <path d="M16.5 3v4" />
      <circle cx="7.5" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconHourglass(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6.5 2.5h11" />
      <path d="M6.5 21.5h11" />
      <path d="M7 2.5c0 5 4.5 5.5 4.5 9.5s-4.5 4.5-4.5 9.5" />
      <path d="M17 2.5c0 5-4.5 5.5-4.5 9.5s4.5 4.5 4.5 9.5" />
    </svg>
  );
}

export function IconPencilNote(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 20h4l10.5-10.5a2 2 0 0 0-2.83-2.83L5 17v3Z" />
      <path d="M13 6l3 3" />
    </svg>
  );
}

export function IconShare(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.7l7.4-4.2" />
      <path d="M8.2 13.3l7.4 4.2" />
    </svg>
  );
}

export function IconClockCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="M3 9h13" />
      <path d="M6.5 3v4" />
      <circle cx="17.3" cy="16.3" r="5.3" />
      <path d="M17.3 13.8v2.5l1.7 1" />
    </svg>
  );
}

export function IconFlagCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7.5 3v4" />
      <path d="M16.5 3v4" />
      <path d="M9 12.5v6.5" />
      <path d="M9 12.5h4.5l-1.5 2 1.5 2H9" />
    </svg>
  );
}

export function IconCake(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 20h16" />
      <path d="M4 20v-6.5c0-1 .8-1.5 2-1.5h12c1.2 0 2 .5 2 1.5V20" />
      <path d="M4 16.5c1.4 1 2.6-1 4 0s2.6 1 4 0 2.6-1 4 0 2.6-1 4 0" />
      <path d="M12 12V8" />
      <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFilterTag(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 11V5a2 2 0 0 1 2-2h6l10 10-9.5 9.5L3 13z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheckCircle(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.3l2.6 2.6 5-5.4" />
    </svg>
  );
}

export function IconToggle(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="2" y="8" width="20" height="8" rx="4" />
      <circle cx="8" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default {
  IconVideo, IconPin, IconCheck, IconUsers, IconMic, IconTag,
  IconToday, IconCalendarDay, IconCalendarWeek, IconCalendarMonth, IconHourglass, IconPencilNote,
  IconShare, IconClockCalendar, IconFlagCalendar, IconFilterTag, IconCheckCircle, IconToggle,
  IconCake,
};
