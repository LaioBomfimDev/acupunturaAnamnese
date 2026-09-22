import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';

// ============================================================
// Guarda de regressão para o BOLA achado em 2026-09-22 durante debug
// de agenda: `appointments_insert`, `professional_schedules_insert` e
// `satisfaction_surveys_insert` escreviam a checagem de clínica do
// paciente/profissional como `pa.clinic_id = clinic_id` (bare). Como a
// subquery correlacionada (EXISTS ... FROM patients pa / profiles pr)
// também tem uma coluna `clinic_id`, o Postgres resolve o `clinic_id`
// bare para o escopo mais interno — a checagem virava
// `pa.clinic_id = pa.clinic_id`, sempre verdadeira, e a política nunca
// comparava com a clínica da linha sendo inserida. Corrigido em
// 20260922_fix_clinic_id_rls_shadowing.sql qualificando o lado de fora
// pelo NOME DA TABELA (ex.: `appointments.clinic_id`).
//
// Mesmo padrão do teste de shared-session-cumulative-hardening: não
// confia em qual arquivo define a política hoje. Para cada política,
// pega a definição MAIS RECENTE entre todas as migrations versionadas
// (ordem de arquivo = ordem real de aplicação do `supabase db push`) e
// valida só essa versão final. Qualquer migration futura que reescreva
// a política e reintroduza a tautologia quebra este teste, não importa
// o nome do arquivo.
//
// Cobre também as 3 políticas que a varredura ampla (mesmo dia) achou
// com o padrão sintático parecido mas que já eram corretas
// (qualificadas pelo nome da tabela, sem shadowing) — para garantir
// que elas não REGRIDAM para a forma ambígua.
// ============================================================

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

let migrationFiles;

before(async () => {
  const entries = await readdir(migrationsDir);
  migrationFiles = entries.filter(name => name.endsWith('.sql')).sort();
});

async function latestPolicyDefinition(policyName) {
  const expression = new RegExp(
    `CREATE POLICY ${policyName}\\b[\\s\\S]*?;`,
  );
  let latest;
  let latestFile;
  for (const name of migrationFiles) {
    const source = await readFile(path.join(migrationsDir, name), 'utf8');
    const match = source.match(expression);
    if (match) {
      latest = match[0];
      latestFile = name;
    }
  }
  assert.ok(latest, `nenhuma migration define a política ${policyName}`);
  return { body: latest, file: latestFile };
}

// [policyName, alias usado na subquery correlacionada]
const fixedPolicies = [
  ['appointments_insert', ['pa', 'pr']],
  ['professional_schedules_insert', ['pr']],
  ['satisfaction_surveys_insert', ['pa']],
];

for (const [policyName, aliases] of fixedPolicies) {
  test(`${policyName}: a versão vigente não compara clinic_id com ele mesmo (shadowing)`, async () => {
    const { body, file } = await latestPolicyDefinition(policyName);
    for (const alias of aliases) {
      // Forma "deparseada" do bug (o que pg_policies mostra ao vivo
      // quando o Postgres amarrou um `clinic_id` bare no escopo interno).
      const tautology = new RegExp(`${alias}\\.clinic_id\\s*=\\s*${alias}\\.clinic_id`);
      assert.doesNotMatch(
        body,
        tautology,
        `${file}: ${policyName} não pode comparar ${alias}.clinic_id com ele mesmo — isso é sempre verdadeiro e não filtra por clínica`,
      );
      // Forma como o bug aparece no SOURCE da migration: `clinic_id` bare
      // do lado direito, sem qualificar pelo nome da tabela de fora. É
      // isso que o Postgres amarra para o escopo interno (shadowing) e
      // vira a tautologia acima quando a política é criada.
      const bareRhs = new RegExp(`${alias}\\.clinic_id\\s*=\\s*clinic_id\\b`);
      assert.doesNotMatch(
        body,
        bareRhs,
        `${file}: ${policyName} compara ${alias}.clinic_id com um "clinic_id" bare — isso amarra no escopo interno (a própria subquery), não na linha de fora. Qualifique com o nome da tabela.`,
      );
    }
  });

  test(`${policyName}: a versão vigente qualifica o lado de fora pelo nome da tabela`, async () => {
    const { body, file } = await latestPolicyDefinition(policyName);
    const tableName = policyName.includes('appointments')
      ? 'appointments'
      : policyName.includes('professional_schedules')
        ? 'professional_schedules'
        : 'satisfaction_surveys';
    for (const alias of aliases) {
      const qualified = new RegExp(`${alias}\\.clinic_id\\s*=\\s*${tableName}\\.clinic_id`);
      assert.match(
        body,
        qualified,
        `${file}: ${policyName} precisa comparar ${alias}.clinic_id com ${tableName}.clinic_id (a linha sendo inserida), não com um bare "clinic_id" ambíguo`,
      );
    }
  });
}

// As 3 políticas da mesma varredura que já eram corretas (qualificadas
// pelo nome da tabela) — guarda contra regressão para a forma bare.
const alreadyCorrectPolicies = [
  ['enrollments_insert_initial_own', 'patient_enrollments'],
  ['record_shares_select_clinic', 'record_shares'],
  ['record_shares_update', 'record_shares'],
];

for (const [policyName, tableName] of alreadyCorrectPolicies) {
  test(`${policyName}: continua qualificando clinic_id pelo nome da tabela (${tableName})`, async () => {
    const { body, file } = await latestPolicyDefinition(policyName);
    assert.match(
      body,
      new RegExp(`clinic_id\\s*=\\s*${tableName}\\.clinic_id`),
      `${file}: ${policyName} precisa continuar comparando com ${tableName}.clinic_id explicitamente qualificado`,
    );
    assert.doesNotMatch(
      body,
      /\bp\.clinic_id\s*=\s*p\.clinic_id\b/,
      `${file}: ${policyName} não pode virar uma tautologia p.clinic_id = p.clinic_id`,
    );
  });
}
