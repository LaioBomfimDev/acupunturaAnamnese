import { useState } from 'react';
import { Panel } from '../../ui/Panel';
import { FieldInput } from '../../ui/FieldInput';
import { FormLayout, FormRoute, FormSectionTitle } from '../../ui/FormRoute';
import { buildNutriAntropometriaRoute, findRouteItem } from '../../../utils/formRoute';
import {
  ANTHRO_BASIC_FIELDS,
  ANTHRO_COMPOSITION_FIELDS,
  ANTHRO_SKINFOLD_FIELDS,
  classifyBmi,
  computeBmi,
  computeWaistHipRatio,
  createMeasurement,
  formatDecimal,
  normalizeAntropometria,
} from '../../../data/nutricaoAvaliacao';
import { EmptyNote, MeasureInput, TextInput } from '../areaFields';
import { newEntryId, todayLabel } from '../areaIds';

// ============================================================
// Nutrição → Antropometria. Grava em session.antropometria.medidas
// (a mais recente primeiro). Calcula IMC e relação cintura-quadril e
// mostra a faixa de IMC pelos pontos de corte usuais — descritivo,
// a interpretação é da nutricionista.
// ============================================================

export function NutriAntropometria({ value, onChange, patientAge }) {
  const antropometria = normalizeAntropometria(value);
  const { medidas } = antropometria;
  const route = buildNutriAntropometriaRoute(antropometria);
  const entry = id => findRouteItem(route, id);
  const [selectedId, setSelectedId] = useState(null);
  const selectedIndex = Math.max(0, medidas.findIndex(item => item.id === selectedId));
  const current = medidas[selectedIndex] || null;

  const setMedidas = next => onChange({ ...antropometria, medidas: next });

  function addMeasurement() {
    // Altura raramente muda no adulto: a nova medida já nasce com a última.
    const next = { ...createMeasurement(newEntryId('medida'), todayLabel()), altura: medidas[0]?.altura || '' };
    setMedidas([next, ...medidas]);
    setSelectedId(next.id);
  }

  function updateCurrent(patch) {
    setMedidas(medidas.map((item, index) => (index === selectedIndex ? { ...item, ...patch } : item)));
  }

  function removeCurrent() {
    setMedidas(medidas.filter((_, index) => index !== selectedIndex));
    setSelectedId(null);
  }

  const bmi = current ? computeBmi(current.peso, current.altura) : null;
  const bmiRange = bmi ? classifyBmi(bmi, patientAge) : null;
  const ratio = current ? computeWaistHipRatio(current.cintura, current.quadril) : null;

  return (
    <FormLayout route={<FormRoute items={route} />}>
      <Panel title="Antropometria">
        <div className="area-toolbar">
          <p className="small area-intro">
            Cada medição fica guardada com a data. IMC e relação cintura-quadril são calculados
            automaticamente; a faixa de IMC é só referência.
          </p>
          <button type="button" className="primary-button" onClick={addMeasurement}>Nova medida</button>
        </div>

        {!current ? (
          <>
            <FormSectionTitle entry={entry('antro-medidas')} />
            <EmptyNote>Nenhuma medida registrada. Clique em “Nova medida” para começar.</EmptyNote>
          </>
        ) : (
          <>
            <FormSectionTitle entry={entry('antro-medidas')} />
            {selectedIndex > 0 && (
              <div className="alert alert-info">
                Você está editando uma medida antiga ({current.date || 'sem data'}). O roteiro e o relatório usam a mais recente.
              </div>
            )}
            <div className="measure-grid">
              <TextInput label="Data da medida" value={current.date} placeholder="dd/mm/aaaa" onChange={next => updateCurrent({ date: next })} />
              {ANTHRO_BASIC_FIELDS.map(field => (
                <MeasureInput
                  key={field.id}
                  label={field.label}
                  unit={field.unit}
                  value={current[field.id]}
                  onChange={next => updateCurrent({ [field.id]: next })}
                />
              ))}
            </div>

            <div className="calc-strip" aria-live="polite">
              <div className="calc-item">
                <span>IMC</span>
                <b>{bmi ? `${formatDecimal(bmi)} kg/m²` : '—'}</b>
                <small>
                  {bmiRange
                    ? `${bmiRange.label} · ${bmiRange.reference}`
                    : 'informe peso e altura'}
                </small>
              </div>
              <div className="calc-item">
                <span>Relação cintura-quadril</span>
                <b>{ratio ? formatDecimal(ratio, 2) : '—'}</b>
                <small>{ratio ? 'cintura ÷ quadril' : 'informe cintura e quadril'}</small>
              </div>
            </div>

            <FormSectionTitle entry={entry('antro-composicao')} />
            <div className="measure-grid">
              {[...ANTHRO_SKINFOLD_FIELDS, ...ANTHRO_COMPOSITION_FIELDS].map(field => (
                <MeasureInput
                  key={field.id}
                  label={field.label}
                  unit={field.unit}
                  value={current[field.id]}
                  onChange={next => updateCurrent({ [field.id]: next })}
                />
              ))}
            </div>
            <FieldInput
              label="Observações desta medida"
              field="observacoes"
              value={current.observacoes}
              onChange={(_, next) => updateCurrent({ observacoes: next })}
              textarea
            />
            <div className="actions">
              <button type="button" className="tag" onClick={removeCurrent}>Remover esta medida</button>
            </div>
          </>
        )}

        <FormSectionTitle entry={entry('antro-historico')} />
        {medidas.length === 0 ? (
          <EmptyNote>O histórico aparece aqui a partir da primeira medida.</EmptyNote>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr><th>Data</th><th>Peso</th><th>IMC</th><th>Cintura</th><th><span className="sr-only">Abrir</span></th></tr>
              </thead>
              <tbody>
                {medidas.map((item, index) => {
                  const rowBmi = computeBmi(item.peso, item.altura);
                  return (
                    <tr key={item.id || index} aria-current={index === selectedIndex ? 'true' : undefined}>
                      <td>{item.date || '—'}{index === 0 ? ' (mais recente)' : ''}</td>
                      <td>{item.peso ? `${item.peso} kg` : '—'}</td>
                      <td>{rowBmi ? formatDecimal(rowBmi) : '—'}</td>
                      <td>{item.cintura ? `${item.cintura} cm` : '—'}</td>
                      <td>
                        <button type="button" className="tag" onClick={() => setSelectedId(item.id)} disabled={index === selectedIndex}>
                          {index === selectedIndex ? 'Aberta' : 'Abrir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </FormLayout>
  );
}
