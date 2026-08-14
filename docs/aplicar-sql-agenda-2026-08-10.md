# Aplicar no Supabase — Fase 0 da agenda (2026-08-10)

Duas migrações novas. Rode **na ordem**, cada uma inteira, no SQL Editor
do projeto. Ambas são aditivas: não tocam prontuário, não apagam dado.

Pré-requisito: `20260809_appointments.sql` já aplicada. Se não estiver, o
frontend acusa com o nome do arquivo antes de qualquer coisa.

## 1. `supabase/migrations/20260810_clinic_members.sql`

Cria a função `list_clinic_members()`. É o que destrava a agenda de
recepção — sem ela, `profiles` continua "cada um vê só a si mesmo" e o
seletor de profissional fica vazio.

A verificação no fim deve devolver:

| coluna | esperado |
|---|---|
| `funcao_criada` | `true` |
| `authenticated_pode_executar` | `true` |
| `anon_bloqueado` | `true` |
| `anon_bloqueado_na_agenda` | `true` |

> **Correção de 2026-08-12.** Na primeira aplicação, `anon_bloqueado` veio
> `false`: o Postgres concede `EXECUTE` a `PUBLIC` ao criar a função e o
> papel `anon` herda dessa concessão, então revogar só de `anon` não tinha
> efeito. O arquivo foi corrigido para `REVOKE ALL ... FROM PUBLIC, anon`
> e passou a consertar também `can_manage_agenda`, que nasceu com o mesmo
> padrão em `20260809`. **Reaplique este arquivo inteiro** — ele é
> idempotente e agora as quatro colunas devem vir `true`. Detalhe do
> incidente em `docs/regressao-log.md`.

## 2. `supabase/migrations/20260810_agenda_operacao.sql`

Colunas de operação em `appointments`, tabelas `professional_schedules` e
`clinic_holidays`, e a redefinição da constraint de sobreposição.

A verificação no fim deve devolver:

| coluna | esperado |
|---|---|
| `jornada_criada` | `true` |
| `feriados_criados` | `true` |
| `coluna_kind` | `true` |
| `paciente_opcional_para_bloqueio` | `true` |
| `guarda_so_para_atendimento` | `true` |
| `politicas_jornada` | `4` |
| `politicas_feriados` | `2` |

`guarda_so_para_atendimento` é o item que importa conferir: se vier
`false`, a constraint antiga continua valendo e bloqueio virou parede —
marcar um encaixe no almoço passa a ser impossível, que é o oposto do
combinado (`docs/plano-agenda-gestao-clinica.md` §6.1).

## Depois de aplicar

1. Recarregue o sistema e abra **Agenda** pelo hub.
2. O seletor de profissional só aparece quando a instituição tem mais de
   um membro ativo. Com um só, a tela fica igual a antes — isso é
   esperado, não é falha.
3. Enquanto ninguém cadastrar jornada, **nenhum** aviso de horário
   atípico aparece. Isso é de propósito: avisar sem configuração
   transformaria todo agendamento em alerta. Os avisos de feriado e de
   bloqueio funcionam desde já.
4. Não há tela de cadastro de jornada ainda (é Fase 2). Para testar os
   avisos agora, insira uma faixa direto pelo SQL Editor:

```sql
insert into public.professional_schedules
  (professional_id, weekday, starts_at, ends_at, break_starts_at, break_ends_at, slot_minutes)
select id, generate_series(1, 5), '08:00', '18:00', '12:00', '13:00', 60
from public.profiles
where email = 'coloque-o-email-do-profissional-aqui';
```

## Como reverter

Nada aqui é destrutivo, mas se precisar voltar atrás:

```sql
drop function if exists public.list_clinic_members(uuid);
drop table if exists public.professional_schedules;
drop table if exists public.clinic_holidays;
-- devolve a guarda antiga (bloqueio volta a ser parede):
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (professional_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status not in ('cancelled', 'no_show', 'excused'));
```

As colunas novas de `appointments` podem ficar: são anuláveis ou têm
default, e nenhum código antigo as enxerga.
