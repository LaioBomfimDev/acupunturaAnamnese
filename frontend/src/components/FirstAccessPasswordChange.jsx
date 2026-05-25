import { useMemo, useState } from 'react';

function getPasswordChecks(password, profile) {
  const lower = password.toLowerCase();
  const blocked = ['123456', '654321', 'password', 'senha', 'qwerty', 'admin', 'superadm'];
  const personal = [
    profile?.email,
    profile?.username,
    profile?.full_name,
  ]
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => item.length >= 4);

  return [
    { label: '8 caracteres ou mais', ok: password.length >= 8 },
    { label: 'letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'letra minúscula', ok: /[a-z]/.test(password) },
    { label: 'número', ok: /[0-9]/.test(password) },
    { label: 'sem sequências óbvias', ok: !blocked.some(item => lower.includes(item)) },
    { label: 'sem dados do usuário', ok: !personal.some(item => lower.includes(item)) },
  ];
}

export function FirstAccessPasswordChange({ profile, onSubmit, onSignOut }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const checks = useMemo(() => getPasswordChecks(password, profile), [password, profile]);
  const isValid = checks.every(check => check.ok) && password === confirmPassword && confirmPassword.length > 0;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!isValid) {
      setError('Crie uma senha forte e confirme exatamente igual.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit(password, confirmPassword);
    } catch (err) {
      setError(err.message || 'Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="force-password-screen">
      <section className="force-password-modal" role="dialog" aria-modal="true" aria-labelledby="force-password-title">
        <div className="force-password-head">
          <p>Primeiro acesso</p>
          <h1 id="force-password-title">Troque sua senha temporária</h1>
          <span>{profile?.full_name || profile?.email}</span>
        </div>

        {error && <div className="inline-error">{error}</div>}

        <form onSubmit={handleSubmit} className="force-password-form">
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={saving}
              autoFocus
            />
          </label>

          <label>
            Confirmar nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              disabled={saving}
            />
          </label>

          <div className="password-checks">
            {checks.map(check => (
              <span key={check.label} className={check.ok ? 'ok' : ''}>
                {check.ok ? '✓' : '•'} {check.label}
              </span>
            ))}
            <span className={password && password === confirmPassword ? 'ok' : ''}>
              {password && password === confirmPassword ? '✓' : '•'} confirmação igual
            </span>
          </div>

          <div className="force-password-actions">
            <button className="primary-button" type="submit" disabled={saving || !isValid}>
              {saving ? 'Alterando...' : 'Alterar senha e entrar'}
            </button>
            <button className="quiet-button" type="button" onClick={onSignOut} disabled={saving}>
              Sair
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
