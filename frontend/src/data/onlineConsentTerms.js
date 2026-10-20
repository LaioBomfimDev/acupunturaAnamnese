// ============================================================
// Termos que o paciente responde antes da primeira consulta online.
//
// RASCUNHO (20/10/2026): o texto final é da psicóloga responsável com
// revisão jurídica. A sala só funciona depois que a administração liga
// "Atendimento online pela sala do sistema" em Configurar agenda — ligar
// é a hora de conferir este texto.
//
// Mudou o texto de um termo: sobe `version` aqui e em
// supabase/functions/_shared/onlineConsultation.ts
// (ONLINE_CONSENT_TERM_VERSIONS). O paciente responde de novo, e cada
// resposta guarda a versão que ele leu.
// ============================================================

export const ONLINE_CONSENT_STATUS = 'rascunho';

export const TELECONSULTATION_TERM = Object.freeze({
  kind: 'teleatendimento',
  version: 'teleatendimento-v1',
  title: 'Atendimento online',
  // Os três pontos que a tela mostra (prévia A escolhida em 20/10/2026).
  summary: Object.freeze([
    'A consulta é por vídeo, com o mesmo sigilo do consultório.',
    'Fique num lugar reservado e, se puder, use fone.',
    'Se a ligação cair, a clínica liga para o seu telefone.',
  ]),
  paragraphs: Object.freeze([
    'A consulta acontece por vídeo, numa sala criada só para este atendimento. Entram apenas você e quem atende você.',
    'O sigilo é o mesmo do consultório. A conversa só é gravada se você autorizar, numa escolha à parte.',
    'O vídeo passa pelos servidores da Daily, empresa contratada pela clínica para a chamada. A Daily não guarda o vídeo nem o som da consulta.',
    'Você precisa de um lugar reservado, internet estável e um aparelho com câmera e microfone. Se a ligação cair, tente entrar de novo pelo mesmo link; se não der, a clínica liga para o seu telefone.',
    'Se em algum momento do tratamento a consulta online não for a mais adequada, quem atende você pode propor a consulta presencial.',
    'Em emergência, procure o SAMU (192). Para conversar com alguém agora, o CVV atende pelo 188, a qualquer hora.',
    'Se o paciente for menor de idade, quem responde este termo é o responsável.',
    'Você pode deixar de fazer consultas online quando quiser: basta avisar a clínica.',
  ]),
});

export const RECORDING_TERM = Object.freeze({
  kind: 'gravacao_sessao',
  version: 'gravacao-v1',
  title: 'Gravação da sessão',
  question: 'Autoriza gravar a sessão?',
  paragraphs: Object.freeze([
    'Gravar é opcional. Se você não autorizar, a consulta acontece do mesmo jeito.',
    'Só o som é gravado, nunca a imagem.',
    'A gravação serve para transformar a conversa em texto e ajudar quem atende você a escrever o registro da sessão. Quem atende revisa tudo antes de guardar.',
    'O som é apagado assim que vira texto. O texto fica protegido no seu prontuário, com o mesmo sigilo do resto do atendimento.',
    'A transformação em texto é feita pelo Google Cloud, serviço contratado pela clínica.',
    'Você pode retirar a autorização quando quiser, até durante a consulta: é só pedir para quem atende você.',
    'Se o paciente for menor de idade, quem decide é o responsável.',
  ]),
});

export const ONLINE_CONSENT_TERM_VERSIONS = Object.freeze({
  teleatendimento: TELECONSULTATION_TERM.version,
  gravacao_sessao: RECORDING_TERM.version,
});
