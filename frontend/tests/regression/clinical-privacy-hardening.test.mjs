import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('exclusão de paciente vira pedido auditável e nunca DELETE direto', async () => {
  const [service, start, dashboard] = await Promise.all([
    readFile(path.join(root, 'src/services/patientService.js'), 'utf8'),
    readFile(path.join(root, 'src/components/PatientStart.jsx'), 'utf8'),
    readFile(path.join(root, 'src/components/panels/PainelInicial.jsx'), 'utf8'),
  ]);

  assert.match(service, /rpc\('request_patient_deletion'/);
  assert.doesNotMatch(service, /\.from\('patients'\)[\s\S]{0,120}\.delete\(\)/);
  assert.match(start, /arquivado e a solicitação de exclusão ficou pendente/i);
  assert.match(dashboard, /sem apagar prontuários automaticamente/i);
});

test('auditoria clínica vem do servidor sem payload e pseudo-audit local foi removido', async () => {
  const auditService = await readFile(
    path.join(root, 'src/services/clinicalAuditService.js'),
    'utf8',
  );
  assert.match(auditService, /rpc\('get_patient_audit_log'/);
  assert.doesNotMatch(auditService, /sensitive_data|payload|ciphertext|idempotency/i);

  await assert.rejects(
    access(path.join(root, 'src/utils/patientAuditLog.js')),
  );
});

test('exportação clínica em JSON sem criptografia permanece desativada', async () => {
  const dashboard = await readFile(
    path.join(root, 'src/components/panels/PainelInicial.jsx'),
    'utf8',
  );
  assert.doesNotMatch(dashboard, /new Blob\(\[JSON\.stringify\(backup/);
  assert.doesNotMatch(dashboard, /download\s*=\s*`backup-/);
  assert.match(dashboard, /Exportação clínica em JSON sem criptografia foi desativada/);
});

test('Psicologia usa CAS e idempotência na lane de anamnese', async () => {
  const source = await readFile(
    path.join(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  assert.match(source, /createClinicalSaveQueue/);
  assert.match(source, /upsertVersionedClinicalRecord/);
  assert.match(source, /const laneKey = `\$\{patientId\}:\$\{PSI_ANAMNESE_RECORD_TYPE\}`/);
  assert.doesNotMatch(source, /updateClinicalRecord|saveClinicalRecord/);
});

// Avaliação neuropsicológica migrou para a disciplina própria
// Neuropsicologia em 10/09/2026 — mesma proteção de CAS/idempotência,
// agora no workspace novo.
test('Neuropsicologia usa CAS e idempotência na lane de avaliação', async () => {
  const source = await readFile(
    path.join(root, 'src/components/NeuropsychologyWorkspace.jsx'),
    'utf8',
  );
  assert.match(source, /createClinicalSaveQueue/);
  assert.match(source, /upsertVersionedClinicalRecord/);
  assert.match(source, /const laneKey = `\$\{patientId\}:\$\{PSI_NEURO_RECORD_TYPE\}`/);
  assert.doesNotMatch(source, /updateClinicalRecord|saveClinicalRecord/);
});

test('troca de paciente limpa a ficha anterior antes da próxima pintura', async () => {
  const [app, hook, psychology, neuropsychology] = await Promise.all([
    readFile(path.join(root, 'src/App.jsx'), 'utf8'),
    readFile(path.join(root, 'src/hooks/useSessionPersistence.js'), 'utf8'),
    readFile(path.join(root, 'src/components/PsychologyWorkspace.jsx'), 'utf8'),
    readFile(path.join(root, 'src/components/NeuropsychologyWorkspace.jsx'), 'utf8'),
  ]);

  assert.match(app, /useLayoutEffect\(\(\) => \{[\s\S]*?isHydratingSessionRef\.current = true/);
  assert.match(hook, /useLayoutEffect\(\(\) => \{[\s\S]*?activePatientIdRef\.current = patientId/);
  assert.match(hook, /setState\(emptyState\);\s*setSelectedMap\(\{\}\)/);
  assert.match(psychology, /useLayoutEffect\(\(\) => \{[\s\S]*?setSession\(createEmptyPsychologySession\(\)\)/);
  assert.match(neuropsychology, /useLayoutEffect\(\(\) => \{[\s\S]*?setNeuroEvaluation\(createEmptyNeuropsychologyEvaluation\(\)\)/);
});
