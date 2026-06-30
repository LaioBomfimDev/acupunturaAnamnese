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
    title: '2. Controlador dos dados e Encarregado (DPO)',
    items: [
      'O controlador dos dados tratados nesta plataforma é a clínica/profissional responsável pelo atendimento: [preencher: razão social/nome, CNPJ ou registro profissional, endereço]. O Sistema Acup é ferramenta de apoio ao tratamento conduzido por esse controlador.',
      'Encarregado pelo Tratamento de Dados (DPO), responsável por receber solicitações de titulares e comunicação da ANPD: [preencher: nome do encarregado] — contato: [preencher: e-mail/telefone do encarregado].',
      'Dúvidas, solicitações de titulares e comunicações sobre proteção de dados devem ser dirigidas ao Encarregado, pelos contatos acima.',
    ],
  },
  {
    title: '3. Dados tratados na plataforma',
    items: [
      'Dados do profissional: nome, e-mail, login, telefone, documento, registro profissional, especialidade, clínica, perfil de acesso, status do usuário, troca de senha temporária e registros administrativos de auditoria quando houver ação do SuperAdm.',
      'Dados do paciente: nome, telefone, idade ou data de nascimento, sexo, profissão, data do atendimento, queixa principal, história clínica, sono, emoções, digestão, eliminações, hidratação, dor, escala de dor, histórico, medicamentos, exames, observações, sinais de segurança, achados de língua (incluindo fotografias), achados de pulso, evolução, protocolo e relatório clínico.',
    ],
  },
  {
    title: '4. Dados pessoais sensíveis e base legal',
    items: [
      'A plataforma trata dados pessoais sensíveis, especialmente dados referentes à saúde (art. 5º, II, da LGPD). Esses dados só devem ser coletados quando necessários ao atendimento, em linguagem respeitosa, objetiva e pertinente à finalidade clínica.',
      'O tratamento de dados de saúde apoia-se, conforme o caso, na tutela da saúde por profissional/serviço de saúde (art. 11, II, "f", da LGPD) e/ou no consentimento específico e destacado do titular (art. 11, I), além das obrigações legais e regulatórias do exercício profissional.',
      'O profissional declara possuir base legal adequada para registrar dados do paciente, observando os princípios da LGPD: finalidade, adequação, necessidade, livre acesso, qualidade dos dados, transparência, segurança, prevenção, não discriminação e responsabilização.',
      'O consentimento desta tela é a ciência do PROFISSIONAL sobre as regras de uso. Ele NÃO substitui o consentimento, contrato terapêutico ou aviso de privacidade que a clínica/profissional deve apresentar e colher do PACIENTE.',
    ],
  },
  {
    title: '5. Segurança, acesso e armazenamento',
    items: [
      'O acesso é pessoal, identificado e reservado a usuários autorizados. Credenciais não devem ser compartilhadas, anotadas em local inseguro ou usadas por terceiros.',
      'No ambiente Supabase, os pacientes ficam vinculados ao profissional responsável por regras de segurança em nível de linha (RLS), e as fichas clínicas são salvas por RPC com dados sensíveis criptografados no banco. A chave administrativa e a chave de criptografia não ficam no frontend. Ações administrativas relevantes ficam registradas em logs de auditoria.',
      'Quando o fallback local estiver habilitado para desenvolvimento ou contingência, pacientes e fichas podem ficar no localStorage do navegador. Nesse caso, o usuário deve proteger o dispositivo, evitar computadores compartilhados e sair da sessão ao terminar.',
    ],
  },
  {
    title: '6. Inteligência Artificial assistiva (Google Vertex AI)',
    items: [
      'A IA Assistente, o módulo de língua, o assistente de marcações da anamnese, os rascunhos de relatório/evolução e a consulta à Biblioteca produzem SUGESTÕES para conferência. Nada é diagnóstico definitivo, prescrição obrigatória ou decisão automática — a revisão humana profissional é obrigatória.',
      'O processamento de IA é feito pelo Google Cloud Vertex AI (modelo Gemini), acionado por servidor seguro, com os dados processados na região do Brasil (São Paulo).',
      'No Vertex AI, sob o Adendo de Tratamento de Dados do Google (CDPA, que abrange a LGPD), os dados enviados NÃO são utilizados para treinar modelos do provedor nem passam por revisão humana do provedor.',
      'Antes de sair do dispositivo, o texto clínico enviado à IA passa por anonimização automática (mascaramento de nome, CPF, telefone, e-mail, datas e CEP) e o nome do paciente não é enviado. As fotos da língua ficam em armazenamento privado vinculado ao profissional. Ainda assim, recomenda-se não digitar identificadores diretos nos campos de texto livre.',
      'Somente achados aceitos pela profissional entram no checklist e no raciocínio clínico. A decisão final sobre avaliação, protocolo, técnica, intensidade, contraindicações e encaminhamento é sempre da profissional responsável.',
    ],
  },
  {
    title: '7. Provedores, nuvem e subprocessadores',
    items: [
      'Para operar, a plataforma utiliza provedores que tratam dados como operadores/subprocessadores: (a) Supabase — banco de dados, autenticação e armazenamento das fichas e imagens; (b) Google Cloud Vertex AI — processamento de IA (Gemini), na região do Brasil.',
      'Esses provedores tratam os dados conforme instruções do controlador e seus próprios termos de proteção de dados. O compartilhamento limita-se ao necessário para a finalidade clínica e técnica da plataforma.',
      'A Biblioteca Viva separa conhecimento clínico e fontes bibliográficas dos dados pessoais de pacientes. Conteúdos importados, mapas, coordenadas e fontes externas passam por revisão profissional antes de uso clínico aprovado.',
    ],
  },
  {
    title: '8. Compartilhamento, relatórios e dever de sigilo',
    items: [
      'Relatórios, protocolos e evoluções devem ser usados apenas para a finalidade clínica adequada. O compartilhamento com paciente, outros profissionais ou serviços externos é responsabilidade do usuário e deve respeitar sigilo profissional e LGPD.',
      'Não é permitido copiar dados clínicos para ferramentas externas, mensagens, planilhas ou sistemas de IA não previstos neste termo, sem base legal, necessidade real, proteção adequada e ciência do paciente quando aplicável.',
      'Dados não devem ser usados para discriminação, exposição, marketing indevido, treinamento externo de modelos, publicação de casos ou qualquer finalidade incompatível com o atendimento.',
    ],
  },
  {
    title: '9. Retenção e eliminação dos dados',
    items: [
      'Os dados clínicos são mantidos pelo prazo necessário ao atendimento e pelo prazo legal de guarda de prontuário aplicável à categoria profissional (em regra, no mínimo 20 anos a contar do último registro; [confirmar com o conselho profissional aplicável]).',
      'Encerrada a finalidade e esgotados os prazos legais, os dados devem ser eliminados ou anonimizados. O titular pode solicitar eliminação quando cabível, ressalvadas as hipóteses de guarda obrigatória.',
      'O usuário deve evitar registrar informação excessiva ou sem relação com o atendimento e manter os dados corretos e atualizados.',
    ],
  },
  {
    title: '10. Direitos dos titulares',
    items: [
      'Pacientes e profissionais podem solicitar, conforme a LGPD, confirmação de tratamento, acesso, correção, atualização, portabilidade quando aplicável, informação sobre compartilhamento, eliminação quando cabível e revogação de consentimento quando essa for a base utilizada.',
      'As solicitações devem ser dirigidas ao Encarregado (Seção 2) e avaliadas pela clínica/profissional responsável, considerando obrigações legais, deveres éticos, segurança clínica, prazos de guarda e limites técnicos do sistema.',
    ],
  },
  {
    title: '11. Crianças e adolescentes',
    items: [
      'Quando o paciente for criança ou adolescente, o tratamento de dados observará o seu melhor interesse, com consentimento específico e em destaque de pelo menos um dos pais ou do responsável legal, salvo nas hipóteses legais que dispensem o consentimento (por exemplo, tutela da saúde).',
      'A coleta deve ser a mínima necessária, e o responsável legal deve ser informado, em linguagem clara, sobre a finalidade do tratamento e sobre o uso assistivo de IA descrito na Seção 6.',
    ],
  },
  {
    title: '12. Incidentes de segurança',
    items: [
      'Suspeitas de acesso indevido, perda de dispositivo, exposição de senha, vazamento, alteração indevida ou qualquer incidente com dados pessoais devem ser comunicadas imediatamente ao Encarregado/responsável pela clínica.',
      'Incidentes que possam acarretar risco ou dano relevante aos titulares devem ser avaliados para comunicação à ANPD e aos titulares afetados, nos prazos e condições da LGPD.',
    ],
  },
  {
    title: '13. Aceite',
    items: [
      'Ao clicar em "Li e aceito", o profissional confirma que compreendeu as finalidades do Sistema Acup, o caráter SENSÍVEL dos dados de saúde tratados, o processamento por IA (Google Vertex AI) descrito na Seção 6, os limites da IA assistiva e a obrigatoriedade de revisão humana, bem como o seu dever de sigilo, segurança, necessidade e responsabilidade profissional.',
      'Este aceite é do PROFISSIONAL usuário e não substitui o consentimento próprio que o PACIENTE (ou seu responsável legal) deve fornecer à clínica.',
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
              Li e aceito o termo de uso profissional, o tratamento de dados sensíveis de saúde e o uso assistido por IA (Google Vertex AI), com revisão humana obrigatória.{' '}
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
                Privacidade, LGPD, dados sensíveis e uso de IA
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
