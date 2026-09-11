// Atalhos "Da instituição" do Hub (DisciplineHub e ClinicAdminHome).
//
// Redesenho aprovado 2026-09-11 (referência visual: Proposta B) — os 5
// atalhos tinham peso visual idêntico, mas o uso real não é: Agenda e
// Evolução pendente resolvem uma tarefa do dia a dia; Gestão, Pacientes
// e Documentos timbrados são consultados bem mais raro. `primary: true`
// vira um cartão maior com ícone e descrição; o resto vira uma linha
// compacta (ícone + rótulo, descrição só no title).
const TOOL_ICONS = {
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h2M8 17h2M14 14h2M14 17h2" />
    </>
  ),
  evolucao: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  gestao: (
    <>
      <path d="M4 19h16" />
      <rect x="6" y="11" width="3" height="8" />
      <rect x="11" y="6" width="3" height="13" />
      <rect x="16" y="14" width="3" height="5" />
    </>
  ),
  pacientes: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 9.5a3 3 0 1 0 0-6" />
      <path d="M15 14.5c2.8.4 4.8 1.9 5.5 4" />
    </>
  ),
  documentos: (
    <>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </>
  ),
};

function ToolIcon({ id }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TOOL_ICONS[id]}
    </svg>
  );
}

export function InstitutionShortcuts({ tools }) {
  const items = tools.filter(Boolean);
  if (items.length === 0) return null;

  const primary = items.filter(tool => tool.primary);
  const secondary = items.filter(tool => !tool.primary);

  return (
    <>
      {primary.length > 0 && (
        <div className="hub-tools-primary">
          {primary.map(tool => (
            <button key={tool.id} type="button" className="hub-tool-primary" onClick={tool.onClick}>
              <span className="hub-tool-icon"><ToolIcon id={tool.icon} /></span>
              <span className="hub-tool-primary-text">
                <b>{tool.title}</b>
                <span>{tool.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {secondary.length > 0 && (
        <div className="hub-tools-secondary">
          {secondary.map(tool => (
            <button key={tool.id} type="button" className="hub-tool-row" onClick={tool.onClick} title={tool.description}>
              <ToolIcon id={tool.icon} />
              <span>{tool.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
