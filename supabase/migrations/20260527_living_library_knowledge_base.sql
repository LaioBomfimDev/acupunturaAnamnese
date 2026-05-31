-- ==========================================================
-- Biblioteca Viva: conhecimento clinico separado de dados de paciente
-- ==========================================================
-- Principios:
-- 1. Dados de pacientes continuam em clinical_records, criptografados.
-- 2. Esta camada guarda conhecimento bibliografico/clinico revisavel.
-- 3. Importacoes externas entram como draft e exigem revisao profissional.
-- 4. Usuarios autenticados leem apenas conteudo aprovado.
-- 5. SuperAdm gerencia rascunhos, aprovacao, versoes e auditoria.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  citation TEXT,
  url TEXT,
  license_note TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key TEXT UNIQUE NOT NULL,
  entity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT,
  display_code TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT knowledge_entities_status_check
    CHECK (approval_status IN ('draft', 'review', 'approved', 'retired'))
);

CREATE TABLE IF NOT EXISTS public.knowledge_entity_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  source_ids UUID[] NOT NULL DEFAULT '{}',
  change_note TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(entity_id, version)
);

CREATE TABLE IF NOT EXISTS public.point_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  map_id TEXT NOT NULL,
  view_name TEXT NOT NULL,
  x_pct NUMERIC(6,3) NOT NULL,
  y_pct NUMERIC(6,3) NOT NULL,
  calibrated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  calibrated_at TIMESTAMPTZ,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT point_locations_pct_check CHECK (x_pct >= 0 AND x_pct <= 100 AND y_pct >= 0 AND y_pct <= 100),
  CONSTRAINT point_locations_status_check CHECK (approval_status IN ('draft', 'review', 'approved', 'retired'))
);

CREATE TABLE IF NOT EXISTS public.knowledge_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  to_entity_id UUID NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  evidence_note TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(from_entity_id, to_entity_id, relationship_type),
  CONSTRAINT knowledge_relationships_status_check CHECK (approval_status IN ('draft', 'review', 'approved', 'retired'))
);

CREATE TABLE IF NOT EXISTS public.safety_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  condition JSONB NOT NULL,
  message TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT safety_rules_severity_check CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT safety_rules_status_check CHECK (approval_status IN ('draft', 'review', 'approved', 'retired'))
);

CREATE TABLE IF NOT EXISTS public.ingestion_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE SET NULL,
  import_type TEXT NOT NULL,
  original_filename TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT ingestion_batches_status_check CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.knowledge_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.ingestion_batches(id) ON DELETE SET NULL,
  entity_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft',
  review_note TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT knowledge_drafts_status_check CHECK (review_status IN ('draft', 'review', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.knowledge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_id UUID REFERENCES public.knowledge_entities(id) ON DELETE SET NULL,
  draft_id UUID REFERENCES public.knowledge_drafts(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS knowledge_entities_type_status_idx
ON public.knowledge_entities(entity_type, approval_status);

CREATE INDEX IF NOT EXISTS knowledge_entities_code_idx
ON public.knowledge_entities(code)
WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS knowledge_entity_versions_entity_idx
ON public.knowledge_entity_versions(entity_id, version DESC);

CREATE INDEX IF NOT EXISTS point_locations_entity_map_idx
ON public.point_locations(entity_id, map_id);

CREATE INDEX IF NOT EXISTS knowledge_relationships_from_type_idx
ON public.knowledge_relationships(from_entity_id, relationship_type);

CREATE OR REPLACE FUNCTION public.touch_knowledge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_sources_touch_updated_at ON public.knowledge_sources;
CREATE TRIGGER knowledge_sources_touch_updated_at
BEFORE UPDATE ON public.knowledge_sources
FOR EACH ROW EXECUTE PROCEDURE public.touch_knowledge_updated_at();

DROP TRIGGER IF EXISTS knowledge_entities_touch_updated_at ON public.knowledge_entities;
CREATE TRIGGER knowledge_entities_touch_updated_at
BEFORE UPDATE ON public.knowledge_entities
FOR EACH ROW EXECUTE PROCEDURE public.touch_knowledge_updated_at();

DROP TRIGGER IF EXISTS point_locations_touch_updated_at ON public.point_locations;
CREATE TRIGGER point_locations_touch_updated_at
BEFORE UPDATE ON public.point_locations
FOR EACH ROW EXECUTE PROCEDURE public.touch_knowledge_updated_at();

DROP TRIGGER IF EXISTS safety_rules_touch_updated_at ON public.safety_rules;
CREATE TRIGGER safety_rules_touch_updated_at
BEFORE UPDATE ON public.safety_rules
FOR EACH ROW EXECUTE PROCEDURE public.touch_knowledge_updated_at();

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knowledge sources select authenticated"
ON public.knowledge_sources FOR SELECT TO authenticated
USING (public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Knowledge sources manage super admin"
ON public.knowledge_sources FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Knowledge entities select approved"
ON public.knowledge_entities FOR SELECT TO authenticated
USING (
  public.can_access_clinical_data(auth.uid())
  AND (approval_status = 'approved' OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "Knowledge entities manage super admin"
ON public.knowledge_entities FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Knowledge versions select approved entity"
ON public.knowledge_entity_versions FOR SELECT TO authenticated
USING (
  public.can_access_clinical_data(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.knowledge_entities ke
    WHERE ke.id = entity_id
      AND (ke.approval_status = 'approved' OR public.is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Knowledge versions manage super admin"
ON public.knowledge_entity_versions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Point locations select approved"
ON public.point_locations FOR SELECT TO authenticated
USING (
  public.can_access_clinical_data(auth.uid())
  AND (
    approval_status = 'approved'
    OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "Point locations manage super admin"
ON public.point_locations FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Knowledge relationships select approved"
ON public.knowledge_relationships FOR SELECT TO authenticated
USING (
  public.can_access_clinical_data(auth.uid())
  AND (
    approval_status = 'approved'
    OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "Knowledge relationships manage super admin"
ON public.knowledge_relationships FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Safety rules select approved"
ON public.safety_rules FOR SELECT TO authenticated
USING (
  public.can_access_clinical_data(auth.uid())
  AND (
    approval_status = 'approved'
    OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "Safety rules manage super admin"
ON public.safety_rules FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Ingestion batches manage super admin"
ON public.ingestion_batches FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Knowledge drafts manage super admin"
ON public.knowledge_drafts FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Knowledge audit select super admin"
ON public.knowledge_audit_log FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Knowledge audit insert super admin"
ON public.knowledge_audit_log FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.knowledge_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_entities FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_entity_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.point_locations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_relationships FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.safety_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ingestion_batches FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_drafts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_audit_log FROM anon;
