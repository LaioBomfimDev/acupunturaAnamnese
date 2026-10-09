// ============================================================
// Apoio na hora para o paciente que marcou uma resposta de risco numa
// escala (item 9 do PHQ-9) na Área do Paciente. Aparece logo abaixo da
// pergunta e de novo depois de enviar. Não substitui o atendimento: a
// equipe recebe um alerta na tela dela até marcar "Vi o alerta".
// Texto em conferência com a psicóloga responsável, como as escalas.
// ============================================================

export function PatientRiskSupport() {
  return (
    <div className="pq-risk-support" role="note">
      <p>
        <b>Você não precisa passar por isso sozinho(a).</b> Se estiver pensando em se machucar, converse agora
        com o CVV: ligue <a href="tel:188">188</a>, de graça e a qualquer hora, ou acesse cvv.org.br.
      </p>
      <p>
        Em emergência, ligue <a href="tel:192">192</a> (SAMU) ou vá ao pronto-socorro mais próximo. A equipe que
        cuida de você vai ver esta resposta.
      </p>
    </div>
  );
}

export default PatientRiskSupport;
