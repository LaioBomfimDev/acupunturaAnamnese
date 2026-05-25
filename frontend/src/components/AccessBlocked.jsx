export function AccessBlocked({ profile, profileError, onSignOut }) {
  return (
    <div className="force-password-screen">
      <section className="force-password-modal" role="alertdialog" aria-modal="true">
        <div className="force-password-head">
          <p>Acesso bloqueado</p>
          <h1>Usuário sem liberação ativa</h1>
          <span>{profile?.email || profileError || 'Perfil não disponível'}</span>
        </div>
        <div className="alert">
          Este acesso está suspenso ou o perfil não pôde ser validado com segurança.
        </div>
        <button className="primary-button" type="button" onClick={onSignOut}>
          Sair
        </button>
      </section>
    </div>
  );
}
