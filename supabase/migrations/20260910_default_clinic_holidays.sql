-- ==========================================================
-- Feriados nacionais pré-cadastrados automaticamente por clínica
--
-- Contexto (decisão da usuária, 2026-09-10): depois de cadastrar os
-- feriados de 2026/2027 manualmente só na Clínica Reability (SQL
-- direto, uma vez), ela pediu pra generalizar — toda clínica (as que
-- já existem e as que forem criadas depois) deve nascer com os
-- feriados nacionais já pré-cadastrados, e o admin só valida (checkbox
-- "clínica atende neste dia" já existe em HolidaysEditor.jsx) em vez
-- de digitar um por um. Digitar manualmente continua possível, sem
-- mudança nenhuma — isto só ACRESCENTA um ponto de partida.
--
-- easter_sunday() existe pra não precisar atualizar uma lista de datas
-- todo ano: Carnaval, Sexta-feira Santa e Corpus Christi são calculados
-- (algoritmo de Gregorian Computus, contas conferidas à mão pra
-- 2026-04-05 e 2027-03-28, batem com o calendário oficial) — funciona
-- pra qualquer ano, não só os que alguém lembrou de digitar.
--
-- O gatilho em clinics cobre QUALQUER caminho de criação (o painel da
-- clínica insere direto na tabela — clinicService.js — e qualquer outro
-- que exista ou venha a existir), porque é do banco, não da tela.
--
-- Limite aceito: o gatilho roda só na CRIAÇÃO da clínica, com 5 anos de
-- fôlego (ano atual + 4). Uma clínica muito antiga sem ninguém rodar
-- seed_default_holidays nela de novo eventualmente fica sem feriado
-- novo — top-up periódico é um problema separado, não resolvido aqui.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Domingo de Páscoa de um ano qualquer (Gregorian Computus)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.easter_sunday(p_year int)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  WITH k AS (
    SELECT
      p_year % 19 AS a,
      p_year / 100 AS b,
      p_year % 100 AS c
  ), k2 AS (
    SELECT a, b, c,
      b / 4 AS d,
      b % 4 AS e,
      (b + 8) / 25 AS f
    FROM k
  ), k3 AS (
    SELECT a, b, c, d, e,
      (b - f + 1) / 3 AS g
    FROM k2
  ), k4 AS (
    SELECT a, c, e, g,
      (19 * a + b - d - g + 15) % 30 AS h,
      c / 4 AS i,
      c % 4 AS j
    FROM k3
  ), k5 AS (
    SELECT a, h,
      (32 + 2 * e + 2 * i - h - j) % 7 AS l
    FROM k4
  ), k6 AS (
    SELECT h, l,
      (a + 11 * h + 22 * l) / 451 AS m
    FROM k5
  )
  SELECT make_date(
    p_year,
    (h + l - 7 * m + 114) / 31,
    ((h + l - 7 * m + 114) % 31) + 1
  )
  FROM k6;
$$;

-- ----------------------------------------------------------
-- 2. Semeia os feriados nacionais de uma clínica, ano a ano
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_holidays(
  p_clinic_id uuid,
  p_from_year int,
  p_to_year int
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  y int;
  pascoa date;
BEGIN
  FOR y IN p_from_year..p_to_year LOOP
    pascoa := public.easter_sunday(y);

    INSERT INTO public.clinic_holidays (clinic_id, day, name, is_working_day)
    VALUES
      (p_clinic_id, make_date(y, 1, 1), 'Confraternização Universal', false),
      (p_clinic_id, pascoa - 48, 'Carnaval (segunda-feira)', false),
      (p_clinic_id, pascoa - 47, 'Carnaval (terça-feira)', false),
      (p_clinic_id, pascoa - 2, 'Sexta-feira Santa', false),
      (p_clinic_id, make_date(y, 4, 21), 'Tiradentes', false),
      (p_clinic_id, make_date(y, 5, 1), 'Dia do Trabalho', false),
      (p_clinic_id, pascoa + 60, 'Corpus Christi', false),
      (p_clinic_id, make_date(y, 9, 7), 'Independência do Brasil', false),
      (p_clinic_id, make_date(y, 10, 12), 'Nossa Senhora Aparecida', false),
      (p_clinic_id, make_date(y, 11, 2), 'Finados', false),
      (p_clinic_id, make_date(y, 11, 15), 'Proclamação da República', false),
      (p_clinic_id, make_date(y, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra', false),
      (p_clinic_id, make_date(y, 12, 25), 'Natal', false)
    ON CONFLICT (clinic_id, day) DO NOTHING;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------
-- 3. Gatilho: toda clínica nova já nasce com 5 anos de feriado
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_holidays_for_new_clinic()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ano_atual int := EXTRACT(YEAR FROM timezone('utc', now()))::int;
BEGIN
  PERFORM public.seed_default_holidays(NEW.id, ano_atual, ano_atual + 4);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_holidays_new_clinic ON public.clinics;
CREATE TRIGGER trg_seed_default_holidays_new_clinic
  AFTER INSERT ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_holidays_for_new_clinic();

-- ----------------------------------------------------------
-- 4. Backfill das clínicas que já existem hoje
-- ----------------------------------------------------------
DO $$
DECLARE
  clinica record;
BEGIN
  FOR clinica IN SELECT id FROM public.clinics LOOP
    PERFORM public.seed_default_holidays(clinica.id, 2026, 2030);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------
-- 5. Verificação
-- ----------------------------------------------------------
SELECT
  public.easter_sunday(2026) = DATE '2026-04-05' AS pascoa_2026_correta,
  public.easter_sunday(2027) = DATE '2027-03-28' AS pascoa_2027_correta,
  (SELECT COUNT(*) FROM public.clinic_holidays) AS total_feriados_cadastrados,
  NOT EXISTS (
    SELECT 1 FROM public.clinic_holidays
    GROUP BY clinic_id, day HAVING COUNT(*) > 1
  ) AS sem_duplicata;
