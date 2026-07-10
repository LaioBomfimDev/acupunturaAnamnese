-- ==========================================================
-- Compartilhamento de prontuário entre disciplinas (Fase 3)
-- Plano: docs/plano-clinica-multidisciplinar.md
-- REQUER: 20260707 e 20260708 aplicadas antes (reafirmadas por
-- segurança/idempotência abaixo).
--
-- O que muda:
--  * record_shares — encaminhamento explícito: profissional A
--    escolhe O QUE compartilha (escopos) com a disciplina B;
--  * is_clinic_admin() — o Adm da clínica (CEO) enxerga e age
--    sobre tudo DA SUA clínica (inclusive enviar);
--  * get_shared_session() — RPC de leitura que autoriza por
--    compartilhamento/admin (a get_clinical_records original, que
--    é dona-somente, permanece INTACTA — nada de risco nela).
--
-- LIMITE HONESTO: a sessão clínica é um único registro criptografado
-- ('full_session'). Portanto o BANCO garante o acesso no nível da
-- SESSÃO (o colega autorizado lê a sessão compartilhada); a escolha
-- de facetas (resumo/dores/progressão) é registrada em shared_scopes
-- para consentimento/auditoria e HONRADA na visualização. Separar
-- cada faceta em fronteira criptográfica é trabalho futuro.
--
-- Escrita clínica continua dona-somente. Compartilhamento é revogável
-- e auditável. Migração aditiva.
-- ==========================================================

-- Idempotência com Fases 1 e 2.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- ----------------------------------------------------------
-- Adm da clínica (CEO): mais que profissional, menos que SuperAdm.
-- Espelha is_super_admin (20260522): ativo e sem troca de senha pendente.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_clinic_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'clinic_admin'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_clinic_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_admin(UUID) TO authenticated;

-- ----------------------------------------------------------
-- record_shares — o "enviar para outro profissional/disciplina"
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.record_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  from_discipline TEXT NOT NULL CHECK (from_discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  to_discipline TEXT NOT NULL CHECK (to_discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  -- Facetas escolhidas pelo profissional (cadastro sempre incluso na origem).
  shared_scopes TEXT[] NOT NULL DEFAULT '{}',
  shared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  revoked_at TIMESTAMPTZ,
  CHECK (from_discipline <> to_discipline)
);

CREATE INDEX IF NOT EXISTS idx_record_shares_patient ON public.record_shares(patient_id);
CREATE INDEX IF NOT EXISTS idx_record_shares_active
  ON public.record_shares(patient_id, to_discipline) WHERE revoked_at IS NULL;

-- Preenche clinic_id e shared_by a partir do contexto.
CREATE OR REPLACE FUNCTION public.set_record_share_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT p.clinic_id INTO NEW.clinic_id FROM public.patients p WHERE p.id = NEW.patient_id;
  END IF;
  IF NEW.shared_by IS NULL THEN
    NEW.shared_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_share_defaults ON public.record_shares;
CREATE TRIGGER trg_record_share_defaults
  BEFORE INSERT ON public.record_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_record_share_defaults();

ALTER TABLE public.record_shares ENABLE ROW LEVEL SECURITY;

-- Ver os compartilhamentos: quem é da clínica (metadado do encaminhamento).
DROP POLICY IF EXISTS record_shares_select_clinic ON public.record_shares;
CREATE POLICY record_shares_select_clinic ON public.record_shares
  FOR SELECT TO authenticated
  USING (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR shared_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.therapist_id = auth.uid())
  );

-- Criar compartilhamento (enviar): dono do paciente OU adm/superadm da clínica.
DROP POLICY IF EXISTS record_shares_insert ON public.record_shares;
CREATE POLICY record_shares_insert ON public.record_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.therapist_id = auth.uid())
    OR (
      (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = patient_id AND p.clinic_id = public.user_clinic_id(auth.uid())
      )
    )
  );

-- Revogar (UPDATE de revoked_at): quem compartilhou OU adm/superadm da clínica.
DROP POLICY IF EXISTS record_shares_update ON public.record_shares;
CREATE POLICY record_shares_update ON public.record_shares
  FOR UPDATE TO authenticated
  USING (
    shared_by = auth.uid()
    OR (
      (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
      AND clinic_id = public.user_clinic_id(auth.uid())
    )
  )
  WITH CHECK (
    shared_by = auth.uid()
    OR (
      (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
      AND clinic_id = public.user_clinic_id(auth.uid())
    )
  );

-- Sem DELETE: compartilhamento se revoga (revoked_at), não se apaga (auditoria).
GRANT SELECT, INSERT, UPDATE ON public.record_shares TO authenticated;

-- ----------------------------------------------------------
-- Adm da clínica enxerga TODOS os pacientes da SUA clínica
-- (política ADICIONAL de SELECT; a do dono da Fase 2 segue valendo).
-- ----------------------------------------------------------
DROP POLICY IF EXISTS patients_select_clinic_admin ON public.patients;
CREATE POLICY patients_select_clinic_admin ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  );

-- ----------------------------------------------------------
-- Leitura autorizada da sessão compartilhada.
-- Autoriza por: dono | adm/superadm da clínica | compartilhamento
-- ativo para uma disciplina do chamador. A get_clinical_records
-- original (dona-somente) NÃO é tocada.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_session(p_patient_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $get_shared_session$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_patient_clinic UUID;
  v_authorized BOOLEAN := FALSE;
BEGIN
  SELECT ac.value INTO v_key FROM public.app_config ac WHERE ac.key = 'encryption_key';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  SELECT p.clinic_id INTO v_patient_clinic FROM public.patients p WHERE p.id = p_patient_id;

  -- Dono do paciente.
  IF EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id AND p.therapist_id = v_uid) THEN
    v_authorized := TRUE;
  -- Adm/SuperAdm da mesma clínica.
  ELSIF (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
        AND v_patient_clinic IS NOT NULL
        AND v_patient_clinic = public.user_clinic_id(v_uid) THEN
    v_authorized := TRUE;
  -- Compartilhamento ativo para uma disciplina do chamador.
  ELSIF EXISTS (
    SELECT 1 FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY (public.user_disciplines(v_uid))
  ) THEN
    v_authorized := TRUE;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Acesso negado: sem compartilhamento ativo para este paciente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT AS sensitive_data,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.record_type = 'full_session'
  ORDER BY cr.updated_at DESC;
END;
$get_shared_session$;

REVOKE EXECUTE ON FUNCTION public.get_shared_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shared_session(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
