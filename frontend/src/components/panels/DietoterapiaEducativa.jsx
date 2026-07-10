import { useMemo, useState } from 'react';
import {
  FOOD_AXES,
  FOOD_CATALOG,
  FOOD_DISCLAIMER,
  FOOD_ENERGIES,
  FOOD_FLAVORS,
  FOOD_ORGANS,
  FOOD_SOURCE,
  describeFoodTradition,
  getFoodsByAxis,
  getFoodsByEnergy,
  getFoodsByFlavor,
  getFoodsByOrgan,
} from '../../knowledge/foodDietoterapia';
import { getLocalFoodCurationDecisions } from '../../knowledge/foodDietoterapiaCuration';
import { FOOD_BOOK_GUIDE } from '../../knowledge/foodBookGuide';
import { linkHerbsToSymptoms } from '../../knowledge/herbalIndicationLinking';
import {
  FOOD_RESEARCH_DISCLAIMER,
  FOOD_RESEARCH_MODES,
  getFoodResearchMode,
  researchFood,
} from '../../services/foodResearchAiService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';

// Cor de fundo do selo de energia — só apoio visual (quente = quente).
const ENERGY_TONE = {
  fria: '#1f6feb',
  fresca: '#3d8bd4',
  neutra: '#6b7280',
  morna: '#d98324',
  quente: '#c0392b',
};

const AXIS_ORDER = ['todos', 'aquecer', 'refrescar', 'digestao'];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Diálogo de PESQUISA por IA de um alimento/planta. A profissional escolhe um
 * modo (visão medicinal, receitas, leitura MTC, segurança) e a IA responde por
 * TÓPICOS FIXOS — não é prompt genérico. Estudo da profissional, não prescrição.
 */
function FoodResearchDialog({ food, onClose }) {
  const [mode, setMode] = useState(null);
  const [objective, setObjective] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const modeMeta = getFoodResearchMode(mode);

  async function handleResearch() {
    if (!mode || loading) return;
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await researchFood(food, mode, { objective });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Falha ao pesquisar o alimento.');
    } finally {
      setLoading(false);
    }
  }

  const isMock = result?.modelVersion?.startsWith('mock');

  return (
    <div
      className="admin-modal-backdrop"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <section
        className="box"
        role="dialog"
        aria-modal="true"
        aria-label={`Pesquisar ${food.commonName} com IA`}
        style={{ maxWidth: 640, width: '92%', maxHeight: '88vh', overflowY: 'auto', margin: 0 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <b style={{ fontSize: 18 }}>✦ Pesquisar com IA — {food.commonName}</b>
            <p className="small" style={{ margin: '2px 0 0' }}>{describeFoodTradition(food)}</p>
          </div>
          <button type="button" className="quiet-button" onClick={onClose}>Fechar</button>
        </div>

        <div className="alert" style={{ background: '#fbf9f2', borderColor: 'var(--gold)', color: '#3a2f10', marginTop: 10 }}>
          {FOOD_RESEARCH_DISCLAIMER}
        </div>

        <p className="small" style={{ margin: '10px 0 6px' }}><b>Escolha o que pesquisar:</b></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {FOOD_RESEARCH_MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${mode === m.id ? 'var(--gold)' : 'var(--line)'}`,
                background: mode === m.id ? '#fbf6e8' : 'white',
              }}
            >
              <b style={{ fontSize: 13 }}>{m.label}</b>
              <span className="small" style={{ display: 'block', opacity: 0.75, marginTop: 2 }}>{m.hint}</span>
            </button>
          ))}
        </div>

        {modeMeta?.needsObjective && (
          <input
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="Objetivo (opcional): digestão, sono, imunidade, ansiedade…"
            style={{ width: '100%', marginTop: 10, borderRadius: 10, border: '1px solid var(--line)', padding: '9px 12px', fontSize: 13 }}
          />
        )}

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="ai-analyze-btn"
            style={{ margin: 0 }}
            disabled={!mode || loading}
            onClick={handleResearch}
          >
            {loading ? 'Pesquisando…' : '✦ Pesquisar'}
          </button>
        </div>

        {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 14 }}>
            {result.insufficient && (
              <div className="alert" style={{ marginBottom: 8 }}>
                A IA não encontrou informação confiável suficiente sobre este item.
              </div>
            )}
            {result.sections.map((sec, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                {sec.heading && <b style={{ display: 'block', color: 'var(--navy)' }}>{sec.heading}</b>}
                <p style={{ margin: '2px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#1f2937' }}>{sec.body}</p>
              </div>
            ))}

            {result.evidenceNote && (
              <p className="small" style={{ margin: '8px 0 0' }}>
                <b>Nível de evidência:</b> {result.evidenceNote}
              </p>
            )}
            {result.safety && (
              <p className="small" style={{ margin: '6px 0 0', color: '#b3261e' }}>
                <b>Cuidados:</b> {result.safety}
              </p>
            )}

            <p className="small" style={{ marginTop: 8, color: '#94a3b8' }}>
              Modelo: {result.modelVersion}{isMock ? ' (simulado)' : ''}.
            </p>

            <div className="deepdive-correct-row" style={{ marginTop: 6 }}>
              <AiCorrectionButton
                surface={AI_SURFACES.FOOD_RESEARCH}
                aiOutput={{ paragraphs: result.sections.map(s => `${s.heading}: ${s.body}`) }}
                contextSnapshot={{ food: food.commonName, mode: result.mode, objective }}
                modelVersion={result.modelVersion}
                summary={result.sections[0]?.body}
                label="✎ Corrigir a pesquisa"
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Tag clicável de propriedade (sabor/órgão). Ao clicar, abre o modal de
// cruzamento com os outros alimentos que compartilham aquela propriedade.
function PropertyTag({ label, title, onClick, italic }) {
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      className="tag"
      onClick={onClick}
      disabled={!clickable}
      title={clickable ? (title ? `${title} — ver outros alimentos` : 'Ver outros alimentos') : title}
      style={{
        margin: 0, cursor: clickable ? 'pointer' : 'default', font: 'inherit',
        ...(italic ? { opacity: 0.8, fontStyle: 'italic' } : {}),
      }}
    >
      {label}
    </button>
  );
}

function FoodCard({ food, approved, onPropertyClick }) {
  const energy = FOOD_ENERGIES[food.energy];
  const tone = ENERGY_TONE[food.energy] || '#6b7280';
  const [researching, setResearching] = useState(false);
  const clickable = typeof onPropertyClick === 'function';
  return (
    <div className="box" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <b>{food.commonName}</b>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {approved && (
            <span style={{ background: '#e6f4ea', color: '#137333', borderRadius: 12, padding: '2px 8px', fontSize: 11, whiteSpace: 'nowrap' }}>
              ✓ Aprovado
            </span>
          )}
          <button
            type="button"
            onClick={clickable ? () => onPropertyClick({ type: 'energy', value: food.energy }) : undefined}
            disabled={!clickable}
            title={clickable ? `${energy?.hint || ''} — ver alimentos de mesma energia` : energy?.hint}
            style={{
              background: tone, color: '#fff', border: 'none', borderRadius: 12, padding: '2px 10px',
              fontSize: 12, whiteSpace: 'nowrap', cursor: clickable ? 'pointer' : 'default', font: 'inherit',
            }}
          >
            {energy?.label}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
        {food.flavors.map(flavor => (
          <PropertyTag
            key={flavor}
            label={FOOD_FLAVORS[flavor]?.label}
            title={FOOD_FLAVORS[flavor]?.hint}
            onClick={clickable ? () => onPropertyClick({ type: 'flavor', value: flavor }) : undefined}
          />
        ))}
        {food.organs.map(organ => (
          <PropertyTag
            key={organ}
            label={FOOD_ORGANS[organ]}
            italic
            onClick={clickable ? () => onPropertyClick({ type: 'organ', value: organ }) : undefined}
          />
        ))}
      </div>

      <p className="small" style={{ margin: '4px 0' }}>{describeFoodTradition(food)}</p>

      {food.caution && (
        <p className="small" style={{ margin: '4px 0', color: '#b3261e' }}>
          <b>Cautela:</b> {food.caution}
        </p>
      )}

      <FoodBookContent food={food} />

      <p className="small" style={{ margin: '6px 0 0', opacity: 0.65 }}>
        Fonte: {FOOD_SOURCE.title}
        {food.chapter ? ` · ${food.chapter}` : ''} · p. {food.sourcePages.join(', ')}
      </p>

      <button
        type="button"
        className="btn-mini"
        style={{ marginTop: 10 }}
        onClick={() => setResearching(true)}
        title="Pesquisar por tópicos com IA (estudo da profissional)"
      >
        ✦ Pesquisar com IA
      </button>

      {researching && (
        <FoodResearchDialog food={food} onClose={() => setResearching(false)} />
      )}
    </div>
  );
}

// Conteúdo TRADICIONAL do livro (indicações, aplicações com quantidades,
// relatórios clínicos, experiências, comentários). Referência do profissional —
// não é prescrição nem indicação automática. Fica recolhido por padrão.
function BookSection({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ margin: '8px 0 0' }}>
      <b>{title}</b>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((text, i) => (
          <li key={i} style={{ marginBottom: 4 }}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

function FoodBookContent({ food }) {
  const hasRich =
    food.indications ||
    food.aplicacoes?.length ||
    food.comentarios?.length ||
    food.relatoriosClinicos?.length ||
    food.experiencias?.length;
  if (!hasRich) return null;
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#8a6d1a' }}>
        Ver conteúdo do livro
        {food.needsReview && (
          <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, color: '#b3261e' }}>
            (OCR a conferir)
          </span>
        )}
      </summary>
      <div className="small" style={{ marginTop: 6 }}>
        <p style={{ margin: '4px 0 8px', fontStyle: 'italic', opacity: 0.7 }}>
          Conteúdo tradicional do livro (referência do profissional). Cita quantidades e
          preparos exatamente como a fonte descreve; não é prescrição, plano alimentar nem
          indicação automática ao paciente.
        </p>
        {food.indications && (
          <p style={{ margin: '6px 0' }}><b>Indicações da fonte:</b> {food.indications}</p>
        )}
        {food.descricao && (
          <p style={{ margin: '6px 0' }}><b>Descrição:</b> {food.descricao}</p>
        )}
        <BookSection title="Aplicações" items={food.aplicacoes} />
        <BookSection title="Relatórios clínicos" items={food.relatoriosClinicos} />
        <BookSection title="Experiências" items={food.experiencias} />
        <BookSection title="Comentários" items={food.comentarios} />
      </div>
    </details>
  );
}

// Preâmbulo do livro (dieta chinesa, sabores, energias, movimentos, dosagens,
// preparo, estações, formato). Recolhido por padrão — referência de leitura.
function FoodBookGuide() {
  const { intro, topics, source } = FOOD_BOOK_GUIDE;
  return (
    <details className="box" style={{ margin: '0 0 12px', background: '#fbf9f2', borderColor: 'var(--gold)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#3a2f10' }}>
        📖 Como o livro funciona · dosagens, sabores, energias e preparos
      </summary>
      <p className="small" style={{ margin: '10px 0' }}>{intro}</p>
      {topics.map(topic => (
        <details key={topic.id} style={{ margin: '6px 0', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>{topic.title}</summary>
          <div className="small" style={{ marginTop: 4 }}>
            {topic.paragraphs.map((p, i) => (
              <p key={i} style={{ margin: '4px 0' }}>{p}</p>
            ))}
            <p style={{ margin: '4px 0 0', opacity: 0.6 }}>Fonte: {source.title} · {topic.pages}</p>
          </div>
        </details>
      ))}
    </details>
  );
}

// Metadados da propriedade clicada — título, dica e a lista de alimentos que a
// compartilham. Não inventa nada: só reagrupa o catálogo pela propriedade da
// fonte (energia/sabor/órgão MTC). É cruzamento de leitura, não recomendação.
function resolvePropertyMeta(property) {
  if (!property) return null;
  const { type, value } = property;
  if (type === 'energy') {
    const meta = FOOD_ENERGIES[value];
    return {
      title: `Energia ${meta?.label || value}`,
      hint: meta?.hint || '',
      foods: getFoodsByEnergy(value),
    };
  }
  if (type === 'flavor') {
    const meta = FOOD_FLAVORS[value];
    return {
      title: `Sabor ${meta?.label || value}`,
      hint: meta?.hint || '',
      foods: getFoodsByFlavor(value),
    };
  }
  if (type === 'organ') {
    return {
      title: FOOD_ORGANS[value] || value,
      hint: 'Sistema funcional da MTC (não é órgão biomédico).',
      foods: getFoodsByOrgan(value),
    };
  }
  return null;
}

/**
 * Modal de CRUZAMENTO: mostra os outros alimentos que compartilham a propriedade
 * clicada (mesma energia, sabor ou afinidade de órgão). Cada item é clicável e
 * abre o card completo daquele alimento para leitura. Reagrupamento educativo da
 * fonte — não é recomendação, plano alimentar nem prescrição.
 */
function PropertyCrossRefDialog({ property, isBlocked, currentFoodId, onOpenFood, onClose }) {
  const meta = resolvePropertyMeta(property);
  if (!meta) return null;
  const foods = meta.foods.filter(f => !isBlocked(f.id));
  return (
    <div
      className="admin-modal-backdrop"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <section
        className="box"
        role="dialog"
        aria-modal="true"
        aria-label={`Alimentos com ${meta.title}`}
        style={{ maxWidth: 560, width: '92%', maxHeight: '86vh', overflowY: 'auto', margin: 0 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <b style={{ fontSize: 17 }}>{meta.title}</b>
            {meta.hint && <p className="small" style={{ margin: '2px 0 0', opacity: 0.75 }}>{meta.hint}</p>}
          </div>
          <button type="button" className="quiet-button" onClick={onClose}>Fechar</button>
        </div>

        <p className="small" style={{ margin: '10px 0' }}>
          {foods.length} aliment{foods.length === 1 ? 'o' : 'os'} que a fonte associa a esta propriedade.
          Clique para abrir o card e ler a leitura completa. Reagrupamento educativo da fonte; não é
          indicação nem prescrição.
        </p>

        {foods.length === 0 ? (
          <p className="small">Nenhum outro alimento liberado com esta propriedade.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {foods.map(food => {
              const isCurrent = food.id === currentFoodId;
              return (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => onOpenFood(food)}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${isCurrent ? 'var(--gold)' : 'var(--line)'}`,
                    background: isCurrent ? '#fbf6e8' : 'white', font: 'inherit',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  }}
                >
                  <span><b style={{ fontSize: 13 }}>{food.commonName}</b>{isCurrent ? ' (atual)' : ''}</span>
                  <span
                    className="small"
                    style={{ opacity: 0.7, whiteSpace: 'nowrap' }}
                    title={FOOD_ENERGIES[food.energy]?.hint}
                  >
                    {FOOD_ENERGIES[food.energy]?.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Modal de DETALHE: abre o card completo de um alimento (a "página da erva" para
 * ler certinho). As tags dentro dele continuam clicáveis, então dá para navegar
 * de propriedade em propriedade sem sair do fluxo.
 */
function FoodDetailDialog({ food, approved, onPropertyClick, onClose }) {
  return (
    <div
      className="admin-modal-backdrop"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <section
        className="box"
        role="dialog"
        aria-modal="true"
        aria-label={food.commonName}
        style={{ maxWidth: 620, width: '92%', maxHeight: '88vh', overflowY: 'auto', margin: 0, padding: 0, background: 'transparent', border: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button type="button" className="quiet-button" onClick={onClose}>Fechar</button>
        </div>
        <FoodCard food={food} approved={approved} onPropertyClick={onPropertyClick} />
      </section>
    </div>
  );
}

/**
 * LANE FITOTERÁPICA (paradigma próprio, não MTC). Liga a queixa/anamnese do
 * paciente às ervas do catálogo fitoterápico ocidental por TEMA DE SINTOMA.
 * Fica visualmente separada do bloco MTC dos alimentos — nunca blendada. Só
 * ervas `educativo_aprovado` entram na sugestão ao vivo; as `restrito` só sob o
 * toggle de uso profissional. Instrui/indica, não prescreve.
 */
function HerbalIndicationLane({ anamneseText }) {
  const [includeRestrito, setIncludeRestrito] = useState(false);

  const link = useMemo(
    () => linkHerbsToSymptoms(anamneseText, {
      minStatus: includeRestrito ? 'restrito_profissional' : 'educativo_aprovado',
    }),
    [anamneseText, includeRestrito],
  );

  return (
    <details className="box" style={{ margin: '0 0 12px', borderColor: '#2e7d5b', background: '#f2f8f4' }} open>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#1e5c40' }}>
        🌿 Fitoterapia · leitura tradicional ocidental (lane própria — não é MTC)
      </summary>

      <p className="small" style={{ margin: '10px 0', color: '#2f4f40' }}>{link.disclaimer}</p>

      <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', margin: '0 0 10px', cursor: 'pointer' }}>
        <input type="checkbox" checked={includeRestrito} onChange={e => setIncludeRestrito(e.target.checked)} />
        Incluir ervas de uso restrito (estudo da profissional)
      </label>

      {!link.hasInput ? (
        <p className="small" style={{ opacity: 0.75 }}>
          Preencha a queixa/anamnese do paciente para ver as ervas que a fonte associa ao <b>tema</b> da queixa.
        </p>
      ) : link.patientThemes.length === 0 ? (
        <p className="small" style={{ opacity: 0.75 }}>
          A queixa atual não toca nenhum tema fitoterápico do catálogo (digestivo, hepático, calmante, respiratório, garganta, urinário, pele, circulação, vitalidade).
        </p>
      ) : (
        <>
          <p className="small" style={{ margin: '0 0 8px' }}>
            A queixa toca os temas:{' '}
            {link.patientThemes.map(t => (
              <span key={t.id} className="tag" style={{ margin: '0 4px 0 0', cursor: 'default', background: '#e2f0e8', borderColor: '#8fc3aa' }}>
                {t.label}
              </span>
            ))}
          </p>

          {link.matched.length === 0 ? (
            <p className="small" style={{ opacity: 0.75 }}>Nenhuma erva liberada e coerente com esses temas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {link.matched.map(herb => (
                <div key={herb.id} className="box" style={{ margin: 0, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <b>{herb.commonName}</b>
                    {herb.scientificName && <span className="small" style={{ fontStyle: 'italic', opacity: 0.7 }}>{herb.scientificName}</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                    {herb.matchedThemes.map(label => (
                      <span key={label} className="tag" style={{ margin: 0, cursor: 'default', background: '#e2f0e8', borderColor: '#8fc3aa' }}>{label}</span>
                    ))}
                    {herb.status === 'restrito_profissional' && (
                      <span className="tag" style={{ margin: 0, cursor: 'default', background: '#fdeede', borderColor: '#e0a96d', color: '#8a4b12' }}>restrito</span>
                    )}
                  </div>
                  <p className="small" style={{ margin: '2px 0' }}>{herb.educationalSummary}</p>
                  {herb.caution && (
                    <p className="small" style={{ margin: '2px 0', color: '#b3261e' }}><b>Cautela:</b> {herb.caution}</p>
                  )}
                  <p className="small" style={{ margin: '4px 0 0', opacity: 0.6 }}>
                    Evidência: {herb.evidence}{herb.sourcePages?.length ? ` · fonte p. ${herb.sourcePages.join(', ')}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  );
}

/**
 * Painel educativo de dietoterapia chinesa dentro da anamnese. Superfície do
 * PROFISSIONAL: organiza a leitura tradicional dos alimentos (energia, sabor,
 * sistemas funcionais) por eixo educativo. NÃO é recomendador, plano alimentar
 * nem prescrição — não cruza automaticamente padrão do paciente com alimento.
 * Ver docs/plano-dietoterapia.md e docs/nutricao-ervas/.
 */
export function DietoterapiaEducativa({ anamneseText = '' } = {}) {
  const [axis, setAxis] = useState('todos');
  const [query, setQuery] = useState('');
  // Propriedade clicada (energia/sabor/órgão) e alimento aberto em detalhe —
  // dão o cruzamento e a navegação card ↔ modal sem tocar no filtro/busca.
  const [propertyView, setPropertyView] = useState(null);
  const [detailFood, setDetailFood] = useState(null);

  // Decisões de curadoria do SuperAdm: esconde alimentos bloqueados e sinaliza
  // os aprovados. Sem decisão = status padrão (curadoria técnica), segue visível.
  const decisionByFoodId = useMemo(() => {
    const map = new Map();
    for (const decision of getLocalFoodCurationDecisions()) map.set(decision.foodId, decision);
    return map;
  }, []);

  const isBlocked = id => decisionByFoodId.get(id)?.status === 'bloqueado_risco';
  const isApproved = id => decisionByFoodId.get(id)?.status === 'educativo_aprovado';

  const foods = useMemo(() => {
    const base = axis === 'todos' ? FOOD_CATALOG : getFoodsByAxis(axis);
    const term = normalize(query).trim();
    const visible = base.filter(food => decisionByFoodId.get(food.id)?.status !== 'bloqueado_risco');
    if (!term) return visible;
    return visible.filter(food => normalize(food.commonName).includes(term));
  }, [axis, query, decisionByFoodId]);

  return (
    <div className="box" style={{ borderColor: 'var(--gold)' }}>
      <div className="alert" style={{ background: '#fbf9f2', borderColor: 'var(--gold)', color: '#3a2f10', marginTop: 0 }}>
        <b>Educação, não prescrição.</b> {FOOD_DISCLAIMER}
      </div>

      <HerbalIndicationLane anamneseText={anamneseText} />

      <FoodBookGuide />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        {AXIS_ORDER.map(id => (
          <button
            key={id}
            type="button"
            className={`tag${axis === id ? ' active' : ''}`}
            style={{ margin: 0 }}
            onClick={() => setAxis(id)}
          >
            {id === 'todos' ? 'Todos' : FOOD_AXES[id].label}
          </button>
        ))}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar alimento…"
          style={{ marginLeft: 'auto', minWidth: 180, flex: '0 1 220px' }}
        />
      </div>

      <p className="small" style={{ margin: '0 0 10px' }}>
        {foods.length} aliment{foods.length === 1 ? 'o' : 'os'} · leitura tradicional da MTC com o conteúdo
        completo do livro (indicações, aplicações e comentários em “Ver conteúdo do livro”). Referência do
        profissional; não converte padrão do paciente em recomendação nem em prescrição automática.
      </p>

      {foods.length === 0 ? (
        <p className="small">Nenhum alimento encontrado para este filtro.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {foods.map(food => (
            <FoodCard
              key={food.id}
              food={food}
              approved={isApproved(food.id)}
              onPropertyClick={setPropertyView}
            />
          ))}
        </div>
      )}

      {detailFood && (
        <FoodDetailDialog
          food={detailFood}
          approved={isApproved(detailFood.id)}
          onPropertyClick={setPropertyView}
          onClose={() => setDetailFood(null)}
        />
      )}

      {/* Renderizado por último para ficar acima do card em detalhe quando a
          profissional clica numa tag de dentro do modal de detalhe. */}
      {propertyView && (
        <PropertyCrossRefDialog
          property={propertyView}
          isBlocked={isBlocked}
          currentFoodId={detailFood?.id}
          onOpenFood={food => { setDetailFood(food); setPropertyView(null); }}
          onClose={() => setPropertyView(null)}
        />
      )}
    </div>
  );
}
