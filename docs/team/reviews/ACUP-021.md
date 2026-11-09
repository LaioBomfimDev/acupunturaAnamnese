## ACUP-021 — revisão (hotfix Documentos timbrados sobre a main)

- Veredito: **APROVADO**, com duas correções minhas (limpeza do colado e opções no celular).
- Commit revisado: `ac30abe` (PR #16), aplicado por cherry-pick em `qa/ACUP-021` criada de `origin/main` `1ea4172` (produção), **nunca do integracao** (PUB-1/PUB-2). Aplicou sem conflito e virou `c1bab7b`. Minha correção: `7d60b56`. **Commit para publicar: `7d60b56`** (main + c1bab7b + 7d60b56, nada da 016/017).
- Gate: `npm run quality` verde.
  - Entrega do dev: **1449 testes (1448 ok, 1 pulado, 0 falhas)**.
  - Com minha correção: **1450 (1449 ok, 1 pulado, 0 falhas)**.
  - As duas vezes rodado sozinho. Lint, invariantes de segurança e build ok.
- SQL: não há. PROD-2 ok, nenhuma migration tocada.
- Arquivos do commit: só os listados na task (DocumentosTimbrados, documentosDocx, App.css só documentos/tabela, screenHelp + corpus, package/lock, teste, regressao-log, bullet AGENTS §7). Nada de WhatsApp (3061329) nem de docs antigos (e86d792).

### Dependências novas
| Pacote | Versão | Licença | Publicada | Onde entra |
|---|---|---|---|---|
| `jszip` | 3.10.2 (era 3.10.1, já no lock pelo mammoth/html-to-docx) | MIT ou GPL-3.0 (usamos MIT) | 08/09/2026, pelos mantenedores de sempre (stuk, jkoops) | chunk próprio `jszip.min` (96 KB), import dinâmico só ao baixar Word |
| `buffer` | 6.0.3 (+ `ieee754` 1.2.1 BSD-3; `base64-js` já estava) | MIT | 2020 | chunk próprio `buffer` (~6 KB), import dinâmico só ao baixar Word |

- A integridade do lock bate com o registro (`npm view jszip@3.10.2 dist.integrity`). As dependências da 3.10.2 são as mesmas da 3.10.1.
- Nenhum dos dois aparece no `index-*.js` (pacote principal). `html-to-docx` e `mammoth` seguem em chunks próprios, como antes.

### Espelho do "Como funciona"
- Rodei `node scripts/sync-assistant-help.mjs`: o conteúdo gerado é igual ao do commit (diferença só de fim de linha, desfeita). O texto novo do `screenHelp.documentos` cita os rótulos reais da tela ("Enviar arquivo Word", "Colar conteúdo", "Ver no papel timbrado", "Editar conteúdo").

### PDF: folhas = páginas
Tela sem login (`mesa/ferramentas/harness-telas/telas/documentos-021-qa.jsx`), clínica e texto fictícios, conteúdo longo com tabela de 40 linhas. Cliquei em "Imprimir / PDF" e conferi que `window.print` roda com `body.pq-printing` e que a classe sai depois. O PDF saiu pelo `printToPDF` do Chrome, com a classe ligada como na impressão.

| Caso | Folhas `.rpage` | Páginas do PDF | Mesmo PDF sem a classe (controle) |
|---|---|---|---|
| Embrulho tipo Gestão (menu + topo + recuo), com logo | 6 | **6** | 7 |
| Sem logo (monograma) | 6 | **6** | 7 |
| Celular 360px, embrulho Gestão | 6 | **6** | 7 |

- A folha mora em `body > .pq-print-root` (portal). O cabeçalho da tabela repete na folha seguinte e a marca d'água não atravessa a tabela (print `pdf-folhas-1a6-qa`).

### Word (.docx)
Gerado na mesma tela (com logo e sem logo), aberto no **Microsoft Word** (COM), exportado em PDF e conferido por dentro do zip:
- `w:pgSz` 11906 × 16838 (A4 retrato); margens laterais de 21 mm; Word mede 595,3 × 841,9 pt; 5 páginas.
- Cabeçalho com logo (ou monograma "C" sem logo), nome, dados e CNPJ, data, título, profissional e faixa colorida. Rodapé com faixa, ícones, telefone, endereço e nome. Tudo em toda página.
- Marca d'água: `behindDoc="1"` no cabeçalho, `timbrado-marca-dagua.png`. Sem logo não há marca, como no PDF.
- Cabeçalho de tabela: `<w:tblHeader/>` na primeira linha (1 tabela, 1 marca). No Word a página 3 abre com "Campo | Valor | Observação".
- Sem aviso de erro na tela; o "Buffer is not defined" não volta com logo nem com imagem.

### "Colar conteúdo"
Colei pelo evento de colar do navegador (clipboard com `text/html`):
- **Fica:** negrito/itálico do Google Docs (`<b id="docs-internal-guid…">` desembrulhado, sem deixar tudo em negrito) e do Word (`<o:p>`, `class="MsoNormal"`, cor e fonte saem). Também ficam a imagem embutida (`data:image/png`), o link https e a tabela com `doc-table`.
- **Sai:** script, style, meta, iframe com `srcdoc`, form/input/button, `onerror`/`onclick`/`ontoggle`, imagem `file://` e `src="x"`, `href="javascript:"`, base.
- Só texto vira parágrafos com `<br>`, e `<b>` digitado vira texto (`&lt;b&gt;`).
- **Furo achado e corrigido (`7d60b56`):** antes "Colar conteúdo" só limpava o que vinha do mammoth; agora recebe HTML de qualquer página. Passavam para a prévia:
  - `href="java<TAB>script:…"` e `href="java<LF>script:…"`, que o navegador lê como `javascript:` (o `a.href` resolvido confirmava);
  - `href="data:text/html,…"`;
  - `<svg><a><set attributeName="href" to="javascript:…">` e `<animate>`, que trocam o href depois da limpeza (o `href.animVal` confirmava).

  Nos meus testes nenhum rodou, mas um link de controle posto direto na prévia também não rodou, então isso não prova nada. A CSP de produção (`script-src 'self'`, `base-uri 'self'`, `vercel.json`) segura, mas a limpeza não pode depender dela. Correção:
  - o esquema é comparado sem os caracteres que o navegador ignora (≤ 0x20 e 0x7F);
  - `javascript:`/`vbscript:` saem, e `data:` só fica em `<img src="data:image/…">`;
  - `svg`, `math` e `base` são removidos (Word, Google Docs e mammoth não mandam svg em linha).

  Depois da correção os mesmos casos saem `<a>clique</a>` sem href. Teste: 'QA: limpeza do colado barra javascript: com tab/quebra, data: fora de imagem e svg/math' em `documentos-timbrados.test.mjs`.

### Telas (prints em `mesa/prints/ACUP-021`, todos `-qa`, dados fictícios)
- Computador: `tela-arquivo-qa`, `tela-colar-qa`, `tela-previa-qa`. Celular 360px: `tela-colar-celular-qa`, `tela-previa-celular-qa`, sem rolagem lateral. PDF: `pdf-folhas-1a6-qa`. Word: `word-paginas-1a5-qa`, `word-sem-logo-paginas-1a3-qa`.
- **Corrigi (`7d60b56`):** a 360px a pílula "Enviar arquivo Word | Colar conteúdo" quebrava em duas linhas. Abaixo de 520px as duas opções dividem a largura numa linha (CSS, sem mudar a tela no computador).

### Observações (não bloqueiam; para uma task depois)
1. **Prévia em tela a 360px corta o timbrado à direita** ("Profiss…", e o fim de linhas do texto some). É a estrutura antiga `report report-screen-only` do Relatório, que este commit não mexeu (bloco e CSS iguais à main). O PDF e o Word saem certos. Vale para Documentos e Relatório no celular.
2. Paginação do PDF: um título pode ficar sozinho no fim da folha com a tabela começando na seguinte ("Tabela longa" na folha 2). Vem do `paginateReportBody` existente.
3. O Word usa Arial e a tela usa a fonte do sistema; títulos e cores batem. Cosmético.
4. O placeholder "Cole aqui (Ctrl+V)" aparece também no celular, onde não há Ctrl.
5. O `window.Buffer` fica definido na aba depois do primeiro Word (polyfill global). É inofensivo, mas está registrado.

### Depois do APROVADO (lembrete da task)
- A publicação da main é do humano. Ao juntar a main no `integracao`: há conflito esperado no AGENTS.md (manter os dois bullets) e no corpus (regenerar pelo script, não à mão).
