import { useState } from 'react';
import { Panel } from '../../ui/Panel';
import { FieldInput } from '../../ui/FieldInput';
import { FormLayout, FormRoute, FormSectionTitle } from '../../ui/FormRoute';
import { buildFisioEscalasRoute, findRouteItem } from '../../../utils/formRoute';
import {
  CUSTOM_SCALE_ID,
  FUNCTIONAL_SCALES,
  getFunctionalScale,
  normalizeFisioEscalas,
} from '../../../data/fisioterapiaAvaliacao';
import { EmptyNote, MeasureInput, SelectInput, TextInput } from '../areaFields';
import { newEntryId, todayLabel } from '../areaIds';

// ============================================================
// Fisioterapia → Escalas funcionais. Grava em session.escalas.
// Registra nome, escore, data e observação. As perguntas das escalas
// (várias com direito autoral) NÃO são reproduzidas: a profissional
// aplica o instrumento próprio e lança o resultado aqui.
// ============================================================

export function FisioEscalas({ value, onChange }) {
  const escalas = normalizeFisioEscalas(value);
  const route = buildFisioEscalasRoute(escalas);
  const entry = id => findRouteItem(route, id);
  const [scaleId, setScaleId] = useState(FUNCTIONAL_SCALES[0].id);
  const update = patch => onChange({ ...escalas, ...patch });

  function updateItem(index, patch) {
    update({ itens: escalas.itens.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)) });
  }

  return (
    <FormLayout route={<FormRoute items={route} />}>
      <Panel title="Escalas funcionais">
        <p className="small area-intro">
          Aplique o instrumento como de costume e lance aqui o escore. Repetir a mesma escala em datas
          diferentes mostra a evolução no relatório.
        </p>

        <FormSectionTitle entry={entry('escalas-aplicadas')} />
        <div className="measure-add">
          <SelectInput
            label="Escala"
            value={scaleId}
            onChange={setScaleId}
            options={[
              ...FUNCTIONAL_SCALES.map(scale => [scale.id, `${scale.label} — ${scale.about}`]),
              [CUSTOM_SCALE_ID, 'Outra escala (escrever o nome)'],
            ]}
          />
          <button
            type="button"
            className="tag"
            onClick={() => update({
              itens: [...escalas.itens, { id: newEntryId('escala'), scaleId, label: '', score: '', date: todayLabel(), notes: '' }],
            })}
          >
            Adicionar escala
          </button>
        </div>

        {escalas.itens.length === 0 ? (
          <EmptyNote>Nenhuma escala lançada ainda.</EmptyNote>
        ) : (
          <div className="measure-list">
            {escalas.itens.map((item, index) => {
              const scale = getFunctionalScale(item.scaleId);
              return (
                <div key={item.id || index} className="measure-row measure-row--scale">
                  {scale ? (
                    <div className="measure-row-title">
                      <b>{scale.label}</b>
                      <small>{scale.about} · faixa {scale.range}</small>
                    </div>
                  ) : (
                    <TextInput label="Nome da escala" value={item.label} onChange={next => updateItem(index, { label: next })} />
                  )}
                  <MeasureInput label="Escore" unit={scale?.unit} value={item.score} onChange={next => updateItem(index, { score: next })} />
                  <TextInput label="Data" value={item.date} placeholder="dd/mm/aaaa" onChange={next => updateItem(index, { date: next })} />
                  <TextInput label="Observação" value={item.notes} onChange={next => updateItem(index, { notes: next })} />
                  <button
                    type="button"
                    className="tag"
                    onClick={() => update({ itens: escalas.itens.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    Remover
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <FormSectionTitle entry={entry('escalas-observacoes')} />
        <FieldInput
          label="Observações da avaliação funcional"
          field="observacoes"
          value={escalas.observacoes}
          onChange={(_, next) => update({ observacoes: next })}
          textarea
        />
      </Panel>
    </FormLayout>
  );
}
