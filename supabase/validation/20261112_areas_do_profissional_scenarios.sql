-- ==========================================================
-- Validação de 20261112_areas_do_profissional.sql (BEGIN … ROLLBACK)
--
-- Cenários:
--   1. terapeuta nutricionista criado com disciplines NULL nasce só
--      {nutricao} — nunca mais acupuntura automática;
--   2. profissão sem área mapeada ('outro') nasce SEM área;
--   3. recepção continua sem área e fora da agenda;
--   4. a administração troca as áreas: desconhecido some, repetido some,
--      e a ordem é a do catálogo, não a do aparelho;
--   5. a administração pode deixar alguém sem área nenhuma;
--   6. recepção não recebe área clínica nem pela RPC;
--   7. profissional comum não altera áreas de ninguém;
--   8. administração de outra instituição não alcança o perfil;
--   9. mudar a profissão de quem já tem áreas NÃO devolve acupuntura;
--  10. os dois cadastros errados saem corrigidos e a Denise mantém
--      a acupuntura dela.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'admin.areas@example.invalid'),
  ('a7000000-0000-4000-8000-000000000002', 'prof.areas@example.invalid'),
  ('a7000000-0000-4000-8000-000000000003', 'recep.areas@example.invalid'),
  ('a7000000-0000-4000-8000-000000000004', 'admin.outra@example.invalid'),
  ('a7000000-0000-4000-8000-000000000005', 'nutri.nova@example.invalid'),
  ('a7000000-0000-4000-8000-000000000006', 'outro.novo@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES
  ('c7000000-0000-4000-8000-000000000001', 'Clínica Validação Áreas'),
  ('c7000000-0000-4000-8000-000000000002', 'Outra Clínica Áreas');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, profession, disciplines)
VALUES
  ('a7000000-0000-4000-8000-000000000001', 'admin.areas@example.invalid', 'Admin Áreas', 'clinic_admin', 'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, 'outro', ARRAY['psicologia']),
  ('a7000000-0000-4000-8000-000000000002', 'prof.areas@example.invalid', 'Profissional Áreas', 'therapist', 'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, 'psicologo', ARRAY['psicologia']),
  ('a7000000-0000-4000-8000-000000000004', 'admin.outra@example.invalid', 'Admin Outra', 'clinic_admin', 'c7000000-0000-4000-8000-000000000002', TRUE, FALSE, 'outro', ARRAY['psicologia'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, profession = EXCLUDED.profession,
  disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

-- O gatilho de auth.users já cria a linha em profiles; os três perfis
-- abaixo são inseridos à mão para exercitar o INSERT do gatilho de áreas.
DELETE FROM public.profiles WHERE id IN (
  'a7000000-0000-4000-8000-000000000003',
  'a7000000-0000-4000-8000-000000000005',
  'a7000000-0000-4000-8000-000000000006');

-- ---------- 1, 2 e 3. como nasce ----------
DO $$
DECLARE
  v_disc TEXT[];
  v_agenda BOOLEAN;
BEGIN
  -- 1. nutricionista com disciplines NULL
  INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, profession, disciplines)
  VALUES ('a7000000-0000-4000-8000-000000000005', 'nutri.nova@example.invalid', 'Nutri Nova', 'therapist',
          'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, 'nutricionista', NULL);
  SELECT disciplines INTO v_disc FROM public.profiles WHERE id = 'a7000000-0000-4000-8000-000000000005';
  IF v_disc IS DISTINCT FROM ARRAY['nutricao']::TEXT[] THEN
    RAISE EXCEPTION 'cenario 1 falhou: nutricionista nasceu com %', v_disc;
  END IF;

  -- 2. profissão sem área mapeada
  INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, profession, disciplines)
  VALUES ('a7000000-0000-4000-8000-000000000006', 'outro.novo@example.invalid', 'Outro Novo', 'therapist',
          'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, 'outro', NULL);
  SELECT disciplines INTO v_disc FROM public.profiles WHERE id = 'a7000000-0000-4000-8000-000000000006';
  IF v_disc IS DISTINCT FROM ARRAY[]::TEXT[] THEN
    RAISE EXCEPTION 'cenario 2 falhou: profissão sem mapa nasceu com %', v_disc;
  END IF;

  -- 3. recepção
  INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, profession, disciplines, has_agenda)
  VALUES ('a7000000-0000-4000-8000-000000000003', 'recep.areas@example.invalid', 'Recepção Áreas', 'receptionist',
          'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, 'nutricionista', ARRAY['nutricao'], TRUE);
  SELECT disciplines, has_agenda INTO v_disc, v_agenda FROM public.profiles WHERE id = 'a7000000-0000-4000-8000-000000000003';
  IF v_disc IS DISTINCT FROM ARRAY[]::TEXT[] OR v_agenda THEN
    RAISE EXCEPTION 'cenario 3 falhou: recepção com % / agenda %', v_disc, v_agenda;
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

-- ---------- 4, 5 e 6. a administração ajusta ----------
DO $$
DECLARE
  v_out TEXT[];
BEGIN
  -- 4. desconhecido e repetido saem; ordem é a do catálogo
  v_out := public.set_member_disciplines('a7000000-0000-4000-8000-000000000002',
             ARRAY['aba', 'nutricao', 'xpto', 'nutricao']);
  IF v_out IS DISTINCT FROM ARRAY['nutricao', 'aba']::TEXT[] THEN
    RAISE EXCEPTION 'cenario 4 falhou: voltou %', v_out;
  END IF;
  -- (a leitura de volta fica para depois do RESET ROLE: sob a RLS de
  -- authenticated esta consulta não enxerga a linha do colega.)

  -- 5. pode ficar sem área
  v_out := public.set_member_disciplines('a7000000-0000-4000-8000-000000000002', ARRAY[]::TEXT[]);
  IF v_out IS DISTINCT FROM ARRAY[]::TEXT[] THEN
    RAISE EXCEPTION 'cenario 5 falhou: voltou %', v_out;
  END IF;

  -- grava de novo a lista bagunçada: a conferência do que ficou no banco
  -- é feita depois do RESET ROLE (cenário 4b).
  PERFORM public.set_member_disciplines('a7000000-0000-4000-8000-000000000002',
            ARRAY['aba', 'nutricao', 'xpto', 'nutricao']);

  -- 6. recepção nunca recebe área
  BEGIN
    PERFORM public.set_member_disciplines('a7000000-0000-4000-8000-000000000003', ARRAY['nutricao']);
    RAISE EXCEPTION 'cenario 6 falhou: recepção recebeu área';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ---------- 7. profissional comum não altera ----------
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_member_disciplines('a7000000-0000-4000-8000-000000000005', ARRAY['acupuntura']);
    RAISE EXCEPTION 'cenario 7 falhou: profissional alterou áreas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ---------- 8. administração de outra instituição ----------
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_member_disciplines('a7000000-0000-4000-8000-000000000005', ARRAY['acupuntura']);
    RAISE EXCEPTION 'cenario 8 falhou: admin de outra clínica alcançou o perfil';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- ---------- 4b. o que ficou gravado de verdade ----------
DO $$
DECLARE
  v_disc TEXT[];
BEGIN
  SELECT disciplines INTO v_disc FROM public.profiles WHERE id = 'a7000000-0000-4000-8000-000000000002';
  IF v_disc IS DISTINCT FROM ARRAY['nutricao', 'aba']::TEXT[] THEN
    RAISE EXCEPTION 'cenario 4b falhou: gravado %', v_disc;
  END IF;
END;
$$;

-- ---------- 9. trocar a profissão não devolve acupuntura ----------
DO $$
DECLARE
  v_disc TEXT[];
BEGIN
  UPDATE public.profiles SET profession = 'fisioterapeuta'
  WHERE id = 'a7000000-0000-4000-8000-000000000005';
  SELECT disciplines INTO v_disc FROM public.profiles WHERE id = 'a7000000-0000-4000-8000-000000000005';
  IF v_disc IS DISTINCT FROM ARRAY['nutricao']::TEXT[] THEN
    RAISE EXCEPTION 'cenario 9 falhou: virou %', v_disc;
  END IF;
END;
$$;

-- ---------- 10. os cadastros reais ----------
SELECT
  (SELECT disciplines FROM public.profiles WHERE id = 'cd7cd287-9326-43e9-88c3-53428f7988d5')
    = ARRAY['nutricao']::TEXT[] AS laize_so_nutricao,
  (SELECT disciplines FROM public.profiles WHERE id = '1bdd37c9-c791-47d7-bc21-9ae109f292a4')
    = ARRAY['fisioterapia']::TEXT[] AS paulo_so_fisio,
  (SELECT bool_and(disciplines @> ARRAY['acupuntura']::TEXT[]) FROM public.profiles WHERE full_name ILIKE 'Denise%')
    AS denise_mantem_acupuntura;

ROLLBACK;
