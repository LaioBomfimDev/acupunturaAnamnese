import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../ui/Panel';
import { getKnowledgeCategories, getKnowledgeStats, searchKnowledge } from '../../knowledge/searchIndex';
import { KM_AGENT_DRAFT_INDEX_URL, getKmAgentDraftStats, getKmAgentDraftTitlePtBr } from '../../knowledge/kmAgentDrafts';
import { MapCoordinateEditor } from './MapCoordinateEditor';

/* ── Mapeamento de Categorias ──────────────────────────────────────────── */
const CATEGORY_MAP = {
  'Síndrome': { icon: '🌀', color: '#7c3aed' },
  'Órgão':    { icon: '🏮', color: '#dc2626' },
  'Técnica':  { icon: '🛠️', color: '#0ea5e9' },
  'Ponto':    { icon: '📍', color: '#10b981' },
  'Aurículo': { icon: '👂', color: '#f59e0b' },
  'Segurança':{ icon: '⚠️', color: '#ef4444' },
  'Relatório':{ icon: '📄', color: '#6366f1' },
  'Evolução': { icon: '📈', color: '#8b5cf6' },
  'Mapa':     { icon: '🗺️', color: '#0891b2' },
  'Rascunhos KM-Agent': { icon: '🧬', color: '#475569' },
};

const KM_AGENT_DRAFT_CATEGORY = 'Rascunhos KM-Agent';

function getCategoryInfo(catName) {
  return CATEGORY_MAP[catName] || { icon: '📚', color: '#64748b' };
}

function asSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function kmAgentDraftToCard(item) {
  return {
    id: `${item.id}:draft`,
    cat: KM_AGENT_DRAFT_CATEGORY,
    title: getKmAgentDraftTitlePtBr(item),
    tags: [
      item.code,
      item.displayCode,
      item.metadata?.meridianCode,
      item.metadata?.meridian,
      item.names?.ko,
      item.names?.zh,
      item.names?.en,
      'rascunho',
      'KM-Agent',
    ].filter(Boolean).join(', '),
    source: 'KM-Agent data/acupoints.csv',
    txt: [
      'Rascunho importado. Exige revisão profissional antes de uso clínico.',
      item.locationPreview ? `Localização: ${item.locationPreview}` : '',
      item.needlingPreview ? `Needling: ${item.needlingPreview}` : '',
    ].filter(Boolean).join(' '),
    entity: item,
    approvalStatus: 'draft',
  };
}

function filterCards(cards, { query, category }) {
  const normalizedQuery = asSearchText(query);
  return cards.filter(item => {
    const categoryMatches = category === 'Todos' || item.cat === category;
    if (!categoryMatches) return false;
    if (!normalizedQuery) return true;
    return asSearchText([item.title, item.txt, item.tags, item.source].join(' ')).includes(normalizedQuery);
  });
}

/* ── Componente de Tag (Chip) ───────────────────────────────────────── */
function Chip({ children }) {
  return (
    <span style={{
      fontSize: 11, border: '1px solid var(--line)', borderRadius: 999,
      padding: '3px 8px', background: 'var(--soft)', marginRight: 4,
      display: 'inline-block', marginBottom: 4
    }}>
      {children}
    </span>
  );
}

/* ── Card de Informação ─────────────────────────────────────────────── */
function KnowledgeCard({ item }) {
  const catInfo = getCategoryInfo(item.cat);

  return (
    <div className="lib-card" style={{
      border: '1px solid var(--line)', background: 'white',
      borderRadius: 18, padding: 16, position: 'relative',
      borderTop: `3px solid ${catInfo.color}`,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 24, paddingTop: 2 }}>{catInfo.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', color: 'var(--navy)', fontSize: 18, fontWeight: 700 }}>
            {item.title}
          </p>
          <div style={{ marginBottom: 10 }}>
            <span style={{ 
              fontSize: 11, fontWeight: 'bold', color: catInfo.color, 
              border: `1px solid ${catInfo.color}40`, background: `${catInfo.color}15`,
              borderRadius: 999, padding: '2px 8px', marginRight: 8, textTransform: 'uppercase'
            }}>
              {item.cat}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Fonte: {item.source}
            </span>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
            {item.txt}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {String(item.tags || '').split(',').filter(Boolean).map((tag, idx) => (
              <Chip key={idx}>#{tag.trim()}</Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Componente Principal ────────────────────────────────── */
export function Biblioteca() {
  const [catFilter, setCatFilter] = useState('Todos');
  const [search,    setSearch]    = useState('');
  const [kmAgentDrafts, setKmAgentDrafts] = useState([]);
  const [kmAgentLoadState, setKmAgentLoadState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    fetch(KM_AGENT_DRAFT_INDEX_URL)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        setKmAgentDrafts(Array.isArray(data) ? data : []);
        setKmAgentLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setKmAgentDrafts([]);
        setKmAgentLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const draftCards = useMemo(() => kmAgentDrafts.map(kmAgentDraftToCard), [kmAgentDrafts]);
  const curatedCategories = getKnowledgeCategories();
  const uniqueCategories = draftCards.length
    ? [...curatedCategories, KM_AGENT_DRAFT_CATEGORY]
    : curatedCategories;
  const stats = getKnowledgeStats();
  const kmAgentStats = getKmAgentDraftStats(kmAgentDrafts);

  /* filtro */
  const curatedFiltered = catFilter === KM_AGENT_DRAFT_CATEGORY
    ? []
    : searchKnowledge({ query: search, category: catFilter });
  const draftFiltered = filterCards(draftCards, { query: search, category: catFilter });
  const filtered = [...curatedFiltered, ...draftFiltered];

  /* contagem por categoria */
  const counts = Object.fromEntries(uniqueCategories.map(c => {
    if (c === KM_AGENT_DRAFT_CATEGORY) return [c, draftCards.length];
    return [c, searchKnowledge({ category: c }).length];
  }));
  const totalCards = stats.total + kmAgentStats.total;

  return (
    <Panel title="Biblioteca Clínica Viva">

      {/* ── descrição da seção ─────────────────────────── */}
      <div className="box" style={{ marginBottom: 20 }}>
        Base consultável integrada ao raciocínio clínico: {stats.acupoints} pontos sistêmicos curados, {stats.auricular} pontos auriculares, {stats.patterns} síndromes e {stats.techniques} técnicas. Também há {kmAgentStats.total || '...'} pontos do KM-Agent em rascunho{kmAgentStats.meridians ? `, cobrindo ${kmAgentStats.meridians} meridianos/categorias` : ''}, sem uso clínico automático até revisão profissional.
        {kmAgentLoadState === 'error' && <span> A base KM-Agent não carregou nesta sessão.</span>}
      </div>

      <MapCoordinateEditor />

      {/* ── busca ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 18 }}>
        <input
          placeholder="🔍 Buscar por título, conteúdo ou tags (ex: baço, ansiedade, E36)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ borderRadius: 12, border: '1px solid var(--line)', padding: '12px 16px', fontSize: 15 }}
        />
      </div>

      {/* ── filtro de categorias ───────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button
          className={`tag${catFilter === 'Todos' ? ' active' : ''}`}
          onClick={() => setCatFilter('Todos')}
          style={catFilter === 'Todos' ? { background: 'var(--navy)', color: 'white', borderColor: 'var(--navy)' } : {}}
        >
          📚 Todos ({totalCards})
        </button>
        {uniqueCategories.map(cat => {
          const info = getCategoryInfo(cat);
          const isActive = catFilter === cat;
          return (
            <button
              key={cat}
              className={`tag${isActive ? ' active' : ''}`}
              onClick={() => setCatFilter(cat)}
              style={isActive ? { background: info.color, borderColor: info.color, color: 'white' } : {}}
            >
              {info.icon} {cat} ({counts[cat]})
            </button>
          );
        })}
      </div>

      {/* ── lista de materiais ─────────────────────────── */}
      <div>
        {filtered.length === 0 ? (
          <div className="box" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <p style={{ fontSize: 32, margin: 0 }}>📭</p>
            <p style={{ margin: '12px 0 0', fontSize: 16 }}>
              {search ? `Nenhum resultado encontrado para "${search}"` : 'Nenhum material nesta categoria.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
            {filtered.map((item, idx) => (
              <KnowledgeCard key={idx} item={item} />
            ))}
          </div>
        )}
      </div>

    </Panel>
  );
}
