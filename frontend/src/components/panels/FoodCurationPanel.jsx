import { useMemo, useState } from 'react';
import {
  FOOD_ENERGIES,
  FOOD_FLAVORS,
  FOOD_ORGANS,
  FOOD_SOURCE,
  describeFoodTradition,
} from '../../knowledge/foodDietoterapia';
import {
  FOOD_CURATION_FILTERS,
  FOOD_RELEASE_STATUS,
  downloadFoodCurationDecisions,
  filterFoodCurationRows,
  getLocalFoodCurationDecisions,
  materializeFoodCurationRows,
  removeLocalFoodCurationDecision,
  saveLocalFoodCurationDecision,
  summarizeFoodCurationRows,
  validateFoodCurationDecision,
} from '../../knowledge/foodDietoterapiaCuration';

const REVIEW_FIELDS = [
  ['sourceConfirmed', 'Fonte e páginas conferidas'],
  ['languageReviewed', 'Linguagem educativa revisada (sem promessa de cura)'],
  ['cautionsReviewed', 'Cautelas revisadas (grupos vulneráveis, medicamentos)'],
];

function statusTone(status) {
  if (status === 'educativo_aprovado') return 'active';
  if (status === 'bloqueado_risco') return 'blocked';
  if (status === 'restrito_profissional') return 'warning';
  if (status === 'curadoria_tecnica') return 'pending';
  return 'neutral';
}

function statusLabel(status) {
  return FOOD_RELEASE_STATUS.find(item => item.value === status)?.label || 'Curadoria técnica';
}

function formFromRow(row) {
  const decision = row?.curationDecision || {};
  return {
    status: decision.status || row?.contentReleaseStatus || 'curadoria_tecnica',
    cautionNote: decision.cautionNote || '',
    reviewNote: decision.reviewNote || '',
    review: {
      sourceConfirmed: false,
      languageReviewed: false,
      cautionsReviewed: false,
      ...(decision.review || {}),
    },
  };
}

export function FoodCurationPanel() {
  const [decisions, setDecisions] = useState(() => getLocalFoodCurationDecisions());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(() => formFromRow(null));

  const rows = useMemo(() => materializeFoodCurationRows(decisions), [decisions]);
  const summary = useMemo(() => summarizeFoodCurationRows(rows), [rows]);
  const filteredRows = useMemo(() => filterFoodCurationRows(rows, { query, filter }), [rows, query, filter]);
  const selectedRow = useMemo(
    () => rows.find(row => row.id === selectedId) || filteredRows[0] || rows[0] || null,
    [rows, filteredRows, selectedId],
  );

  function selectFood(row) {
    setSelectedId(row.id);
    setForm(formFromRow(row));
    setMessage('');
  }

  function saveDecision(event) {
    event.preventDefault();
    if (!selectedRow) return;
    const validation = validateFoodCurationDecision({
      ...form,
      foodId: selectedRow.id,
      reviewedByLabel: 'SuperAdm',
    });
    if (!validation.ok) {
      setMessage(validation.errors.join(' '));
      return;
    }
    saveLocalFoodCurationDecision(validation.decision);
    setDecisions(getLocalFoodCurationDecisions());
    setMessage('Decisão salva localmente.');
  }

  function resetDecision() {
    if (!selectedRow) return;
    removeLocalFoodCurationDecision(selectedRow.id);
    const next = getLocalFoodCurationDecisions();
    setDecisions(next);
    setForm(formFromRow({ ...selectedRow, curationDecision: null }));
    setMessage('Decisão removida — volta ao status padrão (curadoria técnica).');
  }

  const energy = selectedRow ? FOOD_ENERGIES[selectedRow.energy] : null;

  return (
    <section className="box" style={{ borderColor: 'var(--gold)' }}>
      <div className="anamnese-review-section-head" style={{ marginBottom: 8 }}>
        <div>
          <p className="small">Dietoterapia · trilha alimento</p>
          <h3 style={{ margin: 0 }}>Curadoria de alimentos</h3>
        </div>
        <button type="button" className="tag" onClick={() => downloadFoodCurationDecisions()}>
          Exportar decisões (JSON)
        </button>
      </div>

      <div className="alert" style={{ background: '#f8fbff', borderColor: '#c9d8ef', color: '#061F3A' }}>
        Alimentos vêm de {FOOD_SOURCE.title} (leitura tradicional da MTC). Aprovar como <b>educativo aprovado</b> exige
        revisar linguagem, cautelas e fonte. Nenhuma decisão vai para o paciente/IA automaticamente; é apoio de curadoria local.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0' }}>
        {[
          ['Total', summary.total],
          ['Técnica', summary.technical],
          ['Aprovados', summary.approved],
          ['Restritos', summary.restricted],
          ['Elegíveis a paciente', summary.patientEligible],
        ].map(([label, value]) => (
          <div key={label} className="security-card" style={{ padding: '8px 14px', minWidth: 120 }}>
            <span className="small">{label}</span>
            <b style={{ fontSize: 20 }}>{value}</b>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        {FOOD_CURATION_FILTERS.map(item => (
          <button
            key={item.id}
            type="button"
            className={`tag${filter === item.id ? ' active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar alimento…"
          style={{ marginLeft: 'auto', minWidth: 180 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) 1fr', gap: 16 }}>
        <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
          {filteredRows.length === 0 ? (
            <p className="small" style={{ padding: 12 }}>Nenhum alimento para este filtro.</p>
          ) : filteredRows.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={() => selectFood(row)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none',
                borderBottom: '1px solid var(--line)', cursor: 'pointer',
                background: selectedRow?.id === row.id ? '#fbf7e8' : 'transparent',
              }}
            >
              <span>{row.commonName}</span>
              <span className={`admin-status ${statusTone(row.contentReleaseStatus)}`} style={{ fontSize: 11 }}>
                {statusLabel(row.contentReleaseStatus)}
              </span>
            </button>
          ))}
        </div>

        {selectedRow && (
          <form onSubmit={saveDecision}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <h4 style={{ margin: 0 }}>{selectedRow.commonName}</h4>
                <p className="small" style={{ margin: '2px 0' }}>
                  {energy?.label} · {selectedRow.flavors.map(f => FOOD_FLAVORS[f]?.label).join(', ')}
                  {selectedRow.organs.length ? ` · ${selectedRow.organs.map(o => FOOD_ORGANS[o]).join(', ')}` : ''}
                </p>
                <p className="small" style={{ opacity: 0.7 }}>Fonte: {FOOD_SOURCE.title} · p. {selectedRow.sourcePages.join(', ')}</p>
              </div>
              <span className={`admin-status ${statusTone(selectedRow.contentReleaseStatus)}`}>
                {statusLabel(selectedRow.contentReleaseStatus)}
              </span>
            </div>

            <p className="small" style={{ background: '#faf9f5', borderRadius: 8, padding: 10 }}>
              {describeFoodTradition(selectedRow)}
            </p>
            {selectedRow.caution && (
              <p className="small" style={{ color: '#b3261e' }}><b>Cautela da fonte:</b> {selectedRow.caution}</p>
            )}

            <label style={{ display: 'block', margin: '10px 0' }}>
              Status de liberação
              <select
                value={form.status}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              >
                {FOOD_RELEASE_STATUS.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <fieldset style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, margin: '10px 0' }}>
              <legend className="small">Conferência para aprovar</legend>
              {REVIEW_FIELDS.map(([field, label]) => (
                <label key={field} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.review[field])}
                    onChange={e => setForm(prev => ({ ...prev, review: { ...prev.review, [field]: e.target.checked } }))}
                  />
                  <span className="small">{label}</span>
                </label>
              ))}
            </fieldset>

            <label style={{ display: 'block', margin: '10px 0' }}>
              Cautela adicional (opcional)
              <input
                value={form.cautionNote}
                onChange={e => setForm(prev => ({ ...prev, cautionNote: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
                placeholder="Ex.: moderar em pessoas com refluxo"
              />
            </label>

            <label style={{ display: 'block', margin: '10px 0' }}>
              Nota de curadoria
              <textarea
                value={form.reviewNote}
                onChange={e => setForm(prev => ({ ...prev, reviewNote: e.target.value }))}
                rows={3}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
                placeholder="Justifique a decisão e a fonte (mín. 12 caracteres para status revisados)."
              />
            </label>

            {message && <div className="alert" style={{ marginBottom: 8 }}>{message}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="tag active">Salvar decisão</button>
              <button type="button" className="tag" onClick={resetDecision}>Remover decisão</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
