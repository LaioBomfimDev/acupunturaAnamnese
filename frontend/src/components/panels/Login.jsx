import { useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';

export function Login() {
  const { signInWithPassword } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }
    if (!acceptedTerms) {
      setError('Para acessar, confirme a ciência sobre uso profissional e confidencialidade dos dados.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signInWithPassword(username, password);
    } catch (err) {
      console.error('Falha de login:', err);
      // Traduzir erros comuns do Supabase
      if (err.message && (err.message.includes('Invalid login credentials') || err.message.includes('invalid_credentials'))) {
        setError('Usuário ou senha incorretos.');
      } else {
        setError(err.message || 'Ocorreu um erro ao conectar ao servidor.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%)', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ 
        background: 'white', 
        padding: '40px 30px', 
        borderRadius: '24px', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.06)', 
        maxWidth: '420px', 
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid rgba(212, 168, 83, 0.15)' // Borda dourada muito sutil
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ 
            fontFamily: 'Georgia, serif', 
            color: 'var(--gold, #d4a853)', 
            margin: '0 0 8px', 
            fontSize: '32px',
            fontWeight: 'normal' 
          }}>
            Sistema Acup
          </h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '15px' }}>Plataforma Clínica Integrativa</p>
        </div>

        {error && (
          <div style={{ 
            background: '#fef2f2', 
            border: '1px solid #fecaca', 
            color: '#dc2626', 
            padding: '12px 16px', 
            borderRadius: '12px', 
            fontSize: '13px', 
            marginBottom: '20px',
            textAlign: 'center',
            fontWeight: 500
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '12px', 
              fontWeight: '600', 
              color: '#475569', 
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Usuário ou E-mail
            </label>
            <input 
              type="text" 
              placeholder="Ex: admLaio"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                background: loading ? '#f1f5f9' : 'white'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--gold, #d4a853)'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '12px', 
              fontWeight: '600', 
              color: '#475569', 
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Senha
            </label>
            <input 
              type="password" 
              placeholder="Digite sua senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                background: loading ? '#f1f5f9' : 'white'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--gold, #d4a853)'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          <label style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            color: '#475569',
            fontSize: '12px',
            lineHeight: 1.45,
            fontWeight: 500
          }}>
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
              disabled={loading}
              style={{
                width: '16px',
                height: '16px',
                margin: '2px 0 0',
                flex: '0 0 auto'
              }}
            />
            <span>
              Li e aceito o uso profissional, confidencial e responsável dos dados clínicos.{' '}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: 'var(--gold, #d4a853)',
                  padding: 0,
                  cursor: 'pointer',
                  font: 'inherit',
                  fontWeight: 700
                }}
              >
                Ver termo
              </button>
            </span>
          </label>

          <button 
            type="submit"
            disabled={loading || !acceptedTerms}
            style={{
              background: 'var(--navy, #0c1f3f)', 
              color: 'white', 
              border: 'none', 
              padding: '14px 20px', 
              borderRadius: '12px', 
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading || !acceptedTerms ? 'not-allowed' : 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'background 0.2s, transform 0.1s',
              marginTop: '10px',
              opacity: loading || !acceptedTerms ? 0.65 : 1
            }}
            onMouseOver={(e) => { if (!loading && acceptedTerms) e.target.style.background = '#0a2a4d'; }}
            onMouseOut={(e) => { if (!loading && acceptedTerms) e.target.style.background = 'var(--navy, #0c1f3f)'; }}
            onMouseDown={(e) => { if (!loading && acceptedTerms) e.target.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { if (!loading && acceptedTerms) e.target.style.transform = 'scale(1)'; }}
          >
            {loading ? 'Entrando...' : 'Entrar na Plataforma'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowSecurityInfo(true)}
          style={{
          marginTop: '25px', 
          paddingTop: '15px', 
          borderTop: '1px solid #f1f5f9', 
            borderRight: 0,
            borderBottom: 0,
            borderLeft: 0,
            background: 'transparent',
            textAlign: 'center',
            width: '100%',
            cursor: 'pointer',
            font: 'inherit'
        }}>
          <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#94a3b8' }}>
            Plataforma Segura • Conformidade LGPD
          </p>
          <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1' }}>
            Acesso administrativo reservado
          </p>
        </button>
      </div>

      {showTerms && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-title"
          onClick={() => setShowTerms(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 26, 49, 0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 1000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '560px',
              boxShadow: '0 24px 70px rgba(6, 26, 49, 0.28)',
              border: '1px solid rgba(212, 168, 83, 0.18)',
              overflow: 'hidden'
            }}
          >
            <div style={{
              background: 'var(--navy, #061a31)',
              color: 'white',
              padding: '20px 22px'
            }}>
              <p style={{
                margin: '0 0 6px',
                color: 'var(--gold-2, #f0bd53)',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.7px'
              }}>
                Termo de uso
              </p>
              <h2 id="terms-title" style={{
                margin: 0,
                fontFamily: 'Georgia, serif',
                fontSize: '24px',
                lineHeight: 1.15
              }}>
                Confidencialidade e responsabilidade profissional
              </h2>
            </div>

            <div style={{ padding: '22px', color: '#0f2742' }}>
              {[
                'O acesso é pessoal, identificado e destinado apenas a profissionais autorizados.',
                'Informações de pacientes, anamnese, evolução e conduta são dados sensíveis e devem ser tratados com sigilo.',
                'O usuário se compromete a registrar dados necessários ao atendimento e a não compartilhar credenciais.',
                'O sistema apoia organização e raciocínio clínico, mas não substitui avaliação, responsabilidade técnica e conduta profissional.',
                'Ao entrar, o usuário declara ciência das boas práticas de confidencialidade, segurança e finalidade de uso alinhadas à LGPD.'
              ].map(item => (
                <p key={item} style={{
                  margin: '0 0 12px',
                  lineHeight: 1.55,
                  fontSize: '14px'
                }}>
                  {item}
                </p>
              ))}

              <button
                type="button"
                onClick={() => {
                  setAcceptedTerms(true);
                  setShowTerms(false);
                }}
                style={{
                  background: 'var(--navy, #0c1f3f)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%',
                  marginTop: '8px'
                }}
              >
                Li e aceito
              </button>
            </div>
          </div>
        </div>
      )}

      {showSecurityInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="security-info-title"
          onClick={() => setShowSecurityInfo(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 26, 49, 0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 1000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 24px 70px rgba(6, 26, 49, 0.28)',
              border: '1px solid rgba(212, 168, 83, 0.18)',
              overflow: 'hidden'
            }}
          >
            <div style={{
              background: 'var(--navy, #061a31)',
              color: 'white',
              padding: '20px 22px'
            }}>
              <p style={{
                margin: '0 0 6px',
                color: 'var(--gold-2, #f0bd53)',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.7px'
              }}>
                Segurança e confiança
              </p>
              <h2 id="security-info-title" style={{
                margin: 0,
                fontFamily: 'Georgia, serif',
                fontSize: '24px',
                lineHeight: 1.15
              }}>
                Plataforma clínica criada para uso profissional
              </h2>
            </div>

            <div style={{ padding: '22px', color: '#0f2742' }}>
              <p style={{ margin: '0 0 16px', lineHeight: 1.55 }}>
                O Sistema Acup foi idealizado por uma profissional da área, pensando na rotina real
                de atendimento, organização clínica e cuidado responsável com informações sensíveis.
              </p>

              <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
                {[
                  'Acesso reservado a usuários autorizados e identificados.',
                  'Dados clínicos organizados por profissional e por paciente.',
                  'Registros de anamnese, evolução e conduta tratados como informação sensível.',
                  'Fluxo pensado para apoiar o raciocínio clínico, sem substituir a avaliação profissional.',
                  'Boas práticas alinhadas à LGPD: necessidade, finalidade, segurança e confidencialidade.'
                ].map(item => (
                  <div key={item} style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    border: '1px solid #edf2f7',
                    background: '#fbfdff',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    lineHeight: 1.45
                  }}>
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: 'rgba(213, 163, 59, .18)',
                      color: 'var(--navy, #061a31)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 900,
                      flex: '0 0 auto',
                      marginTop: '1px'
                    }}>
                      ✓
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <p style={{
                margin: '0 0 18px',
                fontSize: '13px',
                lineHeight: 1.5,
                color: '#64748b'
              }}>
                O compromisso é manter um ambiente de trabalho claro, rastreável e reservado, para
                que a equipe possa registrar atendimentos com mais segurança e confiança.
              </p>

              <button
                type="button"
                onClick={() => setShowSecurityInfo(false)}
                style={{
                  background: 'var(--navy, #0c1f3f)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
