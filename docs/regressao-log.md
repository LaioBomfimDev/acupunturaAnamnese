# Log de Incidentes de Regressão

Histórico completo dos incidentes que viraram regra. **Não é lido a cada tarefa** — a regra destilada vive no `AGENTS.md` ou no doc de módulo correspondente; aqui fica o caso completo para auditoria e contexto.

Fluxo: ao corrigir um bug recorrente, destile a regra na seção/doc certo e registre o incidente completo aqui.

Modelo de entrada:

```markdown
### AAAA-MM-DD - Nome curto do erro

- Sintoma:
- Causa:
- Regra nova:
- Teste ou verificação obrigatória:
```

---

## Incidentes registrados

### 2026-07-09 - Proposta de erva do worksheet confundida com publicação

- Sintoma: ervas do `docs/herbal-curation-worksheet.md` podiam ser consumidas por fluxos clínicos usando `suggestedStatus` como se fosse liberação, apesar de serem apenas propostas para revisão no SuperAdm.
- Causa: o catálogo gerado carregava o status proposto da planilha com nome ambíguo e a ligação fitoterápica/relatório podiam tratar esse campo como gate de exibição.
- Regra nova: pré-carga de worksheet entra apenas como `curadoria_tecnica` + `proposedStatus`/`worksheetSuggestedStatus`, com `approvalMode: local_only` e `requiresProfessionalAudit: true`; esse campo nunca publica ao paciente nem alimenta relatório, Biblioteca, IA ou busca ao vivo.
- Teste ou verificação obrigatória: regressões em `frontend/tests/regression/herbal-indication-linking.test.mjs`, `frontend/tests/regression/herbal-plant-curation.test.mjs` e `tools/knowledge/build-herbal-curation-seed.test.mjs` devem garantir elegibilidade de paciente zerada, relatório sem catálogo herbal e resolvedor padrão `source_only`.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-07 - Auriculares comuns restritos ao trilho chinês rastreável

- Sintoma: a categoria "Pontos comumente usados" misturava pontos auriculares do padrão chinês rastreável com pontos funcionais/de escola ou sem equivalência segura (`Ansiedade`, `Útero`, `Ovário`, `Depressão`, `Insônia`, `Occipital`, `Fronte`, `Tálamo`). Isso deixava a lista comum mais ampla que o escopo desejado para aprovação clínica inicial.
- Causa: a curadoria auricular preservava pontos locais úteis para protocolos futuros, mas alguns entraram como comuns mesmo sem `officialChinese: true` ou sem fonte/página equivalente. Protocolos também citavam pontos funcionais (`Ansiedade`, `Sono`, `Fome`) em vez de usar apenas pontos auriculares chineses rastreados.
- Regra nova: a lista padrão de auriculares comuns e os protocolos padrão devem usar apenas pontos auriculares no trilho chinês/clássico rastreável (`officialChinese: true`, fonte/página local e texto pt-BR revisável). Pontos funcionais/de escola ficam fora da categoria comum até curadoria específica.
- Teste ou verificação obrigatória: `frontend/tests/regression/commonly-used-points.test.mjs` deve validar a contagem `126` corporais + `16` auriculares, bloquear `Ansiedade/Sono/Fome` e os slugs sem equivalência, e exigir texto pt-BR limpo nos auriculares comuns.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-07 - Fechamento do lote residual final de pontos comuns

- Sintoma: os pontos `ST41` e `ST44` eram os últimos candidatos da varredura residual estrutural; `ST41` ainda tinha título em inglês/genérico (`Dispersing Stream`/`Ravine Divide`) e `ST44` mantinha `Exemplos de combinações` colado em `indications`, apesar de a planilha de dúvidas OCR já estar zerada.
- Causa: a contagem de dúvidas OCR não cobria todos os problemas estruturais de título, cabeçalho e mistura de campos; esses casos exigiam reOCR manual contra as páginas do Atlas, não só limpeza automática.
- Regra nova: regra residual já destilada em `docs/agents-mapas.md` permanece obrigatória até a varredura estrutural retornar 0 candidatos reais em `high-confidence` e `deep-curated`.
- Teste ou verificação obrigatória: regressão do lote final em `tools/knowledge/apply-common-points-reocr.test.mjs`; depois rodar `apply-common-points-reocr`, `clean-common-points-ocr`, dry-run e varredura residual estrutural.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-07 - ReOCR sobrescrito por fallback deep-curated e lote residual 7

- Sintoma: os pontos `EXHN3`, `GB34`, `LI5`, `LI14`, `SI11`, `SP8`, `ST6` e `ST35` ainda exibiam títulos antigos, cabeçalhos de combinação em `indications` ou OCR em características (`Palacio da Impressao`, `Ji11g`, `dis1ãncia`, `pon10`, `Angu.lo`, `/ l l 1 E`). `EXHN3` também voltava para `deep_curated_clean` após a limpeza, mesmo tendo entrada de reOCR.
- Causa: a varredura residual detectou campos fora do contador de dúvidas; além disso, o limpador tinha fallback fixo para extras (`EXHN3`, `EXHN5`) e sobrepunha registros já relidos contra o Atlas. O aplicador de reOCR também não gravava `status`/`approvalMode`, dependendo do estado anterior do JSON.
- Regra nova: `clinicalSource: reocr_atlas` tem precedência sobre `deep_curated_clean`; o limpador não pode sobrescrever esse conteúdo, e o aplicador de reOCR deve marcar `approved_local`, `local_only` e `requiresProfessionalAudit: true` explicitamente.
- Teste ou verificação obrigatória: regressões em `tools/knowledge/apply-common-points-reocr.test.mjs` e `tools/knowledge/clean-common-points-ocr.test.mjs`; depois rodar `apply-common-points-reocr`, `clean-common-points-ocr`, dry-run e varredura residual.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-07 - Lote residual de títulos, OCR pequeno e cabeçalhos colados

- Sintoma: os pontos `CV3`, `CV12`, `CV14`, `CV15`, `CV22`, `GB8`, `GB21` e `LI15` ainda tinham títulos em inglês/genéricos, caracteres OCR e campos estruturais misturados (`Middle Extremity`, `Great Palace`, `Heaven Projection`, `Shoulder Well`, `Segu.indo`, `Dazhul`, `gastroptosc`, `paraaliviardornodiafragma`, `bemiplegia`) apesar de `doubtCount: 0`.
- Causa: a varredura de dúvidas OCR já estava zerada, mas não cobria integralmente títulos, pequenos resíduos estruturais e cabeçalhos/campos colados que só aparecem ao revisar a ficha completa contra a página do Atlas.
- Regra nova: depois de zerar dúvidas OCR, executar varredura residual de títulos e campos estruturais dos pontos comuns; títulos genéricos/inglês, OCR pequeno e cabeçalhos de seção dentro de campos clínicos exigem reOCR rastreado e regressão.
- Teste ou verificação obrigatória: regressão em `tools/knowledge/apply-common-points-reocr.test.mjs` deve cobrir o lote residual, bloquear inglês/AcuKG/OCR conhecido e validar cautelas rastreadas; depois rodar `apply-common-points-reocr`, `clean-common-points-ocr` e varredura seca.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-07 - Lote residual de títulos e cautela vazada nos pontos comuns

- Sintoma: os pontos `CV6`, `CV23`, `SI3`, `SP4`, `ST25`, `SI10`, `PC6` e `SP6` ainda exibiam títulos genéricos, inglês ou OCR visível (`Sea of Qi`, `Corner (Ridge) Spring`, `Back Stream`, `Yellow Emperor`, `Pi vô`, `Umero`, `N eiguan`, `Three Yin Meeting`) mesmo com a varredura de dúvidas zerada. `PC6` também preservava cautela torácica incompatível com o ponto de antebraço.
- Causa: a limpeza automática zerava dúvidas de OCR e algumas fichas já estavam em `reocr_atlas`, mas entradas antigas não traziam título/características rastreadas; a política de preservar cautelas locais também mantinha uma cautela originada de vazamento estrutural.
- Regra nova: títulos, características e cautelas herdadas precisam ser revisados no mesmo reOCR rastreado; cautela local correta é preservada, mas cautela comprovadamente vazada de outro contexto deve ser substituída explicitamente e coberta por regressão.
- Teste ou verificação obrigatória: regressão em `tools/knowledge/apply-common-points-reocr.test.mjs` deve bloquear títulos genéricos/inglês/OCR e validar `cautionsMode: replace` para o caso comprovado; depois rodar `apply-common-points-reocr`, `clean-common-points-ocr` e varredura seca.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-07 - Quarto lote estrutural de reOCR dos pontos comuns deep-curated

- Sintoma: os pontos `BL13`, `GB15`, `BL36`, `CV10`, `SP1`, `GB40`, `HT5` e `SI18` ainda tinham títulos genéricos ou em inglês, termos vindos de AcuKG e seções do Atlas vazando para campos errados (`needling`, `actions`, `indications`), apesar de estarem como `approved_local`.
- Causa: a limpeza por padrões de OCR reduzia ruído superficial, mas não substituía com segurança campos estruturalmente misturados quando a fonte do Atlas precisava ser relida ponto a ponto.
- Regra nova: lote estrutural de pontos comuns deve ser corrigido por reOCR rastreado contra as páginas do Atlas, separando localização, método, funções, indicações e características do ponto; manter `approved_local/local_only` apenas com `requiresProfessionalAudit: true`.
- Teste ou verificação obrigatória: regressão em `tools/knowledge/apply-common-points-reocr.test.mjs` deve cobrir os 8 códigos do lote e bloquear inglês/AcuKG, seções misturadas e ruídos OCR conhecidos; depois rodar `apply-common-points-reocr` e `clean-common-points-ocr`.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-06 - Segundo pente fino de OCR nos pontos comuns prioritários

- Sintoma: após a primeira limpeza, pontos comuns prioritários ainda exibiam ruídos como `ton ifi ca`, `estufa1nentofdor`, `Slu111`, `O$ a 1,2 am`, `EstômagoehannonÍ7`, `1 nemória S: fraca`, `Nota tk localiwção` e códigos de combinação sem espaçamento.
- Sintoma adicional do lote 2: os pontos `CV6`, `GB8/VB8`, `GB13/VB13`, `GB20/VB20`, `GB21/VB21`, `GB30/VB30`, `GB33/VB33` e `GB39/VB39` ainda exibiam padrões como `ponLos`, `Segu.indo`, `Yang V ei`, `consciêocia`, `0,.5`, `D11bí`, `fTbula`, `f orta lece` e `toráci-:, ca`.
- Sintoma adicional do lote 3: os pontos `GV16/VG16`, `GV24/VG24`, `HT6/C6`, `HT8/C8`, `KI1/R1`, `KI2/R2` e `LR3/F3` ainda exibiam padrões como `1 c 1111`, `Redu za fe bre`, `Shenniet1`, `Con1ção`, `metatarsais JJ e rn`, `Gongs1111`, `dist\1rbios` e palavras clínicas quebradas por espaço.
- Causa: os OCRs do Atlas tinham padrões adicionais de quebra de palavra, troca de letras por números e pontuação colada que ainda não estavam no normalizador da ficha nem no limpador offline.
- Regra nova: tratar esses ruídos em duas passagens: primeiro corrigir padrões inequívocos, depois rerodar a varredura no lote real e só acrescentar novas regras quando a leitura correta for segura; fragmentos clínicos ambíguos continuam como revisão humana.
- Teste ou verificação obrigatória: regressão deve montar fichas aprovadas para os lotes corrigidos (`CV3`, `CV12`, `CV14`, `CV15`, `CV22`, `GB34/VB34`, `GV20/VG20`, `PC6`, `ST34`, `ST40`, `TE14/SJ14`, `CV6`, `GB8/VB8`, `GB13/VB13`, `GB20/VB20`, `GB21/VB21`, `GB30/VB30`, `GB33/VB33`, `GB39/VB39`, `GV16/VG16`, `GV24/VG24`, `HT6/C6`, `HT8/C8`, `KI1/R1`, `KI2/R2`, `LR3/F3`), além de cobrir os mesmos padrões no `clean-common-points-ocr`.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-05 - Ruído de OCR visível na ficha de pontos comuns

- Sintoma: textos de localização/ações/indicações exibiam sobras e quebras de OCR como `lização A partir`, `d edo`, `u ma`, `tubcrosidadc`, `mastóidoo`, `ne.rvo`, `conjuntivite,.,.,`, `Fa ce`, `Ya11gch1`, `Harmoni za`, `transtornos 1 notores`, prejudicando a leitura clínica.
- Causa: a ficha do ponto renderizava campos aprovados do Atlas com limpeza limitada; alguns padrões inequívocos de OCR ainda não estavam no normalizador nem no script de limpeza dos pontos comuns.
- Regra nova: antes de exibir texto clínico do Atlas, aplicar limpeza conservadora apenas para ruídos comprovados; termos ambíguos continuam como dúvida de curadoria e não devem virar correção automática.
- Teste ou verificação obrigatória: teste de regressão deve montar revisão aprovada com os ruídos reais do VB20/GB20 e do TA5/SJ-5, garantindo que `buildPointDetail` devolve texto limpo, listas separadas e sem pontuação espúria; o script `clean-common-points-ocr` deve cobrir os mesmos padrões.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-07-05 - Ações e indicações em chip gigante na ficha do ponto

- Sintoma: na ficha visual do ponto, `Ações` e `Indicações` apareciam como um único chip oval contendo um parágrafo inteiro, enquanto `Técnicas` aparecia corretamente em chips separados.
- Causa: a normalização da ficha aceitava arrays sem abrir seus itens internos; quando OCR/curadoria gravava `actions` ou `indications` como array com um único texto delimitado por vírgulas/sentenças, o componente renderizava esse texto inteiro como um item só.
- Regra nova: campos clínicos da ficha do ponto devem ser normalizados para itens individuais antes da renderização: ações por bullets/sentenças, indicações por vírgula/ponto e vírgula, técnicas por lista simples, preservando placeholders de curadoria para bloqueio.
- Teste ou verificação obrigatória: teste de regressão deve montar uma revisão aprovada com `actions` e `indications` colados em um único array item e garantir que `buildPointDetail` devolve múltiplos itens/chips.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-06-23 - Lacuna menstrual exibida para todos os sexos

- Sintoma: o diagnóstico listava “ciclo menstrual/hormonal” como lacuna sempre que o checklist ginecológico estivesse vazio, inclusive em atendimentos masculinos e sem sexo clínico informado.
- Causa: a regra de lacunas consultava apenas o grupo `gineco`; ignorava o campo `state.sexo` e não existia checklist urogenital equivalente.
- Regra nova: sexo clínico informado só direciona investigação complementar — nunca entra como evidência ou peso de padrão. Contexto feminino sem achados ginecológicos pede investigação menstrual/ginecológica; contexto masculino sem achados urogenitais pede investigação urogenital/sexual; sem contexto informado, não presumir nenhum dos dois.
- Teste ou verificação obrigatória: teste de regressão deve assegurar que as lacunas são específicas ao contexto informado, que “sem queixas” encerra a lacuna correspondente e que o novo grupo `urogenital` entra no texto, no peso diagnóstico e no caso enviado à IA.
- Regra destilada em: `AGENTS.md` §8.

### 2026-06-15 - Fontes PDF locais sem rota protegida em produção

- Sintoma: a área SuperAdm > Fontes PDF exibiu `HTTP 404` e as páginas/imagens renderizadas dos PDFs não apareciam após deploy, porque os arquivos estavam em `frontend/.local-source-assets` e não eram publicados.
- Causa: a UI referenciava URLs públicas (`/knowledge/source-assets/...`) para assets bibliográficos que foram corretamente mantidos fora do bundle, mas ainda não havia camada protegida de Storage privado + URL assinada para produção.
- Regra nova: fontes visuais bibliográficas (PDFs renderizados, páginas webp, OCR/texto e manifestos `.local.json`) nunca devem depender de rota pública em produção. Use bucket privado `knowledge-source-assets`, manifesto `knowledge_source_assets` e Edge Function `knowledge-source-asset-url`; o frontend só pode enviar `assetKey`, nunca `bucket`/`object_path`, e deve ter fallback local apenas em desenvolvimento.
- Teste ou verificação obrigatória: teste de regressão deve validar sanitização de `assetKey`, bucket privado/RLS do manifesto e que a Edge Function exige `assertSuperAdmin` antes de gerar `createSignedUrl`.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-06-15 - Atlas é público: bucket público, sem URL assinada

- Sintoma/decisão: o Atlas da Ednéa é material público e precisa guiar o profissional comum ao clicar no ponto; a camada protegida (Edge Function + URL assinada de 5 min) era complexidade desnecessária e impedia o usuário comum de ver a imagem.
- Regra nova: fontes do prefixo `atlas-ednea/` (páginas webp + índice) ficam em bucket **público** dedicado `knowledge-atlas-public`, servidas por URL pública fixa (`publicAtlasAssetUrl`), sem Edge Function e sem expiração. Bucket público é só-leitura: sem policy de escrita em `storage.objects`, então não há endpoint dinâmico nem caminho de escrita explorável. As demais fontes (`pdf-sources/*`) permanecem no fluxo protegido (bucket privado + Edge Function + SuperAdm).
- Atenção: não confundir os dois mundos. Só `atlas-ednea/` é público; o resto continua restrito. A separação é por bucket e por prefixo (`isPublicAtlasAssetKey`).
- Teste ou verificação obrigatória: teste de regressão deve garantir que `atlas-ednea/*` resolve para a URL pública do bucket (sem `token=`/expiração) e que a migration cria o bucket público sem policy de escrita customizada.
- Regra destilada em: `docs/agents-mapas.md`.

### 2026-06-12 - Grupo novo de checklist sem peso de evidência no analyzer

- Sintoma: itens do checklist `linguaOrgao:*` (painel Língua) entravam no texto clínico (`getAllClinicalText`), mas não contavam no peso de evidência de língua em `diagnosticProfile` (que somava apenas os grupos legados `lingua` e `regioesLingua`), nem nos contadores do `PainelInicial` e dos "Achados rápidos" do `App.jsx`.
- Causa: ao criar um novo prefixo de grupo no `selectedMap`, ele foi ligado em um ponto do analyzer e esquecido nos demais. O filtro por `startsWith(grupo + ':')` não falha nem avisa — apenas ignora silenciosamente.
- Regra nova: todo novo prefixo de grupo de checklist deve ser ligado em TODOS os consumidores do `selectedMap`: (1) `getAllClinicalText`, (2) pesos de `diagnosticProfile` (`parts`), (3) contadores de UI (`PainelInicial.jsx`, "Achados rápidos" em `App.jsx`). Procurar por `getSelectedItems`/`getSelectedCount`/`getSelected` antes de concluir.
- Teste ou verificação obrigatória: teste de regressão garantindo que marcar um item do novo grupo altera `parts` e `confidence` do `diagnosticProfile` (ver `tests/regression/tongue-ai.test.mjs`, teste "achado aceito pesa como evidência de língua").
- Regra destilada em: `docs/agents-lingua.md`.
