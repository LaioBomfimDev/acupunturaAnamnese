# Regras de Módulo: Língua e IA Assistiva

Leia este doc ao trabalhar no módulo de inspeção da língua (`Lingua.jsx`, `tongueData.js`, `tongueAiService.js`) ou em qualquer futura análise assistiva por IA (pulso, face etc.). As regras universais ficam no `AGENTS.md`. Os invariantes mais críticos também estão resumidos no `AGENTS.md` §0.

## Contrato de tags estáveis

- A IA (mock ou serviço real) NUNCA referencia o texto literal dos rótulos do checklist. Ela retorna tags estáveis (ex.: `swollen_center`), resolvidas por `tongueAiTagMap`/`resolveTongueAiTag` em `frontend/src/data/tongueData.js`.
- Não renomear rótulos em `tongueOrganAlterations` sem atualizar a entrada correspondente no `tongueAiTagMap`. O teste `tests/regression/tongue-ai.test.mjs` quebra se uma tag apontar para item inexistente — isso é proposital; corrija o mapa, não o teste.
- Tag sem entrada no mapa não marca nada e aparece como "não mapeada" na UI. Nunca fazer fallback por similaridade de texto.

## IA é assistiva, nunca conduta final

- Achados da IA NÃO entram no diagnóstico automaticamente. O analyzer lê somente o `selectedMap` (achados confirmados pela profissional). Esse desacoplamento é arquitetural e não deve ser quebrado.
- "Aceitar" um achado usa `setSelection(group, item, true)` do `useClinicState` (marca, nunca desmarca). Não usar `toggle` para aceite — aceitar um item já marcado manualmente não pode desmarcá-lo.
- "Desfazer" um aceite volta o card a pendente, mas NÃO desmarca itens do checklist — desmarcar é decisão explícita da profissional no checklist.
- Confiança é exibida em faixas (alta/média/baixa) + inteiro arredondado. Nunca decimais — precisão decimal transmite falsa certeza clínica.
- Linguagem da UI: "Sugestões da IA para conferência", "achados confirmados pela profissional". Proibido: "diagnóstico definitivo", "tratamento obrigatório", prescrição direta ou qualquer formulação que sugira que a IA "fechou diagnóstico".

## Fotos e dados sensíveis

- Fotos de pacientes (língua ou qualquer imagem clínica) NUNCA viram base64 dentro de `clinical_records` nem entram no bundle do frontend.
- O estado `tongueAi` (fotos + análise) vive fora de `state`/`selectedMap` no `useClinicState` exatamente para não ser arrastado pelo `useSessionPersistence`. Não mover para dentro de `state`.
- Object URLs de fotos devem ser revogados (`URL.revokeObjectURL`) ao substituir/remover foto e no reset da sessão.
- Persistência futura (fase 4): bucket privado `clinical-tongue-photos` no Supabase Storage, caminho `therapist_id/patient_id/data/arquivo.webp`, políticas RLS por terapeuta, remoção de EXIF/GPS antes do upload e compressão para webp no cliente. No registro clínico, apenas metadados (caminho, tipo, data, achados, aceitos/ignorados, versão do modelo).
- Inferência real (fase 5) roda em microserviço Python separado, atrás do contrato `analyzeTongueImages(photos)` em `frontend/src/services/tongueAiService.js`. O frontend não roda modelos; Edge Function não faz inferência pesada. Trocar mock por real = trocar o corpo dessa função, sem mexer na UI.

## Troca/remoção de foto

- Trocar ou remover qualquer foto invalida a análise vigente (`analysis: null`) — um resultado de IA nunca pode ficar órfão da imagem que o gerou. Os achados já aceitos no checklist permanecem.

## Analyzer / novo prefixo de grupo no `selectedMap`

Firmado por incidente (2026-06-12; caso completo em `docs/regressao-log.md`):

- Todo novo prefixo de grupo de checklist deve ser ligado em TODOS os consumidores do `selectedMap`: (1) `getAllClinicalText`, (2) pesos de `diagnosticProfile` (`parts`), (3) contadores de UI (`PainelInicial.jsx`, "Achados rápidos" em `App.jsx`).
- O filtro por `startsWith(grupo + ':')` não falha nem avisa — apenas ignora silenciosamente. Procurar por `getSelectedItems`/`getSelectedCount`/`getSelected` antes de concluir.
- Teste de regressão obrigatório: marcar um item do novo grupo deve alterar `parts` e `confidence` do `diagnosticProfile` (ver `tests/regression/tongue-ai.test.mjs`).
