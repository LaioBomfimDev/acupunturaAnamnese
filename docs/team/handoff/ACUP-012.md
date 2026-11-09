## ACUP-012 — entrega

- Branch: `codex/lk`. Base: merge fast-forward de `integracao` até `16a77c8` (contém a base pedida `cf35992`). Commit de entrega: consultar `git log -1` nesta branch.
- Registro de pendência no `AbaWorkspace`, com texto mantido apenas no editor. Trocar aba, abrir outro paciente por seletor/alerta/sessão, Voltar à tela principal e Sair passam pelo mesmo guarda. Continuar editando cancela a intenção; Descartar e sair executa a ação pedida. Troca de área usa o mesmo callback de Voltar. Nenhum botão novo de fechar paciente, conforme decisão do Orquestrador.
- Pergunta usa `AbaDialog`/`useDismiss` e `DismissPrompt`, sem `window.confirm`. Esc/clique fora/× cancelam a intenção. Navegação bloqueada durante escrita; listener `beforeunload` do registro existe só com pendência. Fechar a aba do navegador usa a confirmação nativa obrigatória do navegador, sem texto clínico.
- Registro limpa quando editor desmonta ou volta ao valor salvo. Plano que continua aberto após salvar compara com sua assinatura salva. Coleta compara com o fingerprint confirmado pelo autosave existente; nenhuma alteração no autosave, CAS, fila ou seus avisos prévios.
- Perfil: nível de suporte usa `aba-field` e largura de campo do kit. Biblioteca: Objetivos, Funções do comportamento e Hierarquia de ajuda são caixas de marcar; preservam códigos, seleção múltipla, opcionais e valores anteriores fora do catálogo. Lista vazia segue omitida como antes.

### Arquivos e propriedade

- `frontend/src/components/AbaWorkspace.jsx`: registro único e todas as rotas existentes da área.
- Novo `frontend/src/components/aba/AbaUnsavedContext.jsx`: contexto, registro por editor, bloqueio ocupado, confirmação e descarte da intenção de navegar. O mapa guarda somente identificador React e dois booleanos; nenhum conteúdo clínico.
- `AbaProfile.jsx`: import/registro do formulário inline e classe do seletor de suporte.
- `AbaPlan.jsx`: import/registro do editor e overlay customizado (inclui motivo de anulação). Nenhuma alteração de gravação.
- `AbaLibrary.jsx`: import/registro do editor customizado e três grupos de caixas no lugar dos seletores múltiplos.
- `AbaSupervision.jsx`: import/registro do editor e overlay customizado, incluindo motivo de anulação. Nenhuma alteração de contrato SUP-1/2/3.
- `AbaCollection.jsx`: só import/registro do rascunho que ainda difere do autosave confirmado, com bloqueio durante escrita.
- Editores já dentro de `AbaDialog guardUnsaved` preservados (Programas, Repertório, Qualidade e correções de Sessões). Filtros/buscas não são rascunhos clínicos e não registram dirty.
- `frontend/src/components/PatientStart.jsx`: autorização do quadro de 09/11, prop opcional `beforeSelectPatient` envolvendo a operação de selecionar e seu callback; sem prop, caminho anterior. Cadastro também guarda a seleção após criar/atualizar lista; retomar paciente segue o mesmo guarda.
- `frontend/src/components/ui/DismissPrompt.jsx`: autorização do quadro, só prop opcional `discardLabel`; padrão `Descartar e fechar` mantido para os demais usos. ABA passa `Descartar e sair`.
- `frontend/src/styles/aba.css`: adições para caixas e seletor.
- Novo `frontend/tests/regression/aba-unsaved-guard.test.mjs`: registros, rotas, limpeza, beforeunload, props opcionais e interação real dos handlers das caixas com códigos conhecidos/históricos e remoção da última seleção.
- `frontend/tests/regression/aba-library-screen.test.mjs`: autorização `840bc6e`, somente as quatro asserções: 11→8 select, 3→0 multiple, mesmos códigos `comunicar`/`ajuda_visual` agora checked. Rótulos, ausência de textarea e legado intactos. Nenhuma outra asserção existente alterada.

### Validação

- Gates finais em `frontend`: `npm run lint` **exit 0, sem avisos**; `npm test` **exit 0, 1443 testes, 1442 aprovados, 1 pulado, zero falhas (206199,9983 ms)**; `npm run build` **exit 0, 2,53 s**. Avisos conhecidos do build: import dinâmico ineficaz de patientEvolutionService e chunk acima de 500 kB. Logs em `%TEMP%/acup-012-{lint,test,build}-final.log`.
- Focados: `node --test frontend/tests/regression/aba-unsaved-guard.test.mjs frontend/tests/regression/aba-library-screen.test.mjs frontend/tests/regression/patient-start-ui.test.mjs frontend/tests/regression/dismiss-overlays.test.mjs`: exit 0, **36/36**. Log `%TEMP%/acup-012-focused.log`.
- Mutação real em disco: retirar todas as chamadas `useAbaUnsaved(...)` de cada arquivo, separadamente: Perfil, Plano, Biblioteca, Supervisão e Coleta. Cada execução do novo teste falhou identificando o editor; bytes originais restaurados em `finally`. **5/5 detectadas**. Logs `%TEMP%/acup-012-mutation-Aba{Profile,Plan,Library,Supervision,Collection}.log`.
- Navegador real Chrome/CDP, somente RPCs e pacientes fictícios: manter/descartar em aba, abertura da seleção de paciente, Voltar e Sair; seleção real do PatientStart só muda contexto após descarte; salvar limpa registro; saída durante escrita não executa; Esc mantém o texto; beforeunload cancela evento só quando dirty. Plano e Supervisão: digitar, tentar sair, manter conserva o texto; descartar sai. Biblioteca: pergunta acima do editor e Esc fecha só a pergunta, conservando o modelo digitado. Estados de confirmação, Perfil e Biblioteca verificados em **360/768/1024/1280**, sem rolagem lateral. Log `%TEMP%/acup-012-browser.log`.
- Console: sem erro de aplicação ou texto clínico. Harness registra mensagens normais Vite/React DevTools e aviso conhecido de beforeunload em reload automatizado sem gesto confiável (o Chrome recusa mostrar confirmação nessa situação). Driver só separa essas mensagens exatas, não ignora exceções da aplicação. Não foi usado login nem rede de produção.
- Harness reproduzível na mesa: `ferramentas/harness-telas/server-012-lk.mjs`, `telas/unsaved-012-lk.jsx`, `verify-012-lk.mjs`. Servidor isola Supabase e PatientContext; UI do Workspace, editores, PatientStart, guarda e callbacks de navegação são os reais. `?probe=1` monta editor e seletor juntos para provar a fronteira anterior à seleção; os prints usam o Workspace real, não esse probe.

### Prints e roteiro QA

- `mesa/prints/ACUP-012/`: `troca-aba`, `troca-paciente`, `perfil`, `biblioteca`, cada um computador + `-celular`. Mais `biblioteca-caixas` e `biblioteca-hierarquia` nos dois tamanhos, para mostrar os três grupos no editor comprido: **12 prints**. Desktop pelo `mesa/ferramentas/print.mjs`; celular pelo `harness-telas/print-cdp.mjs --celular --largura 360 --inteira`. Largura dos seis PNGs de celular conferida pelo cabeçalho: 360 px. Legendas com espaços normais.
- O print troca-paciente mostra a confirmação **antes de abrir Tela inicial para selecionar outro paciente**. Não existe ação de fechar paciente adicionada. O teste com `?probe=1` prova separadamente a seleção direta e seu callback com a prop opcional.
- Iniciar: `node C:/Users/m/Downloads/acup-team/mesa/ferramentas/harness-telas/server-012-lk.mjs C:/Users/m/Downloads/acup-team/lk/frontend 5192`; verificar com o driver Node homônimo. URLs `/tela/unsaved-012-lk?auto=tab|patient|profile|library`; refazer prints com sufixo `-qa`.
- Regra preservada: editor inline/customizado registra diferença contra a cópia salva antes de qualquer saída da área; navegação não muda aba/paciente antes da confirmação. Nunca guardar o texto no registro global.
- Manual: digitar em Perfil e tentar cada saída; manter deve preservar paciente, aba e texto. Repetir descartando; salvar e tentar sair deve passar direto. Abrir Plano/Biblioteca/Supervisão, digitar, tentar saída e conferir preservação. No telefone conferir pergunta no painel de baixo e caixas tocáveis sem Ctrl/Cmd.

### Limites

- Sem SQL, schema, produção, catálogo clínico ou financeiro; nenhum arquivo publicado de migration alterado. Outras áreas conservam os defaults das duas props compartilhadas. Sem autosave novo, sem persistência no navegador.
- Ruby/Rails não configurado neste frontend: gates Ruby não aplicáveis.
- Review e integração cabem ao QA/Orquestrador; esta entrega não se declara aprovada.
