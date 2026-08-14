import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';

// ============================================================
// Guarda de regressão para o achado crítico da auditoria de
// segurança 2026-08-11 (docs/auditoria-seguranca-2026-08-11.md,
// item C1): a migration 20260807 sobrescreveu, sem perceber, o
// isolamento entre clínicas que 20260723 tinha introduzido em
// get_shared_session. Nenhum teste existente pegou isso porque
// cada migration era testada isolada (ver hardening-blockers.test.mjs),
// nunca o ESTADO FINAL/CUMULATIVO do schema depois de todas as
// migrations aplicadas em ordem.
//
// Este teste não confia em qual arquivo específico define a função
// hoje: ele encontra, entre TODAS as migrations versionadas, a mais
// recente que contém `CREATE OR REPLACE FUNCTION
// public.get_shared_session` (ordem = ordem de aplicação real do
// `supabase db push`, que segue o nome do arquivo) e valida SÓ essa
// versão. Qualquer migration futura que reescreva a função sem manter
// as proteções abaixo quebra este teste, não importa o nome do arquivo.
// ============================================================

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

let latestDefinition;
let latestFile;

before(async () => {
  const entries = (await readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();

  const defRegex = /CREATE OR REPLACE FUNCTION public\.get_shared_session\b[\s\S]*?AS \$get_shared_session\$([\s\S]*?)\$get_shared_session\$;/;

  for (const name of entries) {
    const source = await readFile(path.join(migrationsDir, name), 'utf8');
    const match = source.match(defRegex);
    if (match) {
      latestDefinition = match[1];
      latestFile = name;
    }
  }
});

test('get_shared_session existe em pelo menos uma migration', () => {
  assert.ok(latestDefinition, 'nenhuma migration define public.get_shared_session');
});

test('a versão vigente (mais recente por ordem de arquivo) isola por clínica', () => {
  assert.match(
    latestDefinition,
    /v_patient_clinic IS DISTINCT FROM public\.user_clinic_id\(v_uid\)/,
    `${latestFile}: get_shared_session precisa rejeitar paciente de clínica diferente da do chamador`,
  );
});

test('a versão vigente restringe record_shares pela clínica do paciente', () => {
  assert.match(
    latestDefinition,
    /s\.clinic_id IS NOT DISTINCT FROM v_patient_clinic/,
    `${latestFile}: o compartilhamento usado para autorizar leitura precisa ser da mesma clínica do paciente`,
  );
});

test('a versão vigente lê a chave de criptografia só do Vault, nunca de app_config em texto puro', () => {
  assert.match(
    latestDefinition,
    /get_clinical_encryption_key\(\)/,
    `${latestFile}: precisa usar get_clinical_encryption_key() (Vault)`,
  );
  assert.doesNotMatch(
    latestDefinition,
    /FROM\s+public\.app_config/i,
    `${latestFile}: não pode voltar a ler a chave de criptografia de app_config em texto puro`,
  );
});

test('a versão vigente ainda redige por escopo para chamadores sem acesso pleno', () => {
  assert.match(
    latestDefinition,
    /filter_shared_session_payload/,
    `${latestFile}: leitura compartilhada sem acesso pleno precisa passar por redação de escopo (não devolver o registro cru)`,
  );
});
