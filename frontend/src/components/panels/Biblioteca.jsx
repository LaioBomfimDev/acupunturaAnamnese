import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { bibliotecaData } from '../../data/bibliotecaData';

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
};

function getCategoryInfo(catName) {
  return CATEGORY_MAP[catName] || { icon: '📚', color: '#64748b' };
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
            {item.tags.split(',').map((tag, idx) => (
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

  // Obter categorias únicas existentes nos dados
  const uniqueCategories = [...new Set(bibliotecaData.map(item => item.cat))];

  /* filtro */
  const filtered = bibliotecaData.filter(it => {
    const matchCat = catFilter === 'Todos' || it.cat === catFilter;
    const searchLower = search.toLowerCase();
    const matchSearch = !search ||
      it.title.toLowerCase().includes(searchLower) ||
      it.txt.toLowerCase().includes(searchLower) ||
      it.tags.toLowerCase().includes(searchLower);
    return matchCat && matchSearch;
  });

  /* contagem por categoria */
  const counts = Object.fromEntries(uniqueCategories.map(c => [c, bibliotecaData.filter(i => i.cat === c).length]));

  return (
    <Panel title="Biblioteca Clínica Viva">

      {/* ── descrição da seção ─────────────────────────── */}
      <div className="box" style={{ marginBottom: 20 }}>
        Base de conhecimento integrada à plataforma Reability MTC. Pesquise por síndromes, órgãos, pontos, técnicas e protocolos de tratamento.
      </div>

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
          📚 Todos ({bibliotecaData.length})
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
