// ============================================================
// Gráficos da área ABA, em SVG próprio (sem biblioteca de gráfico no
// pacote). Mesmas regras do Atlas e do Manual (cap. 10 §14):
//   * linha sem suavização, um ponto ("bolinha") por sessão;
//   * sessão sem dado pontuável é LACUNA — a linha quebra, nunca liga por
//     cima nem interpola;
//   * linha de critério tracejada e divisória vertical onde a fase muda;
//   * cada dimensão no seu gráfico (independência, tempo, ajuda, redução).
// ============================================================

const WIDTH = 640;
const MARGIN = { top: 18, right: 18, bottom: 30, left: 44 };

function niceMax(values, fallback = 10) {
  const highest = Math.max(0, ...values.filter(value => typeof value === 'number'));
  if (highest <= 0) return fallback;
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find(item => item * magnitude >= highest) || 10;
  return step * magnitude;
}

function ticksFor(min, max, count = 4) {
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
}

function formatTick(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

// Mostra no eixo X só rótulos que cabem (um a cada N), sempre o último.
function visibleLabelIndexes(count, plotWidth) {
  const maxLabels = Math.max(2, Math.floor(plotWidth / 54));
  const every = Math.max(1, Math.ceil(count / maxLabels));
  return new Set(Array.from({ length: count }, (_, index) => index).filter(index => index % every === 0 || index === count - 1));
}

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <ul className="aba-chart-legend">
      {series.map(item => (
        <li key={item.key}>
          <span className={`aba-chart-swatch aba-tone-${item.tone || 'main'}${item.dashed ? ' is-dashed' : ''}`} aria-hidden="true" />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Linha por sessão.
 * data: [{ date, ...valores }] · series: [{ key, name, tone, dashed, dots }]
 * reference: { value, label } (critério) · phaseChanges: [{ label, text }]
 */
export function LineChart({
  data,
  series,
  yMax,
  yMin = 0,
  unit = '%',
  reference = null,
  phaseChanges = [],
  height = 220,
  emptyText = 'Sem dados.',
  title,
}) {
  if (!data?.length) return <p className="aba-empty">{emptyText}</p>;

  const values = data.flatMap(point => series.map(item => point[item.key]));
  const top = yMax ?? niceMax([...values, reference?.value ?? 0]);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const x = index => MARGIN.left + (data.length === 1 ? plotWidth / 2 : (plotWidth * index) / (data.length - 1));
  const y = value => MARGIN.top + plotHeight - ((value - yMin) / (top - yMin || 1)) * plotHeight;
  const labels = visibleLabelIndexes(data.length, plotWidth);

  // Trechos contínuos: a linha quebra em cada lacuna (valor nulo).
  const segmentsFor = key => {
    const segments = [];
    let current = [];
    data.forEach((point, index) => {
      const value = point[key];
      if (typeof value !== 'number') {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push([x(index), y(value)]);
    });
    if (current.length) segments.push(current);
    return segments;
  };

  return (
    <figure className="aba-chart">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={title || series.map(item => item.name).join(', ')}>
        {ticksFor(yMin, top).map(tick => (
          <g key={tick} className="aba-chart-grid">
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} />
            <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{formatTick(tick)}</text>
          </g>
        ))}
        {data.map((point, index) => labels.has(index) && (
          <text key={`x-${point.date}-${index}`} className="aba-chart-axis" x={x(index)} y={height - 8} textAnchor="middle">{point.date}</text>
        ))}
        {reference && reference.value > 0 && (
          <g className="aba-chart-reference">
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(reference.value)} y2={y(reference.value)} />
            <text x={WIDTH - MARGIN.right} y={y(reference.value) - 5} textAnchor="end">{reference.label}</text>
          </g>
        )}
        {phaseChanges.map(change => {
          const index = data.findIndex(point => point.date === change.label);
          if (index < 0) return null;
          // A divisória fica entre a última sessão da fase anterior e a primeira da nova.
          const lineX = index === 0 ? x(0) : (x(index - 1) + x(index)) / 2;
          return (
            <g key={`${change.label}-${change.text}`} className="aba-chart-phase">
              <line x1={lineX} x2={lineX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
              <text x={lineX + 4} y={MARGIN.top + 10}>{change.text}</text>
            </g>
          );
        })}
        {series.map(item => (
          <g key={item.key} className={`aba-chart-series aba-tone-${item.tone || 'main'}${item.dashed ? ' is-dashed' : ''}`}>
            {segmentsFor(item.key).map(segment => (
              <polyline key={segment.map(point => point.join(',')).join(' ')} points={segment.map(point => point.join(',')).join(' ')} />
            ))}
            {item.dots !== false && data.map((point, index) => (typeof point[item.key] === 'number') && (
              <circle key={`${item.key}-${index}`} cx={x(index)} cy={y(point[item.key])} r={item.dots === 'small' ? 3 : 4.5}>
                <title>{`${point.date}: ${formatTick(point[item.key])}${unit}${item.name ? ` — ${item.name}` : ''}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

/**
 * Colunas por sessão (intensidade, duração dos episódios).
 * yTickFormat recebe o número do eixo (ex.: posição na escala de intensidade).
 */
export function ColumnChart({ data, series, yMax, yTickFormat, yTicks, unit = '', height = 190, emptyText = 'Sem dados.', title }) {
  if (!data?.length) return <p className="aba-empty">{emptyText}</p>;
  const values = data.flatMap(point => series.map(item => point[item.key]));
  const top = yMax ?? niceMax(values);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const band = plotWidth / data.length;
  const barWidth = Math.min(28, (band * 0.7) / series.length);
  const y = value => MARGIN.top + plotHeight - (value / (top || 1)) * plotHeight;
  const labels = visibleLabelIndexes(data.length, plotWidth);
  const tickValues = yTicks || ticksFor(0, top);

  return (
    <figure className="aba-chart">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={title || series.map(item => item.name).join(', ')}>
        {tickValues.map(tick => (
          <g key={tick} className="aba-chart-grid">
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} />
            <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{yTickFormat ? yTickFormat(tick) : formatTick(tick)}</text>
          </g>
        ))}
        {data.map((point, index) => {
          const start = MARGIN.left + band * index + (band - barWidth * series.length) / 2;
          return (
            <g key={`${point.date}-${index}`}>
              {series.map((item, position) => {
                const value = point[item.key];
                if (typeof value !== 'number') return null;
                return (
                  <rect
                    key={item.key}
                    className={`aba-chart-bar aba-tone-${item.tone || 'main'}`}
                    x={start + barWidth * position}
                    y={y(value)}
                    width={barWidth - 2}
                    height={Math.max(0, MARGIN.top + plotHeight - y(value))}
                    rx="3"
                  >
                    <title>{`${point.date}: ${yTickFormat ? yTickFormat(value) : formatTick(value)}${unit}${item.name ? ` — ${item.name}` : ''}`}</title>
                  </rect>
                );
              })}
              {labels.has(index) && (
                <text className="aba-chart-axis" x={MARGIN.left + band * index + band / 2} y={height - 8} textAnchor="middle">{point.date}</text>
              )}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

/** Barras deitadas de 0 a 100% (independência por etapa, reforçadores). */
export function PercentBars({ rows, reference = null, tone = 'accent' }) {
  if (!rows?.length) return null;
  return (
    <ul className="aba-percent-bars">
      {rows.map(row => (
        <li key={row.label}>
          <span className="aba-percent-bars-label">{row.label}</span>
          <span className="aba-percent-bars-track">
            <span className={`aba-percent-bars-fill aba-tone-${tone}`} style={{ width: `${row.value ?? 0}%` }} />
            {reference > 0 && <span className="aba-percent-bars-reference" style={{ left: `${reference}%` }} aria-hidden="true" />}
          </span>
          <span className="aba-percent-bars-value">
            {row.value == null ? 'sem dado' : `${row.value}%`}
            {row.hint && <small>{row.hint}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
