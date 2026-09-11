// ============================================================
// Home administrativa (Fase 7) — tela inicial de conta clinic_admin
// SEM disciplina própria (administração pura, não atende). Diferente
// do DisciplineHub: não mostra nenhum card de disciplina — a agenda
// completa da clínica e os atendimentos aguardando evolução (que já
// vêm clínica-inteira automaticamente pra clinic_admin, via RLS) são
// os atalhos principais, não secundários.
//
// Admin COM disciplina própria continua caindo no DisciplineHub normal
// (ver App.jsx) — esta tela é só pra quem não tem nenhuma área liberada.
// ============================================================

export function ClinicAdminHome({
  profile, therapistName, onSignOut,
  onOpenAgenda, onOpenPendingEvolutions, onOpenGestao, onOpenClinicPatients, onOpenDocuments,
}) {
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Vitalis';

  return (
    <div className="hub-screen">
      <header className="hub-topbar">
        <div className="hub-brand">
          <span className="hub-wordmark">Vitalis</span>
          <h1>{clinicName}</h1>
          <p>Administração da instituição</p>
        </div>
        <button type="button" className="topbar-button" onClick={onSignOut}>Sair</button>
      </header>

      <main className="hub-body">
        <p className="hub-greeting">Oi, {therapistName || 'administrador'}</p>
        <h2>Visão geral da clínica</h2>
        <p className="hub-note">
          Sua conta não tem área de atendimento própria — aqui você acompanha a agenda e os pendentes
          de toda a equipe, não só os seus.
        </p>

        <div className="hub-tools">
          {onOpenAgenda && (
            <button type="button" className="hub-secondary" onClick={onOpenAgenda}>
              <b>Agenda completa →</b>
              <span>Calendário de todos os profissionais da clínica, status do dia e aniversários dos pacientes.</span>
            </button>
          )}

          {onOpenPendingEvolutions && (
            <button type="button" className="hub-secondary" onClick={onOpenPendingEvolutions}>
              <b>Atendimentos aguardando evolução →</b>
              <span>Pendências de toda a equipe, não só as suas — atendido, faltou ou falta justificada.</span>
            </button>
          )}

          {onOpenClinicPatients && (
            <button type="button" className="hub-secondary" onClick={onOpenClinicPatients}>
              <b>Pacientes da instituição →</b>
              <span>Cadastro central, matrículas por área e ficha completa de cada paciente.</span>
            </button>
          )}

          {onOpenGestao && (
            <button type="button" className="hub-secondary" onClick={onOpenGestao}>
              <b>Gestão →</b>
              <span>Relatórios operacionais da clínica: faltosos e o que vier depois.</span>
            </button>
          )}

          {onOpenDocuments && (
            <button type="button" className="hub-secondary" onClick={onOpenDocuments}>
              <b>Documentos timbrados →</b>
              <span>Envie um Word (.docx) e receba o documento no papel timbrado da instituição.</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
