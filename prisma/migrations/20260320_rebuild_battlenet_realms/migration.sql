-- Rebuild rf_battlenet_realm for connected realm imports with multilingual names.

DROP TABLE IF EXISTS public.rf_battlenet_realm;

CREATE TABLE public.rf_battlenet_realm (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  realm_id BIGINT NOT NULL,
  name JSONB NOT NULL DEFAULT '{}'::jsonb,
  slug TEXT NOT NULL,
  region TEXT NOT NULL,
  namespace TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rf_battlenet_realm_region_namespace_realm_id_key
  ON public.rf_battlenet_realm(region, namespace, realm_id);

CREATE UNIQUE INDEX rf_battlenet_realm_region_namespace_slug_key
  ON public.rf_battlenet_realm(region, namespace, slug);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rf_battlenet_realm_set_updated_at ON public.rf_battlenet_realm;
CREATE TRIGGER rf_battlenet_realm_set_updated_at
BEFORE UPDATE ON public.rf_battlenet_realm
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rf_battlenet_realm ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rf_upsert_battlenet_realm(
  p_realm_id BIGINT,
  p_name JSONB,
  p_slug TEXT,
  p_region TEXT,
  p_namespace TEXT,
  p_version TEXT,
  p_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_id TEXT;
BEGIN
  INSERT INTO public.rf_battlenet_realm (realm_id, name, slug, region, namespace, version, type)
  VALUES (p_realm_id, COALESCE(p_name, '{}'::jsonb), p_slug, p_region, p_namespace, p_version, p_type)
  ON CONFLICT (region, namespace, realm_id)
  DO UPDATE SET
    name = rf_battlenet_realm.name || EXCLUDED.name,
    slug = EXCLUDED.slug,
    version = EXCLUDED.version,
    type = EXCLUDED.type,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
