import { useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';

const TERMS_SECTIONS = [
  {
    title: '1. Finalidade do Sistema Acup',
    items: [
      'O Sistema Acup é uma plataforma clínica integrativa para uso profissional em acupuntura e Medicina Tradicional Chinesa. Ele organiza cadastro de pacientes, anamnese, inspeção da língua, avaliação de pulso, raciocínio clínico, hipóteses energéticas, protocolos, evolução, relatórios e consulta à Biblioteca Viva.',
      'A plataforma apoia o registro e a organização do atendimento, mas não substitui avaliação presencial, julgamento técnico, responsabilidade profissional, consentimento do paciente, prontuário obrigatório quando aplicável ou encaminhamento médico quando houver sinal de alerta.',
    ],
  },
  {
    title: '2. Dados tratados na plataforma',
    items: [
      'Dados do profissional: nome, e-mail, login, telefone, documento, registro profissional, especialidade, clínica, perfil de acesso, status do usuário, troca de senha temporária e registros administrativos de auditoria quando houver ação do SuperAdm.',
      'Dados do paciente: nome, telefone, idade ou data de nascimento, sexo, profissão, data do atendimento, queixa principal, história clínica, sono, emoções, digestão, eliminações, hidratação, dor, escala de dor, histórico, medicamentos, exames, observações, sinais de segurança, achados de língua, achados de pulso, evolução, protocolo e relatório clínico.',
      'Essas informações podem incluir dados pessoais sensíveis, especialmente dados referentes à saúde. Por isso devem ser coletadas apenas quando forem necessárias ao atendimento, em linguagem respeitosa, objetiva e pertinente à finalidade clínica.',
    ],
  },
  {
    title: '3. Base de uso e responsabilidades pela LGPD',
    items: [
      'Ao usar o sistema, o profissional declara que possui autorização, hipótese legal ou justificativa profissional adequada para registrar dados do paciente no contexto do atendimento, incluindo dados sensíveis de saúde quando necessários.',
      'O tratamento deve observar os princípios da LGPD, como finalidade, adequação, necessidade, livre acesso, qualidade dos dados, transparência, segurança, prevenção, não discriminação e responsabilização.',
      'O consentimento dado nesta tela é a ciência do usuário profissional sobre as regras de uso da plataforma. Ele não substitui o consentimento, contrato terapêutico, aviso de privacidade ou outro documento que a clínica/profissional deva apresentar ao paciente.',
    ],
  },
  {
    title: '4. Segurança, acesso e armazenamento',
    items: [
      'O acesso é pessoal, identificado e reservado a usuários autorizados. Credenciais não devem ser compartilhadas, anotadas em local inseguro ou usadas por terceiros.',
      'No ambiente Supabase, os pacientes ficam vinculados ao profissional responsável por regras de segurança em nível de linha (RLS), e as fichas clínicas são salvas por RPC com dados sensíveis criptografados no banco. A chave administrativa e a chave de criptografia não ficam no frontend.',
      'Quando o fallback local estiver habilitado para desenvolvimento ou contingência, pacientes e fichas podem ficar no localStorage do navegador. Nesse caso, o usuário deve proteger o dispositivo, evitar computadores compartilhados e sair da sessão ao terminar.',
      'O SuperAdm gerencia acessos, perfis profissionais, status de usuários, senhas temporárias, Biblioteca Viva, mapas e auditoria administrativa. Métricas administrativas podem mostrar quantidades de pacientes e registros, sem transformar a área administrativa em acesso livre ao conteúdo clínico do paciente.',
    ],
  },
  {
    title: '5. IA assistiva (Google Gemini), língua e Biblioteca Viva',
    items: [
      'A IA Assistente, o módulo de língua e o assistente de marcações da anamnese produzem sugestões para conferência. Nada deve ser tratado como diagnóstico definitivo, prescrição obrigatória ou decisão automática.',
      'Para gerar essas sugestões, o sistema envia a um provedor de IA externo (Google Gemini), por meio de servidor seguro, as fotos da língua e/ou trechos do texto clínico da anamnese. As fotos ficam em armazenamento privado vinculado ao profissional; o texto enviado passa por anonimização automática, com mascaramento de nome, CPF, telefone, e-mail, datas e CEP antes de sair do dispositivo.',
      'O processamento ocorre em plano pago do provedor, em que os dados enviados não são utilizados para treinar modelos nem passam por revisão humana do provedor. Ainda assim, recomenda-se não digitar identificadores diretos do paciente nos campos de texto livre.',
      'Somente achados aceitos pela profissional entram no checklist e no raciocínio clínico. A decisão final sobre avaliação, protocolo, técnica, intensidade, contraindicações e encaminhamento continua sendo da profissional responsável.',
      'A Biblioteca Viva separa conhecimento clínico e fontes bibliográficas dos dados pessoais de pacientes. Conteúdos importados, mapas, coordenadas e fontes externas passam por revisão profissional antes de uso clínico aprovado.',
    ],
  },
  {
    title: '6. Compartilhamento, relatórios e dever de sigilo',
    items: [
      'Relatórios, protocolos e evoluções gerados no sistema devem ser usados apenas para a finalidade clínica adequada. O compartilhamento com paciente, outros profissionais ou serviços externos é responsabilidade do usuário e deve respeitar sigilo profissional e LGPD.',
      'Não é permitido copiar dados clínicos para ferramentas externas, mensagens, planilhas ou sistemas de IA sem base legal, necessidade real, proteção adequada e ciência do paciente quando aplicável.',
      'Dados não devem ser usados para discriminação, exposição, marketing indevido, treinamento externo de modelos, publicação de casos ou qualquer finalidade incompatível com o atendimento.',
    ],
  },
  {
    title: '7. Direitos dos titulares e correções',
    items: [
      'Pacientes e profissionais podem solicitar, conforme a LGPD, confirmação de tratamento, acesso, correção, atualização, informação sobre compartilhamento, eliminação quando cabível, revogação de consentimento quando essa for a base usada e outras providências previstas em lei.',
      'Solicitações de titulares devem ser avaliadas pela clínica ou profissional responsável, considerando obrigações legais, deveres éticos, segurança clínica, prazos de guarda e limites técnicos do sistema.',
      'O usuário deve manter dados corretos e atualizados, corrigir registros inexatos quando identificar erro e evitar registrar informação excessiva ou sem relação com o atendimento.',
    ],
  },
  {
    title: '8. Incidentes e uso responsável',
    items: [
      'Suspeitas de acesso indevido, perda de dispositivo, exposição de senha, erro de paciente, vazamento, alteração indevida ou qualquer incidente com dados pessoais devem ser comunicados imediatamente ao responsável pela plataforma ou pela clínica.',
      'Ao clicar em "Li e aceito", o usuário confirma que compreendeu as finalidades do Sistema Acup, o caráter sensível dos dados tratados, os limites da IA assistiva e seu dever de sigilo, segurança, necessidade e responsabilidade profissional.',
    ],
  },
];

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
              Li e aceito o termo de consentimento, uso profissional e responsabilidade sobre dados clínicos.{' '}
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
                Termo de consentimento
              </p>
              <h2 id="terms-title" style={{
                margin: 0,
                fontFamily: 'Georgia, serif',
                fontSize: '24px',
                lineHeight: 1.15
              }}>
                Privacidade, LGPD e responsabilidade profissional
              </h2>
            </div>

            <div style={{
              padding: '22px',
              color: '#0f2742',
              maxHeight: '62vh',
              overflowY: 'auto'
            }}>
              <p style={{
                margin: '0 0 16px',
                lineHeight: 1.55,
                fontSize: '14px',
                color: '#334155'
              }}>
                Este termo registra a ciência do usuário profissional sobre como o Sistema Acup deve ser
                usado no atendimento clínico e no tratamento de dados pessoais e dados sensíveis de saúde.
              </p>

              {TERMS_SECTIONS.map(section => (
                <section key={section.title} style={{ marginBottom: '16px' }}>
                  <h3 style={{
                    margin: '0 0 8px',
                    fontSize: '15px',
                    color: 'var(--navy, #061a31)'
                  }}>
                    {section.title}
                  </h3>
                  {section.items.map(item => (
                    <p key={item} style={{
                      margin: '0 0 9px',
                      lineHeight: 1.55,
                      fontSize: '13px'
                    }}>
                      {item}
                    </p>
                  ))}
                </section>
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
