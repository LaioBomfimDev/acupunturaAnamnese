// ============================================================
// UTIL: Mescla o histórico de evolução legado (JSON solto em
// state.evolucoes / session.evolucoes) com os registros novos vindos
// de patient_evolutions (data do atendimento travada no servidor —
// ver supabase/migrations/20260903_patient_evolutions.sql).
//
// O array legado nunca é reescrito nem reordenado: data ali é texto
// livre digitado à mão, em formatos demais para parsear com confiança.
// Os registros novos entram depois, ordenados pela data real do
// atendimento (atendimento_em). `sessao` é renumerada sequencialmente
// para a tabela/relatório continuarem contando 1, 2, 3...
// ============================================================

function formatDateTimeBR(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const datePart = date.toLocaleDateString('pt-BR');
  const timePart = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

/**
 * @param {Array} legacyEvolucoes - state.evolucoes / session.evolucoes (congelado, só leitura daqui em diante)
 * @param {Array} recordRows - retorno de listPatientEvolutions (patientEvolutionService)
 * @returns {Array} histórico mesclado, pronto para exibição/impressão. Cada item ganha
 *   `source` ('legacy'|'record'), `attendanceStatus` ('attended'|'no_show'|'excused') e
 *   `editable` (só o legado é editável inline na tela — o novo se corrige via updatePatientEvolution).
 */
export function mergeEvolutionHistory(legacyEvolucoes, recordRows) {
  const legacy = Array.isArray(legacyEvolucoes) ? legacyEvolucoes : [];
  const records = Array.isArray(recordRows) ? recordRows : [];

  const normalizedLegacy = legacy.map(item => ({
    ...item,
    source: 'legacy',
    attendanceStatus: 'attended',
    editable: true,
  }));

  const normalizedRecords = records
    .slice()
    .sort((a, b) => new Date(a.atendimento_em) - new Date(b.atendimento_em))
    .map(record => {
      let conteudo = record.conteudo;
      if (typeof conteudo === 'string') {
        try {
          conteudo = JSON.parse(conteudo);
        } catch {
          conteudo = {};
        }
      }
      return {
        ...(conteudo || {}),
        id: record.id,
        data: formatDateTimeBR(record.atendimento_em),
        atendimentoEm: record.atendimento_em,
        registradoEm: record.registrado_em,
        appointmentId: record.appointment_id,
        attendanceStatus: record.attendance_status,
        source: 'record',
        editable: false,
      };
    });

  const merged = [...normalizedLegacy, ...normalizedRecords];
  return merged.map((item, index) => ({ ...item, sessao: index + 1 }));
}
