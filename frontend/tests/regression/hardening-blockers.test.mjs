import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

let migration;
let queue;
let curationService;
let clinicalService;
let persistenceHook;
let psychologyWorkspace;
let shareDialog;
let recordSharesService;
let shareEdge;
let resetPasswordEdge;

before(async () => {
  [
    migration,
    queue,
    curationService,
    clinicalService,
    persistenceHook,
    psychologyWorkspace,
    shareDialog,
    recordSharesService,
    shareEdge,
    resetPasswordEdge,
  ] = await Promise.all([
    readFile(
      path.resolve(
        frontendRoot,
        '../supabase/migrations/20260723_clinical_data_hardening.sql',
      ),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/components/panels/CurationProposalsQueue.jsx'),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/services/curationProposalService.js'),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/services/clinicalRecordService.js'),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/hooks/useSessionPersistence.js'),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/components/PsychologyWorkspace.jsx'),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/components/SharePatientDialog.jsx'),
      'utf8',
    ),
    readFile(
      path.join(frontendRoot, 'src/services/recordSharesService.js'),
      'utf8',
    ),
    readFile(
      path.resolve(
        frontendRoot,
        '../supabase/functions/create-record-share/index.ts',
      ),
      'utf8',
    ),
    readFile(
      path.resolve(
        frontendRoot,
        '../supabase/functions/super-admin-reset-password/index.ts',
      ),
      'utf8',
    ),
  ]);
});

function functionBody(name) {
  const expression = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?`
      + `AS \\$${name}\\$([\\s\\S]*?)\\$${name}\\$;`,
  );
  const match = migration.match(expression);
  assert.ok(match, `função ${name} ausente`);
  return match[1];
}

test('compartilhamento não muda identidade e fica restrito à mesma clínica', () => {
  const defaults = functionBody('set_record_share_defaults');
  assert.match(defaults, /NEW\.clinic_id := v_patient_clinic/);
  assert.match(defaults, /NEW\.shared_by := v_uid/);
  assert.match(defaults, /ARRAY\['cadastro'\]/);

  const revocation = functionBody('enforce_record_share_revocation');
  for (const field of [
    'patient_id',
    'clinic_id',
    'from_discipline',
    'to_discipline',
    'shared_scopes',
    'shared_by',
  ]) {
    assert.match(
      revocation,
      new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`),
      `${field} precisa ser imutável`,
    );
  }
  assert.match(revocation, /OLD\.revoked_at IS NOT NULL OR NEW\.revoked_at IS NULL/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.record_shares FROM authenticated/,
  );
  assert.match(
    migration,
    /GRANT UPDATE \(revoked_at\) ON TABLE public\.record_shares TO authenticated/,
  );

  for (const rpc of ['get_shared_session', 'get_patient_audit_log']) {
    const body = functionBody(rpc);
    assert.match(
      body,
      /v_patient_clinic IS DISTINCT FROM public\.user_clinic_id\(v_uid\)/,
      `${rpc} precisa rejeitar acesso entre clínicas`,
    );
  }
});

test('retenção remove DELETE direto de paciente e prontuário', () => {
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Patients delete own after password change"/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Clinical records delete own after password change"/,
  );
  assert.match(
    migration,
    /REVOKE DELETE ON TABLE public\.patients FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.clinical_records FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.delete_clinical_record\(UUID\)[\s\S]*?authenticated/,
  );
  assert.doesNotMatch(clinicalService, /export async function deleteClinicalRecord/);
});

test('writers clínicos legados não contornam CAS nem idempotência', () => {
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Clinical records insert own after password change"/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Clinical records update own after password change"/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.insert_clinical_record\(UUID, TEXT, TEXT, TEXT\)[\s\S]*?authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.update_clinical_record\(UUID, TEXT\)[\s\S]*?authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.(?:insert|update)_clinical_record[^;]*authenticated/,
  );
  assert.doesNotMatch(clinicalService, /export async function (?:save|update)ClinicalRecord/);
});

test('Psicologia carrega a lane correta e promove legado sem sobrescrever coexistência', () => {
  assert.match(
    psychologyWorkspace,
    /getLatestRecord\(patientId, PSI_ANAMNESE_RECORD_TYPE, 'psicologia'\)/,
  );
  assert.match(
    psychologyWorkspace,
    /getLatestRecord\(patientId, PSI_NEURO_RECORD_TYPE, 'psicologia'\)/,
  );
  assert.match(migration, /WITH ranked_legacy_psychology AS/);
  assert.match(
    migration,
    /AND NOT EXISTS \([\s\S]*?canonical\.discipline = 'psicologia'/,
  );
  assert.match(
    migration,
    /SET discipline = 'psicologia',\s+revision = record\.revision \+ 1/,
  );
});

test('matrícula e compartilhamento exigem gate e reautenticação atômica na Edge', () => {
  const enrollmentDefaults = functionBody('set_enrollment_defaults');
  const enrollmentIdentity = functionBody('enforce_enrollment_identity');
  const shareRpc = functionBody('create_record_share_after_reauthentication');

  assert.match(enrollmentDefaults, /NEW\.clinic_id := v_patient_clinic/);
  assert.match(enrollmentDefaults, /NEW\.referred_by := v_uid/);
  assert.match(enrollmentIdentity, /NEW\.patient_id IS DISTINCT FROM OLD\.patient_id/);
  assert.match(enrollmentIdentity, /NEW\.discipline IS DISTINCT FROM OLD\.discipline/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.patient_enrollments/,
  );
  assert.match(
    migration,
    /GRANT UPDATE \(status, assigned_to\) ON TABLE public\.patient_enrollments/,
  );
  assert.match(shareRpc, /auth\.role\(\) <> 'service_role'/);
  assert.match(shareRpc, /INSERT INTO public\.patient_enrollments/);
  assert.match(shareRpc, /INSERT INTO public\.record_shares/);
  assert.match(shareRpc, /p_idempotency_key/);

  assert.match(shareEdge, /verifier\.auth\.signInWithPassword/);
  assert.match(shareEdge, /create_record_share_after_reauthentication/);
  assert.doesNotMatch(shareEdge, /password[,}]\s*\)/);
  assert.doesNotMatch(shareDialog, /verifyPassword|enrollPatient/);
  assert.match(shareDialog, /idempotencyKeyRef/);
  assert.match(recordSharesService, /functions\.invoke\('create-record-share'/);
  assert.doesNotMatch(
    recordSharesService,
    /\.from\('record_shares'\)[\s\S]{0,160}\.insert/,
  );
});

test('auditoria compartilhada exige escopo clínico além de cadastro', () => {
  const audit = functionBody('get_patient_audit_log');
  assert.match(
    audit,
    /s\.shared_scopes && ARRAY\[\s*'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio'/,
  );
});

test('reset de senha temporária fecha o gate antes de alterar Auth', () => {
  const profileUpdateAt = resetPasswordEdge.indexOf(".from('profiles')");
  const gateUpdateAt = resetPasswordEdge.indexOf('must_change_password: true', profileUpdateAt);
  const authUpdateAt = resetPasswordEdge.indexOf('auth.admin.updateUserById');

  assert.match(resetPasswordEdge, /validateStrongPassword/);
  assert.ok(gateUpdateAt >= 0 && authUpdateAt > gateUpdateAt);
  assert.doesNotMatch(resetPasswordEdge, /authError\.message|profileError\.message/);
});

test('decisão de conhecimento exige nota e rejeição também é transacional', () => {
  const rejection = functionBody('reject_knowledge_curation_proposal');
  assert.match(rejection, /Nota de decisão é obrigatória/);
  assert.match(rejection, /v_proposal\.type <> 'knowledge_review'/);
  assert.match(rejection, /SET status = 'rejected'/);
  assert.match(rejection, /INSERT INTO public\.knowledge_audit_log/);
  assert.match(rejection, /INSERT INTO public\.knowledge_outbox/);

  assert.match(curationService, /decisionNote\.length < 10/g);
  assert.match(queue, /approveKnowledgeCurationProposal\(\s*proposal\.id,\s*decisionNotes\[proposal\.id\]/);
  assert.match(queue, /rejectKnowledgeCurationProposal\(\s*proposal\.id,\s*decisionNotes\[proposal\.id\]/);
  assert.match(queue, /applied\.entity_approval_status === 'approved'/);
  assert.match(queue, /Justificativa da decisão/);
});

test('edição após falha de carga permanece marcada como pendente', () => {
  assert.match(
    persistenceHook,
    /loadBlockedPatientRef\.current === patientId[\s\S]*?setHasPendingChanges\(true\)[\s\S]*?setSaveStatus\('load_error'\)/,
  );
});
