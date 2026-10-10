// ============================================================
// Evolução de uma escala no tempo: a nota de cada aplicação válida
// (anuladas ficam de fora) sobre as faixas do instrumento.
// Uma série só: sem legenda, o título do cartão já diz qual é.
// As faixas são magnitude, então vão num tom só (a cor da clínica,
// mais forte conforme a faixa sobe); vermelho fica para risco.
// A tabela de aplicações logo abaixo é a versão em texto do gráfico.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { formatInstrumentDate, validApplications } from './instrumentFormat';

// O desenho usa a largura real do cartão (1 unidade = 1 px): assim o
// texto fica legível no celular em vez de encolher junto com o SVG.
// Em tela estreita os nomes das faixas entram no próprio gráfico.
const DEFAULT_WIDTH = 640;
const COMPACT_BELOW = 480;
const HEIGHT = 210;

function scoredApplications(applications) {
  return validApplications(applications)
    .slice()
    .sort((a, b) => new Date(a.appliedAt) - new Date(b.appliedAt));
}

// Ref por callback: o gráfico só existe quando há aplicação, então a
// medição começa quando o elemento aparece, não só na montagem. Mede em
// px de CSS sem o zoom da tela (clientWidth / contentRect), não com
// getBoundingClientRect, que já vem multiplicado pelo --app-zoom.
function useMeasuredWidth() {
  const [element, setElement] = useState(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const measureRef = useCallback(node => {
    setElement(node);
    if (node?.clientWidth > 0) setWidth(node.clientWidth);
  }, []);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [measureRef, width];
}

// Faixa estreita (ex.: "Leve" da ansiedade na DASS-21, 8 a 9 pontos numa
// régua de 0 a 42) deixava os nomes um em cima do outro. Afasta só o que
// colide, mantendo a ordem e o limite do gráfico.
const LABEL_GAP = 12;
const TICK_GAP = 11;

function spreadLabels(centers, low, high) {
  const order = centers.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
  const placed = [];
  let previous = null;
  for (const { value, index } of order) {
    let position = Math.min(value, high);
    if (previous !== null && previous - position < LABEL_GAP) position = previous - LABEL_GAP;
    placed[index] = position;
    previous = position;
  }
  // Passou do topo: empurra de volta para baixo, de cima para baixo.
  const fromTop = placed.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  let above = null;
  for (const { value, index } of fromTop) {
    let position = Math.max(value, low);
    if (above !== null && position - above < LABEL_GAP) position = above + LABEL_GAP;
    placed[index] = position;
    above = position;
  }
  return placed;
}

/** Números do eixo que cabem sem encostar no anterior; o máximo sempre aparece. */
function visibleTicks(values, y) {
  const kept = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = kept[kept.length - 1];
    if (last === undefined || y(last) - y(value) >= TICK_GAP) kept.push(value);
  }
  const top = values[values.length - 1];
  if (kept[kept.length - 1] !== top) {
    if (kept.length && y(kept[kept.length - 1]) - y(top) < TICK_GAP) kept.pop();
    kept.push(top);
  }
  return new Set(kept);
}

export function InstrumentTrendChart({ instrument, applications }) {
  const [figureRef, measuredWidth] = useMeasuredWidth();
  const points = scoredApplications(applications);
  if (!points.length) return null;

  const WIDTH = Math.max(260, measuredWidth);
  const compact = WIDTH < COMPACT_BELOW;
  const PAD = { top: 14, right: compact ? 12 : 138, bottom: 30, left: 30 };
  const PLOT_W = WIDTH - PAD.left - PAD.right;
  const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
  const { min, max } = instrument.scoring;
  const y = value => PAD.top + PLOT_H - ((value - min) / (max - min)) * PLOT_H;

  const times = points.map(point => new Date(point.appliedAt).getTime());
  const first = times[0];
  const last = times[times.length - 1];
  const x = time => (last === first
    ? PAD.left + PLOT_W / 2
    : PAD.left + ((time - first) / (last - first)) * PLOT_W);

  const coords = points.map((point, index) => ({ point, cx: x(times[index]), cy: y(point.result.score) }));
  const lastCoord = coords[coords.length - 1];
  const showAllDates = coords.length <= 6;
  const description = coords.length === 1
    ? `${instrument.shortName}: ${lastCoord.point.result.score} pontos em ${formatInstrumentDate(lastCoord.point.appliedAt)}.`
    : `${instrument.shortName}: de ${coords[0].point.result.score} pontos em ${formatInstrumentDate(coords[0].point.appliedAt)} para ${lastCoord.point.result.score} pontos em ${formatInstrumentDate(lastCoord.point.appliedAt)}.`;

  const bandEdges = instrument.bands.map(band => {
    const lower = band.min === min ? min : band.min - 0.5;
    const upper = band.max === max ? max : band.max + 0.5;
    return { top: y(upper), bottom: y(lower) };
  });
  const labelY = spreadLabels(
    bandEdges.map(edge => (edge.top + edge.bottom) / 2),
    PAD.top + 6,
    PAD.top + PLOT_H - 6,
  );
  const ticks = visibleTicks([...instrument.bands.map(band => band.min), max], y);

  return (
    <figure className="instrument-chart" ref={figureRef}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Evolução da nota. ${description}`}>
        {instrument.bands.map((band, index) => {
          const { top, bottom } = bandEdges[index];
          return (
            <g key={band.id}>
              <rect
                className={`instrument-band instrument-band-${Math.min(index, 4)}`}
                x={PAD.left}
                y={top}
                width={PLOT_W}
                height={Math.max(0, bottom - top)}
              />
              {!compact && (
                <text className="instrument-band-label" x={PAD.left + PLOT_W + 10} y={labelY[index]} dominantBaseline="middle">
                  {band.label}
                </text>
              )}
              {ticks.has(band.min) && (
                <text className="instrument-axis-label" x={PAD.left - 8} y={bottom} textAnchor="end" dominantBaseline="middle">
                  {band.min}
                </text>
              )}
            </g>
          );
        })}
        <text className="instrument-axis-label" x={PAD.left - 8} y={y(max)} textAnchor="end" dominantBaseline="middle">
          {max}
        </text>

        {coords.length > 1 && (
          <polyline
            className="instrument-line"
            points={coords.map(coord => `${coord.cx},${coord.cy}`).join(' ')}
          />
        )}

        {/* Celular: nome da faixa dentro do gráfico, por cima da linha, com contorno do fundo. */}
        {compact && instrument.bands.map((band, index) => {
          return (
            <text
              key={band.id}
              className="instrument-band-label is-inside"
              x={PAD.left + 6}
              y={labelY[index]}
              dominantBaseline="middle"
            >
              {band.label}
            </text>
          );
        })}

        {coords.map(({ point, cx, cy }, index) => {
          const isLast = index === coords.length - 1;
          const label = `${formatInstrumentDate(point.appliedAt)}: ${point.result.score} pontos, faixa ${point.result.bandLabel || 'sem faixa'}`;
          return (
            <g key={point.id} className="instrument-point-group">
              <title>{label}</title>
              <circle className="instrument-point-hit" cx={cx} cy={cy} r="12" />
              <circle className={`instrument-point${isLast ? ' is-last' : ''}`} cx={cx} cy={cy} r="5" />
              {isLast && (
                <text className="instrument-point-label" x={cx} y={cy - 12} textAnchor="middle">
                  {point.result.score}
                </text>
              )}
              {(showAllDates || index === 0 || isLast) && (
                <text
                  className="instrument-axis-label"
                  x={cx}
                  y={HEIGHT - 10}
                  textAnchor={coords.length === 1 ? 'middle' : index === 0 ? 'start' : isLast ? 'end' : 'middle'}
                >
                  {formatInstrumentDate(point.appliedAt, { short: true })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {coords.length === 1 && (
        <figcaption className="small">Aplique de novo depois de {instrument.reapplyAfterDays} dias para ver a evolução.</figcaption>
      )}
    </figure>
  );
}
