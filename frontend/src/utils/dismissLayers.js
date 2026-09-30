// ============================================================
// Pilha das janelas abertas (diálogos, painéis laterais, ajuda).
//
// Esc fecha só a janela de cima: com a ficha do paciente aberta e o
// "Enviar" por cima, o primeiro Esc fecha o envio e o segundo, a ficha.
// Lógica pura (sem React) para o teste de regressão exercitar direto —
// ver tests/regression/dismiss-overlays.test.mjs. Quem usa é o hook
// hooks/useDismiss.js.
// ============================================================

const layers = [];

export function pushLayer(id) {
  removeLayer(id);
  layers.push(id);
}

export function removeLayer(id) {
  const index = layers.indexOf(id);
  if (index >= 0) layers.splice(index, 1);
}

export function isTopLayer(id) {
  return layers.length > 0 && layers[layers.length - 1] === id;
}

export function openLayerCount() {
  return layers.length;
}

/**
 * Esc que deve fechar a janela. Fica de fora o Esc que outro controle já
 * tratou (defaultPrevented — ex.: lista aberta do SearchSelect fecha
 * primeiro) e o Esc no meio de uma composição de acento/IME.
 */
export function isDismissKey(event) {
  return Boolean(event)
    && (event.key === 'Escape' || event.key === 'Esc')
    && !event.defaultPrevented
    && !event.isComposing;
}
