import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sql = await readFile(path.join(root, 'supabase/migrations/20261108d_aba_supervisao_formal.sql'), 'utf8');
const previous = await readFile(path.join(root, 'supabase/migrations/20261108b_aba_perfil_paciente.sql'), 'utf8');
const body = (name, text = sql) => {
  const match = text.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, name); return match[0];
};
const save = body('aba_save_supervision_draft');
const sign = body('aba_sign_supervision');
const ack = body('aba_ack_supervision');
const cancel = body('aba_void_supervision');
const list = body('aba_list_supervisions');
const lock = body('aba_supervision_lock');
const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.aba_supervision_records \(([\s\S]*?)\r?\n\);/)?.[1];

test('supervisão: schema fechado, texto cifrado, status com carimbos obrigatórios e nomes de CHECK sem colisão', () => {
  assert.ok(table);
  for (const key of ['supervisor_id', 'supervisee_id', 'created_by', 'updated_by']) assert.match(table, new RegExp(`${key} UUID NOT NULL REFERENCES public\\.profiles\\(id\\) ON DELETE RESTRICT`));
  assert.match(table, /patient_id UUID REFERENCES public\.patients\(id\) ON DELETE RESTRICT/);
  assert.match(table, /duration_minutes BETWEEN 1 AND 600/);
  assert.match(table, /modality IN \('individual', 'grupo'\)/);
  assert.match(table, /format IN \('presencial', 'online'\)/);
  assert.match(table, /status = 'assinado' AND signed_by IS NOT NULL AND signed_at IS NOT NULL/);
  assert.match(table, /status = 'anulado' AND signed_by IS NOT NULL AND signed_at IS NOT NULL\r?\n\s+AND void_reason_encrypted IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL/);
  assert.match(table, /CONSTRAINT aba_supervision_records_lifecycle_check CHECK/);
  assert.doesNotMatch(table, /CONSTRAINT aba_supervision_records_status_check/);
  assert.match(table, /UNIQUE \(clinic_id, client_event_id\)/);
  for (const key of ['agenda', 'decisions', 'void_reason']) {
    assert.match(table, new RegExp(`${key}_encrypted BYTEA`));
    assert.doesNotMatch(table, new RegExp(`\\b${key} (?:TEXT|JSONB)`));
  }
});

test('supervisão: RLS, gates e privilégio só das cinco RPCs; auxiliares internos não são API', () => {
  for (const name of ['aba_save_supervision_draft','aba_sign_supervision','aba_ack_supervision','aba_void_supervision','aba_list_supervisions','aba_supervision_can_manage','aba_supervision_lock']) {
    const fn = body(name);
    assert.match(fn, /SECURITY DEFINER\r?\nSET search_path = pg_catalog/);
    assert.match(fn, /v_uid UUID := public\.aba_require_gate\(\)/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]* FROM PUBLIC, anon`));
  }
  assert.match(sql, /ARRAY\['aba_supervision_records'\]/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY|DROP TABLE|DROP COLUMN|RAISE NOTICE|RAISE LOG/i);
  for (const name of ['aba_supervision_lock','aba_supervision_can_manage']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(UUID\\) FROM PUBLIC, anon, authenticated`));
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}`));
  }
});

test('supervisão: mesmo banco escolhe clínica/ator, equipe ativa e profissional ABA da clínica', () => {
  const manage = body('aba_supervision_can_manage');
  assert.match(manage, /person\.clinic_id = v_clinic/);
  assert.match(manage, /person\.is_active IS TRUE AND public\.aba_is_aba_professional\(person\.id\)/);
  assert.match(manage, /team\.supervisor_id = v_uid AND team\.archived_at IS NULL/);
  assert.match(manage, /member\.therapist_id = p_supervisee AND member\.ended_at IS NULL/);
  assert.match(save, /public\.aba_supervision_can_manage\(v_supervisee\)/);
  assert.doesNotMatch(save, /p_record ->> '(?:supervisor_id|clinic_id|created_by|updated_by|signed_by)'/);
  assert.match(save, /VALUES\(v_id,v_clinic,auth\.uid\(\),v_supervisee/);
  assert.match(save, /aba_require_patient\(v_patient, TRUE\)/);
  assert.match(save, /erased_at IS NULL FOR NO KEY UPDATE/);
  assert.match(save, /archived_at IS NOT NULL/);
  assert.match(save, /clock_timestamp\(\) AT TIME ZONE 'America\/Sao_Paulo'/);
  assert.match(save, /char_length\(p_record ->> v_key\) > 12000/);
});

test('supervisão: CAS e replay antes do CAS nas escritas; ciência só uma vez sob lock', () => {
  for (const fn of [save, sign, cancel]) {
    const replay = fn.indexOf('client_event_id = ');
    const cas = fn.indexOf('.revision <> ');
    assert.ok(replay >= 0 && cas > replay);
    assert.match(fn, /ERRCODE = '40001'/);
    assert.match(fn, /WHEN unique_violation THEN\r?\n\s+RAISE EXCEPTION 'Este evento já foi registrado em outra supervisão\. Recarregue\.' USING ERRCODE = '23505'/);
  }
  assert.match(ack, /aba_ack_supervision\(p_id UUID, p_client_event_id UUID\)/);
  assert.doesNotMatch(ack, /p_revision/);
  assert.match(ack, /v_record := public\.aba_supervision_lock\(p_id\)/);
  assert.match(ack, /v_record\.supervisee_id <> v_uid/);
  assert.match(ack, /v_record\.status <> 'assinado'/);
  assert.match(ack, /v_record\.supervisee_ack_at IS NOT NULL THEN RAISE/);
  assert.match(ack, /revision=record\.revision\+1/);
  assert.ok(lock.indexOf('public.patients') < lock.indexOf('FOR UPDATE;'));
  assert.match(lock, /erased_at IS NULL FOR NO KEY UPDATE/);
});

test('supervisão: assinatura imutável, anulação nominal com motivo cifrado, carimbos do banco', () => {
  assert.match(save, /v_existing\.status <> 'rascunho'/);
  assert.match(sign, /v_record\.supervisor_id = v_uid OR public\.is_clinic_admin\(v_uid\)/);
  assert.match(sign, /signed_by=auth\.uid\(\),signed_at=clock_timestamp\(\)/);
  assert.match(cancel, /v_record\.signed_by = v_uid OR public\.is_clinic_admin\(v_uid\)/);
  assert.match(cancel, /char_length\(btrim\(p_reason\)\) < 10/);
  assert.match(cancel, /void_reason_encrypted=public\.aba_encrypt\(btrim\(p_reason\)\)/);
  assert.match(cancel, /voided_by=auth\.uid\(\),voided_at=clock_timestamp\(\)/);
});

test('supervisão: histórico visível só aos autorizados, textos/paciente restritos no servidor e total só assinado', () => {
  assert.match(list, /record\.clinic_id = v_clinic/);
  assert.match(list, /p_supervisee_id IS NULL OR record\.supervisee_id=p_supervisee_id/);
  assert.match(list, /record\.supervisee_id=v_uid AND record\.status IN \('assinado','anulado'\)/);
  assert.match(list, /record\.supervisor_id=v_uid/);
  assert.match(list, /team\.supervisor_id=v_uid AND member\.therapist_id=record\.supervisee_id AND member\.ended_at IS NULL/);
  assert.match(list, /v_record\.patient_id IS NULL OR public\.aba_can_access_patient\(v_record\.patient_id,v_uid\)/);
  assert.match(list, /IF v_content_allowed THEN\r?\n\s+IF v_record\.patient_id IS NOT NULL THEN PERFORM public\.aba_require_patient/);
  assert.match(list, /'patient_id',CASE WHEN v_content_allowed THEN v_record\.patient_id ELSE NULL END/);
  for (const key of ['agenda','decisions','void_reason']) assert.match(list, new RegExp(`'${key}',CASE WHEN v_content_allowed THEN public\\.aba_decrypt_text\\(v_record\\.${key}_encrypted,v_key\\) ELSE NULL END`));
  assert.match(list, /'content_restricted',NOT v_content_allowed/);
  assert.match(list, /IF v_record\.status = 'assinado' THEN/);
  assert.match(list, /'records',v_rows,'totals'/);
  assert.doesNotMatch(list, /patient\.name|public\.patients.*name/);
});

test('SUP-1/2: exclusão é exatamente base 20261108b + locks/snapshot/limpeza autorizados', () => {
  const updated = body('admin_decide_patient_deletion');
  const added = [
    '  PERFORM 1 FROM public.patients WHERE id=v_req.patient_id FOR UPDATE;',
    "    'aba_supervision_records', (SELECT coalesce(jsonb_agg(to_jsonb(asup)), '[]'::jsonb) FROM public.aba_supervision_records asup WHERE asup.patient_id = v_req.patient_id),",
    '  UPDATE public.aba_supervision_records SET patient_id = NULL, agenda_encrypted = NULL, decisions_encrypted = NULL,',
    "    void_reason_encrypted = CASE WHEN status = 'anulado' THEN public.aba_encrypt('Motivo removido na exclusão do paciente.') ELSE NULL END,",
    '    revision = revision + 1 WHERE patient_id = v_req.patient_id;',
  ];
  for (const line of added) assert.equal(updated.split(/\r?\n/).filter(value => value === line).length, 1);
  assert.deepEqual(updated.split(/\r?\n/).filter(line => !added.includes(line)), body('admin_decide_patient_deletion', previous).split(/\r?\n/));
  assert.ok(updated.indexOf('FOR UPDATE;', updated.indexOf('PERFORM 1 FROM public.patients')) < updated.indexOf('SELECT jsonb_build_object('));
  assert.ok(updated.indexOf('INSERT INTO patient_erasure_backup.snapshots') < updated.indexOf('UPDATE public.aba_supervision_records'));
  assert.doesNotMatch(updated, /DELETE FROM public\.aba_supervision_records/);
  const clean = updated.match(/UPDATE public\.aba_supervision_records[\s\S]*?WHERE patient_id = v_req\.patient_id;/)[0];
  assert.doesNotMatch(clean, /duration_minutes|held_on|signed_at|signed_by|supervisee_ack_at|updated_at|updated_by|client_event_id\s*=/);
});

test('regra durável explica ciência, restrição de conteúdo e preservação das horas', async () => {
  const agents = await readFile(path.join(root,'AGENTS.md'),'utf8');
  const bullet = agents.split(/\r?\n/).find(line => line.startsWith('- ABA ('));
  assert.match(bullet, /Supervisão formal \(`aba_supervision_records`\)/);
  assert.match(bullet, /SUP-3/);
  assert.match(bullet, /SUP-1\/2/);
  assert.match(bullet, /sobe a revisão para barrar texto antigo/);
});

// QA (review da ACUP-008): mutações que passavam sem o teste notar.
test('QA: rascunho é o único editável e nenhuma RPC da supervisão vai para anon', () => {
  assert.match(save, /IF v_existing\.status <> 'rascunho' THEN RAISE EXCEPTION 'Só o rascunho pode ser editado; registro assinado ou anulado não muda\.' USING ERRCODE = '22023';/);
  for (const signature of ['aba_save_supervision_draft(JSONB)', 'aba_sign_supervision(UUID,BIGINT,UUID)', 'aba_ack_supervision(UUID,UUID)', 'aba_void_supervision(UUID,BIGINT,TEXT,UUID)', 'aba_list_supervisions(UUID)']) {
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon;`), `${signature}: REVOKE de PUBLIC e anon`);
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`), `${signature}: GRANT só para authenticated`);
  }
  assert.doesNotMatch(sql, /^GRANT [^;]*\b(?:anon|PUBLIC)\b[^;]*;/m);
});
