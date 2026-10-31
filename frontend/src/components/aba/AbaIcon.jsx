// Ícones de traço da área ABA, no mesmo desenho dos glifos do hub
// (HomeConsole): SVG próprio, sem biblioteca de ícones no pacote.
const PATHS = {
  play: <path d="M7 5v14l11-7z" />,
  pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9.5 2.5h5" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14a6 6 0 0 1 3.5 6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  library: <><path d="M4 4h4v16H4z" /><path d="M10 4h4v16h-4z" /><path d="m16 5 3.5-1 2.5 15.5-3.5 1z" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="m7 15 4-5 3 3 5-6" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
};

export function AbaIcon({ name, size = 16 }) {
  return (
    <svg
      className="aba-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] || null}
    </svg>
  );
}

export default AbaIcon;
