// ============================================================
// Evolução de uma escala no tempo: a nota de cada aplicação válida
// (anuladas ficam de fora) sobre as faixas do instrumento.
// Uma série só: sem legenda, o título do cartão já diz qual é.
// As faixas são magnitude, então vão num tom só (a cor da clínica,
// mais forte conforme a faixa sobe); vermelho fica para risco.
// A tabela de aplicações logo abaixo é a versão em texto do gráfico.
//
// Visual (13/10/2026, "está tudo apagado"): faixas mais fortes, área
// sombreada sob a linha, bolinhas maiores com a nota em cima, e a última
// com halo pulsando e a nota numa caixinha na cor da tela. Ao abrir, a
// linha se desenha e as bolinhas aparecem uma a uma; quem pediu menos
// movimento vê tudo parado (styles/instruments.css).
// ============================================================

import { useCallback, useEffect, useId, useState } from 'react';
import { formatInstrumentDate, formatScore, pointsLabel, validApplications } from './instrumentFormat';

// O desenho usa a largura real do cartão (1 unidade = 1 px): assim o
// texto fica legível no celular em vez de encolher junto com o SVG.
// Em tela estreita os nomes das faixas entram no próprio gráfico.
const DEFAULT_WIDTH = 640;
const COMPACT_BELOW = 480;
const HEIGHT = 250;

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

// Rótulo da última nota: caixinha na cor da tela. A largura sai do texto
// (algarismos de ~7,4 px em 12px negrito), sem medir no navegador.
function pillWidth(text) {
  return 16 + String(text).length * 7.4;
}

// Coluna dos nomes das faixas: do tamanho do nome mais comprido (~6,6 px
// por letra em 12px), para "No ponto de corte ou acima" não cortar.
function bandLabelColumn(bands) {
  const longest = bands.reduce((size, band) => Math.max(size, String(band.label).length), 0);
  return Math.min(200, Math.max(120, 22 + longest * 6.6));
}

// Distância mínima entre duas datas embaixo e entre duas notas em cima.
const DATE_GAP = 62;
const VALUE_GAP = 30;

/**
 * Quais rótulos cabem sem encostar: a última sempre, depois a primeira e
 * as do meio, da direita para a esquerda, só se ficarem longe das já
 * escolhidas. Devolve o conjunto dos índices.
 */
function spacedIndexes(xs, gap) {
  if (!xs.length) return new Set();
  const lastIndex = xs.length - 1;
  const order = [lastIndex, 0, ...xs.map((_, index) => index).slice(1, lastIndex).reverse()];
  const kept = [];
  for (const index of order) {
    if (kept.includes(index)) continue;
    if (kept.every(other => Math.abs(xs[other] - xs[index]) >= gap)) kept.push(index);
  }
  return new Set(kept);
}

export function InstrumentTrendChart({ instrument, applications }) {
  const [figureRef, measuredWidth] = useMeasuredWidth();
  const gradientId = `instrument-area-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const points = scoredApplications(applications);
  if (!points.length) return null;

  const WIDTH = Math.max(260, measuredWidth);
  const compact = WIDTH < COMPACT_BELOW;
  const PAD = { top: 30, right: compact ? 14 : bandLabelColumn(instrument.bands), bottom: 32, left: 34 };
  const PLOT_W = WIDTH - PAD.left - PAD.right;
  const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
  const { min, max } = instrument.scoring;
  const y = value => PAD.top + PLOT_H - ((value - min) / (max - min)) * PLOT_H;

  const times = points.map(point => new Date(point.appliedAt).getTime());
  const first = times[0];
  const last = times[times.length - 1];
  // Pontos com folga das bordas: a bolinha e o número não cortam no canto.
  const INSET = Math.min(18, PLOT_W / 6);
  const x = time => (last === first
    ? PAD.left + PLOT_W / 2
    : PAD.left + INSET + ((time - first) / (last - first)) * (PLOT_W - INSET * 2));

  const coords = points.map((point, index) => ({ point, cx: x(times[index]), cy: y(point.result.score) }));
  const lastCoord = coords[coords.length - 1];
  // Datas e notas só onde cabem: duas aplicações em dias seguidos não
  // empilham a data nem a nota uma em cima da outra.
  const shownDates = spacedIndexes(coords.map(coord => coord.cx), DATE_GAP);
  // Até 8 aplicações, cada bolinha leva a nota em cima (a última, na
  // caixinha); a nota de uma bolinha colada na última fica só no toque.
  const shownValues = coords.length <= 8
    ? spacedIndexes(coords.map(coord => coord.cx), VALUE_GAP)
    : new Set([coords.length - 1]);
  const baseline = PAD.top + PLOT_H;
  const description = coords.length === 1
    ? `${instrument.shortName}: ${pointsLabel(lastCoord.point.result.score)} em ${formatInstrumentDate(lastCoord.point.appliedAt)}.`
    : `${instrument.shortName}: de ${pointsLabel(coords[0].point.result.score)} em ${formatInstrumentDate(coords[0].point.appliedAt)} para ${pointsLabel(lastCoord.point.result.score)} em ${formatInstrumentDate(lastCoord.point.appliedAt)}.`;

  // Meio passo entre faixas vizinhas: 0,5 na nota inteira, 0,005 na média.
  const half = (instrument.scoring.step || 1) / 2;
  const bandEdges = instrument.bands.map(band => {
    const lower = band.min === min ? min : band.min - half;
    const upper = band.max === max ? max : band.max + half;
    return { top: y(upper), bottom: y(lower) };
  });
  const labelY = spreadLabels(
    bandEdges.map(edge => (edge.top + edge.bottom) / 2),
    PAD.top + 6,
    PAD.top + PLOT_H - 6,
  );
  // Sem faixas (Rosenberg): a régua marca o começo, o meio e o fim da escala.
  const tickBase = instrument.bands.length
    ? instrument.bands.map(band => band.min)
    : [min, Math.round((min + max) / 2)];
  const ticks = visibleTicks([...tickBase, max], y);

  const linePoints = coords.map(coord => `${coord.cx},${coord.cy}`).join(' ');
  const areaPoints = `${coords[0].cx},${baseline} ${linePoints} ${lastCoord.cx},${baseline}`;
  const lastText = formatScore(lastCoord.point.result.score);
  const lastPillW = pillWidth(lastText);
  const lastPillX = Math.min(Math.max(lastCoord.cx - lastPillW / 2, PAD.left), PAD.left + PLOT_W - lastPillW);
  // Bolinha perto do topo: a caixinha vai para baixo dela.
  const lastPillY = lastCoord.cy - 34 < 2 ? lastCoord.cy + 12 : lastCoord.cy - 34;

  return (
    <figure className="instrument-chart" ref={figureRef}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Evolução da nota. ${description}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="instrument-area-stop-top" />
            <stop offset="100%" className="instrument-area-stop-bottom" />
          </linearGradient>
        </defs>
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
                <text className="instrument-band-label" x={PAD.left + PLOT_W + 12} y={labelY[index]} dominantBaseline="middle">
                  {band.label}
                </text>
              )}
              {ticks.has(band.min) && (
                <text className="instrument-axis-label" x={PAD.left - 8} y={bottom} textAnchor="end" dominantBaseline="middle">
                  {formatScore(band.min)}
                </text>
              )}
            </g>
          );
        })}
        {!instrument.bands.length && (
          <>
            <rect className="instrument-band instrument-band-0" x={PAD.left} y={y(max)} width={PLOT_W} height={Math.max(0, y(min) - y(max))} />
            {tickBase.filter(value => ticks.has(value)).map(value => (
              <text key={value} className="instrument-axis-label" x={PAD.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">
                {formatScore(value)}
              </text>
            ))}
          </>
        )}
        <text className="instrument-axis-label" x={PAD.left - 8} y={y(max)} textAnchor="end" dominantBaseline="middle">
          {formatScore(max)}
        </text>

        {coords.length > 1 && (
          <>
            <polygon className="instrument-area" points={areaPoints} fill={`url(#${gradientId})`} />
            <polyline className="instrument-line" points={linePoints} pathLength="1" />
          </>
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
          const bandText = instrument.bands.length ? `, faixa ${point.result.bandLabel || 'sem faixa'}` : '';
          const label = `${formatInstrumentDate(point.appliedAt)}: ${pointsLabel(point.result.score)}${bandText}`;
          return (
            <g key={point.id} className="instrument-point-group" style={{ '--instrument-i': index }}>
              <title>{label}</title>
              <circle className="instrument-point-hit" cx={cx} cy={cy} r="14" />
              {isLast && <circle className="instrument-point-halo" cx={cx} cy={cy} r="8" />}
              <circle className={`instrument-point${isLast ? ' is-last' : ''}`} cx={cx} cy={cy} r={isLast ? 8 : 6} />
              {isLast ? (
                <g className="instrument-point-pill">
                  <rect x={lastPillX} y={lastPillY} width={lastPillW} height="22" rx="11" />
                  <text x={lastPillX + lastPillW / 2} y={lastPillY + 15} textAnchor="middle">{lastText}</text>
                </g>
              ) : shownValues.has(index) && (
                <text className="instrument-point-value" x={cx} y={cy - 13} textAnchor="middle">
                  {formatScore(point.result.score)}
                </text>
              )}
              {shownDates.has(index) && (
                <text
                  className={`instrument-date-label${isLast ? ' is-last' : ''}`}
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
