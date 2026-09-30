import {
  IconBolt,
  IconClock,
  IconFlag,
  IconRepeat,
  IconSparkle,
  IconStar,
} from './AgendaIcons';

// ============================================================
// Selo de fixo × eventual nos cards da agenda.
//
// Nome, cor e ícone são escolha do Admin em "Configurar agenda"
// (settings.seriesBadges, entregue pronto por seriesMarkOf). Nenhum card
// escreve o nome do selo por conta própria: o nome é da clínica.
// ============================================================

const ICONS = {
  star: IconStar,
  bolt: IconBolt,
  clock: IconClock,
  repeat: IconRepeat,
  flag: IconFlag,
  sparkle: IconSparkle,
};

/** Ícone do selo pelo id de SERIES_ICONS; 'none' ou id desconhecido → nada. */
export function SeriesIcon({ id, className = 'ag-series-icon' }) {
  const Icon = ICONS[id];
  return Icon ? <Icon className={className} /> : null;
}

/** Selo pronto (mark = seriesMarkOf(...)), ou nada quando não há marca. */
export function SeriesBadge({ mark, className }) {
  if (!mark) return null;
  return (
    <span
      className={mark.color ? `${className} has-color` : className}
      style={mark.color ? { '--series-color': mark.color } : undefined}
    >
      <SeriesIcon id={mark.icon} />
      {mark.label}
    </span>
  );
}

export default SeriesBadge;
