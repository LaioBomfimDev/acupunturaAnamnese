// ============================================================
// Rótulos da área ABA usados por mais de uma tela.
// ============================================================

const COLUMN_LABELS = {
  independente: 'Independente',
  ajuda_visual: 'Visual',
  ajuda_gestual: 'Gestual',
  ajuda_verbal: 'Verbal',
  modelacao: 'Modelação',
  fisica_parcial: 'Fís. parcial',
  fisica_total: 'Fís. total',
  aproximada: 'Aproximação',
  erro: 'Erro',
  sem_resposta: 'Sem resposta',
  recusa: 'Recusa',
  nao_aplicavel: 'Não aplicável',
};

export const responseColumnLabel = response => COLUMN_LABELS[response] || response;

// Famílias visuais da matriz: sem ajuda, com ajuda, erro e fora do cálculo.
export const columnTone = response => (
  response === 'independente' ? 'independent'
    : response === 'erro' ? 'error'
      : response === 'sem_resposta' || response === 'recusa' || response === 'nao_aplicavel' ? 'neutral'
        : 'prompted'
);

export const reviewStatusLabel = status => ({
  pending_review: 'Aguardando revisão',
  correction_requested: 'Correção solicitada',
  corrected_pending_review: 'Correção reenviada',
  approved: 'Aprovada e assinada',
}[status || 'pending_review']);

export const reviewActionLabel = action => ({
  correction_requested: 'Correção solicitada',
  correction_submitted: 'Correção enviada',
  approved_and_signed: 'Aprovada e assinada',
}[action] || action);

export const sessionStatusLabel = status => ({
  em_andamento: 'Em andamento',
  incompleta: 'Incompleta',
  finalizada: 'Finalizada',
  corrigida: 'Corrigida',
}[status] || status);

export const calloutStatusLabel = status => ({
  convocado: 'Aguardando confirmação',
  aceito: 'Aceito',
  concluido: 'Concluído',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
}[status] || status);
