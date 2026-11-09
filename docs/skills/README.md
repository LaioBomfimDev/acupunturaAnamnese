# Pasta de skills (SKILL.md)

Cópia dos arquivos `SKILL.md` de todas as skills disponíveis nesta máquina, em 2026-11-06, para levar para outro projeto ou entregar a outra IA. Só markdown: `SKILL.md` de cada skill e os `.md` de apoio (`references/`, `themes/`, etc.). Scripts, fontes e PDFs ficaram de fora — a origem de cada grupo está logo abaixo, se precisar deles.

**Companheiro deste pacote:** [`../guia-design-telas-para-ia.md`](../guia-design-telas-para-ia.md) — o guia de design/percepção destilado do trabalho real. As skills marcadas ★ são as citadas na seção 10 dele.

## Como usar em outro projeto

Copie a pasta da skill para `.claude/skills/<nome>/SKILL.md` na raiz do outro repositório:

```bash
mkdir -p /caminho/do/outro-projeto/.claude/skills && cp -r docs/skills/projeto/* /caminho/do/outro-projeto/.claude/skills/
```

O nome da pasta é o nome da skill. A skill é lida pelo `description:` do frontmatter — é ele que faz a IA chamar a skill na hora certa, então não edite a descrição sem necessidade.

## O que veio de onde

| Grupo | Quantas | Origem |
|---|---|---|
| `projeto/` | 29 | `.claude/skills/` deste repositório (não versionado — `.claude/` está no `.gitignore`, então esta cópia é o único registro em git) |
| `anthropic/` | 26 | Pacote de skills da Anthropic instalado no app (`AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/…`) |
| `plugins/42crunch-api-security-testing/` | 5 | Plugin oficial 42crunch 1.5.5 |
| `plugins/aws-dev-toolkit/` | 40 | Plugin oficial aws-dev-toolkit 0.3.0 |
| `plugins/agent-sdk-dev/` | 3 | Plugin oficial agent-sdk-dev 1.0.1 — são comando + agentes, não skills |

Total: 122 arquivos `.md`, ~1,3 MB.

---

## ★ Design e interface

### Núcleo visual
| Skill | Para quê |
|---|---|
| [`projeto/accessibility`](projeto/accessibility/SKILL.md) ★ | WCAG 2.2 AA: ARIA semântico na web e traits nativos (iOS/Android); auditar contraste, foco, leitor de tela |
| [`anthropic/canvas-design`](anthropic/canvas-design/SKILL.md) ★ | Arte visual em `.png`/`.pdf` com filosofia de design — pôster, capa, peça estática |
| [`anthropic/theme-factory`](anthropic/theme-factory/SKILL.md) ★ | Paleta + tipografia coerente: 10 temas prontos (um `.md` por tema em `themes/`) ou gerar um na hora |
| [`anthropic/web-artifacts-builder`](anthropic/web-artifacts-builder/SKILL.md) ★ | Protótipo HTML complexo com estado/rotas/componentes (React, Tailwind, shadcn/ui) |
| [`anthropic/algorithmic-art`](anthropic/algorithmic-art/SKILL.md) ★ | Arte generativa em p5.js com aleatoriedade semeada |
| [`anthropic/brand-guidelines`](anthropic/brand-guidelines/SKILL.md) ★ | Cor e tipografia da marca Anthropic (serve de exemplo de como amarrar uma marca, não é a marca do cliente) |
| [`anthropic/slack-gif-creator`](anthropic/slack-gif-creator/SKILL.md) ★ | GIF animado dentro dos limites do Slack |

### Implementação da UI
| Skill | Para quê |
|---|---|
| [`projeto/frontend-patterns`](projeto/frontend-patterns/SKILL.md) ★ | Padrões de frontend: React, Next.js, estado, performance, boas práticas de UI |
| [`projeto/react-patterns`](projeto/react-patterns/SKILL.md) ★ | React 18/19: disciplina de hooks, fronteira servidor/cliente, Suspense, formulário, composição acessível |
| [`projeto/react-performance`](projeto/react-performance/SKILL.md) ★ | 70+ regras de performance React/Next por prioridade (cascata, bundle, re-render) |
| [`projeto/react-testing`](projeto/react-testing/SKILL.md) ★ | Teste de componente com Testing Library, Vitest/Jest, MSW, axe; onde para o teste de componente e começa o E2E |
| [`projeto/vite-patterns`](projeto/vite-patterns/SKILL.md) ★ | Config, plugins, HMR, env, proxy, SSR, build do Vite |

### Saída em documento (o design do que é impresso ou enviado)
| Skill | Para quê |
|---|---|
| [`anthropic/docs`](anthropic/docs/SKILL.md) ★ | Documento editável e comentável (o padrão quando alguém pede "um documento") |
| [`anthropic/docx`](anthropic/docx/SKILL.md) ★ | Word `.docx`/`.dotx`: criar, ler, editar, alterações controladas, comentários |
| [`anthropic/pdf`](anthropic/pdf/SKILL.md) ★ | PDF: ler, extrair, juntar, dividir, marca d'água, formulário (`FORMS.md`, `REFERENCE.md` inclusos) |
| [`anthropic/pptx`](anthropic/pptx/SKILL.md) ★ | PowerPoint `.pptx`/`.potx`: criar, ler, editar, layout, notas |
| [`anthropic/xlsx`](anthropic/xlsx/SKILL.md) ★ | Planilha: abrir, corrigir, calcular, formatar, converter |
| [`projeto/nutrient-document-processing`](projeto/nutrient-document-processing/SKILL.md) ★ | Converter, OCR, extrair, tarjar, assinar e preencher documento via API Nutrient DWS |

### Interface de dado clínico/sensível
| Skill | Para quê |
|---|---|
| [`projeto/healthcare-emr-patterns`](projeto/healthcare-emr-patterns/SKILL.md) ★ | Entrada de dado clínico, fluxo de atendimento, segurança clínica, UI acessível para dado médico |
| [`projeto/healthcare-cdss-patterns`](projeto/healthcare-cdss-patterns/SKILL.md) ★ | Severidade de alerta e onde o alerta entra no fluxo (interação, dose, escore clínico) |
| [`projeto/healthcare-phi-compliance`](projeto/healthcare-phi-compliance/SKILL.md) | Classificação de dado, controle de acesso, trilha de auditoria, vetores comuns de vazamento |
| [`projeto/hipaa-compliance`](projeto/hipaa-compliance/SKILL.md) | Entrada específica de HIPAA (contexto EUA) |
| [`projeto/healthcare-eval-harness`](projeto/healthcare-eval-harness/SKILL.md) | Suíte de segurança do paciente que barra deploy |

### Processo e qualidade em volta do design
| Skill | Para quê |
|---|---|
| [`projeto/verification-loop`](projeto/verification-loop/SKILL.md) ★ | Verificar de verdade antes de dizer "pronto" |
| [`projeto/tdd-workflow`](projeto/tdd-workflow/SKILL.md) ★ | Teste primeiro, cobertura ≥80% |
| [`projeto/ai-regression-testing`](projeto/ai-regression-testing/SKILL.md) ★ | Teste de regressão quando a mesma IA escreve e revisa o código (os pontos cegos) |
| [`projeto/prompt-optimizer`](projeto/prompt-optimizer/SKILL.md) ★ | Reescrever um pedido em prompt completo (só aconselha, não executa) |
| [`projeto/architecture-decision-records`](projeto/architecture-decision-records/SKILL.md) ★ | Registrar a decisão e o porquê, para a próxima sessão não desfazer |
| [`anthropic/skill-creator`](anthropic/skill-creator/SKILL.md) ★ | Criar/editar skill e medir se ela dispara na hora certa |
| [`projeto/safety-guard`](projeto/safety-guard/SKILL.md) | Barrar operação destrutiva em produção |

---

## Skills de design que NÃO têm arquivo nesta máquina

Estas quatro são entregues pela plataforma na hora (não existem em disco, não deu para copiar). Numa sessão do Claude elas se chamam pelo nome; em outra IA, o conteúdo delas não está aqui — o substituto é a seção correspondente do [guia](../guia-design-telas-para-ia.md).

| Skill | O que cobre (pela descrição oficial) |
|---|---|
| `artifact-design` ★ | Contrato da página de artefato: título, tema claro/escuro, tokens de cor, bibliotecas permitidas, limite de tamanho, layout, ícone — e quanto esforço de design o pedido merece. **Carregar antes de escrever qualquer página.** |
| `dataviz` ★ | Antes da primeira linha de código de qualquer gráfico, KPI, medidor ou dashboard, em qualquer meio: heurística de forma, fórmula de cor com validador, especificação de marca, regras de interação |
| `artifact-diagramming` ★ | Diagrama que mostra o mecanismo real, em SVG legível nos dois temas |
| `artifact-capabilities` ★ | Capacidades de runtime da página: guardar estado, lembrar o que as pessoas fizeram, ler dado ao vivo, receber arquivo |

Também não são arquivos (são comandos embutidos do Claude Code, chamados com `/`): `code-review`, `simplify`, `security-review`, `run`, `init`, `loop`, `schedule`, `claude-api`, `plugin-authoring`, `update-config`, `keybindings-help`, `fewer-permission-prompts`.

---

## Demais skills copiadas (não são de design)

**`projeto/`** — `api-design`, `backend-patterns`, `cost-aware-llm-pipeline`, `database-migrations`, `deployment-patterns`, `error-handling`, `hexagonal-architecture`, `iterative-retrieval`, `knowledge-ops`, `postgres-patterns`, `regex-vs-llm-structured-text`.

**`anthropic/`** — `built-in-browser`, `chrome-browser`, `computer-use` (navegador e controle do computador), `deep-research`, `doc-coauthoring`, `learn`, `mcp-builder`, `google-workspace`, `consolidate-memory`, `import-memory`, `explain-usage`, `morning`, `setup-claude`, `setup-cowork`.

**`plugins/`** — 42crunch (auditoria e varredura de segurança de API a partir do OpenAPI), aws-dev-toolkit (40 skills de AWS: arquitetura, IAM, Lambda, ECS/EKS, custo, observabilidade…), agent-sdk-dev (criar app com o Agent SDK + dois agentes verificadores).

---

## Observações honestas sobre esta cópia

- É um retrato de 2026-11-06. Skill atualizada pelo app ou pelo plugin **não** atualiza esta pasta: para refrescar, recopie da origem da tabela acima.
- As skills do grupo `anthropic/` e `plugins/` são de terceiros, com licença própria (vários trazem `LICENSE.txt` na origem, que **não** foi copiado por ser fora do escopo "só markdown"). Antes de redistribuir fora deste repositório, confira a licença na pasta original.
- Faltam os arquivos não-markdown que algumas skills usam de verdade para funcionar: fontes do `canvas-design` (~5,5 MB), scripts de `docx`/`pdf`/`pptx`/`xlsx`/`web-artifacts-builder`, `core/` do `slack-gif-creator`, `theme-showcase.pdf` do `theme-factory`, `templates/` do `algorithmic-art`. Levando a skill para outro projeto e dando erro de script faltando, copie a pasta inteira da origem.
