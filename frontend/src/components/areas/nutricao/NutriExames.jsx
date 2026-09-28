import { Panel } from '../../ui/Panel';
import { FieldInput } from '../../ui/FieldInput';
import { FormLayout, FormRoute, FormSectionTitle } from '../../ui/FormRoute';
import { buildNutriExamesRoute, findRouteItem } from '../../../utils/formRoute';
import { EXAM_CATALOG, normalizeExames } from '../../../data/nutricaoAvaliacao';
import { EmptyNote, MeasureInput, TextInput } from '../areaFields';
import { newEntryId } from '../areaIds';

// ============================================================
// Nutrição → Exames laboratoriais. Grava em session.exames.itens.
// Só registra valor, unidade e data: a referência é a do laudo do
// laboratório, e o sistema não classifica o resultado.
// ============================================================

export function NutriExames({ value, onChange }) {
  const exames = normalizeExames(value);
  const route = buildNutriExamesRoute(exames);
  const entry = id => findRouteItem(route, id);
  const update = patch => onChange({ ...exames, ...patch });

  function addExam(template) {
    update({
      itens: [...exames.itens, {
        id: newEntryId('exame'),
        nome: template?.name || '',
        unidade: template?.unit || '',
        valor: '',
        data: '',
        obs: '',
      }],
    });
  }

  function updateItem(index, patch) {
    update({ itens: exames.itens.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)) });
  }

  return (
    <FormLayout route={<FormRoute items={route} />}>
      <Panel title="Exames">
        <p className="small area-intro">
          Lance os resultados do laudo. A unidade sugerida pode ser trocada; a referência vale a do laboratório.
        </p>

        <FormSectionTitle entry={entry('exames-registrados')} />
        <div className="quick-words" role="group" aria-label="Adicionar exame">
          {EXAM_CATALOG.map(template => (
            <button key={template.name} type="button" className="quick-word-chip" onClick={() => addExam(template)}>
              + {template.name}
            </button>
          ))}
          <button type="button" className="quick-word-chip quick-word-chip-add" onClick={() => addExam(null)}>
            + Outro exame
          </button>
        </div>

        {exames.itens.length === 0 ? (
          <EmptyNote>Clique no nome do exame acima para adicionar uma linha.</EmptyNote>
        ) : (
          <div className="measure-list">
            {exames.itens.map((item, index) => (
              <div key={item.id || index} className="measure-row measure-row--exam">
                <TextInput label="Exame" value={item.nome} onChange={next => updateItem(index, { nome: next })} />
                <MeasureInput label="Resultado" value={item.valor} onChange={next => updateItem(index, { valor: next })} />
                <TextInput label="Unidade" value={item.unidade} onChange={next => updateItem(index, { unidade: next })} />
                <TextInput label="Data da coleta" value={item.data} placeholder="dd/mm/aaaa" onChange={next => updateItem(index, { data: next })} />
                <TextInput label="Observação" value={item.obs} onChange={next => updateItem(index, { obs: next })} />
                <button
                  type="button"
                  className="tag"
                  onClick={() => update({ itens: exames.itens.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}

        <FormSectionTitle entry={entry('exames-observacoes')} />
        <FieldInput
          label="Observações sobre os exames"
          field="observacoes"
          value={exames.observacoes}
          onChange={(_, next) => update({ observacoes: next })}
          textarea
        />
      </Panel>
    </FormLayout>
  );
}
