// O banco recusou a ficha da área porque a pessoa não cadastrou nem atende
// o paciente nesta área (20261016b): a tela avisa "Ficha de quem atende",
// não trata como falha de carga.
export function isNotAttendingError(error) {
  return error?.code === '42501' && /não pertence ao profissional/.test(String(error?.message || ''));
}
