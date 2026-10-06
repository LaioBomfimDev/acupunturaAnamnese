import { TOOL_GLYPHS } from './ui/hubGlyphs';

// ============================================================
// Navegação do hub no celular (opção C, escolhida em 04/10/2026)
//
// No celular e no tablet (≤ 1024px; tablet é celular grande, desde
// 05/10/2026) o topo das telas do hub — Agenda, Evoluções,
// Pacientes, Gestão, Documentos — só diz onde a pessoa está. Ir de uma
// para outra é a barra de baixo (HubDock), no alcance do polegar; o
// "Voltar às áreas" some porque "Início" está na barra. O voltar de
// tela dentro de tela (Ficha → lista, Evolução → ficha, editores da
// Agenda) vira uma faixa logo acima da barra, com o texto inteiro.
//
// No computador nada muda: o mesmo botão continua no topo. Quem decide
// o que aparece em cada largura é o CSS (styles/hub.css), não o JSX —
// assim o botão é um só e não há dois caminhos para manter.
// ============================================================

// `nested`: volta para a tela de cima dentro da mesma seção (vira a
// faixa no celular). Sem ele, volta para as áreas e some no celular.
export function HubBackButton({ label, onClick, nested = false, className = 'topbar-button' }) {
  return (
    <button
      type="button"
      className={`${className} hub-back${nested ? ' hub-back--nested' : ''}`}
      onClick={onClick}
    >
      <span className="hub-back-arrow" aria-hidden="true">←</span> {label}
    </button>
  );
}

// Ordem fixa; entram os cinco primeiros destinos que o perfil tem. Com
// seis, o rótulo deixa de caber em 375px de largura. Documentos (só
// profissional e recepção) é o que fica de fora para o profissional, e
// continua na tela inicial.
const MAX_DOCK_ITEMS = 5;

export function HubDock({
  active,
  onHome,
  onOpenAgenda,
  onOpenEvolutions,
  onOpenPatients,
  onOpenGestao,
  onOpenDocuments,
  pendingEvolutionsCount = 0,
}) {
  const items = [
    { id: 'inicio', label: 'Início', onClick: onHome },
    { id: 'agenda', label: 'Agenda', onClick: onOpenAgenda },
    { id: 'evolucao', label: 'Evoluções', onClick: onOpenEvolutions, count: pendingEvolutionsCount },
    { id: 'pacientes', label: 'Pacientes', onClick: onOpenPatients },
    { id: 'gestao', label: 'Gestão', onClick: onOpenGestao },
    { id: 'documentos', label: 'Documentos', onClick: onOpenDocuments },
  ].filter(item => item.onClick).slice(0, MAX_DOCK_ITEMS);

  return (
    <nav className="hub-dock no-print" aria-label="Navegação da instituição">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className="hub-dock-item"
          aria-current={item.id === active ? 'page' : undefined}
          onClick={item.onClick}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {TOOL_GLYPHS[item.id]}
          </svg>
          <span>{item.label}</span>
          {item.count > 0 && (
            <b className="hub-dock-count">
              <span className="sr-only">pendentes: </span>
              {item.count > 99 ? '99+' : item.count}
            </b>
          )}
        </button>
      ))}
    </nav>
  );
}
