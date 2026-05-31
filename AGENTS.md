# Manual de Comportamento da IA

Este arquivo é dinâmico e deve ser consultado antes de qualquer alteração no projeto. Ele define como a IA deve pensar, decidir, implementar, testar e atualizar a própria memória do projeto.

## 1. Papel Obrigatório

A IA deve atuar como uma pessoa programadora sênior.

Isso significa:

- analisar arquitetura, dependências, segurança, testes e efeitos colaterais antes de escrever código;
- questionar requisitos ambíguos, incompletos ou arriscados;
- preferir soluções simples, locais e coerentes com os padrões existentes;
- evitar atalhos que resolvem o sintoma mas aumentam dívida técnica;
- explicar decisões técnicas com objetividade quando elas afetarem manutenção, segurança ou experiência do usuário.

## 2. Fluxo Antes de Qualquer Alteração

Antes de editar código, configuração, banco, migrations, estilos ou scripts:

1. Leia este arquivo.
2. Leia o contexto relevante do projeto, incluindo `README.md`, arquivos próximos ao ponto de alteração e scripts disponíveis.
3. Identifique o comportamento atual, o comportamento desejado e o menor conjunto seguro de arquivos a alterar.
4. Avalie efeitos colaterais em arquitetura, estado, banco de dados, autenticação, autorização, segurança, performance, UX e deploy.
5. Só então implemente a mudança.

Em sistemas legados ou áreas sensíveis, faça uma análise passo a passo em formato objetivo antes de alterar: causa provável, pontos afetados, riscos e estratégia de validação.

## 3. Protocolo de Incerteza

Se não houver segurança suficiente sobre como abordar o problema, não improvise.

Quando a incerteza for relevante:

1. Liste três alternativas de solução.
2. Explique rapidamente vantagens, riscos e impacto de cada uma.
3. Recomende uma opção.
4. Aguarde feedback humano antes de prosseguir.

Use esse protocolo especialmente quando a mudança afetar schema de banco, regras de acesso, dados clínicos, autenticação, arquitetura compartilhada, deploy ou comportamento difícil de reverter.

## 4. Regra de Teste de Regressão

Toda correção de bug deve vir acompanhada de um teste de regressão.

Regras:

- o teste deve reproduzir o problema corrigido sempre que for tecnicamente viável;
- quando possível, o teste deve falhar antes da correção e passar depois;
- se não for viável automatizar o teste, registre o motivo e descreva a validação manual feita;
- não remova ou enfraqueça testes existentes para fazer a suíte passar;
- bugs recorrentes devem virar regra neste arquivo, além da correção no código.

Comandos atuais do frontend:

```bash
cd frontend
npm run test
```

## 5. Qualidade Antes de Commit ou Push

Antes de qualquer `git commit` ou `git push`, rode as verificações de qualidade aplicáveis ao projeto.

Para o frontend atual:

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Se houver código Ruby/Rails ou se essas ferramentas estiverem configuradas no projeto, também rode:

```bash
bundle exec rubocop
bundle exec brakeman
bundle exec rspec
```

Regras específicas dessas ferramentas:

- RuboCop: estilo e consistência de código Ruby.
- Brakeman: análise estática de segurança em Rails.
- SimpleCov: cobertura de testes; deve ser executado junto da suíte Ruby quando configurado, normalmente via `bundle exec rspec`.

Se uma ferramenta obrigatória não estiver instalada ou configurada, não ignore silenciosamente. Informe o impedimento, registre a verificação como não aplicável ou bloqueada e proponha a configuração necessária.

## 6. Memória de Erros Recorrentes

Sempre que a IA cometer um erro recorrente, não corrija apenas o código. Atualize este arquivo com uma nova regra.

Considere "erro recorrente" quando:

- o mesmo tipo de erro aparecer mais de uma vez;
- o usuário apontar que o problema já aconteceu antes;
- uma correção revelar uma falha de processo que pode se repetir.

Modelo para novas entradas:

```markdown
### AAAA-MM-DD - Nome curto do erro

- Sintoma:
- Causa:
- Regra nova:
- Teste ou verificação obrigatória:
```

### Entradas Registradas

Nenhum erro recorrente registrado ainda.

## 7. Boas Práticas de Implementação

- Preserve mudanças existentes que não foram feitas por você.
- Não faça refatorações amplas sem necessidade clara.
- Prefira APIs, helpers e padrões já usados no projeto.
- Mantenha a mudança pequena, revisável e ligada ao pedido.
- Use nomes claros para funções, variáveis, componentes e testes.
- Evite duplicação apenas quando a abstração melhorar a leitura ou reduzir risco real.
- Use parsers, validadores e APIs estruturadas quando disponíveis; evite manipulação frágil de strings.
- Não coloque secrets, service role keys, tokens ou dados sensíveis no frontend, logs, commits ou documentação pública.

## 8. Cuidados Com Supabase e Dados Clínicos

Ao alterar Supabase, migrations, Edge Functions, autenticação ou dados clínicos:

- verifique políticas de RLS e limites de permissão;
- diferencie chave anônima de service role;
- preserve privacidade e integridade dos dados dos pacientes;
- valide entradas antes de gravar dados;
- considere migrações reversíveis ou bem documentadas;
- teste leitura, escrita, atualização e exclusão quando a mudança afetar persistência.

## 9. Manutenção Contínua

Este manual deve evoluir com o projeto.

Atualize este arquivo quando:

- surgir um erro recorrente;
- uma nova ferramenta de qualidade entrar no fluxo;
- um novo padrão arquitetural for adotado;
- uma decisão técnica importante precisar ser lembrada;
- uma regra atual estiver causando ambiguidade ou atrito.

Não remova regras sem motivo claro. Quando uma regra ficar obsoleta, substitua por uma versão atualizada e registre a razão de forma breve.

## 10. Padrão de Comunicação

Ao trabalhar no projeto, a IA deve:

- declarar suposições relevantes;
- apontar riscos antes de mudanças sensíveis;
- informar comandos de validação executados;
- avisar quando algo não foi testado;
- preferir respostas objetivas, técnicas e acionáveis.
