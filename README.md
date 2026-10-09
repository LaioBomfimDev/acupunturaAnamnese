# Vitalis — Sistema Acup

Plataforma clínica multidisciplinar para organizar pacientes, agenda, prontuários, evoluções, gestão e conhecimento assistivo. O produto aparece como **Vitalis** na interface; **Sistema Acup** é o nome histórico do repositório.

## Estado atual — 06/10/2026

O projeto está em desenvolvimento ativo, com uma base funcional ampla:

- hub clínico com Agenda, Evoluções, Pacientes, Gestão e Documentos;
- áreas de Acupuntura, Fisioterapia, Psicologia, Nutrição e Neuropsicologia;
- anamnese, avaliações por disciplina, raciocínio assistido, protocolos, relatórios e Biblioteca Viva;
- perfis e permissões para profissional, recepção, administração, revisão e SuperAdm;
- experiência responsiva unificada para celular e tablet até 1024 px;
- backend Supabase com migrations, RLS, RPCs, Edge Functions e proteção de dados clínicos;
- suíte de regressão, lint, build, verificações de segurança e limite de bundle no CI.

Trabalho local em andamento neste snapshot:

- ferramenta da Agenda para copiar horários vagos;
- fundações da Área do Paciente e de formulários online importáveis.

Esses itens em andamento ainda precisam passar pelo gate completo e pelas etapas de implantação. O estado do repositório não confirma, por si só, quais migrations ou versões já estão em produção.

## Princípios do produto

- A IA é assistiva: nenhuma sugestão vira diagnóstico ou conduta final sem revisão profissional.
- Conhecimento curado permanece em `draft` ou `review` até aprovação humana.
- Dados clínicos exigem autorização no servidor; secrets e service role nunca vão para o frontend.
- Dietoterapia e ervas têm finalidade educativa e dependem de revisão profissional.
- Todo texto visível ao usuário deve estar em pt-BR.

As regras completas de desenvolvimento e segurança estão em [AGENTS.md](AGENTS.md).

## Stack

- React 19 + Vite 8
- Supabase (Postgres, Auth, RLS, Storage e Edge Functions)
- JavaScript/JSX e funções TypeScript no Supabase
- testes de regressão com o test runner nativo do Node.js
- Vercel para o frontend e GitHub Actions para o quality gate

## Estrutura

- `frontend/` — aplicação web, serviços, estilos e testes de regressão.
- `supabase/` — migrations, configuração, RPCs e Edge Functions.
- `docs/` — decisões, runbooks, planos e regras clínicas/técnicas.
- `tools/` — scripts auxiliares e ferramentas de manutenção.

## Rodar localmente

Requer Node.js 22.

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

No PowerShell, substitua o `cp` por:

```powershell
Copy-Item .env.example .env.local
```

Preencha somente as chaves públicas em `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

O fallback local de autenticação exige `DEV` e opt-in explícito. Nunca coloque service role key, tokens ou dados clínicos em arquivos versionados.

## Validar antes de commit ou push

```bash
cd frontend
npm run quality
```

O comando executa invariantes de segurança, lint, testes de regressão, build de produção e verificação do bundle. O mesmo gate roda em pull requests e na branch `main`.

## Deploy

Na Vercel, use `frontend` como diretório raiz, `npm run build` como comando e `dist` como saída. Configure apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; funções e secrets administrativos ficam no Supabase.

Antes de alterações sensíveis em dados clínicos, consulte o [runbook de produção](docs/runbook-hardening-producao.md). A migration de hardening é fail-closed e depende de `clinical_records_encryption_key` no Supabase Vault.
