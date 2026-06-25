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
