# Plano — Agenda e gestão de clínica (ERP do Reability One)

Documento de planejamento. Não descreve o que existe, e sim o que vamos
construir e em que ordem. Estado atual verificado em 2026-08-09, branch
`hardening-clinico`.

---

## 1. A decisão de partida: mobile primeiro ou features primeiro?

**Recomendação: features primeiro — mas com o shell responsivo antecipado
e toda tela nova nascendo mobile-first.**

Não é meio-termo por covardia; é o que o código mostra:

| Fato verificado | Consequência |
|---|---|
| `src/App.css` tem 10.295 linhas, 710 cores chumbadas e apenas 20 `@media` | Converter o legado agora é um diff gigante, arriscado e sem valor comercial imediato |
| A sidebar é `width: 268px` e o conteúdo `calc(100% - 268px)` | O layout inteiro do app antigo assume desktop; é uma mudança de *shell*, não de telas |
| As superfícies novas (`tokens.css`, `login.css`, `hub.css`, `agenda.css`) já usam tokens e têm breakpoints | O caminho responsivo já começou pelo lugar certo |
| As telas pesadas do legado são mapas de pontos, curadoria, atlas e anamnese longa | São trabalho de mesa. São as **últimas** que alguém vai querer no celular |
| O que a clínica usa no celular é agenda do dia, check-in, confirmação e dashboard | Ou seja: exatamente o que ainda **não existe** |

Traduzindo: reescrever o legado para mobile hoje seria gastar semanas
tornando responsivas justamente as telas que ninguém abre no telefone,
enquanto as telas que *só* fazem sentido no telefone ainda não foram
escritas.

**A regra que adotamos:**

1. **Toda tela nova nasce mobile-first.** Sem exceção. Custa ~15% a mais
   agora e evita 100% de retrabalho depois.
2. **Tela legada vira responsiva quando for tocada** pela migração de
   tokens do rebranding. Uma passada só, dois objetivos.
3. **Exceção antecipada: o shell.** Sidebar → drawer, barra inferior,
   breakpoints canônicos e PWA entram **já na Fase 1**, porque é a moldura
   onde toda tela nova vai sentar. Fazer isso depois obrigaria a refazer o
   enquadramento de tudo que construirmos no meio tempo.

Custo do shell: pequeno e localizado (App.css + Sidebar.jsx + tokens.css).
Custo de migrar o legado inteiro: semanas. Fazemos o primeiro agora, o
segundo por lotes.

---

## 2. Onde estamos (verificado)

**Pronto e sólido:**

- `supabase/migrations/20260809_appointments.sql` — tabela `appointments`
  com RLS por instituição, 6 status, `EXCLUDE USING gist` barrando dupla
  marcação no banco, triggers de `clinic_id`/`created_by`/`updated_at`.
  Base bem desenhada. *(Confirmar se já foi aplicada no Supabase real.)*
- `src/services/appointmentService.js` — listar, criar, mudar status,
  remarcar; erros traduzidos (conflito, migração ausente).
- `src/components/panels/Agenda.jsx` — calendário mensal + painel do dia +
  formulário de criação, aberto pelo hub.
- `src/utils/agenda.js` — grade do mês, aniversariantes, detecção de
  conflito.

**Lacunas que impedem "gestão de clínica de verdade":**

| Lacuna | Impacto |
|---|---|
| `profiles` só deixa cada perfil ler a si mesmo | **Bloqueador nº 1.** Sem listar colegas não existe agenda de recepção, só "minha agenda" |
| Não existe jornada de trabalho por profissional | "Horário livre" hoje = "sem agendamento", o que inclui 3h da manhã e domingo |
| Não existe bloqueio (almoço, reunião, feriado, férias) | A recepção marca em cima do almoço e o banco aceita |
| Só visão de mês | Mês é bom para navegar, péssimo para operar o dia |
| `rescheduleAppointment` existe no service mas não tem UI | Remarcar hoje é cancelar + criar de novo |
| Sem confirmação, check-in, sala de espera | O dia da clínica não é acompanhável |
| Sem convênio/valor, sem financeiro | É o que faz a clínica pagar assinatura |
| Sem recorrência | Pacote de 10 sessões é o caso mais comum em acupuntura e fisio |
| Sem lista de espera/encaixe | Buraco de agenda vira prejuízo |

---

## 3. Fases

### Fase 0 — Destravar o banco (pré-requisito de tudo)

1. Confirmar aplicação de `20260723_clinical_data_hardening.sql` e
   `20260809_appointments.sql` no Supabase real.
2. **Nova migração: leitura de colegas da mesma instituição.** Não abrir
   `profiles` inteiro — criar uma *view* `clinic_members` expondo só o
   administrativo: `id`, `name`, `profession`, `disciplines`, `is_active`,
   `clinic_id`. RLS: membro ativo enxerga colegas da própria instituição.
3. **Nova migração: jornada e bloqueios.**
   - `professional_schedules` — dia da semana, início, fim, duração padrão
     do atendimento, intervalo. É o que define "horário disponível".
   - Bloqueios: **decisão de schema em aberto**, ver §6.
4. **Nova migração: colunas de operação em `appointments`** — `kind`
   (`appointment` | `block`), `appointment_type` (primeira vez / retorno /
   avaliação), `room`, `confirmed_at`, `checked_in_at`,
   `recurrence_group_id`.

> Regra do AGENTS.md §3 e §9: mudança de schema e de política de acesso
> passa por aprovação humana antes de escrever. §6 lista as decisões.

### Fase 1 — Shell responsivo (a única parcela de mobile antecipada)

- Breakpoints canônicos em `tokens.css`: 480 / 768 / 1024 / 1280.
- `< 1024px`: sidebar vira drawer off-canvas com overlay; `≥ 1024px`
  continua fixa. Uma única alteração em `App.css` + `Sidebar.jsx`.
- `< 768px`: barra inferior com 4 destinos — **Hoje**, **Agenda**,
  **Pacientes**, **Mais**.
- Alvos de toque ≥ 44px, `100dvh` em vez de `100vh` (barra do navegador
  móvel), `env(safe-area-inset-*)` para o notch.
- PWA: `manifest.webmanifest`, ícones, service worker mínimo
  (instalável; offline fica para a Fase 7).

Critério de pronto: hub, login e agenda usáveis num iPhone SE (375px) sem
rolagem horizontal.

### Fase 2 — Agenda de verdade (o coração)

**Quatro visões, uma base de dados:**

| Visão | Onde brilha | Uso |
|---|---|---|
| **Dia** | Celular (padrão) e recepção | Operar o dia |
| **Semana** | Desktop | Planejar, ver buracos |
| **Mês** | Ambos | Navegar (já existe) |
| **Lista** | Celular | Rolar os próximos atendimentos |

**Desenho mobile do calendário — o que faz ele ser "fácil de mexer":**

- Abre na **visão Dia**, com uma **faixa de semana** no topo (7 dias, o de
  hoje destacado, ponto indicando quantidade). Padrão do Google Agenda no
  modo "Compromissos": operável com uma mão.
- **Swipe horizontal** troca o dia; swipe na faixa troca a semana.
- **Tocar num slot vazio** abre o formulário já com o horário preenchido.
  Ninguém digita hora no celular se puder tocar.
- **Bottom sheet** para criar/editar no celular; painel lateral no
  desktop. Mesmo componente, dois enquadramentos.
- **FAB "+"** fixo no canto inferior direito.
- **Nada de drag-and-drop no touch** — é o erro clássico de agenda mobile.
  Remarcar no celular = selecionar → "Mover para…" → escolher slot. No
  desktop, arrastar continua valendo.
- Sem hover em lugar nenhum: ação sempre por botão ou menu explícito.
- Manter `<input type="time">` — abre o seletor nativo do sistema, que é
  melhor que qualquer coisa que a gente escreva.
- **Sem biblioteca de calendário.** FullCalendar e similares pesam
  ~200 kB e têm touch ruim. A grade em CSS Grid já iniciada em
  `agenda.css` é o caminho certo.

**Funcionalidades:**

- Agenda por profissional **e** agenda da instituição (colunas por
  profissional no desktop; chip de filtro no celular).
- Slots derivados da jornada (Fase 0): livre, ocupado, bloqueado, fora do
  expediente — quatro estados visuais distintos.
- Remarcar mantendo o mesmo registro (o service já sabe fazer).
- Cancelar com motivo obrigatório (a coluna já existe).
- Recorrência: "10 sessões, toda terça 14h" gera N registros com
  `recurrence_group_id`; editar oferece "só este" / "este e os futuros".
- Fluxo de status completo: agendado → confirmado → chegou → atendido /
  faltou / cancelado / justificado.

### Fase 3 — Recepção e o dia da clínica

- **Painel "Hoje"** — a tela que fica aberta na recepção: fila do dia,
  quem chegou, quem está em atendimento, próximos, atrasos.
- **Check-in em um toque.**
- **Ponte agenda → prontuário**: "Iniciar atendimento" no agendamento abre
  o paciente já selecionado na disciplina certa. Hoje o profissional
  precisa reescolher o paciente na sidebar — é a costura que falta entre o
  ERP e a parte clínica.
- **Cadastro rápido de paciente** no ato de agendar (hoje só dá para
  escolher alguém já cadastrado — paciente novo por telefone não tem como
  ser marcado).
- **Convênios**: tabela própria (nome, vigência, valor por procedimento),
  como o comentário da migração de agenda já antecipa. Particular vs
  convênio no agendamento.

### Fase 4 — Confirmação e lembrete (WhatsApp)

Duas etapas, nesta ordem:

1. **Link `wa.me` gerado pelo sistema** — botão "Avisar no WhatsApp" no
   agendamento, abre o WhatsApp com a mensagem pronta; a recepção envia.
   Custo zero, sem aprovação da Meta, funciona amanhã.
2. **API oficial (WhatsApp Cloud API)** depois — envio automático 24h
   antes, resposta do paciente marcando `confirmed_at`. Exige template
   aprovado, número verificado e custo por conversa.

LGPD: consentimento de contato do paciente antes de qualquer envio, e o
conteúdo da mensagem nunca cita queixa, diagnóstico ou disciplina — só
data, hora e local.

### Fase 5 — Dashboard / BI

Tudo sai de `GROUP BY` em `appointments`, que é exatamente o motivo de a
agenda vir antes do dashboard:

- Taxa de ocupação (agendado ÷ slots disponíveis) — precisa da jornada da
  Fase 0.
- Faltas e cancelamentos por período, por profissional, por disciplina.
- Atendimentos por dia da semana e por período do dia.
- Pacientes novos vs. retorno por mês.
- Aniversariantes (já calculado em `utils/agenda.js`).

### Fase 6 — Financeiro básico

Valor por atendimento, recebido/pendente, fechamento do mês, repasse ao
profissional. É o módulo que sustenta a assinatura do SaaS — mas depende
de convênio (Fase 3) e de histórico confiável de presença (Fase 2).

### Fase 7 — Mobile completo

- Migrar as telas legadas por lotes, junto com a migração de tokens do
  rebranding. Ordem sugerida: Pacientes → Evolução → Relatório →
  Anamnese → Diagnóstico → Mapas → Curadoria (última: é trabalho de mesa).
- Offline read-only da agenda do dia (service worker + cache).
- Notificação push de próximo atendimento.

---

## 4. Ordem sugerida de execução

```
Fase 0 (banco)  →  Fase 1 (shell)  →  Fase 2 (agenda)  →  Fase 3 (recepção)
                                              ↓
                                    Fase 5 (BI)  →  Fase 4 (WhatsApp)  →  Fase 6 (financeiro)
                                              ↓
                                        Fase 7 (mobile do legado, contínua)
```

Fases 0 e 1 são pequenas e destravam todo o resto. A Fase 2 é a maior e é
onde está o valor visível.

---

## 5. O que não entra agora (e por quê)

- **App nativo** — PWA resolve 95% do caso (agenda, check-in, consulta) e
  não tem loja, revisão nem build duplo.
- **Estoque de materiais (agulhas, insumos)** — módulo próprio, sem
  dependência da agenda; entra quando a clínica pedir.
- **Portal do paciente** (paciente marca sozinho) — muda a superfície de
  autenticação e o modelo de risco de dados clínicos. Só depois de a
  agenda interna estar estável.
- **Prontuário no telefone** — tecnicamente possível, mas a anamnese é
  formulário longo; obrigar o profissional a preencher no celular piora o
  registro clínico. Consulta sim, edição não.

---

## 6. Decisões que precisam de aprovação humana (AGENTS.md §3)

**6.1 — Como representar bloqueios (almoço, feriado, férias).**
Recomendo **tornar `patient_id` anulável e adicionar `kind`**
(`appointment` | `block`). Motivo: a constraint `appointments_no_overlap`
passa a proteger bloqueios de graça — o banco recusa marcar em cima do
almoço, sem código novo. A alternativa (tabela separada) mantém
`appointments` mais limpa, mas deixa a proteção de sobreposição por conta
da tela, e a tela erra.
*Risco:* `patient_id` anulável exige revisar todo consumidor que hoje
assume o campo preenchido.

**6.2 — Escopo de leitura de colegas.**
Recomendo a **view `clinic_members`** com campos administrativos apenas,
em vez de afrouxar a política de `profiles`. Mantém o prontuário e os
dados pessoais do profissional fora do alcance.

**6.3 — Agenda da recepção vs. agenda individual.**
"Gestão de clínica de verdade" implica recepção marcando para qualquer
profissional da casa — que é, aliás, o que a RLS de `appointments` já
permite. Confirmar que é isso mesmo antes de investir em UI de múltiplas
colunas.

**6.4 — Duração padrão do atendimento.**
Por profissional, por disciplina, ou por tipo de atendimento? Isso define
a granularidade dos slots. Sugiro: padrão por profissional, sobrescrito
por tipo de atendimento.

---

## 7. Invariantes que valem para todo este plano

- Agendamento é **dado administrativo**, nunca registro clínico. A
  observação da recepção não recebe queixa nem diagnóstico.
- Cada tabela nova nasce com RLS por instituição e verificação explícita
  no fim da migração, no padrão de `20260809_appointments.sql`.
- Sem `DELETE` no fluxo normal: cancelar é estado, porque o BI depende do
  histórico.
- Quality gate (`lint`, `test`, `build`) antes de cada commit.
- pt-BR em todo texto visível.
