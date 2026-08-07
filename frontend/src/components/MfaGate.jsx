import { useMemo, useState } from 'react';

export function MfaGate({
  factors = [],
  onEnroll,
  onVerify,
  onSignOut,
}) {
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verifiedFactor = useMemo(
    () => factors.find(factor => factor.status === 'verified') || null,
    [factors],
  );

  async function handleEnroll() {
    setBusy(true);
    setError('');
    setCode('');
    try {
      setEnrollment(await onEnroll());
    } catch (nextError) {
      setError(nextError?.message || 'Não foi possível iniciar o segundo fator.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    const factorId = enrollment?.id || verifiedFactor?.id;
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      await onVerify(factorId, code);
    } catch (nextError) {
      setError(nextError?.message || 'Código inválido ou expirado.');
    } finally {
      setBusy(false);
    }
  }

  const qrCode = enrollment?.totp?.qr_code;
  const secret = enrollment?.totp?.secret;

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="mfa-title">
        <p className="small">Proteção de dados clínicos</p>
        <h1 id="mfa-title">Confirme o segundo fator</h1>

        {!verifiedFactor && !enrollment ? (
          <>
            <p>
              Esta conta exige autenticação em duas etapas. Use um aplicativo
              autenticador compatível com TOTP.
            </p>
            <button type="button" className="primary-button" onClick={handleEnroll} disabled={busy}>
              {busy ? 'Preparando...' : 'Cadastrar autenticador'}
            </button>
          </>
        ) : (
          <>
            {qrCode && (
              <div className="box" style={{ textAlign: 'center' }}>
                <p>Escaneie o QR Code no aplicativo autenticador.</p>
                <img
                  src={qrCode}
                  alt="QR Code para cadastrar o segundo fator"
                  style={{ width: 220, maxWidth: '100%' }}
                />
                {secret && (
                  <details>
                    <summary>Não consigo escanear</summary>
                    <p className="small">Digite esta chave manualmente no autenticador:</p>
                    <code style={{ overflowWrap: 'anywhere' }}>{secret}</code>
                  </details>
                )}
              </div>
            )}

            <form onSubmit={handleVerify}>
              <label htmlFor="mfa-code">Código de 6 dígitos</label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoFocus
              />
              {error && <div className="inline-error">{error}</div>}
              <button type="submit" className="primary-button" disabled={busy || code.length !== 6}>
                {busy ? 'Verificando...' : 'Verificar e continuar'}
              </button>
            </form>
            {verifiedFactor && (
              <details>
                <summary>Perdi acesso ao autenticador</summary>
                <p className="small">
                  Saia da conta e solicite ao SuperAdm a recuperação auditada
                  do segundo fator. O gate clínico continuará fechado e um
                  novo autenticador será exigido no próximo acesso.
                </p>
              </details>
            )}
          </>
        )}

        {error && !enrollment && !verifiedFactor && <div className="inline-error">{error}</div>}
        <button type="button" className="quiet-button" onClick={onSignOut} disabled={busy}>
          Sair da conta
        </button>
      </section>
    </main>
  );
}
