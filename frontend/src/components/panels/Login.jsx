import { useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import '../../styles/login.css';

const TERMS_SECTIONS = [
  {
    title: '1. Finalidade do Reability One',
    items: [
      'O Reability One é uma plataforma clínica integrativa para uso profissional em acupuntura e Medicina Tradicional Chinesa. Ele organiza cadastro de pacientes, anamnese, inspeção da língua, avaliação de pulso, raciocínio clínico, hipóteses energéticas, protocolos, evolução, relatórios e consulta à Biblioteca Viva.',
      'A plataforma apoia o registro e a organização do atendimento, mas não substitui avaliação presencial, julgamento técnico, responsabilidade profissional, consentimento do paciente, prontuário obrigatório quando aplicável ou encaminhamento médico quando houver sinal de alerta.',
    ],
  },
  {
    title: '2. Controlador dos dados e Encarregado (DPO)',
    items: [
      'O controlador dos dados tratados nesta plataforma é a Reability – Núcleo de Desenvolvimento Neurológico LTDA, CNPJ 53.351.769/0001-10, com sede na Rua Simões Filho, 350, Boa Vista, Catu – BA, CEP 48110-000. Responsável técnica: Denise Neves (CRP 03/10696). O Reability One é ferramenta de apoio ao tratamento clínico conduzido pelo controlador.',
      'Encarregado pelo Tratamento de Dados (DPO): ainda não formalmente nomeado. Até a nomeação, solicitações de titulares e comunicações sobre proteção de dados devem ser dirigidas ao contato institucional da clínica — telefone/WhatsApp (71) 99970-3912 (Instagram @reability.neuro). [preencher: nome e e-mail do Encarregado quando nomeado.]',
      'Dúvidas, solicitações de titulares e comunicações sobre proteção de dados devem ser dirigidas ao Encarregado ou, até a sua nomeação, ao contato institucional indicado acima.',
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
      'Somente em desenvolvimento, com habilitação local explícita, pacientes e fichas de teste podem ficar no localStorage do navegador. Esse modo não está disponível em produção.',
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
      'Ao clicar em "Li e aceito", o profissional confirma que compreendeu as finalidades do Reability One, o caráter SENSÍVEL dos dados de saúde tratados, o processamento por IA (Google Vertex AI) descrito na Seção 6, os limites da IA assistiva e a obrigatoriedade de revisão humana, bem como o seu dever de sigilo, segurança, necessidade e responsabilidade profissional.',
      'Este aceite é do PROFISSIONAL usuário e não substitui o consentimento próprio que o PACIENTE (ou seu responsável legal) deve fornecer à clínica.',
    ],
  },
];

const SECURITY_POINTS = [
  'Acesso reservado a usuários autorizados e identificados.',
  'Dados clínicos organizados por profissional e por paciente.',
  'Registros de anamnese, evolução e conduta tratados como informação sensível.',
  'Fluxo pensado para apoiar o raciocínio clínico, sem substituir a avaliação profissional.',
  'Boas práticas alinhadas à LGPD: necessidade, finalidade, segurança e confidencialidade.',
];

export function Login() {
  const { signInWithPassword } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="r1-login">
      <main className="r1-login__panel">
        <section className="r1-login__card" aria-labelledby="login-title">
          <div className="r1-wordmark" aria-label="Reability One">
            <span className="r1-wordmark__main">REABILITY</span>
            <span className="r1-wordmark__one">One</span>
          </div>

          <p className="r1-eyebrow">Acesso profissional</p>
          <h1 id="login-title" className="r1-login__title">Entrar na plataforma</h1>
          <p className="r1-login__subtitle">
            Use as credenciais fornecidas pela sua instituição.
          </p>

          {error && (
            <div className="r1-alert" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="r1-form">
            <div className="r1-field">
              <label className="r1-label" htmlFor="login-username">
                Usuário ou e-mail
              </label>
              <input
                id="login-username"
                className="r1-input"
                type="text"
                autoComplete="username"
                placeholder="Digite seu usuário ou e-mail"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="r1-field">
              <label className="r1-label" htmlFor="login-password">
                Senha
              </label>
              <div className="r1-password-field">
                <input
                  id="login-password"
                  className="r1-input r1-input--password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="r1-password-toggle"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  aria-controls="login-password"
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword(current => !current)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.9 4.2A10.8 10.8 0 0112 4c5.2 0 8.7 4.6 9.5 6a1.9 1.9 0 010 2 15.7 15.7 0 01-2.5 3.1M6.2 6.2A16 16 0 002.5 10a1.9 1.9 0 000 2c.8 1.4 4.3 6 9.5 6 1.3 0 2.5-.3 3.6-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2.5 10a1.9 1.9 0 000 2c.8 1.4 4.3 6 9.5 6s8.7-4.6 9.5-6a1.9 1.9 0 000-2C20.7 8.6 17.2 4 12 4S3.3 8.6 2.5 10z" />
                      <circle cx="12" cy="11" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <label className="r1-consent">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                disabled={loading}
              />
              <span>
                Li e aceito o termo de uso profissional, o tratamento de dados sensíveis de saúde e o uso assistido por IA (Google Vertex AI), com revisão humana obrigatória.{' '}
                <button type="button" className="r1-link" onClick={() => setShowTerms(true)}>
                  Ver termo
                </button>
              </span>
            </label>

            <button
              type="submit"
              className="r1-btn r1-btn--primary"
              disabled={loading || !acceptedTerms}
            >
              {loading ? 'Entrando…' : 'Entrar na plataforma'}
            </button>
          </form>

          <button
            type="button"
            className="r1-login__foot"
            onClick={() => setShowSecurityInfo(true)}
          >
            <span className="r1-login__foot-main">Plataforma segura • Conformidade LGPD</span>
            <span className="r1-login__foot-sub">Acesso administrativo reservado</span>
          </button>
        </section>
      </main>

      {showTerms && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-title"
          className="r1-modal"
          onClick={() => setShowTerms(false)}
        >
          <div className="r1-modal__panel" onClick={e => e.stopPropagation()}>
            <div className="r1-modal__head">
              <p className="r1-modal__eyebrow">Termo de consentimento</p>
              <h2 id="terms-title" className="r1-modal__title">
                Privacidade, LGPD, dados sensíveis e uso de IA
              </h2>
            </div>

            <div className="r1-modal__body">
              <p className="r1-modal__intro">
                Este termo registra a ciência do usuário profissional sobre como o Reability One
                deve ser usado no atendimento clínico e no tratamento de dados pessoais e dados
                sensíveis de saúde.
              </p>

              {TERMS_SECTIONS.map(section => (
                <section key={section.title} className="r1-term">
                  <h3 className="r1-term__title">{section.title}</h3>
                  {section.items.map(item => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
              ))}

              <button
                type="button"
                className="r1-btn r1-btn--primary"
                onClick={() => {
                  setAcceptedTerms(true);
                  setShowTerms(false);
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
          className="r1-modal"
          onClick={() => setShowSecurityInfo(false)}
        >
          <div className="r1-modal__panel" onClick={e => e.stopPropagation()}>
            <div className="r1-modal__head">
              <p className="r1-modal__eyebrow">Segurança e confiança</p>
              <h2 id="security-info-title" className="r1-modal__title">
                Plataforma clínica criada para uso profissional
              </h2>
            </div>

            <div className="r1-modal__body">
              <p className="r1-modal__intro">
                O Reability One foi idealizado por uma profissional da área, pensando na rotina
                real de atendimento, organização clínica e cuidado responsável com informações
                sensíveis.
              </p>

              <ul className="r1-check-list">
                {SECURITY_POINTS.map(item => (
                  <li key={item} className="r1-check">
                    <span className="r1-check__mark" aria-hidden="true">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className="r1-modal__intro">
                O compromisso é manter um ambiente de trabalho claro, rastreável e reservado, para
                que a equipe possa registrar atendimentos com mais segurança e confiança.
              </p>

              <button
                type="button"
                className="r1-btn r1-btn--primary"
                onClick={() => setShowSecurityInfo(false)}
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
