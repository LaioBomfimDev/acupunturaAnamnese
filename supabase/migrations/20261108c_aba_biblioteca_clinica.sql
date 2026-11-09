-- ACUP-006: biblioteca da clínica (modelos, nunca dados de paciente).
-- REQUER: 20261101b_aba_coleta.sql (gates, profissionais ABA, times e permissões).
-- Aplicar em transação; idempotente, sem seed/cópia do catálogo do sistema.
-- Reversão funcional: revogar EXECUTE da escrita, conservar tabela e leitura;
-- reaplicar reativa. Não apagar registros nem restaurar exclusão de paciente.
-- content é o modelo não clínico em JSONB, com chaves fechadas do abaLibrary.js.
-- Não receber aqui nomes, diagnóstico ou observações de pacientes.
-- API: list() retorna array (inclusive ocultos/arquivados para gestão/mesclagem).
-- save({id, revision, client_event_id, kind, system_key?, content, status?}):
-- id UUID estável do cliente, revision 0 cria. Retorna {id,revision,client_event_id}.
-- Omitidos preservam conteúdo/status; kind/system_key são imutáveis após criar.
-- Replay do último evento no mesmo id devolve o mesmo retorno sem trocar carimbos;
-- evento anterior com CAS velho = 40001; evento usado em outro item = 23505 pt-BR.
-- Lock na clínica serializa criações e replay; NO KEY UPDATE permite novos filhos.

DO $requires$
BEGIN
  IF to_regclass('public.aba_care_teams') IS NULL
     OR to_regprocedure('public.aba_require_gate()') IS NULL
     OR to_regprocedure('public.aba_is_aba_professional(uuid)') IS NULL
     OR to_regprocedure('public.is_clinic_admin(uuid)') IS NULL
     OR to_regprocedure('public.user_clinic_id(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABA: aplique antes 20261101b_aba_coleta.sql.';
  END IF;
END;
$requires$;

CREATE TABLE IF NOT EXISTS public.aba_library_items (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('objetivo', 'tecnica')),
  system_key TEXT CHECK (system_key IS NULL OR system_key ~ '^[a-z0-9][a-z0-9_-]{0,119}$'),
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::TEXT) <= 65536),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'oculto', 'arquivado')),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  client_event_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_library_items_system_status CHECK (system_key IS NULL OR status IN ('ativo', 'oculto')),
  CONSTRAINT aba_library_items_title CHECK (
    (kind = 'objetivo' AND content ->> 'title' IS NOT NULL AND NULLIF(btrim(content ->> 'title'), '') IS NOT NULL)
    OR (kind = 'tecnica' AND content ->> 'name' IS NOT NULL AND NULLIF(btrim(content ->> 'name'), '') IS NOT NULL)
  ),
  CONSTRAINT aba_library_items_event_key UNIQUE (clinic_id, client_event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS aba_library_items_system_key
  ON public.aba_library_items(clinic_id, kind, system_key) WHERE system_key IS NOT NULL;

DO $protect$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['aba_library_items']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END;
$protect$;

CREATE OR REPLACE FUNCTION public.aba_list_library()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_list_library$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
BEGIN
  IF v_clinic IS NULL OR NOT (public.is_clinic_admin(v_uid) OR public.aba_is_aba_professional(v_uid)) THEN
    RAISE EXCEPTION 'Só profissionais ABA da instituição e a administração podem ler a biblioteca.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.kind, item.created_at, item.id), '[]'::JSONB)
    FROM public.aba_library_items AS item WHERE item.clinic_id = v_clinic);
END;
$aba_list_library$;

CREATE OR REPLACE FUNCTION public.aba_save_library_item(p_item JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_library_item$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_id UUID;
  v_revision BIGINT;
  v_event UUID;
  v_existing public.aba_library_items%ROWTYPE;
  v_saved public.aba_library_items%ROWTYPE;
  v_kind TEXT;
  v_system TEXT;
  v_status TEXT;
  v_content JSONB;
  v_keys TEXT[];
  v_key TEXT;
  v_value JSONB;
  v_config_key TEXT;
  v_config_value JSONB;
BEGIN
  IF v_clinic IS NULL OR NOT (public.is_clinic_admin(v_uid) OR EXISTS (
    SELECT 1 FROM public.aba_care_teams AS team
    WHERE team.clinic_id = v_clinic AND team.supervisor_id = v_uid AND team.archived_at IS NULL
  )) THEN
    RAISE EXCEPTION 'Só a administração ou a supervisão de time ativo da instituição pode alterar a biblioteca.' USING ERRCODE = '42501';
  END IF;
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Item da biblioteca inválido.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_id := (p_item ->> 'id')::UUID;
    v_revision := (p_item ->> 'revision')::BIGINT;
    v_event := (p_item ->> 'client_event_id')::UUID;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Informe identificador, revisão e evento válidos para o item.' USING ERRCODE = '22023';
  END;
  IF v_id IS NULL OR v_revision IS NULL OR v_revision < 0 OR v_event IS NULL THEN
    RAISE EXCEPTION 'Informe identificador, revisão e evento do item.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.clinics WHERE id = v_clinic FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instituição indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_existing FROM public.aba_library_items WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.clinic_id <> v_clinic THEN
      RAISE EXCEPTION 'Item indisponível nesta instituição.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.client_event_id = v_event THEN
      RETURN jsonb_build_object('id', v_existing.id, 'revision', v_existing.revision, 'client_event_id', v_existing.client_event_id);
    END IF;
    IF v_existing.revision <> v_revision THEN
      RAISE EXCEPTION 'Item alterado por outra pessoa. Recarregue antes de salvar.' USING ERRCODE = '40001';
    END IF;
    IF (p_item ? 'kind' AND (p_item ->> 'kind') IS DISTINCT FROM v_existing.kind)
       OR (p_item ? 'system_key' AND (p_item ->> 'system_key') IS DISTINCT FROM v_existing.system_key) THEN
      RAISE EXCEPTION 'Tipo e referência do sistema não podem mudar depois da criação.' USING ERRCODE = '22023';
    END IF;
  ELSIF v_revision <> 0 THEN
    RAISE EXCEPTION 'Item inexistente: a revisão inicial é zero.' USING ERRCODE = '40001';
  END IF;

  v_kind := COALESCE(v_existing.kind, p_item ->> 'kind');
  v_system := CASE WHEN v_existing.id IS NOT NULL THEN v_existing.system_key ELSE p_item ->> 'system_key' END;
  v_status := CASE WHEN p_item ? 'status' THEN p_item ->> 'status' ELSE COALESCE(v_existing.status, 'ativo') END;
  v_content := CASE WHEN p_item ? 'content' THEN p_item -> 'content' ELSE v_existing.content END;
  IF v_kind IS NULL OR v_kind NOT IN ('objetivo', 'tecnica')
     OR v_status IS NULL OR v_status NOT IN ('ativo', 'oculto', 'arquivado') THEN
    RAISE EXCEPTION 'Tipo ou estado do item da biblioteca inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_system IS NOT NULL AND (jsonb_typeof(p_item -> 'system_key') IS DISTINCT FROM 'string' AND v_existing.id IS NULL
     OR v_system !~ '^[a-z0-9][a-z0-9_-]{0,119}$') THEN
    RAISE EXCEPTION 'Referência do sistema inválida: use até 120 letras minúsculas, números, hífen ou sublinhado.' USING ERRCODE = '22023';
  END IF;
  IF v_system IS NOT NULL AND v_status = 'arquivado' THEN
    RAISE EXCEPTION 'Item do sistema só pode ficar ativo ou oculto; não pode ser arquivado.' USING ERRCODE = '22023';
  END IF;
  IF v_content IS NULL OR jsonb_typeof(v_content) <> 'object' OR octet_length(v_content::TEXT) > 65536 THEN
    RAISE EXCEPTION 'Conteúdo da biblioteca precisa ser um objeto de até 65536 bytes.' USING ERRCODE = '22023';
  END IF;
  v_keys := CASE WHEN v_kind = 'objetivo'
    THEN ARRAY['category','level','title','objective','target','skill','suggestedFormat','suggestedPrompt','suggestedProcedure']
    ELSE ARRAY['code','category','name','whenToUse','howToApply','example','caution','restricted','goals','behaviorFunctions','suggestedConfig','sortOrder'] END;
  IF (v_content - v_keys) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'Conteúdo contém campos que não pertencem ao modelo da biblioteca.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(v_content ->> CASE WHEN v_kind = 'objetivo' THEN 'title' ELSE 'name' END), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o título do objetivo ou o nome da técnica.' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_content) LOOP
    IF v_key IN ('level', 'sortOrder') THEN
      IF jsonb_typeof(v_value) <> 'number' OR v_value::TEXT !~ '^[0-9]{1,9}$' THEN
        RAISE EXCEPTION 'Nível e ordem do modelo precisam ser números inteiros não negativos de até nove dígitos.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_key = 'restricted' THEN
      IF jsonb_typeof(v_value) <> 'boolean' THEN
        RAISE EXCEPTION 'A indicação de técnica restrita precisa ser verdadeira ou falsa.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_key IN ('goals', 'behaviorFunctions') THEN
      IF jsonb_typeof(v_value) <> 'array' THEN
        RAISE EXCEPTION 'Objetivos e funções da técnica precisam ser listas de textos.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_value) > 32 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_value) AS item
        WHERE jsonb_typeof(item) <> 'string' OR char_length(item #>> '{}') > 120) THEN
        RAISE EXCEPTION 'Objetivos e funções aceitam até 32 textos de até 120 caracteres.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_key = 'suggestedConfig' THEN
      IF jsonb_typeof(v_value) <> 'object' THEN
        RAISE EXCEPTION 'Configuração sugerida precisa ser um objeto.' USING ERRCODE = '22023';
      END IF;
      IF (v_value - ARRAY['collection_type','teaching_format','reinforcement_schedule','prompt_hierarchy','prompt_fading','time_measure','procedure','token_economy','goal_direction']) <> '{}'::JSONB THEN
        RAISE EXCEPTION 'Configuração sugerida contém campos não previstos no catálogo.' USING ERRCODE = '22023';
      END IF;
      FOR v_config_key, v_config_value IN SELECT key, value FROM jsonb_each(v_value) LOOP
        IF v_config_key = 'token_economy' THEN
          IF jsonb_typeof(v_config_value) <> 'boolean' THEN
            RAISE EXCEPTION 'Economia de fichas precisa ser verdadeira ou falsa.' USING ERRCODE = '22023';
          END IF;
        ELSIF v_config_key = 'prompt_hierarchy' THEN
          IF jsonb_typeof(v_config_value) <> 'array' THEN
            RAISE EXCEPTION 'Hierarquia de ajuda precisa ser uma lista de textos.' USING ERRCODE = '22023';
          END IF;
          IF jsonb_array_length(v_config_value) > 32 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_config_value) AS item
            WHERE jsonb_typeof(item) <> 'string' OR char_length(item #>> '{}') > 120) THEN
            RAISE EXCEPTION 'Hierarquia de ajuda aceita até 32 textos de até 120 caracteres.' USING ERRCODE = '22023';
          END IF;
        ELSIF jsonb_typeof(v_config_value) <> 'string' OR char_length(v_config_value #>> '{}') > 1000 THEN
          RAISE EXCEPTION 'Valores da configuração sugerida precisam ser textos de até 1000 caracteres.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    ELSIF NOT (v_key = 'caution' AND v_value = 'null'::JSONB) THEN
      IF jsonb_typeof(v_value) <> 'string' OR char_length(v_value #>> '{}') > 6000 THEN
        RAISE EXCEPTION 'Textos do modelo precisam ter até 6000 caracteres.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.aba_library_items (id, clinic_id, kind, system_key, content, status, client_event_id, created_by, updated_by)
    VALUES (v_id, v_clinic, v_kind, v_system, v_content, v_status, v_event, auth.uid(), auth.uid())
    RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_library_items AS item SET content = v_content, status = v_status,
      revision = item.revision + 1, client_event_id = v_event, updated_by = auth.uid(), updated_at = clock_timestamp()
    WHERE item.id = v_id AND item.clinic_id = v_clinic RETURNING * INTO v_saved;
  END IF;
  RETURN jsonb_build_object('id', v_saved.id, 'revision', v_saved.revision, 'client_event_id', v_saved.client_event_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta referência do sistema ou este evento já foi registrado na biblioteca. Recarregue antes de continuar.' USING ERRCODE = '23505';
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Item da biblioteca inválido: confira tipo, estado, referência e conteúdo.' USING ERRCODE = '22023';
END;
$aba_save_library_item$;

REVOKE ALL ON FUNCTION public.aba_list_library() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_library_item(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_list_library() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_library_item(JSONB) TO authenticated;
