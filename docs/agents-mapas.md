# Regras de Módulo: Biblioteca Viva, Fontes, Domínios e Mapas

Leia este doc ao trabalhar com pontos de acupuntura, mapas, KM-Agent, Atlas da Ednéa Martins, catalogação de PDFs por domínio, dietoterapia/ervas ou qualquer fonte visual/bibliográfica. As regras universais ficam no `AGENTS.md`; a política geral de curadoria está no `AGENTS.md` §8. **Novas regras de fonte/curadoria entram aqui, não no `AGENTS.md`.**

## Fontes visuais e mapas

- Use `tools/codex-skills/sistema-acup-map` como guia local quando a tarefa envolver coordenadas, mapas corporais, pontos auriculares, inferência de localização ou calibração visual.
- A fonte clínica primária deve ser preservada com rastreabilidade: título, página impressa, página do PDF, trecho extraído e status de revisão.
- Imagens ou páginas renderizadas de PDFs clínicos não devem entrar no bundle principal do frontend nem ser carregadas de forma ansiosa. Devem ser tratadas como fonte visual sob demanda, preferencialmente protegida e acessível primeiro em fluxos de Biblioteca Viva/SuperAdm/curadoria.
- A interface clínica deve mostrar dados curados e objetivos; a imagem da fonte deve aparecer em aba ou painel de "Fonte" para conferência, não como substituta do conteúdo normalizado.
- Não publique páginas inteiras de material bibliográfico em área pública sem avaliar licença, privacidade, tamanho de deploy e controle de acesso.
- Ao gerar imagens de páginas do Atlas, use formato otimizado (`webp` quando possível), índice `ponto -> páginas/imagens`, carregamento lazy e metadados de origem.
- Pontos, relações, cautelas, indicações, imagens de fonte e coordenadas inferidas permanecem em `draft` ou `review` até aprovação profissional explícita.
- Aprovação em lote por critério de confiança do KM-Agent/Atlas deve ser registrada como `approved_local`, `approvalMode: local_only` e `requiresProfessionalAudit: true`; não migre para Supabase/produção sem etapa separada de auditoria e rastreabilidade.

## Catalogação de PDFs por domínio

- PDFs novos ou legados que não pertençam ao pacote `atlas-ednea/` devem ficar separados como fonte/rastreamento e rascunho (`review`/`draft`) até uma etapa explícita de curadoria confiável. Fonte PDF, KM-Agent, AcuKG ou material em outro idioma nunca deve substituir um ponto aprovado do Atlas nem entrar no ranking/ficha clínica só por estar como `approved_local` antigo; trate como rascunho preservado e audite antes de ativar.
- PDFs de língua/semiologia/microssistemas devem ser catalogados com domínio próprio (`knowledgeDomain: lingua`, `curationTarget: modulo_lingua`) e `candidateExtractionPolicy: source_only_no_point_candidate_scan`. Eles alimentam curadoria do módulo Língua, mas não podem passar pelo scanner de pontos sistêmicos/auriculares nem gerar candidatos de ponto por coincidência textual.
- PDFs de diagnóstico, clássicos, princípios terapêuticos ou combinações de pontos devem ser catalogados com `knowledgeDomain: diagnostico`, `curationTarget: raciocinio_clinico_mtc` e `candidateExtractionPolicy: source_only_no_point_candidate_scan` até existir um extrator próprio de padrões/síndromes/estratégias. Mesmo quando citarem pontos, não devem alimentar automaticamente ranking, protocolo ou ficha de ponto sem síntese revisada e aprovação explícita.

## Dietoterapia, alimentos e ervas

- PDFs de nutrição, dietoterapia, curas alimentares e ervas devem ser catalogados como base educativa separada (`knowledgeDomain: dietoterapia`, `curationTarget: dietoterapia_mtc_educativa_pos_anamnese`) e sempre com `candidateExtractionPolicy: source_only_no_point_candidate_scan`. O módulo não elabora plano alimentar, cardápio, prescrição dietética, dose/preparo de ervas nem substitui conduta nutricional ou médica; atua somente como educação em saúde baseada em fontes tradicionais, liberada e revisada por profissional habilitado.
- Diferencie `alimento` de `erva/planta medicinal`: alimento pode ser curado como educação geral sobre leitura tradicional, preparo, tolerância e rotina. Erva exige identificação botânica, parte utilizada, forma de apresentação, toxicologia, interações e cautelas para gestação, lactação, doenças renais, hepáticas, cardiovasculares e metabólicas antes de qualquer liberação. Nunca tratar erva como "receita natural simples".
- Todo item de dietoterapia deve ter `contentReleaseStatus`: `source_only` (não exibir), `curadoria_tecnica` (interno por padrão), `educativo_aprovado` (pode exibir ao paciente), `restrito_profissional` (apenas avaliação individual) ou `bloqueado_risco` (não exibir). Um padrão MTC não pode liberar alimento ou erva por si só.
- Ao mencionar relações da MTC, usar "associações tradicionais da MTC entre alimentos, sabores, movimentos e sistemas funcionais". Não apresentar os órgãos funcionais da MTC como diagnóstico biomédico nem dizer que um alimento ou erva "trata o Baço". Toda ficha de erva deve começar pelo aviso de contraindicações, toxicidade e interações, e declarar que não orienta uso, preparo, dose ou combinação sem avaliação profissional.
- O campo `wikipediaUrl` de uma planta medicinal é somente uma referência suplementar de identificação botânica e leitura geral. Preserve `wikipediaTitle`, `wikipediaLanguage`, `wikipediaStatus` e página da fonte; nunca use Wikipedia como evidência clínica, para definir segurança, indicar dose/preparo ou liberar conteúdo ao paciente.
- A curadoria interna de ervas no SuperAdm registra decisões locais exportáveis por `plantId`, sem duplicar texto integral de PDF em `localStorage`. Uma decisão `educativo_aprovado` exige conferência de espécie, parte usada, toxicologia, interações, grupos vulneráveis e escopo educativo; mesmo aprovada, ela não alimenta paciente, Biblioteca ou IA até existir uma etapa explícita de publicação/retrieval revisada.

## Regras firmadas por incidente

Casos completos em `docs/regressao-log.md`.

- **Fontes visuais protegidas (2026-06-15):** fontes visuais bibliográficas (PDFs renderizados, páginas webp, OCR/texto, manifestos `.local.json`) nunca dependem de rota pública em produção. Bucket privado `knowledge-source-assets` + manifesto `knowledge_source_assets` + Edge Function `knowledge-source-asset-url`. O frontend só envia `assetKey` (nunca `bucket`/`object_path`); fallback local apenas em desenvolvimento. A Edge Function exige `assertSuperAdmin` antes de `createSignedUrl`.
- **Atlas é público (2026-06-15):** o prefixo `atlas-ednea/` (páginas webp + índice) fica em bucket **público** dedicado `knowledge-atlas-public`, servido por URL pública fixa (`publicAtlasAssetUrl`), sem Edge Function e sem expiração. Bucket só-leitura (sem policy de escrita em `storage.objects`). **Não confundir com `pdf-sources/*`, que segue protegido.** Separação por bucket e prefixo (`isPublicAtlasAssetKey`).
