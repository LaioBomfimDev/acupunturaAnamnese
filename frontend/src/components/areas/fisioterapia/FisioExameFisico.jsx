import { useState } from 'react';
import { Panel } from '../../ui/Panel';
import { FieldInput } from '../../ui/FieldInput';
import { FormLayout, FormRoute, FormSectionTitle } from '../../ui/FormRoute';
import { buildFisioExameRoute, findRouteItem } from '../../../utils/formRoute';
import {
  EXAM_TEXT_FIELDS,
  MRC_GRADES,
  PAIN_FIELDS,
  PAIN_SCALE_VALUES,
  ROM_JOINTS,
  SIDES,
  SPECIAL_TESTS,
  STRENGTH_GROUPS,
  TEST_RESULTS,
  VITAL_SIGNS,
  getRomJoint,
  getRomMovement,
  normalizeFisioExame,
} from '../../../data/fisioterapiaAvaliacao';
import { EmptyNote, MeasureInput, SelectInput } from '../areaFields';
import { newEntryId } from '../areaIds';

// ============================================================
// Fisioterapia → Exame físico. Grava em session.exameFisico (mesmo
// registro da anamnese). Registra o que foi medido; não julga se está
// "normal" — a referência de amplitude é só apoio visual.
// ============================================================

const SIDE_OPTIONS = SIDES;
const PAIN_OPTIONS = PAIN_SCALE_VALUES.map(value => [value, value]);

function RomAdder({ onAdd }) {
  const [jointId, setJointId] = useState(ROM_JOINTS[0].id);
  const joint = getRomJoint(jointId);
  const [movementId, setMovementId] = useState(joint.movements[0][0]);
  const [side, setSide] = useState('D');
  const movement = getRomMovement(jointId, movementId) ? movementId : joint.movements[0][0];

  return (
    <div className="measure-add">
      <SelectInput
        label="Articulação"
        value={jointId}
        onChange={value => {
          setJointId(value);
          setMovementId(getRomJoint(value).movements[0][0]);
        }}
        options={ROM_JOINTS.map(item => [item.id, item.label])}
      />
      <SelectInput
        label="Movimento"
        value={movement}
        onChange={setMovementId}
        options={joint.movements.map(([id, label, reference]) => [id, `${label} (ref. ${reference})`])}
      />
      {joint.bilateral && (
        <SelectInput label="Lado" value={side} onChange={setSide} options={SIDE_OPTIONS} />
      )}
      <button
        type="button"
        className="tag"
        onClick={() => onAdd({ joint: jointId, movement, side: joint.bilateral ? side : '' })}
      >
        Adicionar movimento
      </button>
    </div>
  );
}

function StrengthAdder({ onAdd }) {
  const [group, setGroup] = useState(STRENGTH_GROUPS[0]);
  const [side, setSide] = useState('D');
  return (
    <div className="measure-add">
      <SelectInput
        label="Grupo muscular"
        value={group}
        onChange={setGroup}
        options={[...STRENGTH_GROUPS.map(item => [item, item]), ['', 'Outro grupo (escrever)']]}
      />
      <SelectInput label="Lado" value={side} onChange={setSide} options={[...SIDE_OPTIONS, ['', 'Sem lado']]} />
      <button type="button" className="tag" onClick={() => onAdd({ group, side })}>
        Adicionar grupo
      </button>
    </div>
  );
}

export function FisioExameFisico({ value, onChange }) {
  const exame = normalizeFisioExame(value);
  const route = buildFisioExameRoute(exame);
  const entry = id => findRouteItem(route, id);
  const update = patch => onChange({ ...exame, ...patch });

  function updateList(key, index, patch) {
    update({ [key]: exame[key].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)) });
  }

  function removeFromList(key, index) {
    update({ [key]: exame[key].filter((_, itemIndex) => itemIndex !== index) });
  }

  return (
    <FormLayout route={<FormRoute items={route} />}>
      <Panel title="Exame físico">
        <p className="small area-intro">
          Registre o que foi medido nesta avaliação. As referências de amplitude são aproximadas e só servem
          de apoio: o sistema não classifica o resultado.
        </p>

        <FormSectionTitle entry={entry('fisio-sinais')} />
        <div className="measure-grid">
          {VITAL_SIGNS.map(field => (
            <MeasureInput
              key={field.id}
              label={field.label}
              unit={field.unit}
              placeholder={field.placeholder}
              inputMode={field.id === 'pa' ? 'text' : 'decimal'}
              value={exame.sinais[field.id]}
              onChange={next => update({ sinais: { ...exame.sinais, [field.id]: next } })}
            />
          ))}
        </div>

        <FormSectionTitle entry={entry('fisio-dor')} />
        <div className="measure-grid">
          {PAIN_FIELDS.map(field => (
            <SelectInput
              key={field.id}
              label={field.label}
              value={exame.dor[field.id]}
              placeholder="Não avaliado"
              options={PAIN_OPTIONS}
              onChange={next => update({ dor: { ...exame.dor, [field.id]: next } })}
            />
          ))}
        </div>

        <FormSectionTitle entry={entry('fisio-adm')} />
        <RomAdder
          onAdd={item => update({
            adm: [...exame.adm, { id: newEntryId('adm'), ...item, active: '', passive: '', pain: false }],
          })}
        />
        {exame.adm.length === 0 ? (
          <EmptyNote>Escolha a articulação e o movimento e clique em “Adicionar movimento”.</EmptyNote>
        ) : (
          <div className="measure-list">
            {exame.adm.map((item, index) => {
              const joint = getRomJoint(item.joint);
              const movement = getRomMovement(item.joint, item.movement);
              return (
                <div key={item.id || index} className="measure-row">
                  <div className="measure-row-title">
                    <b>{joint?.label} — {movement?.label}</b>
                    <small>
                      {item.side === 'D' ? 'Direito' : item.side === 'E' ? 'Esquerdo' : 'Sem lado'}
                      {movement?.reference ? ` · ref. ${movement.reference}` : ''}
                    </small>
                  </div>
                  <MeasureInput label="Ativo" unit="°" value={item.active} onChange={next => updateList('adm', index, { active: next })} />
                  <MeasureInput label="Passivo" unit="°" value={item.passive} onChange={next => updateList('adm', index, { passive: next })} />
                  <label className="check-line">
                    <input type="checkbox" checked={Boolean(item.pain)} onChange={event => updateList('adm', index, { pain: event.target.checked })} />
                    <span>Dor ao movimento</span>
                  </label>
                  <button type="button" className="tag" onClick={() => removeFromList('adm', index)}>Remover</button>
                </div>
              );
            })}
          </div>
        )}

        <FormSectionTitle entry={entry('fisio-forca')} />
        <StrengthAdder
          onAdd={item => update({ forca: [...exame.forca, { id: newEntryId('forca'), ...item, grade: '' }] })}
        />
        {exame.forca.length === 0 ? (
          <EmptyNote>Escolha o grupo muscular e o lado e clique em “Adicionar grupo”.</EmptyNote>
        ) : (
          <div className="measure-list">
            {exame.forca.map((item, index) => (
              <div key={item.id || index} className="measure-row measure-row--strength">
                <label className="measure-field">
                  <span>Grupo muscular</span>
                  <input
                    type="text"
                    lang="pt-BR"
                    value={item.group || ''}
                    placeholder="Ex.: tibial anterior"
                    onChange={event => updateList('forca', index, { group: event.target.value })}
                  />
                </label>
                <SelectInput
                  label="Lado"
                  value={item.side}
                  options={[...SIDE_OPTIONS, ['', 'Sem lado']]}
                  onChange={next => updateList('forca', index, { side: next })}
                />
                <SelectInput
                  label="Grau (MRC)"
                  value={item.grade}
                  placeholder="Não graduado"
                  options={MRC_GRADES}
                  onChange={next => updateList('forca', index, { grade: next })}
                />
                <button type="button" className="tag" onClick={() => removeFromList('forca', index)}>Remover</button>
              </div>
            ))}
          </div>
        )}

        <FormSectionTitle entry={entry('fisio-testes')} />
        <p className="small area-intro">Deixe “Não testado” no que não foi aplicado. Só o resultado entra no registro.</p>
        {SPECIAL_TESTS.map(group => (
          <div key={group.region} className="test-group">
            <h4>{group.region}</h4>
            <div className="test-list">
              {group.tests.map(test => {
                const current = exame.testes[test] || { result: '', side: '' };
                const setTest = patch => update({ testes: { ...exame.testes, [test]: { ...current, ...patch } } });
                return (
                  <div key={test} className={`test-row${current.result === 'positivo' ? ' is-positive' : ''}`}>
                    <span className="test-name">{test}</span>
                    <select aria-label={`Resultado — ${test}`} value={current.result} onChange={event => setTest({ result: event.target.value })}>
                      {TEST_RESULTS.map(([resultValue, resultLabel]) => <option key={resultValue} value={resultValue}>{resultLabel}</option>)}
                    </select>
                    <select
                      aria-label={`Lado — ${test}`}
                      value={current.side || ''}
                      disabled={!current.result}
                      onChange={event => setTest({ side: event.target.value })}
                    >
                      <option value="">Sem lado</option>
                      {SIDE_OPTIONS.map(([sideValue, sideLabel]) => <option key={sideValue} value={sideValue}>{sideLabel}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <FormSectionTitle entry={entry('fisio-achados')} />
        {EXAM_TEXT_FIELDS.map(field => (
          <FieldInput
            key={field.id}
            label={field.label}
            field={field.id}
            value={exame[field.id]}
            onChange={(id, next) => update({ [id]: next })}
            textarea
          />
        ))}
      </Panel>
    </FormLayout>
  );
}
