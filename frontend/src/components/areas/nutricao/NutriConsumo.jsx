import { Panel } from '../../ui/Panel';
import { FieldInput } from '../../ui/FieldInput';
import { FormLayout, FormRoute, FormSectionTitle } from '../../ui/FormRoute';
import { buildNutriConsumoRoute, findRouteItem } from '../../../utils/formRoute';
import { DAY_TYPES, MEALS, normalizeConsumo } from '../../../data/nutricaoAvaliacao';
import { SelectInput, TextInput } from '../areaFields';

// ============================================================
// Nutrição → Consumo alimentar (recordatório 24 horas por refeição).
// Grava em session.consumo. Só registra o relato — nenhuma análise de
// nutrientes nem sugestão de cardápio é gerada.
// ============================================================

export function NutriConsumo({ value, onChange }) {
  const consumo = normalizeConsumo(value);
  const route = buildNutriConsumoRoute(consumo);
  const entry = id => findRouteItem(route, id);
  const update = patch => onChange({ ...consumo, ...patch });

  function updateMeal(mealId, patch) {
    update({ refeicoes: { ...consumo.refeicoes, [mealId]: { ...consumo.refeicoes[mealId], ...patch } } });
  }

  return (
    <FormLayout route={<FormRoute items={route} />}>
      <Panel title="Consumo alimentar">
        <p className="small area-intro">
          Recordatório das últimas 24 horas, refeição por refeição, com horário, local e o que foi consumido
          (alimentos e quantidades em medidas caseiras).
        </p>

        <FormSectionTitle entry={entry('consumo-dia')} />
        <div className="measure-grid">
          <SelectInput
            label="O dia relatado foi"
            value={consumo.tipoDia}
            placeholder="Selecionar"
            options={DAY_TYPES.map(type => [type, type])}
            onChange={next => update({ tipoDia: next })}
          />
        </div>

        <FormSectionTitle entry={entry('consumo-refeicoes')} />
        <div className="meal-list">
          {MEALS.map(meal => {
            const item = consumo.refeicoes[meal.id];
            return (
              <div key={meal.id} className="meal-row">
                <div className="meal-row-head">
                  <b>{meal.label}</b>
                  <div className="meal-row-meta">
                    <TextInput label="Horário" value={item.horario} placeholder="07:30" onChange={next => updateMeal(meal.id, { horario: next })} />
                    <TextInput label="Local" value={item.local} placeholder="Casa, trabalho…" onChange={next => updateMeal(meal.id, { local: next })} />
                  </div>
                </div>
                <FieldInput
                  label={`O que consumiu no ${meal.label.toLowerCase()}`}
                  field={meal.id}
                  value={item.alimentos}
                  onChange={(_, next) => updateMeal(meal.id, { alimentos: next })}
                  textarea
                />
              </div>
            );
          })}
        </div>

        <FormSectionTitle entry={entry('consumo-hidratacao')} />
        <div className="measure-grid">
          <TextInput label="Água ao longo do dia" value={consumo.agua} placeholder="Ex.: 6 copos, 1,5 L" onChange={next => update({ agua: next })} />
        </div>
        <FieldInput
          label="Observações sobre o consumo"
          field="observacoes"
          value={consumo.observacoes}
          onChange={(_, next) => update({ observacoes: next })}
          textarea
        />
      </Panel>
    </FormLayout>
  );
}
