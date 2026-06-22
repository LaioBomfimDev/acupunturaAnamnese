import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../ui/Panel';
import { askLibrary, LIBRARY_AI_DISCLAIMER } from '../../services/libraryAiService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { getKnowledgeCategories, searchKnowledge } from '../../knowledge/searchIndex';
import { commonlyUsedPoints, isCommonlyUsedEntity } from '../../knowledge/commonlyUsedPoints';
import { docCorpusCards } from '../../knowledge/generated/doc-corpus';
import {
  getClinicalKnowledgeReviews,
} from '../../services/knowledgeAdminService';
import { isClinicallyActiveKnowledgeReview } from '../../knowledge/reviewSourcePolicy';
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
  'Aprovados locais': { icon: '✅', color: '#0f766e' },
  'Repertório':   { icon: '📘', color: '#0d9488' },
  'Regra clínica':{ icon: '🧭', color: '#b45309' },
};

function getCategoryInfo(catName) {
  return CATEGORY_MAP[catName] || { icon: '📚', color: '#64748b' };
}

function asSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
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
      borderTop: `3px solid ${item.cardColor || catInfo.color}`,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 24, paddingTop: 2 }}>{catInfo.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', color: 'var(--navy)', fontSize: 18, fontWeight: 700 }}>
            {item.title}
          </p>
          <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ 
              fontSize: 11, fontWeight: 'bold', color: catInfo.color, 
              border: `1px solid ${catInfo.color}40`, background: `${catInfo.color}15`,
              borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase'
            }}>
              {item.cat}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 'bold',
              color: item.confidence === 'high' ? '#137333' : (item.confidence === 'medium' ? '#b06000' : '#c5221f'),
              background: item.confidence === 'high' ? '#e6f4ea' : (item.confidence === 'medium' ? '#fef7e0' : '#fce8e6'),
              border: `1px solid ${item.confidence === 'high' ? '#137333' : (item.confidence === 'medium' ? '#b06000' : '#c5221f')}40`,
              borderRadius: 999, padding: '2px 8px'
            }}>
              {item.statusLabel}
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

/* ── Pergunte à Biblioteca (IA, Fase 4) ──────────────────────────────── */
function LibraryAsk({ cards }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleAsk() {
    if (!question.trim() || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await askLibrary(question, cards);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Falha ao consultar a Biblioteca.');
    } finally {
      setLoading(false);
    }
  }

  const isMock = result?.modelVersion?.startsWith('mock');

  return (
    <div className="box" style={{ marginBottom: 20, borderColor: 'var(--gold)' }}>
      <b>Pergunte à Biblioteca (IA)</b>
      <p className="small" style={{ margin: '4px 0 10px' }}>{LIBRARY_AI_DISCLAIMER}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAsk(); } }}
          placeholder="Ex.: quais pontos para insônia com calor no Coração?"
          style={{ flex: '1 1 260px', borderRadius: 12, border: '1px solid var(--line)', padding: '10px 14px', fontSize: 14 }}
        />
        <button type="button" className="ai-analyze-btn" style={{ margin: 0, whiteSpace: 'nowrap' }} disabled={loading || !question.trim()} onClick={handleAsk}>
          {loading ? 'Consultando…' : '✦ Perguntar'}
        </button>
      </div>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 12 }}>
          {result.warning && <div className="alert" style={{ marginBottom: 8 }}>{result.warning}</div>}
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#1f2937' }}>{result.answer}</p>
          {result.citations?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span className="small"><b>Fontes citadas:</b></span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {result.citations.map((c, i) => (
                  <span key={i} style={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 999, padding: '3px 8px', background: 'var(--soft)' }}>{c}</span>
                ))}
              </div>
            </div>
          )}
          <p className="small" style={{ marginTop: 8, color: '#94a3b8' }}>
            {result.usedCount > 0 ? `${result.usedCount} item(ns) da base consultado(s). ` : ''}
            Modelo: {result.modelVersion}{isMock ? ' (simulado)' : ''}.
          </p>
          <div className="deepdive-correct-row">
            <AiCorrectionButton
              surface={AI_SURFACES.LIBRARY_QA}
              aiOutput={{ answer: result.answer, citations: result.citations }}
              contextSnapshot={{ question }}
              modelVersion={result.modelVersion}
              label="✎ Corrigir a resposta"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function Biblioteca() {
  const [confidenceTab, setConfidenceTab] = useState('high'); // 'high' | 'medium' | 'low'
  const [catFilter, setCatFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [knowledgeReviews, setKnowledgeReviews] = useState([]);
  const [reviewsLoadState, setReviewsLoadState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    getClinicalKnowledgeReviews()
      .then(reviews => {
        if (cancelled) return;
        setKnowledgeReviews(reviews);
        setReviewsLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setKnowledgeReviews([]);
        setReviewsLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Cards da base estática curada (todos alta confiança)
  const curatedCards = useMemo(() => {
    const categories = getKnowledgeCategories();
    return categories.flatMap(cat =>
      searchKnowledge({ category: cat }).map(item => ({
        id: item.id || `static:${item.code || item.name}`,
        cat,
        title: item.name || item.title || item.code || '',
        confidence: 'high',
        statusLabel: '✅ Seguro para Uso Clínico',
        cardColor: '#10b981',
        tags: [
          item.code,
          item.displayCode,
          ...(item.tags || []),
          item.category,
        ].filter(Boolean).join(', '),
        source: item.sources?.map(s => s.label).join(', ') || 'Base Curada',
        txt: item.summary || item.description || item.detail?.root || item.locationText || '',
        entity: item,
      }))
    );
  }, []);

  // 2. Cards dos reviews (enriquecidos) classificados por confiança
  const reviewCards = useMemo(() => {
    return knowledgeReviews.filter(isClinicallyActiveKnowledgeReview).map(review => {
      const actions = Array.isArray(review.actions) ? review.actions : asList(review.actions);
      const indications = Array.isArray(review.indications) ? review.indications : asList(review.indications);
      const cautions = Array.isArray(review.cautions) ? review.cautions : asList(review.cautions);
      const displayCode = review.displayCode || review.code || review.atlasName || 'Ponto';

      let statusLabel = 'Seguro para Uso Clínico';
      let confidence = 'high';
      let cardColor = '#10b981';

      if (review.clinicalActivationBlocked) {
        statusLabel = 'Rascunho separado';
        confidence = 'medium';
        cardColor = '#f59e0b';
      } else if (review.status === 'pending_atlas_review' || review.status === 'review') {
        statusLabel = 'Em revisão de fonte';
        confidence = 'medium';
        cardColor = '#f59e0b';
      } else if (review.status === 'draft_low' || review.status === 'draft') {
        statusLabel = 'Rascunho bruto - não seguro';
        confidence = 'low';
        cardColor = '#f97316';
      }

      const category = review.category === 'auriculo' ? 'Aurículo' : 'Ponto';

      return {
        id: `${review.id || review.code}:review`,
        cat: category,
        title: review.title || `${displayCode} - ${review.names?.pt || ''}`,
        confidence,
        statusLabel,
        cardColor,
        tags: [
          review.code,
          review.displayCode,
          review.atlasName,
          ...(Array.isArray(review.aliases) ? review.aliases : []),
          review.meridianCode,
          review.meridian,
          ...actions,
          ...indications,
        ].filter(Boolean).join(', '),
        source: review.approvalSource || review.source || 'Biblioteca Viva',
        txt: [
          review.locationText ? `Localização: ${review.locationText}` : '',
          actions.length ? `Funções: ${actions.slice(0, 4).join(', ')}.` : '',
          indications.length ? `Indicações: ${indications.slice(0, 5).join(', ')}.` : '',
          cautions.length ? `Cautelas: ${cautions.slice(0, 3).join(', ')}.` : '',
        ].filter(Boolean).join(' '),
        entity: review,
      };
    });
  }, [knowledgeReviews]);

  // Unifica os cards clínicos. Rascunhos KM-Agent/PDF ficam separados no SuperAdm
  // e nao entram na Biblioteca clínica comum nem no contexto da IA da Biblioteca.
  // Os chunks da documentação curada (Repertório/Regra clínica) entram como
  // confiança média: ficam navegáveis e disponíveis ao "Pergunte à Biblioteca".
  const allCards = useMemo(() => {
    const pointCategories = new Set(['Ponto', 'Aurículo']);
    return [...curatedCards, ...reviewCards, ...docCorpusCards]
      .filter(card => !pointCategories.has(card.cat) || isCommonlyUsedEntity(card.entity));
  }, [curatedCards, reviewCards]);

  // Contagens por aba de confiança
  const highCount = useMemo(() => allCards.filter(c => c.confidence === 'high').length, [allCards]);
  const mediumCount = useMemo(() => allCards.filter(c => c.confidence === 'medium').length, [allCards]);
  const lowCount = useMemo(() => allCards.filter(c => c.confidence === 'low').length, [allCards]);

  // Cards da aba ativa
  const cardsByConfidence = useMemo(() => {
    return allCards.filter(c => c.confidence === confidenceTab);
  }, [allCards, confidenceTab]);

  // Categorias disponíveis na aba ativa
  const uniqueCategories = useMemo(() => {
    return [...new Set(cardsByConfidence.map(c => c.cat))].sort();
  }, [cardsByConfidence]);

  // Filtro de pesquisa e categoria
  const filtered = useMemo(() => {
    return cardsByConfidence.filter(item => {
      const categoryMatches = catFilter === 'Todos' || item.cat === catFilter;
      if (!categoryMatches) return false;
      if (!search.trim()) return true;
      return asSearchText([item.title, item.txt, item.tags, item.source].join(' ')).includes(asSearchText(search));
    });
  }, [cardsByConfidence, catFilter, search]);

  // Contagem por categoria na aba ativa
  const counts = useMemo(() => {
    return uniqueCategories.reduce((acc, cat) => {
      acc[cat] = cardsByConfidence.filter(c => c.cat === cat).length;
      return acc;
    }, {});
  }, [cardsByConfidence, uniqueCategories]);

  return (
    <Panel title="Biblioteca Clínica Viva">

      {/* ── descrição da seção ─────────────────────────── */}
      <div className="box" style={{ marginBottom: 20 }}>
        Base consultável integrada ao raciocínio clínico: {highCount} itens seguros para uso clínico, {mediumCount} em revisão de fonte e {lowCount} rascunhos brutos sem uso clínico automático até revisão profissional do SuperAdm.
        {' '}Os pontos exibidos aqui pertencem à categoria <b>Pontos comumente usados</b> ({commonlyUsedPoints.length} pontos validados clinicamente); a biblioteca completa permanece editável no SuperAdm.
        {reviewsLoadState === 'error' && <span> As aprovações locais não carregaram nesta sessão.</span>}
      </div>

      <LibraryAsk cards={allCards} />

      {/* ── Abas de Nível de Confiança de Uso Clínico ───────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--line)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => { setConfidenceTab('high'); setCatFilter('Todos'); }}
          style={{
            background: confidenceTab === 'high' ? '#e6f4ea' : 'transparent',
            color: confidenceTab === 'high' ? '#137333' : 'var(--navy)',
            border: confidenceTab === 'high' ? '1px solid #137333' : '1px solid var(--line)',
            borderRadius: 12, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13
          }}
        >
          🟢 Seguro para Uso Clínico ({highCount})
        </button>
        <button
          onClick={() => { setConfidenceTab('medium'); setCatFilter('Todos'); }}
          style={{
            background: confidenceTab === 'medium' ? '#fef7e0' : 'transparent',
            color: confidenceTab === 'medium' ? '#b06000' : 'var(--navy)',
            border: confidenceTab === 'medium' ? '1px solid #b06000' : '1px solid var(--line)',
            borderRadius: 12, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13
          }}
        >
          🟡 Em Revisão de Fonte ({mediumCount})
        </button>
        <button
          onClick={() => { setConfidenceTab('low'); setCatFilter('Todos'); }}
          style={{
            background: confidenceTab === 'low' ? '#fce8e6' : 'transparent',
            color: confidenceTab === 'low' ? '#c5221f' : 'var(--navy)',
            border: confidenceTab === 'low' ? '1px solid #c5221f' : '1px solid var(--line)',
            borderRadius: 12, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13
          }}
        >
          🟠 Rascunhos Brutos ({lowCount})
        </button>
      </div>

      <MapCoordinateEditor />

      {/* ── busca ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 18 }}>
        <input
          placeholder="🔍 Buscar por título, conteúdo ou tags (ex: baço, ansiedade, E36)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ borderRadius: 12, border: '1px solid var(--line)', padding: '12px 16px', fontSize: 14 }}
        />
      </div>

      {/* ── filtro de categorias ───────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button
          className={`tag${catFilter === 'Todos' ? ' active' : ''}`}
          onClick={() => setCatFilter('Todos')}
          style={catFilter === 'Todos' ? { background: 'var(--navy)', color: 'white', borderColor: 'var(--navy)' } : {}}
        >
          📚 Todos ({cardsByConfidence.length})
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
            <p style={{ margin: '12px 0 0', fontSize: 15 }}>
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
